import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  InferOutputsType,
  PColumnSpec,
  PFrameHandle,
  PlRef,
  RelaxedColumnSelector,
} from "@platforma-sdk/model";
import {
  BlockModelV3,
  Column,
  ColumnLazy,
  ColumnsCollection,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV3,
  DataModelBuilder,
  deriveColumnOptions,
  isColumnLazy,
  isPlRef,
  parseJsonSafely,
  withEnrichments,
} from "@platforma-sdk/model";
import { FEATURE_ORDER, FEATURE_SIGNAL, PRESET_COEFFICIENTS } from "./presets";
import type {
  BlockArgs,
  BlockData,
  FeatureAvailability,
  FeatureKey,
  ScoreLog,
  SelectableTier,
  SignalKind,
} from "./types";

export * from "./presets";
export * from "./types";

// The composite score column emitted by the workflow.
export const REPERTOIRE_SCORE_COLUMN = "pl7.app/vdj/repertoireScore";

// The clonotype dataset this block scores — any of the three shapes (bulk /
// single-cell / paired). All are single-cell/bulk clonotype anchors keyed on
// (sampleId, clonotypeKey|scClonotypeKey).
// `partialAxesMatch: false` keeps the legacy selector's exact axis-set semantics: exactly
// these two axes, in this order. The new selector schema defaults to subset matching, which
// would also admit wider anchors.
const inputAnchorSelectors: RelaxedColumnSelector[] = [
  {
    axes: [{ name: "pl7.app/sampleId" }, { name: "pl7.app/vdj/clonotypeKey" }],
    annotations: { "pl7.app/isAnchor": "true" },
    partialAxesMatch: false,
  },
  {
    axes: [{ name: "pl7.app/sampleId" }, { name: "pl7.app/vdj/scClonotypeKey" }],
    annotations: { "pl7.app/isAnchor": "true" },
    partialAxesMatch: false,
  },
];

// Column-name → signal classification for the reactive UI detection below. This MUST stay
// in sync with the workflow's `classify` (workflow/main.tpl.tengo:"--- Upstream column names
// ---"), which recognizes the same columns to actually feed the score. The two can't share
// code across the TS/Tengo boundary, so any name added/changed here must be mirrored there —
// otherwise the UI advertises a signal the workflow can't use (or vice-versa).
//
// MiXCR SHM mutation features — the current in-vivo score's set, isScore upstream.
// The nucleotide-mutations signal column — also the default scatterplot Y axis.
export const NT_MUTATIONS_COLUMN = "pl7.app/vdj/sequence/nMutations";
export const CDR_MUTATION_FRACTION_COLUMN = "pl7.app/vdj/sequence/fractionCDRMutations";
const MUTATION_COLUMN_NAMES = new Set([
  "pl7.app/vdj/sequence/nAAMutationsCDR",
  "pl7.app/vdj/sequence/nAAMutationsFWR",
  NT_MUTATIONS_COLUMN,
  CDR_MUTATION_FRACTION_COLUMN,
]);
// Generation probability: the score consumes -log10(Pgen).
const PGEN_COLUMN_NAME = "pl7.app/vdj/minlog10GenerationProbability";
// Convergence signal = the fast-STAR Hit/Not-hit flag (a String column, "Hit"/"Not hit").
const CONVERGENCE_FASTSTAR = "pl7.app/vdj/convergence/fastStar";
// Every name `classifyFeature` recognizes outright — the host-side pre-filter for signal
// discovery. Abundance is not name-based, so it gets its own selector next to this one.
const SIGNAL_COLUMN_NAMES = [PGEN_COLUMN_NAME, CONVERGENCE_FASTSTAR, ...MUTATION_COLUMN_NAMES];

