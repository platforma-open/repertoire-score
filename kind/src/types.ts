/**
 * The scoring-configuration vocabulary. It lives in the kind because the kind's
 * init-params contract names these types, and the kind cannot import from the
 * model (the model depends on the kind, not the other way round). The model
 * re-exports them, so there is still one definition.
 */

/**
 * Preset family = the experimental-design context the user declares. This is the primary
 * user-facing configuration; the tier and coefficients auto-resolve. Default is "standard".
 *
 * NB: "family" here means the *preset* context — NOT a signal kind.
 */
export type PresetFamily = "standard" | "antigen-selected";

/**
 * A tier the user can pin in Custom mode. The baseline-absent "none" state is not
 * selectable — it means the block cannot score.
 */
export type SelectableTier = "1" | "2a" | "2b" | "3";

/** Weight-editor mode. */
export type WeightMode = "default" | "custom";

/**
 * A single composite feature — the granularity the coefficients are defined at. One signal
 * can expand to several features (mutations → 4). Grouped back to signals in the UI.
 */
export type FeatureKey =
  | "cdrMutationFraction"
  | "aaMutationsCDR"
  | "aaMutationsFWR"
  | "ntMutations"
  | "logCells"
  | "negLogPgen"
  | "negLogLightPgen"
  | "fastStar";

export const PRESET_FAMILIES: readonly PresetFamily[] = ["standard", "antigen-selected"];
export const SELECTABLE_TIERS: readonly SelectableTier[] = ["1", "2a", "2b", "3"];
export const WEIGHT_MODES: readonly WeightMode[] = ["default", "custom"];
export const FEATURE_KEYS: readonly FeatureKey[] = [
  "cdrMutationFraction",
  "aaMutationsCDR",
  "aaMutationsFWR",
  "ntMutations",
  "logCells",
  "negLogPgen",
  "negLogLightPgen",
  "fastStar",
];
