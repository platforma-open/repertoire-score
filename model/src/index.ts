import type { InferOutputsType, PColumnSpec, PlRef, RenderCtxBase } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder, plRefsEqual } from "@platforma-sdk/model";
import type {
  BlockArgs,
  BlockData,
  FeatureAvailability,
  FeatureKey,
  SelectableTier,
  SignalKind,
} from "./types";

export * from "./types";
export * from "./presets";

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

// MiXCR SHM mutation features — the current in-vivo score's set (spec A-0009),
// exposed as isScore columns upstream.
const MUTATION_COLUMN_NAMES = new Set([
  "pl7.app/vdj/sequence/nAAMutationsCDR",
  "pl7.app/vdj/sequence/nAAMutationsFWR",
  "pl7.app/vdj/sequence/nMutations",
  "pl7.app/vdj/sequence/fractionCDRMutations",
]);

/** Classify one upstream column spec into a composite signal kind, or undefined. */
function classifyFeature(spec: PColumnSpec): SignalKind | undefined {
  const name = spec.name;
  if (
    name === "pl7.app/vdj/generationProbability" ||
    name === "pl7.app/vdj/negLog10GenerationProbability"
  ) {
    return "pgen";
  }
  // Match by spec family, not a fixed name: the per-clonotype aggregation the
  // convergence block is planning (PLAN §5.6) will land under this prefix.
  if (name.startsWith("pl7.app/vdj/convergence/")) return "convergence";
  if (spec.annotations?.["pl7.app/isAbundance"] === "true") return "abundance";
  if (MUTATION_COLUMN_NAMES.has(name)) return "mutations";
  return undefined;
}

/**
 * Detect which composite signal families are present for the selected dataset,
 * and the implied preset tier. Pure spec read over the result pool — no Run
 * required. Mirrors `clonotype-convergence/model/src/facts.ts`: MiXCR partitions
 * outputs across two axis frames (per-(sample,clonotype) and per-clonotype), so
 * both anchored queries are needed.
 */
function detectFeatures<A, U>(
  ctx: RenderCtxBase<A, U>,
  ref: PlRef,
): FeatureAvailability | undefined {
  const refSpec = ctx.resultPool.getPColumnSpecByRef(ref);
  if (!refSpec) return undefined;

  const perSampleClonotype =
    ctx.resultPool.getAnchoredPColumns({ main: ref }, [
      {
        axes: [
          { anchor: "main", idx: 0 },
          { anchor: "main", idx: 1 },
        ],
      },
    ]) ?? [];
  const perClonotype =
    ctx.resultPool.getAnchoredPColumns({ main: ref }, [{ axes: [{ anchor: "main", idx: 1 }] }]) ??
    [];

  const signals = new Set<SignalKind>();
  for (const col of [...perSampleClonotype, ...perClonotype]) {
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

const dataModel = new DataModelBuilder()
  .from<BlockData>("v1")
  .init(() => ({ presetFamily: "standard", tierMode: "automatic", weightMode: "preset" }));

export const platforma = BlockModelV3.create(dataModel)

  .args<BlockArgs>((data) => {
    if (data.inputAnchor === undefined) throw new Error("Input dataset is required");
    // The workflow resolves the effective tier from the columns it discovers; args
    // carries only intent. Preset family + tier choice + weights select the score,
    // so they stale the block.
    //
    // Custom weights count only when the mode is "custom" AND at least one weight is
    // actually set. "Custom with no edits" collapses to "preset": identical args (no
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
      weightMode: customWeights ? "custom" : "preset",
      customWeights,
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
  .output("featureAvailability", (ctx) =>
    ctx.data.inputAnchor ? detectFeatures(ctx, ctx.data.inputAnchor) : undefined,
  )

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

  .sections(() => [{ type: "link" as const, href: "/" as const, label: "Main" }])

  .done();

export type Platforma = typeof platforma;
export type BlockOutputs = InferOutputsType<typeof platforma>;