/** Classify one upstream column spec into a composite signal kind, or undefined. */
function classifyFeature(spec: PColumnSpec): SignalKind | undefined {
  const name = spec.name;
  const ann = spec.annotations;
  if (name === PGEN_COLUMN_NAME) return "pgen";
  if (name === CONVERGENCE_FASTSTAR) return "convergence";
  // Abundance total only — mirror the workflow's rule: raw count (not a normalized fraction),
  // and a clonal-size unit (cells / reads / molecules), never `samples` (sample-count is
  // clonotype prevalence, not abundance). Keeps sample-count and fractions out of both tier
  // detection and the histogram value picker.
  if (
    ann?.["pl7.app/isAbundance"] === "true" &&
    ann["pl7.app/abundance/normalized"] !== "true" &&
    ann["pl7.app/abundance/unit"] !== "samples"
  ) {
    return "abundance";
  }
  if (MUTATION_COLUMN_NAMES.has(name)) return "mutations";
  return undefined;
}

/**
 * Whether a column should be offered as a value in the plots — the composite score plus every
 * recognized per-clonotype signal present (used by the current preset or not).
 */
export function isPlottableColumn(spec: PColumnSpec): boolean {
  if (spec.axesSpec.length !== 1) return false;
  return spec.name === REPERTOIRE_SCORE_COLUMN || classifyFeature(spec) !== undefined;
}

/**
 * OR-list of exact-name matchers for a selector's `name` / annotation value. Exact matchers
 * keep `.` and `/` literal — no regex escaping of column-namespace strings.
 */
function exactly(...values: string[]) {
  return values.map((value) => ({ type: "exact" as const, value }));
}

/**
 * Pool columns of the selected dataset keyed on its clonotype axis alone — the shape every
 * per-clonotype signal has. Axis matching runs host-side, so callers narrow further with
 * `filter()` and pay a `getSpec()` round-trip only on the survivors. `undefined` while the
 * dataset ref is still resolving, or once it is provably gone.
 */
function perClonotypeColumns(ref: PlRef): ColumnsCollection | undefined {
  if (ColumnLazy.getStatusByPlRef(ref) !== "present") return undefined;
  const clonotypeAxis = Column(ref)?.getSpec().axesSpec[1];
  if (!clonotypeAxis) return undefined;
  return ColumnsCollection(["result_pool"]).discover({
    anchors: { main: ref },
    mode: "enrichment",
    // Direct hits only — the anchored discovery this replaced never walked linkers.
    maxHops: 0,
    // `partialAxesMatch: false` pins the axis set to exactly this one axis, keeping
    // per-sample columns (and anything wider) out of signal classification.
    include: { axes: [{ name: exactly(clonotypeAxis.name) }], partialAxesMatch: false },
  });
}

/**
 * Detect which composite signal families are present for the selected dataset, and the
 * implied preset tier. Pure spec read over the result pool — no Run required.
 */
function detectFeatures(ref: PlRef): FeatureAvailability | undefined {
  const perClonotype = perClonotypeColumns(ref);
  if (!perClonotype) return undefined;

  // Narrow host-side to what `classifyFeature` can possibly recognize; the abundance rule
  // compares annotation values, so those few survivors still get their spec read.
  const candidates = perClonotype
    .filter({
      include: [
        { name: exactly(...SIGNAL_COLUMN_NAMES) },
        { annotations: { "pl7.app/isAbundance": exactly("true") } },
      ],
    })
    .getColumns();

  const signals = new Set<SignalKind>();
  for (const col of candidates) {
    const signal = classifyFeature(col.getSpec());
    if (signal) signals.add(signal);
  }

  const hasMixcr = signals.has("mutations") || signals.has("abundance");
  const hasPgen = signals.has("pgen");
  const hasConvergence = signals.has("convergence");

  let tier: FeatureAvailability["tier"] = "none";
  const reachableTiers: SelectableTier[] = [];
  if (hasMixcr) {
    reachableTiers.push("1");
    if (hasConvergence) reachableTiers.push("2a");
    if (hasPgen) reachableTiers.push("2b");
    if (hasPgen && hasConvergence) reachableTiers.push("3");

    if (hasPgen && hasConvergence) tier = "3";
    else if (hasPgen) tier = "2b";
    else if (hasConvergence) tier = "2a";
    else tier = "1";
  }

  return {
    signals: [...signals].sort(),
    tier,
    reachableTiers,
    hasMixcr,
    hasPgen,
    hasConvergence,
  };
}

