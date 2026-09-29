import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  DatasetOption,
  InferOutputsType,
  PColumnSpec,
  PFrameHandle,
  PlRef,
  RelaxedColumnSelector,
} from "@platforma-sdk/model";
import {
  BlockModelV3,
  buildDatasetOptions,
  Column,
  DataColumn,
  ColumnsCollection,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV3,
  DataModelBuilder,
  deriveColumnOptions,
  extractPObjectId,
  isDataColumn,
  isPColumnSpec,
  isPlRef,
  parseJsonSafely,
  plRefsEqual,
} from "@platforma-sdk/model";
import { kind } from "@platforma-open/milaboratories.repertoire-score.kind";
import { FEATURE_ORDER, FEATURE_SIGNAL, PRESET_COEFFICIENTS } from "./presets";
import type {
  FeatureKey,
  SelectableTier,
} from "@platforma-open/milaboratories.repertoire-score.kind";
import type { BlockArgs, BlockData, FeatureAvailability, ScoreLog, SignalKind } from "./types";

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

// Signals produced by a block OTHER than the one the input anchor comes from, so this block
// has to depend on each of them by ref (see BlockData.optionalSignalRefs). Mutations and
// abundance are the anchor block's own columns and ride along with the anchor ref.
const OPTIONAL_SIGNALS: ReadonlySet<SignalKind> = new Set<SignalKind>(["pgen", "convergence"]);

// Domain key a block stamps on columns it computed on a subset of its dataset (Generation
// Probability, Clonotype Convergence). Its value is the subset column's id.
export const SUBSET_DOMAIN = "pl7.app/subset";

/**
 * A result-pool column id: the canonical JSON of its PlRef (keys in sorted order). It is the
 * form `pl7.app/subset` carries, so this block's own filter can be compared with it.
 */
export const columnIdFromPlRef = (ref: PlRef): string =>
  JSON.stringify({ __isRef: true, blockId: ref.blockId, name: ref.name });

export type SignalCandidate = { id: string; spec: PColumnSpec; signal: SignalKind };

/**
 * Which Pgen and convergence columns a run on `subsetId` may use (undefined = full data).
 *
 * - Convergence only from a run on the same input: its hits depend on which clonotypes were in.
 * - Pgen from a run on the same subset, or on the full data: Pgen is per sequence, so full-data
 *   values are the same for the subset's clonotypes. Where both exist for one chain, the
 *   subset's wins.
 *
 * The workflow applies the same rules (main.tpl.tengo), so the tier shown here is the tier run.
 */
