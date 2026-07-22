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
  PlAlert,
  PlBtnGhost,
  PlBtnGroup,
  PlDropdown,
  PlDropdownRef,
  PlMaskIcon24,
  PlNumberField,
  PlRow,
  PlSectionSeparator,
} from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";

const app = useApp();

// `featureAvailability` is a retentive model output (see model): it holds its last stable
// value while the block reruns, instead of transiently shrinking as the upstream enrichment
// columns drop out of the anchored discovery mid-run. So the Settings controls can read it
// directly and the "Signals used" dropdown keeps its options during a run.
const availability = computed(() => app.model.outputs.featureAvailability);

// Preset family is the primary user-facing configuration for this block.
const familyOptions: { value: PresetFamily; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "antigen-selected", label: "Antigen-selected" },
];

const tierModeOptions = [
  { value: "default" as const, label: "Default" },
  { value: "custom" as const, label: "Custom" },
];

const weightModeOptions = [
  { value: "default" as const, label: "Default" },
  { value: "custom" as const, label: "Custom" },
];

// Biologist-facing labels — by signals, not tier ids. "Base" = the mutations + abundance
// MiXCR floor that every tier includes; higher tiers add signals on top.
const TIER_LABELS: Record<SelectableTier, string> = {
  "1": "Base: mutations + abundance",
  "2a": "Base + Convergence",
  "2b": "Base + Generation probability",
  "3": "Base + Convergence + Generation probability",
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
  (availability.value?.reachableTiers ?? []).map((t) => ({
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
  const a = availability.value;
  if (!a || !a.hasMixcr) return [];
  const out: string[] = [];
  if (!a.hasPgen)
    out.push("Generation probability not included. Source: Generation Probability block.");
  if (!a.hasConvergence) out.push("Convergence not included. Source: Convergence Score block.");
  return out;
});

// Switching to Custom seeds the pinned tier with the current auto pick — a user
// gesture, not a watcher on an output, so it's hairpin-free.
function setTierMode(mode: "default" | "custom") {
  app.model.data.tierMode = mode;
  if (mode === "custom") {
    const reachable = availability.value?.reachableTiers ?? [];
    const current = app.model.data.tier;
    if (current === undefined || !reachable.includes(current)) {
      const auto = availability.value?.tier;
      app.model.data.tier = auto && auto !== "none" ? auto : reachable[reachable.length - 1];
    }
  }
}

// The tier the score would actually use: pinned in custom, else the auto pick.
const resolvedTier = computed<SelectableTier | undefined>(() => {
  const a = availability.value;
  if (!a || a.tier === "none") return undefined;
  if (app.model.data.tierMode === "custom" && app.model.data.tier) return app.model.data.tier;
  return a.tier;
});

// Preset default coefficients for the resolved (family, tier).
const weightDefaults = computed<Partial<Record<FeatureKey, number>>>(() =>
  resolvedTier.value ? defaultFeatureWeights(app.model.data.presetFamily, resolvedTier.value) : {},
);

// The features (rows) of the current preset, in signal-grouped display order.
const presetFeatures = computed<FeatureKey[]>(() =>
  FEATURE_ORDER.filter((f) => f in weightDefaults.value),
);

// Weight-editor rows: mutations together, abundance on its own, generation probability +
// convergence sharing a row. Features stay in formula order (FEATURE_ORDER) and empty groups
// (signals absent for the resolved tier) are dropped. A group of up to 3 features stays on one
// row; a larger group (the Antigen-selected mutations set has 4) is split into rows of 2 so a
// row never gets cramped.
const WEIGHT_ROWS: SignalKind[][] = [["mutations"], ["abundance"], ["pgen", "convergence"]];
const featureRows = computed<FeatureKey[][]>(() => {
  const rows: FeatureKey[][] = [];
  for (const signals of WEIGHT_ROWS) {
    const group = presetFeatures.value.filter((f) => signals.includes(FEATURE_SIGNAL[f]));
    if (group.length === 0) continue;
    if (group.length <= 3) {
      rows.push(group);
    } else {
      for (let i = 0; i < group.length; i += 2) rows.push(group.slice(i, i + 2));
    }
  }
  return rows;
});

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

// Read-only preview of the composite the workflow will apply. The effective coefficient
// per feature is mode-dependent: in "default" weight mode the workflow uses the preset
// coefficients and ignores any stored customWeights (see model index.ts), so the preview
// reads the preset defaults; in "custom" mode it reflects the edited weights. Rendered as
// highlightable segments (coefficients emphasised), like peptide-extraction's pattern preview.
type FormulaSegment = { text: string; coef?: boolean };

function formatCoef(c: number): string {
  return Number(Math.abs(c).toFixed(2)).toString();
}

const formulaSegments = computed<FormulaSegment[]>(() => {
  if (!resolvedTier.value || presetFeatures.value.length === 0) return [];
  const custom = app.model.data.weightMode === "custom";
  const terms: FormulaSegment[] = [];
  for (const f of presetFeatures.value) {
    const coef = custom
      ? (app.model.data.customWeights?.[f] ?? weightDefaults.value[f] ?? 0)
      : (weightDefaults.value[f] ?? 0);
    if (Math.round(Math.abs(coef) * 100) === 0) continue; // rounds to 0 — no contribution
    terms.push({ text: terms.length === 0 ? (coef < 0 ? "−" : "") : coef < 0 ? " − " : " + " });
    terms.push({ text: formatCoef(coef), coef: true });
    terms.push({ text: " · " + FEATURE_LABELS[f] });
  }
  if (terms.length === 0) return [];
  return [{ text: "percentile( " }, ...terms, { text: " )" }];
});
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

  <PlSectionSeparator>Score computation</PlSectionSeparator>

  <div v-if="formulaSegments.length > 0">
    <div :class="$style.formulaLabel">Scoring formula</div>
    <div :class="$style.formulaPreview">
      <span
        v-for="(seg, i) in formulaSegments"
        :key="i"
        :class="seg.coef ? $style.coef : undefined"
        >{{ seg.text }}</span
      >
    </div>
  </div>

  <PlBtnGroup v-model="app.model.data.weightMode" :options="weightModeOptions" label="Weights">
    <template #tooltip>
      How much each feature contributes to the final score.<br />
      <b>Default</b> — calibrated preset defaults (recommended).<br />
      <b>Custom</b> — set the weights yourself.
    </template>
  </PlBtnGroup>
  <template v-if="app.model.data.weightMode === 'custom' && featureRows.length > 0">
    <!-- Weight fields laid out row by row (see featureRows: signals grouped, groups larger
          than 3 split into pairs). Fields in a row grow (flex-1) to fill the full width. -->
    <div :class="$style.weightGroups">
      <div v-for="(row, i) in featureRows" :key="i">
        <PlRow>
          <PlNumberField
            v-for="f in row"
            :key="f"
            class="flex-1"
            :model-value="weightValue(f)"
            :label="FEATURE_LABELS[f]"
            :step="0.1"
            @update:model-value="(v) => setWeight(f, v)"
          >
            <template #tooltip>{{ FEATURE_TOOLTIPS[f] }}</template>
          </PlNumberField>
        </PlRow>
      </div>
    </div>
    <PlBtnGhost :class="$style.resetBtn" @click.stop="resetWeights">
      Reset to default
      <template #append>
        <PlMaskIcon24 name="reverse" />
      </template>
    </PlBtnGhost>
  </template>

  <PlBtnGroup
    :model-value="app.model.data.tierMode"
    :options="tierModeOptions"
    label="Scoring signals"
    @update:model-value="setTierMode"
  >
    <template #tooltip>
      Which sequence signals feed the score.<br />
      <b>Default</b> — use every signal available upstream (recommended).<br />
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
</template>

<style module>
/* Rows of weight fields, stacked vertically. */
.weightGroups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* Tighten the sections's 24px flex gap between the last weight field and Reset. */
.resetBtn {
  margin-top: -16px;
}

/* Formula preview — a read-only monospace summary of the composite (mirrors the
   peptide-extraction pattern preview). */
.formulaLabel {
  font-size: 12px;
  font-weight: 600;
  color: var(--txt-03);
  margin-bottom: 4px;
}
.formulaPreview {
  font-family: var(--font-family-monospace, monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--chip-bg);
  border-radius: var(--border-radius, 6px);
  padding: 8px 10px;
  color: var(--txt-01);
}
.coef {
  color: var(--color-accent-default);
  font-weight: 600;
}
.formulaCaption {
  font-size: 11px;
  line-height: 1.4;
  color: var(--txt-03);
  margin-top: 4px;
}
</style>
