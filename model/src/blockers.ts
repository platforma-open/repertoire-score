import type {
  FeatureKey,
  PresetFamily,
} from "@platforma-open/milaboratories.repertoire-score.kind";
import { FEATURE_ORDER, FEATURE_SIGNAL, PRESET_COEFFICIENTS } from "./presets";
import type { FeatureAvailability } from "./types";

// The workflow's stop messages (workflow/src/main.tpl.tengo), word for word, so Settings warns
// before Run with the text the run would stop with. Its light-chain stop has no mirror: the
// dataset picker does not offer light-chain-only datasets (`isLightChainOnlyDataset`).
export const NO_VDJ_REGION_MESSAGE =
  "Repertoire Score needs somatic-mutation columns, which MiXCR Clonotyping exports only for a full-length VDJRegion assembly. This dataset has none.";
export const NO_HEAVY_COUNT_MESSAGE =
  "The Antigen-selected preset needs MiXCR's per-gene heavy-chain mutation counts. This dataset has none.";

/**
 * The message the run would stop with for this dataset and family, or undefined. Same checks, in
 * the same order, as the workflow: a preset mutation feature without a column (the heavy-chain
 * count separately).
 */
export function scoreBlocker(
  availability: Pick<FeatureAvailability, "features">,
  family: PresetFamily,
): string | undefined {
  const present = new Set(availability.features);
  // Every tier of a family scores the same mutation features.
  const scored = new Set<FeatureKey>();
  for (const row of Object.values(PRESET_COEFFICIENTS[family])) {
    for (const f of Object.keys(row) as FeatureKey[]) scored.add(f);
  }
  const missing = FEATURE_ORDER.filter(
    (f) => scored.has(f) && FEATURE_SIGNAL[f] === "mutations" && !present.has(f),
  );
  if (missing.some((f) => f !== "heavyNtMutationsVJ")) return NO_VDJ_REGION_MESSAGE;
  if (missing.includes("heavyNtMutationsVJ")) return NO_HEAVY_COUNT_MESSAGE;
  return undefined;
}
