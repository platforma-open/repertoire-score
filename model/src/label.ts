import { canonicalTier } from "./presets";
import type { BlockData, RunTier } from "./types";

// User-facing tier names — by signals, not tier ids. "Base" = the MiXCR mutation terms every tier
// includes; a family's second tier adds its signal on top (`familyTiers`).
export const TIER_LABELS: Record<RunTier, string> = {
  "1": "Base: mutations",
  "2a": "Base + Convergence",
  "2b": "Base + Generation probability",
};

/**
 * Subtitle shown when the user has not set a custom block label: the dataset's label, then the
 * tier when the user pinned one (as the family runs it). In the default tier mode the tier follows
 * the signals present in the result pool, which the subtitle cannot see, so it is not named.
 */
export function defaultSubtitle(
  data: Pick<BlockData, "subtitleLabel" | "tierMode" | "tier" | "presetFamily">,
): string {
  const tierLabel =
    data.tierMode === "custom" && data.tier !== undefined
      ? TIER_LABELS[canonicalTier(data.presetFamily, data.tier)]
      : undefined;
  return [data.subtitleLabel, tierLabel].filter(Boolean).join(" · ");
}
