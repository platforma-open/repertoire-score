import type { FeatureKey, PresetFamily, SelectableTier, SignalKind } from "./types";

/** Display/editor order — grouped by signal (mutations ×4, abundance, pgen, convergence). */
export const FEATURE_ORDER: FeatureKey[] = [
  "cdrMutationFraction",
  "aaMutationsCDR",
  "aaMutationsFWR",
  "ntMutations",
  "logCells",
  "negLogPgen",
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
  fastStar: "convergence",
};

/**
 * v1 preset coefficients (spec A-0027), keyed by (family, tier). Values are heavy-chain
 * coefficients; light-chain analogues are 0.20× (sign preserved) at compute time per A-0019.
 *
 * - Standard family: hand-set, non-negative, sum-to-1 (biology-informed direction).
 * - Antigen-selected family: fitted logistic regression on percentile-ranked features — signed.
 *
 * Both are v1 provisional (single Chirichella dataset — see A-0021). The feature *set* differs
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
      negLogPgen: 0.5,
    },
    "3": {
      logCells: 0.05,
      ntMutations: 0.1,
      aaMutationsCDR: 0.1,
      aaMutationsFWR: 0.1,
      fastStar: 0.35,
      negLogPgen: 0.3,
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
      cdrMutationFraction: 0.5205,
      aaMutationsCDR: -0.4424,
      aaMutationsFWR: 1.6972,
      ntMutations: -0.9703,
      logCells: -1.1228,
      negLogPgen: 1.723,
    },
    "3": {
      cdrMutationFraction: 0.4191,
      aaMutationsCDR: 0.048,
      aaMutationsFWR: 1.6509,
      ntMutations: -1.057,
      logCells: -0.9948,
      negLogPgen: 2.7935,
      fastStar: -2.5498,
    },
  },
};

/** Default per-feature coefficients for the resolved (family, tier) preset (spec A-0027). */
export function defaultFeatureWeights(
  family: PresetFamily,
  tier: SelectableTier,
): Partial<Record<FeatureKey, number>> {
  return PRESET_COEFFICIENTS[family][tier] ?? {};
}
