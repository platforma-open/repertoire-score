import type {
  PresetFamily,
  WeightMode,
} from "@platforma-open/milaboratories.repertoire-score.kind";
import { appliedWeightMode, canonicalTier, FEATURE_SIGNAL, familyTiers, tierFor } from "./presets";
import type { BlockData, RunTier } from "./types";

export const FAMILY_LABELS: Record<PresetFamily, string> = {
  standard: "Standard",
  "antigen-selected": "Antigen-selected",
};

// User-facing tier names — by signals, not tier ids. "Base" = the MiXCR mutation terms every tier
// includes; a family's second tier adds its signal on top (`familyTiers`).
export const TIER_LABELS: Record<RunTier, string> = {
  "1": "Base: mutations",
  "2a": "Base + Convergence",
  "2b": "Base + Generation probability",
};

/** The score's default label, e.g. "Standard, Base + Convergence, custom weights". */
export function scoreLabel(
  family: PresetFamily,
  tier: RunTier | undefined,
  weightMode: WeightMode,
): string {
  return [
    FAMILY_LABELS[family],
    tier && TIER_LABELS[tier],
    weightMode === "custom" && "custom weights",
  ]
    .filter(Boolean)
    .join(", ");
}

/** The default label for each tier the family offers; the workflow takes the one it runs. */
export function scoreLabels(
  family: PresetFamily,
  weightMode: WeightMode,
): Partial<Record<RunTier, string>> {
  return Object.fromEntries(familyTiers(family).map((t) => [t, scoreLabel(family, t, weightMode)]));
}

/**
 * Subtitle shown when the user has not set a custom block label: the score's default label. The
 * tier is the pinned one, else the one the detected features reach; until the UI has detected
 * them, only the family is named.
 */
export function defaultSubtitle(
  data: Pick<
    BlockData,
    | "presetFamily"
    | "tierMode"
    | "tier"
    | "inputFeatures"
    | "weightMode"
    | "customWeights"
    | "ntMutationsCenter"
  >,
): string {
  const tier =
    data.tierMode === "custom" && data.tier !== undefined
      ? canonicalTier(data.presetFamily, data.tier)
      : data.inputFeatures &&
        tierFor(data.presetFamily, new Set(data.inputFeatures.map((f) => FEATURE_SIGNAL[f])));
  return scoreLabel(data.presetFamily, tier, appliedWeightMode(data));
}