/** Canonicalise custom weights (sorted keys) so the args stale-gate keys on meaning, not order. */
function canonicalWeights(
  w: Partial<Record<FeatureKey, number>> | undefined,
): Partial<Record<FeatureKey, number>> | undefined {
  if (!w) return undefined;
  const out: Partial<Record<FeatureKey, number>> = {};
  for (const k of (Object.keys(w) as FeatureKey[]).sort()) {
    const v = w[k];
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Default state for the Distributions histogram: binned counts, solid bars. */
export const defaultGraphStateHistogram = (): GraphMakerState => ({
  title: "Variable distributions",
  template: "bins",
  currentTab: null,
  axesSettings: {
    other: { binsCount: 20 },
  },
  layersSettings: {
    bins: { fillColor: "#2D93FA" },
  },
});

/** Default state for the Comparison scatterplot (one signal vs another). Trend line on by
 *  default so the score-vs-signal relationship is visible at first open. */
export const defaultGraphStateScatter = (): GraphMakerState => ({
  title: "Score & variable relationships",
  template: "dots",
  currentTab: null,
  statisticsSettings: {
    trend: { on: true },
  },
});

const dataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
  customBlockLabel: "",
  defaultBlockLabel: "",
  presetFamily: "standard",
  tierMode: "default",
  weightMode: "default",
  tableState: createPlDataTableStateV2(),
  graphStateHistogram: defaultGraphStateHistogram(),
  graphStateScatter: defaultGraphStateScatter(),
}));

