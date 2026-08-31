import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import type { PlRef } from "@platforma-sdk/model";
import { isPlRef } from "@platforma-sdk/model";
import { name, version } from "../package.json" with { type: "json" };
import type { FeatureKey, PresetFamily, SelectableTier, WeightMode } from "./types";
import { FEATURE_KEYS, PRESET_FAMILIES, SELECTABLE_TIERS, WEIGHT_MODES } from "./types";

export type { FeatureKey, PresetFamily, SelectableTier, WeightMode } from "./types";
export { FEATURE_KEYS, PRESET_FAMILIES, SELECTABLE_TIERS, WEIGHT_MODES } from "./types";

/**
 * This block's init-params contract — everything a user sets by hand: the
 * dataset to score, the subtitle they type, and the whole scoring recipe
 * (preset family, tier choice, weight mode and any per-feature weights they
 * edited).
 *
 * Left out: `defaultBlockLabel`, which a `watchEffect` derives from the dataset
 * and the resolved tier, and the table / histogram / scatter view state.
 *
 * Every field is optional because the projection hands live state back
 * untouched, and a block whose dataset is not picked yet holds `undefined`
 * there. Requiring one would make the block export a file its own kind refuses
 * to apply, so export and apply would stop being inverses.
 */
export type BlockParams = {
  inputAnchor?: PlRef;
  customBlockLabel?: string;
  presetFamily?: PresetFamily;
  tierMode?: WeightMode;
  tier?: SelectableTier;
  weightMode?: WeightMode;
  customWeights?: Partial<Record<FeatureKey, number>>;
};

/** The same contract at runtime, for params arriving from a template file rather than typed code. */
function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const { inputAnchor, customBlockLabel, presetFamily, tierMode, tier, weightMode, customWeights } =
    value;

  if (inputAnchor !== undefined && !isPlRef(inputAnchor)) {
    throw new Error(
      "'inputAnchor' must be a reference to an upstream column, written as { block, name }.",
    );
  }
  if (customBlockLabel !== undefined && typeof customBlockLabel !== "string") {
    throw new Error("'customBlockLabel' must be a string.");
  }
  assertOneOf(presetFamily, PRESET_FAMILIES, "presetFamily");
  assertOneOf(tierMode, WEIGHT_MODES, "tierMode");
  assertOneOf(tier, SELECTABLE_TIERS, "tier");
  assertOneOf(weightMode, WEIGHT_MODES, "weightMode");

  if (customWeights !== undefined) assertCustomWeights(customWeights);

  return {
    inputAnchor,
    customBlockLabel,
    presetFamily: presetFamily as PresetFamily | undefined,
    tierMode: tierMode as WeightMode | undefined,
    tier: tier as SelectableTier | undefined,
    weightMode: weightMode as WeightMode | undefined,
    customWeights,
  };
}

function assertOneOf(value: unknown, allowed: readonly string[], field: string) {
  if (value !== undefined && !allowed.includes(value as string)) {
    throw new Error(`'${field}' must be one of: ${allowed.join(", ")}.`);
  }
}

/**
 * Only edited features are stored, so a partial map is the normal shape and an
 * empty one is valid. Keys are checked against the feature vocabulary because an
 * unknown key here is a weight that would silently never be applied.
 */
function assertCustomWeights(value: unknown): asserts value is Partial<Record<FeatureKey, number>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("'customWeights' must be an object mapping feature keys to numbers.");
  }
  for (const [key, weight] of Object.entries(value)) {
    if (!FEATURE_KEYS.includes(key as FeatureKey)) {
      throw new Error(`'customWeights.${key}' is not a known feature key.`);
    }
    if (typeof weight !== "number") {
      throw new Error(`'customWeights.${key}' must be a number.`);
    }
  }
}

// Identity (`name`/`version`) comes from this package's own `package.json`, so
// the on-wire `{name}@{version}` reference can never drift from what npm
// publishes; the bundler inlines the JSON import.
export const kind = defineBlockKind<BlockParams>({ name, version, parseInitializationParams });
