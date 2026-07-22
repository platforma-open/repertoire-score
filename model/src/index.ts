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
  plRefsEqual,
} from "@platforma-sdk/model";
import type {
  BlockArgs,
  BlockData,
  FeatureAvailability,
  FeatureKey,
  SelectableTier,
  SignalKind,
} from "./types";
import { FEATURE_ORDER, FEATURE_SIGNAL, PRESET_COEFFICIENTS } from "./presets";

export * from "./types";
export * from "./presets";

// Annotation the workflow stamps onto the score + its feature columns in the display frame.
// The Distributions histogram uses it (via GraphMaker's dataColumnPredicate) to offer only
// these as selectable values, while the enriched PFrame still carries pool metadata/linker
// columns for grouping/labelling. Mirrored as a literal in workflow/main.tpl.tengo.
export const HISTOGRAM_VALUE_ANNOTATION = "pl7.app/vdj/repertoireScore/distributionValue";

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
const MUTATION_COLUMN_NAMES = new Set([
  "pl7.app/vdj/sequence/nAAMutationsCDR",
  "pl7.app/vdj/sequence/nAAMutationsFWR",
  "pl7.app/vdj/sequence/nMutations",
  "pl7.app/vdj/sequence/fractionCDRMutations",
]);
// Generation probability: the score consumes -log10(Pgen). The raw `generationProbability`
// is deliberately NOT recognized — the score needs the -log10 form and the workflow only
// feeds that one (workflow NEG_LOG_PGEN); recognizing the raw would advertise a Pgen tier
// the workflow then can't classify.
const PGEN_COLUMN_NAME = "pl7.app/vdj/negLog10GenerationProbability";
// Match convergence by name prefix, not a fixed name: the per-clonotype aggregation the
// convergence block is planning will land under this prefix.
const CONVERGENCE_PREFIX = "pl7.app/vdj/convergence/";

/** Classify one upstream column spec into a composite signal kind, or undefined. */
function classifyFeature(spec: PColumnSpec): SignalKind | undefined {
  const name = spec.name;
  if (name === PGEN_COLUMN_NAME) return "pgen";
  if (name.startsWith(CONVERGENCE_PREFIX)) return "convergence";
  if (spec.annotations?.["pl7.app/isAbundance"] === "true") return "abundance";
  if (MUTATION_COLUMN_NAMES.has(name)) return "mutations";
  return undefined;
}

