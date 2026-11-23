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
  /**
   * Optional `pl7.app/isSubset` column picked alongside the dataset (e.g. a repertoire-labeling
   * label). Only clonotypes present in it are scored, and only signals computed on the same
   * subset (or, for Pgen, on the full data) are used.
   */
  filterRef?: PlRef;
  /**
   * PlRefs of the OPTIONAL upstream signal columns present for `inputAnchor`.
   * Their presence in args is what makes the platform record this block's dependency on the
   * blocks that produce them.
   *
   * `undefined` means never synced, and is NOT `[]` (synced, found none). Such a block still
   * carries `requireEnrichments` on `inputAnchor`; the UI drops that flag in the same write
   * that fills these in.
   */
  optionalSignalRefs?: PlRef[];
  /**
   * The score features detected for `inputAnchor` (and `filterRef`), kept in sync by the UI so
   * `argsIssues` can keep Run off when the run would stop on this dataset. `undefined` means not
   * detected yet: Run stays on and the workflow's stop is the guard.
   */
  inputFeatures?: FeatureKey[];
  // User-editable block label.
  customBlockLabel?: string;
  /** The dataset's (or subset's) label the subtitle showed up to 2.0.0. No longer written or read. */
  subtitleLabel?: string;
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
  // Custom centre k of |nt mutations − k|, used in "custom" weight mode; absent = the preset's.
  // Reset clears it.
  ntMutationsCenter?: number;
  // View state for the Main-page results table (UI-only; never projected to args).
  tableState: PlDataTableStateV2;
  // View state for the Distributions histogram (score + per-feature). UI-only.
  graphStateHistogram: GraphMakerState;
  // View state for the Comparison scatterplot (any signal vs any signal). UI-only.
  graphStateScatter: GraphMakerState;
};

/** Data as stored before `subtitleLabel` replaced the UI-computed `defaultBlockLabel`. */
export type BlockDataV1 = Omit<BlockData, "subtitleLabel"> & {
  defaultBlockLabel?: string;
};

/** Workflow args projected from `data`. The workflow resolves the effective tier from
 *  the columns it actually discovers; args carries only the user's intent. */
export type BlockArgs = {
  inputAnchor: PlRef;
  /** `filterRef` as its column id: the form upstream blocks stamp as `pl7.app/inputSubset`. */
  inputFilter?: string;
  /** Absent while never synced. */
  optionalSignalRefs?: PlRef[];
  presetFamily: PresetFamily;
  tierMode: "default" | "custom";
  tier?: RunTier;
  weightMode: WeightMode;
  customWeights?: Partial<Record<FeatureKey, number>>;
  // Calibrated preset coefficients for the selected family, keyed by tier. The workflow
  // resolves the effective tier from the columns it discovers, then indexes this map — so
  // the coefficients travel with args rather than being duplicated in Tengo.
  coefficients: Partial<Record<RunTier, Partial<Record<FeatureKey, number>>>>;
  // Static feature taxonomy shipped from the model so it has ONE source of truth
  // (presets.ts FEATURE_ORDER / FEATURE_SIGNAL) instead of a hand-kept Tengo copy. The
  // workflow needs a canonical order anyway (Tengo map iteration is non-deterministic).
  featureOrder: FeatureKey[];
  featureSignal: Record<FeatureKey, SignalKind>;
  /** Centre k of `ntMutationsDistance` = |nt mutations − k| (presets.ts NT_MUTATIONS_CENTER). */
  ntMutationsCenter: number;
  /** The score's trace label. Absent without a custom block label. */
  customBlockLabel?: string;
  /** The trace label per tier when there is no custom block label (`scoreLabels`). */
  defaultLabels: Partial<Record<RunTier, string>>;
};

/**
 * One component signal the composite can draw from. Distinct from {@link PresetFamily}:
 * "family" is the preset context, not the signal kind.
 */
export type SignalKind = "mutations" | "abundance" | "pgen" | "convergence";

/**
 * A tier some family runs. A saved `SelectableTier` can also be "3" (from a block saved with
 * 1.4.x); `canonicalTier` maps it to one of these.
 */
export type RunTier = Exclude<SelectableTier, "3">;

/**
 * Preset tier implied by which upstream signals are present. `"none"` = no MiXCR mutation column
 * is present, so the block cannot score.
 */
export type PresetTier = "none" | RunTier;

/** Reactive read-out of what the composite could use for the selected dataset. */
export type FeatureAvailability = {
  /** Highest reachable tier of `family` given the present signals (what "Default" selects). */
  tier: PresetTier;
  /** Tiers of `family` the user may pin in Custom mode — only those whose signals are all
   *  present. */
  reachableTiers: RunTier[];
  /** A MiXCR mutation column is present. */
  hasMixcr: boolean;
  hasPgen: boolean;
  hasConvergence: boolean;
  /** Features with a column, as the workflow would feed them (`ntMutations` also gives
   *  `ntMutationsDistance`; `heavyNtMutationsVJ` only from a heavy-chain V count). */
  features: FeatureKey[];
  /** PlRefs of the optional signal columns `family` scores, canonically ordered. Mirrored into
   *  `data.optionalSignalRefs` by the UI — see {@link BlockData.optionalSignalRefs}. */
  optionalSignalRefs: PlRef[];
  /** The preset family the tiers and refs are for. Checked like `anchor`. */
  family: PresetFamily;
  /** The anchor these facts describe. Recomputed a render after `data.inputAnchor` changes,
   *  so the UI checks it before mirroring refs that may belong to the previous dataset. */
  anchor: PlRef;
  /** The subset filter (column id) these facts were computed for, undefined for full data.
   *  Checked like `anchor`: a filter change also changes which signals count. */
  subsetId?: string;
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
  transform: "identity" | "distance" | "sumVJ";
  /** Coefficient actually applied to this feature. */
  coefficient: number;
  /** Centre k of a "distance" transform. */
  center?: number;
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
