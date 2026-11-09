import type { SelectableTier } from "@platforma-open/milaboratories.repertoire-score.kind";
import type { BlockData } from "./types";

// User-facing tier names — by signals, not tier ids. "Base" = the mutations + abundance
// MiXCR floor that every tier includes; higher tiers add signals on top.
export const TIER_LABELS: Record<SelectableTier, string> = {
  "1": "Base: mutations + abundance",
  "2a": "Base + Convergence",
  "2b": "Base + Generation probability",
  "3": "Base + Convergence + Generation probability",
};

/**
 * Subtitle shown when the user has not set a custom block label: the dataset's label, then the
 * tier when the user pinned one. In the default tier mode the tier follows the signals present
 * in the result pool, which the subtitle cannot see, so it is not named.
 */
export function defaultSubtitle(
  data: Pick<BlockData, "subtitleLabel" | "tierMode" | "tier">,
): string {
  const tierLabel =
    data.tierMode === "custom" && data.tier !== undefined ? TIER_LABELS[data.tier] : undefined;
  return [data.subtitleLabel, tierLabel].filter(Boolean).join(" · ");
}