export const platforma = BlockModelV3.create(dataModel)

  .args<BlockArgs>((data) => {
    if (data.inputAnchor === undefined) throw new Error("Input dataset is required");
    // The workflow resolves the effective tier from the columns it discovers; args
    // carries only intent. Preset family + tier choice + weights select the score,
    // so they stale the block.
    //
    // Custom weights count only when the mode is "custom" AND at least one weight is
    // actually set. "Custom with no edits" collapses to "default": identical args (no
    // spurious re-run) and cleaner provenance (unedited custom = the base preset).
    const customWeights =
      data.weightMode === "custom" ? canonicalWeights(data.customWeights) : undefined;
    return {
      inputAnchor: data.inputAnchor,
      presetFamily: data.presetFamily,
      tierMode: data.tierMode,
      // Pinned tier only matters in custom mode; drop it in default so a stale
      // pin can't stale the block or reach the workflow.
      tier: data.tierMode === "custom" ? data.tier : undefined,
      weightMode: customWeights ? "custom" : "default",
      customWeights,
      // Ship the calibrated coefficients for the chosen family; the workflow picks the
      // tier row once it knows which signals the input actually carries.
      coefficients: PRESET_COEFFICIENTS[data.presetFamily],
      // Ship the static feature taxonomy so the workflow reads it from one source of truth
      // (presets.ts) instead of a duplicated Tengo copy.
      featureOrder: FEATURE_ORDER,
      featureSignal: FEATURE_SIGNAL,
    };
  })

  .prerunArgs((data) => {
    if (data.inputAnchor === undefined) return undefined;
    return { inputAnchor: data.inputAnchor };
  })

  // Discovery runs host-side and hands back ids; the block's own wire shape stays
  // `{ ref, label }`, since args / enriches / the workflow bundle all want a PlRef.
  .output("inputOptions", () =>
    deriveColumnOptions(
      ColumnsCollection(["result_pool"]).filter({ include: inputAnchorSelectors }),
    ).flatMap(({ id, label }) => {
      const ref = parseJsonSafely(id);
      if (!isPlRef(ref)) return [];
      return [{ ref: withEnrichments(ref, true), label }];
    }),
  )

  // Reactive feature/tier detection for the selected dataset (no Run needed).
  .output("featureAvailability", (ctx) =>
    ctx.data.inputAnchor ? detectFeatures(ctx.data.inputAnchor) : undefined,
  )

  // Results table: exactly Clone Id + this block's score + the metrics that fed it.
  .outputWithStatus("scoreTable", (ctx) => {
    const acc = ctx.outputs?.resolve({
      field: "tablePf",
      assertFieldType: "Input",
      allowPermanentAbsence: true,
    });
    if (!acc) return undefined;
    const collection = ColumnsCollection([acc]);
    if (!collection.isFinal()) return undefined;
    const cols = collection.getColumns();
    if (cols.length === 0) return undefined;
    // Score column anchors the rows (per-clonotype); the rest join on the shared axis.
    // Resolved by a host-side name filter, so no column pays a spec round-trip here.
    const scoreId = collection
      .filter({ include: { name: exactly(REPERTOIRE_SCORE_COLUMN) } })
      .getColumnIds()[0];
    const primary = cols.find((c) => c.id === scoreId) ?? cols[0];
    return createPlDataTableV3(ctx, {
      primaryColumns: [primary],
      columns: cols.filter((c) => c.id !== primary.id),
      tableState: ctx.data.tableState,
    });
  })

  // Distributions: a histogram over the composite score (the default) with re-bind to any
  // available signal. `createPFrameForGraphs` enriches the block's own frame (score + used
  // features) with every compatible pool column — so all available per-clonotype signals AND
  // the metadata/linker columns for grouping are present without re-emitting any data. The
  // value picker is narrowed to score + signals UI-side by `isHistogramValueColumn`.
  .outputWithStatus("histogramPf", (ctx): PFrameHandle | undefined => {
    const acc = ctx.outputs?.resolve("tablePf");
    if (!acc) return undefined;
    // `createPFrameForGraphs` still takes materialised `PColumn[]`, which only bare leaves
    // can produce — these all are, coming straight off the block's own output accessor.
    const leaves = ColumnsCollection([acc]).getColumns().filter(isColumnLazy);
    if (leaves.length === 0) return undefined;
    return createPFrameForGraphs(
      ctx,
      leaves.map((c) => ({ id: c.id, spec: c.getSpec(), data: c.getData() })),
    );
  })

  // Column specs the UI picks chart defaults from (label excluded). The full pickable set is
  // the enriched PFrame; this list carries the block's own frame columns PLUS the CDR
  // mutation fraction column (so the Distributions plot can default to it even when the active
  // preset doesn't score it — it's still offerable via the enriched PFrame).
  .output("histogramPfSpecs", (ctx): PColumnSpec[] | undefined => {
    const acc = ctx.outputs?.resolve("tablePf");
    if (!acc) return undefined;
    const specs = ColumnsCollection([acc])
      .filter({ exclude: { name: exactly("pl7.app/label") } })
      .getColumns()
      .map((c) => c.getSpec());
    // Append the CDR mutation fraction column from the input pool if it isn't a scored feature,
    // so it's available as the Distributions default regardless of the resolved preset.
    const anchor = ctx.data.inputAnchor;
    if (anchor && !specs.some((spec) => spec.name === CDR_MUTATION_FRACTION_COLUMN)) {
      const cdr = perClonotypeColumns(anchor)
        ?.filter({ include: { name: exactly(CDR_MUTATION_FRACTION_COLUMN) } })
        .getColumns()[0];
      if (cdr) specs.push(cdr.getSpec());
    }
    if (specs.length === 0) return undefined;
    return specs;
  })

  // Diagnostic manifest of the per-column weights actually applied (post light-chain
  // scaling), each column's chain, and its source column — for double-checking the score.
  .output("scoreLog", (ctx): ScoreLog | undefined =>
    ctx.outputs?.resolve("scoreLog")?.getDataAsJsonOrUndefined<ScoreLog>(),
  )

  // This block enriches the clonotype dataset it scores, so consumers that pull
  // enrichments (e.g. lead selection) auto-discover the score.
  .enriches((args) => (args.inputAnchor ? [args.inputAnchor] : []))

  .title(() => "Repertoire Score")

  // Block label in the left panel: the user's custom label, else the auto default.
  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel || "")

  .sections(() => [
    { type: "link" as const, href: "/" as const, label: "Main" },
    { type: "link" as const, href: "/distributions" as const, label: "Distributions" },
    // { type: "link" as const, href: "/scatterplot" as const, label: "Scatterplot" },
  ])

  .done();

export type Platforma = typeof platforma;
export type BlockOutputs = InferOutputsType<typeof platforma>;
