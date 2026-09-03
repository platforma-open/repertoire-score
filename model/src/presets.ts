import type {
  FeatureKey,
  PresetFamily,
  SelectableTier,
} from "@platforma-open/milaboratories.repertoire-score.kind";
import type { SignalKind } from "./types";

/** Display/editor order — grouped by signal (mutations ×4, abundance, pgen, convergence). */
export const FEATURE_ORDER: FeatureKey[] = [
  "cdrMutationFraction",
  "aaMutationsCDR",
  "aaMutationsFWR",
  "ntMutations",
  "logCells",
  "negLogPgen",
  "negLogLightPgen",
  "fastStar",
];

/** Which upstream signal each feature belongs to — used to group the weight editor. */
export const FEATURE_SIGNAL: Record<FeatureKey, SignalKind> = {
  cdrMutationFraction: "mutations",
  aaMutationsCDR: "mutations",
  aaMutationsFWR: "mutations",
  ntMutations: "mutations",
  logCells: "abundance",
  negLogPgen: "pgen",
  negLogLightPgen: "pgen",
  fastStar: "convergence",
};

/**
 * v1 preset coefficients, keyed by (family, tier).
 * Each feature carries its own coefficient — there is NO light-chain scaling. Mutations and
 * abundance are chain-aggregated (one column, heavy+light merged); light-chain generation
 * probability is an explicit feature (`negLogLightPgen`) in Tier 2b/3; convergence (`fastStar`)
 * is heavy-only.
 *
 * - Standard family: hand-set, non-negative, sum-to-1 (biology-informed direction).
 * - Antigen-selected family: fitted logistic regression on percentile-ranked features — signed.
 *
 * Fitted on a single Chirichella dataset. The feature *set* differs
 * per (family, tier): e.g. standard-mutations reproduces the legacy in-vivo formula.
 */
export const PRESET_COEFFICIENTS: Record<
  PresetFamily,
  Record<SelectableTier, Partial<Record<FeatureKey, number>>>
> = {
  standard: {
    "1": { logCells: 0.4, cdrMutationFraction: 0.35, ntMutations: 0.25 },
    "2a": {
      logCells: 0.1,
      ntMutations: 0.15,
      aaMutationsCDR: 0.15,
      aaMutationsFWR: 0.1,
      fastStar: 0.5,
    },
    "2b": {
      logCells: 0.1,
      ntMutations: 0.15,
      aaMutationsCDR: 0.15,
      aaMutationsFWR: 0.1,
      negLogPgen: 0.4,
      negLogLightPgen: 0.1,
    },
    "3": {
      logCells: 0.05,
      ntMutations: 0.1,
      aaMutationsCDR: 0.1,
      aaMutationsFWR: 0.1,
      fastStar: 0.35,
      negLogPgen: 0.25,
      negLogLightPgen: 0.05,
    },
  },
  "antigen-selected": {
    "1": {
      cdrMutationFraction: 0.3213,
      aaMutationsCDR: 0.4067,
      aaMutationsFWR: 1.7045,
      ntMutations: -1.1914,
      logCells: -1.0515,
    },
    "2a": {
      cdrMutationFraction: 0.2641,
      aaMutationsCDR: 0.687,
      aaMutationsFWR: 1.705,
      ntMutations: -1.2492,
      logCells: -1.0424,
      fastStar: -0.8755,
    },
    "2b": {
      cdrMutationFraction: 0.414,
      aaMutationsCDR: -0.365,
      aaMutationsFWR: 1.807,
      ntMutations: -0.986,
      logCells: -1.139,
      negLogPgen: 1.714,
      negLogLightPgen: 1.004,
    },
    "3": {
      cdrMutationFraction: 0.331,
      aaMutationsCDR: 0.1,
      aaMutationsFWR: 1.776,
      ntMutations: -1.077,
      logCells: -1.006,
      negLogPgen: 2.764,
      negLogLightPgen: 0.92,
      fastStar: -2.5,
    },
  },
};

/** Default per-feature coefficients for the resolved (family, tier) preset. */
export function defaultFeatureWeights(
  family: PresetFamily,
  tier: SelectableTier,
): Partial<Record<FeatureKey, number>> {
  return PRESET_COEFFICIENTS[family][tier] ?? {};
}
