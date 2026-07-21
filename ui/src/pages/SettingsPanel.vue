<script setup lang="ts">
import type {
  FeatureKey,
  PresetFamily,
  SelectableTier,
  SignalKind,
} from "@platforma-open/milaboratories.repertoire-score.model";
import {
  defaultFeatureWeights,
  FEATURE_ORDER,
  FEATURE_SIGNAL,
} from "@platforma-open/milaboratories.repertoire-score.model";
import {
  PlAccordionSection,
  PlAlert,
  PlBtnGhost,
  PlBtnGroup,
  PlDropdown,
  PlDropdownRef,
  PlMaskIcon24,
  PlNumberField,
} from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";

const app = useApp();

// A-0024: preset family is the primary user-facing configuration for this block.
const familyOptions: { value: PresetFamily; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "antigen-selected", label: "Antigen-selected" },
];

const tierModeOptions = [
  { value: "automatic" as const, label: "Automatic" },
  { value: "custom" as const, label: "Custom" },
];

const weightModeOptions = [
  { value: "preset" as const, label: "Preset" },
  { value: "custom" as const, label: "Custom" },
];

// Biologist-facing labels — by signals, not tier ids (A-0018). "Base" = the
// mutations + abundance MiXCR floor that every tier includes; higher tiers add
// signals on top. Tier 1 defines it; the rest reference it.
const TIER_LABELS: Record<SelectableTier, string> = {
  "1": "Base: mutations + abundance",
  "2a": "Base + Convergence",
  "2b": "Base + Generation probability",
  "3": "Base + Convergence + Generation probability",
};

// Signal-group headers for the weight editor.
const SIGNAL_LABELS: Record<SignalKind, string> = {
  mutations: "Mutations",
  abundance: "Abundance",
  pgen: "Generation probability",
  convergence: "Convergence",
};

// Per-feature labels + zero-prior-knowledge explanations (weight editor rows).
const FEATURE_LABELS: Record<FeatureKey, string> = {
  cdrMutationFraction: "CDR mutation fraction",
  aaMutationsCDR: "AA mutations (CDR)",
  aaMutationsFWR: "AA mutations (FWR)",
  ntMutations: "Nt mutations",
  logCells: "Abundance (log cells)",
  negLogPgen: "Generation probability (-log10)",
  fastStar: "Convergence (fast-STAR)",
};
const FEATURE_TOOLTIPS: Record<FeatureKey, string> = {
  cdrMutationFraction: "Fraction of CDR positions mutated from germline.",
  aaMutationsCDR: "Number of amino-acid changes in the CDRs (the antigen-contact loops).",
  aaMutationsFWR: "Number of amino-acid changes in the framework regions.",
  ntMutations: "Total nucleotide substitutions from the germline V(D)J.",
  logCells: "Clone size — supporting cells, log-compressed.",
  negLogPgen: "How rare the sequence is under random recombination; higher = rarer.",
  fastStar:
    "Whether the clone sits in a convergent CDR3 neighbourhood — evidence of antigen-driven selection.",
};

// The Custom dropdown lists only tiers reachable with the signals actually present.
const tierOptions = computed(() =>
  (app.model.outputs.featureAvailability?.reachableTiers ?? []).map((t) => ({
    value: t,
    label: TIER_LABELS[t],
  })),
);

// Optional signals absent from the pool. Stated neutrally — what's missing + its
// source block — with no "add the block" imperative, so the same message is correct
// whether the block simply isn't in the project OR is present but declined to emit
// for this input (e.g. unsupported species). The user reads the source and runs it
// if their data allows. Only shown once the base (MiXCR) is present.
const suggestions = computed(() => {
  const a = app.model.outputs.featureAvailability;
  if (!a || !a.hasMixcr) return [];
  const out: string[] = [];
  if (!a.hasPgen)
    out.push("Generation probability not included. Source: Generation Probability block.");
  if (!a.hasConvergence) out.push("Convergence not included. Source: Convergence Score block.");
  return out;
});

// Switching to Custom seeds the pinned tier with the current auto pick — a user
// gesture, not a watcher on an output, so it's hairpin-free.
function setTierMode(mode: "automatic" | "custom") {
  app.model.data.tierMode = mode;
  if (mode === "custom") {
    const reachable = app.model.outputs.featureAvailability?.reachableTiers ?? [];
    const current = app.model.data.tier;
    if (current === undefined || !reachable.includes(current)) {
      const auto = app.model.outputs.featureAvailability?.tier;
      app.model.data.tier = auto && auto !== "none" ? auto : reachable[reachable.length - 1];
    }
  }
}

// The tier the score would actually use: pinned in custom, else the auto pick.
const resolvedTier = computed<SelectableTier | undefined>(() => {
  const a = app.model.outputs.featureAvailability;
  if (!a || a.tier === "none") return undefined;
  if (app.model.data.tierMode === "custom" && app.model.data.tier) return app.model.data.tier;
  return a.tier;
});

