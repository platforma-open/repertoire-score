import type { PlRef } from "@platforma-sdk/model";

/**
 * Preset family = the experimental-design context the user declares (spec A-0017 / A-0024).
 * This is the primary user-facing configuration; the tier and coefficients auto-resolve.
 * Default is "standard".
 *
 * NB: "family" here means the *preset* context — NOT a signal kind. See {@link SignalKind}.
 */
export type PresetFamily = "standard" | "antigen-selected";

/**
 * A tier the user can pin in Custom mode (spec A-0018). The baseline-absent "none"
 * state is not selectable — it means the block cannot score.
 */
export type SelectableTier = "1" | "2a" | "2b" | "3";

/** Weight-editor mode (spec A-0015 / A-0024 advanced). */
export type WeightMode = "preset" | "custom";

/**
 * Unified block data (UI-editable state).
 *
 * Phase 0 carries the input dataset, the preset family (A-0024's primary knob), and the
 * scoring-signals control (A-0018 / A-0024 "advanced"). The per-feature weights /
 * custom-variant fields belong to the composite work (spec Q-0001 / A-0016, PLAN §5.1)
 * and land in a later phase — intentionally omitted here.
 */
export type BlockData = {
  inputAnchor?: PlRef;
  presetFamily: PresetFamily;
  // Scoring-signals control:
  //   "automatic" — highest reachable tier; auto-upgrades as upstream signals appear.
  //   "custom"    — pin `tier` explicitly.
  tierMode: "automatic" | "custom";
  tier?: SelectableTier;
  // Weight editor: "preset" uses the calibrated coefficients; "custom" uses `customWeights`,
  // seeded from the preset defaults. (Defaults are the stub seam — all 1 — pending real
  // coefficients from the composite work, PLAN §5.1.)
  weightMode: WeightMode;
  // Per-feature custom weights (spec A-0027 granularity). Only edited features are stored; the
  // rest fall back to the preset default. Persists across preset/custom toggles; Reset clears it.
  customWeights?: Partial<Record<FeatureKey, number>>;
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
};

/**
 * One component signal the composite can draw from (spec A-0016 features).
 * Distinct from {@link PresetFamily}: "family" in the spec is the preset context,
 * not the signal kind.
 */
export type SignalKind = "mutations" | "abundance" | "pgen" | "convergence";

/**
 * A single composite feature — the granularity the coefficients are defined at (spec A-0027).
 * One signal can expand to several features (mutations → 4). Grouped back to signals in the UI.
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
 * Preset tier implied by which upstream signals are present (spec A-0018).
 * `"none"` = the MiXCR baseline (mutations / abundance) is not present, so the
 * block cannot score.
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
