import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  InferOutputsType,
  PColumnIdAndSpec,
  PColumnSpec,
  PFrameHandle,
  PlRef,
  RenderCtxBase,
} from "@platforma-sdk/model";
import {
  BlockModelV3,
  ColumnsCollection,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV3,
  DataModelBuilder,
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
const inputAnchorSpecs = [
  {
    axes: [{ name: "pl7.app/sampleId" }, { name: "pl7.app/vdj/clonotypeKey" }],
    annotations: { "pl7.app/isAnchor": "true" },
  },
  {
    axes: [{ name: "pl7.app/sampleId" }, { name: "pl7.app/vdj/scClonotypeKey" }],
    annotations: { "pl7.app/isAnchor": "true" },
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
const MUTATION_COLUMN_NAMES = new Set([
  "pl7.app/vdj/sequence/nAAMutationsCDR",
  "pl7.app/vdj/sequence/nAAMutationsFWR",
  NT_MUTATIONS_COLUMN,
  "pl7.app/vdj/sequence/fractionCDRMutations",
]);
// Generation probability: the score consumes -log10(Pgen).
const PGEN_COLUMN_NAME = "pl7.app/vdj/negLog10GenerationProbability";
// Convergence signal = the fast-STAR Hit/Not-hit flag (a String column, "Hit"/"Not hit").
const CONVERGENCE_FASTSTAR = "pl7.app/vdj/convergence/starHit";

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
 * Detect which composite signal families are present for the selected dataset, and the
 * implied preset tier. Pure spec read over the result pool — no Run required.
 */
function detectFeatures<A, U>(
  ctx: RenderCtxBase<A, U>,
  ref: PlRef,
): FeatureAvailability | undefined {
  const refSpec = ctx.resultPool.getPColumnSpecByRef(ref);
  if (!refSpec) return undefined;

  const perClonotype =
    ctx.resultPool.getAnchoredPColumns({ main: ref }, [{ axes: [{ anchor: "main", idx: 1 }] }]) ??
    [];

  const signals = new Set<SignalKind>();
  for (const col of perClonotype) {
    const signal = classifyFeature(col.spec);
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
  title: "Score & variable distributions",
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

  .output("inputOptions", (ctx) =>
    ctx.resultPool.getOptions(inputAnchorSpecs, { refsWithEnrichments: true }),
  )

  // Reactive feature/tier detection for the selected dataset (no Run needed).
  .retentiveOutput("featureAvailability", (ctx) =>
    ctx.data.inputAnchor ? detectFeatures(ctx, ctx.data.inputAnchor) : undefined,
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
    if (!cols || cols.length === 0) return undefined;
    // Score column anchors the rows (per-clonotype); the rest join on the shared axis.
    const scoreCol = cols.find((c) => c.getSpec().name === "pl7.app/vdj/repertoireScore");
    const primaryColumns = scoreCol ? [scoreCol] : [cols[0]];
    const columns = cols.filter((c) => c !== primaryColumns[0]);
    return createPlDataTableV3(ctx, {
      primaryColumns,
      columns,
      tableState: ctx.data.tableState,
    });
  })

  // Distributions: a histogram over the composite score (the default) with re-bind to any
  // available signal. `createPFrameForGraphs` enriches the block's own frame (score + used
  // features) with every compatible pool column — so all available per-clonotype signals AND
  // the metadata/linker columns for grouping are present without re-emitting any data. The
  // value picker is narrowed to score + signals UI-side by `isHistogramValueColumn`.
  .outputWithStatus("histogramPf", (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve("tablePf")?.getPColumns();
    if (!pCols || pCols.length === 0) return undefined;
    return createPFrameForGraphs(ctx, pCols);
  })

  // Column ids/specs of the block's own frame (label excluded), so the UI can default the
  // chart to the score. (The full pickable set is the enriched PFrame filtered by
  // `isHistogramValueColumn`; this list only needs to carry the score for the default.)
  .output("histogramPfPcols", (ctx): PColumnIdAndSpec[] | undefined => {
    const pCols = ctx.outputs?.resolve("tablePf")?.getPColumns();
    if (!pCols) return undefined;
    const plottable = pCols.filter((c) => c.spec.name !== "pl7.app/label");
    if (plottable.length === 0) return undefined;
    return plottable.map((c) => ({ columnId: c.id, spec: c.spec }));
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
    { type: "link" as const, href: "/scatterplot" as const, label: "Scatterplot" },
  ])

  .done();

export type Platforma = typeof platforma;
export type BlockOutputs = InferOutputsType<typeof platforma>;
