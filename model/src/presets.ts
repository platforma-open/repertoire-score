import type {
  FeatureKey,
  PresetFamily,
  SelectableTier,
  WeightMode,
} from "@platforma-open/milaboratories.repertoire-score.kind";
import type { RunTier, SignalKind } from "./types";

/** Display/editor order — grouped by signal (mutations ×6, abundance, pgen, convergence). */
export const FEATURE_ORDER: FeatureKey[] = [
  "heavyNtMutationsVJ",
  "ntMutationsDistance",
  "cdrMutationFraction",
  "aaMutationsCDR",
  "aaMutationsFWR",
  "ntMutations",
  "logCells",
  "negLogPgen",
  "negLogLightPgen",
  "nbFreq",
  "fastStar",
];

/** Which upstream signal each feature belongs to — used to group the weight editor. */
export const FEATURE_SIGNAL: Record<FeatureKey, SignalKind> = {
  cdrMutationFraction: "mutations",
  aaMutationsCDR: "mutations",
  aaMutationsFWR: "mutations",
  ntMutations: "mutations",
  ntMutationsDistance: "mutations",
  heavyNtMutationsVJ: "mutations",
  logCells: "abundance",
  negLogPgen: "pgen",
  negLogLightPgen: "pgen",
  nbFreq: "convergence",
  fastStar: "convergence",
};

/** Centre k of `ntMutationsDistance` = |nt mutations − k|. */
export const NT_MUTATIONS_CENTER = 6;

/**
 * Preset coefficients, keyed by (family, tier): one row per tier the family offers; `canonicalTier`
 * maps the others. Each feature carries its own signed coefficient.
 *
 * - standard: −1 · |nt mutations − 6| − 0.25 · CDR amino-acid mutations; tier 2a adds the
 *   convergent neighbour frequency.
 * - antigen-selected: heavy-chain V + J nucleotide mutations + 0.25 · CDR amino-acid mutations;
 *   tier 2b adds the heavy and light generation probability (−log10) at 0.5 each.
 */
export const PRESET_COEFFICIENTS: Record<
  PresetFamily,
  Partial<Record<RunTier, Partial<Record<FeatureKey, number>>>>
> = {
  standard: {
    "1": { ntMutationsDistance: -1, aaMutationsCDR: -0.25 },
    "2a": { ntMutationsDistance: -1, aaMutationsCDR: -0.25, nbFreq: 1 },
  },
  "antigen-selected": {
    "1": { heavyNtMutationsVJ: 1, aaMutationsCDR: 0.25 },
    "2b": { heavyNtMutationsVJ: 1, aaMutationsCDR: 0.25, negLogPgen: 0.5, negLogLightPgen: 0.5 },
  },
};

/** Default per-feature coefficients for the resolved (family, tier) preset. */
export function defaultFeatureWeights(
  family: PresetFamily,
  tier: RunTier,
): Partial<Record<FeatureKey, number>> {
  return PRESET_COEFFICIENTS[family][tier] ?? {};
}

/** The features a family's presets score at any tier. */
function familyFeatures(family: PresetFamily): Set<FeatureKey> {
  const used = new Set<FeatureKey>();
  for (const row of Object.values(PRESET_COEFFICIENTS[family])) {
    for (const f of Object.keys(row) as FeatureKey[]) used.add(f);
  }
  return used;
}

/**
 * The custom weights the family scores, with sorted keys so the args stale-gate keys on meaning,
 * not order. Weights saved for features the family doesn't score (e.g. kept from the other
 * family) are left out.
 */
export function canonicalWeights(
  w: Partial<Record<FeatureKey, number>> | undefined,
  family: PresetFamily,
): Partial<Record<FeatureKey, number>> | undefined {
  if (!w) return undefined;
  const scored = familyFeatures(family);
  const out: Partial<Record<FeatureKey, number>> = {};
  for (const k of (Object.keys(w) as FeatureKey[]).sort()) {
    // Its weight is fixed at the preset's; only its centre is editable.
    if (k === "ntMutationsDistance" || !scored.has(k)) continue;
    const v = w[k];
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

type WeightData = {
  presetFamily: PresetFamily;
  weightMode: WeightMode;
  customWeights?: Partial<Record<FeatureKey, number>>;
  ntMutationsCenter?: number;
};

/** The custom centre k of |nt mutations − k|, when Custom is on and the family scores it. */
export function appliedCenter(data: WeightData): number | undefined {
  if (data.weightMode !== "custom") return undefined;
  return familyFeatures(data.presetFamily).has("ntMutationsDistance")
    ? data.ntMutationsCenter
    : undefined;
}

/**
 * The weight mode the run uses: "custom" only when a custom weight or centre the family scores is
 * set, so Custom with no edits that apply runs as Default.
 */
export function appliedWeightMode(data: WeightData): WeightMode {
  if (data.weightMode !== "custom") return "default";
  return canonicalWeights(data.customWeights, data.presetFamily) ||
    appliedCenter(data) !== undefined
    ? "custom"
    : "default";
}

/** The signals a family's presets score at any tier. */
export function familySignals(family: PresetFamily): Set<SignalKind> {
  const used = new Set<SignalKind>();
  for (const row of Object.values(PRESET_COEFFICIENTS[family])) {
    for (const f of Object.keys(row) as FeatureKey[]) used.add(FEATURE_SIGNAL[f]);
  }
  return used;
}

/** Tier order. Mirrors the workflow's TIER_ORDER. */
const RUN_TIERS: readonly RunTier[] = ["1", "2a", "2b"];

/** The tiers a family offers: one per row, in tier order. */
export function familyTiers(family: PresetFamily): RunTier[] {
  return RUN_TIERS.filter((t) => PRESET_COEFFICIENTS[family][t] !== undefined);
}

/**
 * The family's tiers whose optional signals are all in `present`, in tier order. The MiXCR
 * mutation floor is the caller's to check.
 */
export function reachableTiersFor(
  family: PresetFamily,
  present: ReadonlySet<SignalKind>,
): RunTier[] {
  return familyTiers(family).filter((t) =>
    (Object.keys(PRESET_COEFFICIENTS[family][t] ?? {}) as FeatureKey[]).every((f) => {
      const signal = FEATURE_SIGNAL[f];
      return signal === "mutations" || present.has(signal);
    }),
  );
}

/** The tier the family runs with these signals present: its last reachable tier. */
export function tierFor(family: PresetFamily, present: ReadonlySet<SignalKind>): RunTier {
  const reachable = reachableTiersFor(family, present);
  return reachable[reachable.length - 1] ?? "1";
}

/** The optional signals a saved tier asks for. "3" only comes from a block saved with 1.4.x. */
const SAVED_TIER_SIGNALS: Record<SelectableTier, SignalKind[]> = {
  "1": [],
  "2a": ["convergence"],
  "2b": ["pgen"],
  "3": ["pgen", "convergence"],
};

/**
 * The tier a family runs for a saved `tier`
 */
export function canonicalTier(family: PresetFamily, tier: SelectableTier): RunTier {
  return tierFor(family, new Set(SAVED_TIER_SIGNALS[tier]));
}