// Preset default coefficients for the resolved (family, tier) — the real A-0027 values.
const weightDefaults = computed<Partial<Record<FeatureKey, number>>>(() =>
  resolvedTier.value ? defaultFeatureWeights(app.model.data.presetFamily, resolvedTier.value) : {},
);

// The features (rows) of the current preset, in signal-grouped display order.
const presetFeatures = computed<FeatureKey[]>(() =>
  FEATURE_ORDER.filter((f) => f in weightDefaults.value),
);

// Displayed value: the user's edit if present, else the preset default.
function weightValue(feature: FeatureKey): number {
  return app.model.data.customWeights?.[feature] ?? weightDefaults.value[feature] ?? 0;
}

function setWeight(feature: FeatureKey, v: number | undefined) {
  if (v === undefined || Number.isNaN(v)) return;
  app.model.data.customWeights = { ...(app.model.data.customWeights ?? {}), [feature]: v };
}

// Reset discards custom edits — the display then falls back to the preset defaults.
function resetWeights() {
  app.model.data.customWeights = {};
}

// True when this feature starts a new signal group (drives the group header).
function startsGroup(index: number): boolean {
  if (index === 0) return true;
  return (
    FEATURE_SIGNAL[presetFeatures.value[index]] !== FEATURE_SIGNAL[presetFeatures.value[index - 1]]
  );
}
</script>

<template>
  <PlDropdownRef
    v-model="app.model.data.inputAnchor"
    :options="app.model.outputs.inputOptions ?? []"
    label="Input dataset"
    clearable
    required
  >
    <template #tooltip> MiXCR clonotyping output to score. </template>
  </PlDropdownRef>

  <PlDropdown v-model="app.model.data.presetFamily" :options="familyOptions" label="Preset family">
    <template #tooltip>
      Describes how the sample was prepared — this selects the scoring recipe.<br />
      <b>Standard</b> — an immunised repertoire with no antigen-binding pre-sort.<br />
      <b>Antigen-selected</b> — cells first enriched for antigen binding (e.g. FACS with a tetramer
      or bait).
    </template>
  </PlDropdown>

  <PlAlert v-if="suggestions.length > 0" type="info" :closeable="true">
    <template #title>Signals not included</template>
    <div v-for="s in suggestions" :key="s">{{ s }}</div>
  </PlAlert>

  <PlAccordionSection label="Advanced settings">
    <PlBtnGroup
      :model-value="app.model.data.tierMode"
      :options="tierModeOptions"
      label="Scoring signals"
      @update:model-value="setTierMode"
    >
      <template #tooltip>
        Which sequence signals feed the score.<br />
        <b>Automatic</b> — use every signal available upstream (recommended).<br />
        <b>Custom</b> — choose a specific combination.
      </template>
    </PlBtnGroup>
    <PlDropdown
      v-if="app.model.data.tierMode === 'custom'"
      v-model="app.model.data.tier"
      :options="tierOptions"
      label="Signals used"
    >
      <template #tooltip>
        Each option builds on the <b>Base</b> (mutations + abundance, always from MiXCR); higher
        options add more evidence when it is available upstream.
      </template>
    </PlDropdown>

    <PlBtnGroup v-model="app.model.data.weightMode" :options="weightModeOptions" label="Weights">
      <template #tooltip>
        How much each feature contributes to the final score.<br />
        <b>Preset</b> — calibrated defaults (recommended).<br />
        <b>Custom</b> — set the weights yourself.
      </template>
    </PlBtnGroup>
    <template v-if="app.model.data.weightMode === 'custom' && presetFeatures.length > 0">
      <template v-for="(f, i) in presetFeatures" :key="f">
        <div v-if="startsGroup(i)" :class="$style.groupLabel">
          {{ SIGNAL_LABELS[FEATURE_SIGNAL[f]] }}
        </div>
        <PlNumberField
          :model-value="weightValue(f)"
          :label="FEATURE_LABELS[f]"
          :step="0.1"
          @update:model-value="(v) => setWeight(f, v)"
        >
          <template #tooltip>{{ FEATURE_TOOLTIPS[f] }}</template>
        </PlNumberField>
      </template>
      <PlBtnGhost @click.stop="resetWeights">
        Reset to default
        <template #append>
          <PlMaskIcon24 name="reverse" />
        </template>
      </PlBtnGhost>
      <PlAlert type="info">
        Provisional v1 coefficients (A-0027) — Standard hand-set, Antigen-selected fitted on one
        dataset.
      </PlAlert>
    </template>
  </PlAccordionSection>
</template>

<style module>
.groupLabel {
  font-weight: 600;
  font-size: 13px;
  margin-top: 8px;
  color: var(--txt-01, #111827);
}
</style>