/**
 * Detect which composite signal families are present for the selected dataset, and the
 * implied preset tier. Pure spec read over the result pool — no Run required.
 *
 * Scope: per-clonotype columns only (anchor axis idx 1) — the SAME scope the workflow
 * discovers features on (`wf.prepare` `addMulti({axes:[{anchor:"main",idx:1}]})`). Every
 * feature the score consumes lives on the clonotype axis: SHM mutations, the per-clonotype
 * abundance total (Supporting Cells / Reads / UMIs), -log10(Pgen), and convergence. The raw
 * per-(sample,clonotype) abundance (e.g. cell-count) is 2-axis and NOT used — detecting on a
 * wider scope than the workflow would advertise a signal it can't feed. (This is unlike
 * clonotype-convergence, where the relevant columns are split across two axis frames.)
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
  title: "Repertoire score distribution",
  template: "bins",
  currentTab: null,
  axesSettings: {
    other: { binsCount: 20 },
  },
  layersSettings: {
    bins: { fillColor: "#2D93FA" },
  },
});

const dataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
  presetFamily: "standard",
  tierMode: "automatic",
  weightMode: "automatic",
  tableState: createPlDataTableStateV2(),
  graphStateHistogram: defaultGraphStateHistogram(),
}));

export const platforma = BlockModelV3.create(dataModel)

  .args<BlockArgs>((data) => {
    if (data.inputAnchor === undefined) throw new Error("Input dataset is required");
    // The workflow resolves the effective tier from the columns it discovers; args
    // carries only intent. Preset family + tier choice + weights select the score,
    // so they stale the block.
    //
    // Custom weights count only when the mode is "custom" AND at least one weight is
    // actually set. "Custom with no edits" collapses to "automatic": identical args (no
    // spurious re-run) and cleaner provenance (unedited custom = the base preset).
    const customWeights =
      data.weightMode === "custom" ? canonicalWeights(data.customWeights) : undefined;
    return {
      inputAnchor: data.inputAnchor,
      presetFamily: data.presetFamily,
      tierMode: data.tierMode,
      // Pinned tier only matters in custom mode; drop it in automatic so a stale
      // pin can't stale the block or reach the workflow.
      tier: data.tierMode === "custom" ? data.tier : undefined,
      weightMode: customWeights ? "custom" : "automatic",
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
  // Retentive: while the block reruns, the upstream enrichment columns (Pgen /
  // Convergence) transiently drop out of the anchored pool discovery, which would
  // otherwise shrink `reachableTiers` to just the base and invalidate a higher pinned
  // tier in the Settings "Signals used" dropdown. Retentive rendering holds the last
  // stable value until a new stable one is ready, so the Settings controls stay put.
  .retentiveOutput("featureAvailability", (ctx) =>
    ctx.data.inputAnchor ? detectFeatures(ctx, ctx.data.inputAnchor) : undefined,
  )

  // Results table: exactly Clone Id + this block's score + the metrics that fed it.
  // We render the workflow's own curated `tablePf` frame (built from precisely the
  // feature columns the score used, all on the clonotype axis) rather than discovering
  // from the pool — so the table shows only the used metrics, one row per clonotype.
  // (Pool discovery from the dataset anchor would pull the whole clonotype table and
  // inherit the anchor's per-sample axis; this avoids both.)
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
  // feature that fed it. Uses the enriched `createPFrameForGraphs` so the chart still has the
  // pool's compatible metadata/linker columns for grouping and labelling — the value picker
  // is narrowed to just the score + features by the UI's `dataColumnPredicate`, keyed on
  // `HISTOGRAM_VALUE_ANNOTATION` (stamped on those columns by the workflow). An explicit flag,
  // not name-matching, so it can't be fooled by look-alike pool columns.
  .outputWithStatus("histogramPf", (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve("tablePf")?.getPColumns();
    if (!pCols || pCols.length === 0) return undefined;
    return createPFrameForGraphs(ctx, pCols);
  })

  // Column ids/specs of the histogram PFrame (label excluded), so the UI can default the
  // chart to the score.
  .output("histogramPfPcols", (ctx): PColumnIdAndSpec[] | undefined => {
    const pCols = ctx.outputs?.resolve("tablePf")?.getPColumns();
    if (!pCols) return undefined;
    const plottable = pCols.filter((c) => c.spec.name !== "pl7.app/label");
    if (plottable.length === 0) return undefined;
    return plottable.map((c) => ({ columnId: c.id, spec: c.spec }));
  })

  // This block enriches the clonotype dataset it scores, so consumers that pull
  // enrichments (e.g. lead selection) auto-discover the score.
  .enriches((args) => (args.inputAnchor ? [args.inputAnchor] : []))

  .title((ctx) => {
    try {
      const ref = ctx.data.inputAnchor;
      if (ref) {
        const label = ctx.resultPool
          .getOptions(inputAnchorSpecs, { refsWithEnrichments: true })
          .find((o) => plRefsEqual(o.ref, ref))?.label;
        if (label) return `Repertoire Score - ${label}`;
      }
    } catch {
      // render context may not be fully initialized yet
    }
    return "Repertoire Score";
  })

  .sections(() => [
    { type: "link" as const, href: "/" as const, label: "Main" },
    { type: "link" as const, href: "/distributions" as const, label: "Distributions" },
  ])

  .done();

export type Platforma = typeof platforma;
export type BlockOutputs = InferOutputsType<typeof platforma>;
