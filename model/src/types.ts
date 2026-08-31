import type { GraphMakerState } from "@milaboratories/graph-maker";
// The scoring-configuration vocabulary lives in the kind: the kind's
// init-params contract names these types and a kind cannot import from the
// model. Imported here for the types below that are composed from them.
import type {
  FeatureKey,
  PresetFamily,
  SelectableTier,
  WeightMode,
} from "@platforma-open/milaboratories.repertoire-score.kind";
import type { PlDataTableStateV2, PlRef } from "@platforma-sdk/model";

/** Unified block data (UI-editable state). */
export type BlockData = {
  inputAnchor?: PlRef;
  // User-editable block label.
  customBlockLabel?: string;
  // Auto-generated default label.
  defaultBlockLabel?: string;
  presetFamily: PresetFamily;
  // Scoring-signals control:
  //   "default" — highest reachable tier; auto-upgrades as upstream signals appear.
  //   "custom"    — pin `tier` explicitly.
  tierMode: "default" | "custom";
  tier?: SelectableTier;
  // Weight editor: "default" uses the calibrated preset coefficients; "custom" uses
  // `customWeights`, seeded from the preset defaults.
  weightMode: WeightMode;
  // Per-feature custom weights. Only edited features are stored; the rest fall back to the
  // preset default. Persists across default/custom toggles; Reset clears it.
  customWeights?: Partial<Record<FeatureKey, number>>;
  // View state for the Main-page results table (UI-only; never projected to args).
  tableState: PlDataTableStateV2;
  // View state for the Distributions histogram (score + per-feature). UI-only.
  graphStateHistogram: GraphMakerState;
  // View state for the Comparison scatterplot (any signal vs any signal). UI-only.
  graphStateScatter: GraphMakerState;
};

/** Workflow args projected from `data`. The workflow resolves the effective tier from
 *  the columns it actually discovers; args carries only the user's intent. */
export type BlockArgs = {
  inputAnchor: PlRef;
  presetFamily: PresetFamily;
  tierMode: "default" | "custom";
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
 * Preset tier implied by which upstream signals are present. `"none"` = the MiXCR baseline
 * (mutations / abundance) is not present, so the block cannot score.
 */
export type PresetTier = "none" | SelectableTier;

/** Reactive read-out of what the composite could use for the selected dataset. */
export type FeatureAvailability = {
  signals: SignalKind[];
  /** Highest reachable tier given the present signals (what "Default" selects). */
  tier: PresetTier;
  /** Tiers the user may pin in Custom mode — only those whose signals are all present. */
  reachableTiers: SelectableTier[];
  hasMixcr: boolean;
  hasPgen: boolean;
  hasConvergence: boolean;
};

/** One column's entry in the score-provenance log (`scoreLog` output). */
export type ScoreLogColumn = {
  /** Internal composite feature key. */
  feature: FeatureKey;
  /** Chain slot: "A" (heavy/primary), "B" (light), "x" (bulk / chain-agnostic). */
  chain: "A" | "B" | "x";
  /** Source PColumn name this feature was matched from. */
  sourceColumn: string;
  /** Raw->analysis mapping applied before ranking. */
  transform: "identity" | "log1p" | "hitFlag";
  /** Coefficient actually applied to this feature. */
  coefficient: number;
};

/**
 * Diagnostic manifest of the weights and columns the composite score used, for
 * double-checking. Emitted by the workflow as the `scoreLog` output.
 */
export type ScoreLog = {
  preset: string;
  tier: string;
  family: string;
  weightMode: string;
  columns: ScoreLogColumn[];
};