export function applySubsetRules(
  candidates: SignalCandidate[],
  subsetId: string | undefined,
): SignalCandidate[] {
  const subsetOf = (c: SignalCandidate) => c.spec.domain?.[SUBSET_DOMAIN];
  const allowed = candidates.filter((c) => {
    if (c.signal === "convergence") return subsetOf(c) === subsetId;
    if (c.signal === "pgen") return subsetOf(c) === undefined || subsetOf(c) === subsetId;
    return true;
  });
  if (subsetId === undefined) return allowed;
  // The column's identity without the subset stamp: same name and chain, full vs subset run.
  const sansSubset = (c: SignalCandidate) =>
    c.spec.name +
    JSON.stringify(
      Object.entries(c.spec.domain ?? {})
        .filter(([key]) => key !== SUBSET_DOMAIN)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  // find which chains have a subset Pgen.
  const subsetPgen = new Set(
    allowed.filter((c) => c.signal === "pgen" && subsetOf(c) === subsetId).map(sansSubset),
  );
  // drop the full-data Pgen for exactly those chains.
  return allowed.filter(
    (c) => !(c.signal === "pgen" && subsetOf(c) === undefined && subsetPgen.has(sansSubset(c))),
  );
}

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
  if (DataColumn.getStatusByPlRef(ref) !== "present") return undefined;
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
 * Detect which composite signal families are present for the selected dataset, the implied
 * preset tier, and the refs of the optional (cross-block) signals the block must depend on.
 * Pure spec read over the result pool — no Run required.
 */
function detectFeatures(ref: PlRef, subsetId?: string): FeatureAvailability | undefined {
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

  const classified = candidates.flatMap((col) => {
    const spec = col.getSpec();
    const signal = classifyFeature(spec);
    return signal ? [{ id: extractPObjectId(col.id), spec, signal }] : [];
  });

  const signals = new Set<SignalKind>();
  // Leaf ids of the optional signals. Collected as canonical id strings so the set can be deduped and
  // sorted into an order identical across renders.
  const optionalIds = new Set<string>();
  for (const { id, signal } of applySubsetRules(classified, subsetId)) {
    signals.add(signal);
    if (OPTIONAL_SIGNALS.has(signal)) optionalIds.add(id);
  }
  const optionalSignalRefs = [...optionalIds]
    .sort()
    .map((id) => parseJsonSafely<unknown>(id))
    .filter(isPlRef);

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
    optionalSignalRefs,
    anchor: ref,
    ...(subsetId !== undefined && { subsetId }),
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

// No migration step: `optionalSignalRefs` is optional, so older data is already valid. The
// `requireEnrichments` flag on a stored anchor must NOT be stripped here — a migration cannot
// query the pool, so it has no refs to replace that dependency with. The UI does it.
const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(({ params }) => ({
  customBlockLabel: params?.customBlockLabel ?? "",
  defaultBlockLabel: "",
  // Taken as given: an older template's anchor carries `requireEnrichments`, and stripping
  // it without refs to replace it would drop the dependency.
  inputAnchor: params?.inputAnchor,
  filterRef: params?.filterRef,
  // Present in templates written since MILAB-6993, so a seeded block starts synced.
  optionalSignalRefs: params?.optionalSignalRefs,
  presetFamily: params?.presetFamily ?? "standard",
  tierMode: params?.tierMode ?? "default",
  tier: params?.tier,
  weightMode: params?.weightMode ?? "default",
  customWeights: params?.customWeights,
  tableState: createPlDataTableStateV2(),
  graphStateHistogram: defaultGraphStateHistogram(),
  graphStateScatter: defaultGraphStateScatter(),
}));

export const platforma = BlockModelV3.create({ dataModel, kind })

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
      // As stored, `requireEnrichments` and all. Never added here — only carried, until the
      // sync in ui/src/app.ts has the refs to replace it with.
      inputAnchor: data.inputAnchor,
      // Column-id form, like the `pl7.app/subset` stamps it is compared with. Absent without a
      // filter, so an unfiltered block's args are unchanged.
      ...(data.filterRef !== undefined && { inputFilter: columnIdFromPlRef(data.filterRef) }),
      // Not read by the workflow — it is the dependency edge on the Generation Probability /
      // Convergence blocks. Not defaulted to `[]`: undefined drops the key from the JSON
      // args are compared by, so an unsynced block's args stay unchanged and it is not stale.
      optionalSignalRefs: data.optionalSignalRefs,
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

  // Inverse of the kind's init-params contract: the dataset, the subtitle and
  // the whole scoring recipe -- the fields a user sets by hand. Unlike `args`
  // above, the tier and weights are projected as stored rather than resolved:
  // this is the user's configuration, not the run's. `defaultBlockLabel` is
  // derived by a watchEffect, and the table / plot states are view state;
  // neither is configuration a template carries.
  .templateParams((data) => ({
    inputAnchor: data.inputAnchor,
    filterRef: data.filterRef,
    // Not user configuration, but a template restores dependencies too: the formula records
    // WHICH signals were scored, only a ref names the block supplying one. Applying the
    // template repoints each ref at the new project.
    optionalSignalRefs: data.optionalSignalRefs,
    customBlockLabel: data.customBlockLabel,
    presetFamily: data.presetFamily,
    tierMode: data.tierMode,
    tier: data.tier,
    weightMode: data.weightMode,
    customWeights: data.customWeights,
  }))

  // Discovery runs host-side and hands back ids; the block's own wire shape stays
  // `{ ref, label }`, since args / enriches / the workflow bundle all want a PlRef.
  .output("inputOptions", (ctx): DatasetOption[] => {
    // Subset columns (`pl7.app/isSubset`) on each dataset's axes, e.g. repertoire-labeling
    // labels or Lead Selection picks. Only the filters are taken from here: its primary refs
    // carry `requireEnrichments`, which this block deliberately avoids (see
    // BlockData.optionalSignalRefs). The primary predicate only has to cover the datasets below:
    // results are matched to them by ref.
    const withFilters =
      buildDatasetOptions(ctx, {
        primary: (spec) =>
          isPColumnSpec(spec) &&
          spec.annotations?.["pl7.app/isAnchor"] === "true" &&
          spec.axesSpec[0]?.name === "pl7.app/sampleId",
        // Only subsets keyed by the clonotype axis alone: the score is per clonotype.
        filter: (spec) =>
          isPColumnSpec(spec) &&
          spec.axesSpec.length === 1 &&
          spec.axesSpec[0]?.name !== "pl7.app/sampleId",
      }) ?? [];
    return deriveColumnOptions(
      ColumnsCollection(["result_pool"]).filter({ include: inputAnchorSelectors }),
    ).flatMap(({ id, label }) => {
      const ref = parseJsonSafely(id);
      if (!isPlRef(ref)) return [];
      const primary = { ref, label };
      const filters = withFilters.find((o) => plRefsEqual(o.primary.ref, ref, true))?.filters;
      return [filters === undefined ? { primary } : { primary, filters }];
    });
  })

  // Reactive feature/tier detection for the selected dataset (no Run needed).
  .output("featureAvailability", (ctx) =>
    ctx.data.inputAnchor
      ? detectFeatures(
          ctx.data.inputAnchor,
          ctx.data.filterRef && columnIdFromPlRef(ctx.data.filterRef),
        )
      : undefined,
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
    const leaves = ColumnsCollection([acc]).getColumns().filter(isDataColumn);
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
