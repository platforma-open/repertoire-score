import type { GraphMakerState } from "@milaboratories/graph-maker";
import type { PlDataTableStateV2, PlRef } from "@platforma-sdk/model";

/**
 * Preset family = the experimental-design context the user declares. This is the primary
 * user-facing configuration; the tier and coefficients auto-resolve. Default is "standard".
 *
 * NB: "family" here means the *preset* context — NOT a signal kind. See {@link SignalKind}.
 */
export type PresetFamily = "standard" | "antigen-selected";

/**
 * A tier the user can pin in Custom mode. The baseline-absent "none" state is not
 * selectable — it means the block cannot score.
 */
export type SelectableTier = "1" | "2a" | "2b" | "3";

/** Weight-editor mode. */
export type WeightMode = "automatic" | "custom";

/** Unified block data (UI-editable state). */
export type BlockData = {
  inputAnchor?: PlRef;
  presetFamily: PresetFamily;
  // Scoring-signals control:
  //   "automatic" — highest reachable tier; auto-upgrades as upstream signals appear.
  //   "custom"    — pin `tier` explicitly.
  tierMode: "automatic" | "custom";
  tier?: SelectableTier;
  // Weight editor: "automatic" uses the calibrated preset coefficients; "custom" uses
  // `customWeights`, seeded from the preset defaults.
  weightMode: WeightMode;
  // Per-feature custom weights. Only edited features are stored; the rest fall back to the
  // preset default. Persists across preset/custom toggles; Reset clears it.
  customWeights?: Partial<Record<FeatureKey, number>>;
  // View state for the Main-page results table (UI-only; never projected to args).
  tableState: PlDataTableStateV2;
  // View state for the Distributions histogram (score + per-feature). UI-only.
  graphStateHistogram: GraphMakerState;
};

/** Workflow args projected from `data`. The workflow resolves the effective tier from
 *  the columns it actually discovers; args carries only the user's intent. */
export type BlockArgs = {
  inputAnchor: PlRef;
  presetFamily: PresetFamily;
  tierMode: "automatic" | "custom";
  tier?: SelectableTier;
  weightMode: WeightMode;
  customWeights?: Partial<Record<FeatureKey, number>>;
  // Calibrated preset coefficients for the selected family, keyed by tier. The workflow
  // resolves the effective tier from the columns it discovers, then indexes this map — so
  // the coefficients travel with args rather than being duplicated in Tengo.
  coefficients: Record<SelectableTier, Partial<Record<FeatureKey, number>>>;
  // Static feature taxonomy shipped from the model so it has ONE source of truth
  // (presets.ts FEATURE_ORDER / FEATURE_SIGNAL) instead of a hand-kept Tengo copy. The
  // workflow needs a canonical order anyway (Tengo map iteration is non-deterministic).
  featureOrder: FeatureKey[];
  featureSignal: Record<FeatureKey, SignalKind>;
};

/**
 * One component signal the composite can draw from. Distinct from {@link PresetFamily}:
 * "family" is the preset context, not the signal kind.
 */
export type SignalKind = "mutations" | "abundance" | "pgen" | "convergence";

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
  | "fastStar";

/**
 * Preset tier implied by which upstream signals are present. `"none"` = the MiXCR baseline
 * (mutations / abundance) is not present, so the block cannot score.
 */
export type PresetTier = "none" | SelectableTier;

/** Reactive read-out of what the composite could use for the selected dataset. */
export type FeatureAvailability = {
  signals: SignalKind[];
  /** Highest reachable tier given the present signals (what "Automatic" selects). */
  tier: PresetTier;
  /** Tiers the user may pin in Custom mode — only those whose signals are all present. */
  reachableTiers: SelectableTier[];
  hasMixcr: boolean;
  hasPgen: boolean;
  hasConvergence: boolean;
};
