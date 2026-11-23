<script setup lang="ts">
import type {
  FeatureKey,
  PresetFamily,
} from "@platforma-open/milaboratories.repertoire-score.kind";
import type { RunTier } from "@platforma-open/milaboratories.repertoire-score.model";
import {
  appliedWeightMode,
  canonicalTier,
  defaultFeatureWeights,
  FAMILY_LABELS,
  FEATURE_ORDER,
  familySignals,
  NT_MUTATIONS_CENTER,
  scoreBlocker,
  TIER_LABELS,
} from "@platforma-open/milaboratories.repertoire-score.model";
import type { DatasetSelection } from "@platforma-sdk/model";
import {
  createDatasetSelection,
  createPrimaryRef,
  plRefsEqual,
  withEnrichments,
} from "@platforma-sdk/model";
import {
  PlAlert,
  PlBtnGhost,
  PlBtnGroup,
  PlDatasetSelector,
  PlDropdown,
  PlMaskIcon24,
  PlSectionSeparator,
  PlTooltip,
} from "@platforma-sdk/ui-vue";
import { computed, ref } from "vue";
import { useApp } from "../app";

const app = useApp();

const availability = computed(() => app.model.outputs.featureAvailability);

// Preset family is the primary user-facing configuration for this block.
const familyOptions: { value: PresetFamily; label: string; description: string }[] = [
  {
    value: "standard",
    label: FAMILY_LABELS.standard,
    description:
      "No antigen-binding sort before sequencing. Ranks clonotypes by how likely they are to bind.",
  },
  {
    value: "antigen-selected",
    label: FAMILY_LABELS["antigen-selected"],
    description:
      "Cells enriched for antigen binding first (e.g. FACS with a tetramer or bait). Ranks binders by likely affinity.",
  },
];

const tierModeOptions = [
  { value: "default" as const, label: "Default" },
  { value: "custom" as const, label: "Custom" },
];

const weightModeOptions = [
  { value: "default" as const, label: "Default" },
  { value: "custom" as const, label: "Custom" },
];

// Explanation of |Nt mutations − k| for centre k.
function distanceTooltip(k: number): string {
  return (
    `How far the clonotype's nucleotide mutation count is from ${k}.\n` +
    `${k} mutations give 0, and each mutation more or fewer adds 1. With the negative weight, ` +
    `clonotypes nearer ${k} rank higher.`
  );
}

// Per-feature labels (weight editor rows) and zero-prior-knowledge
// explanations for the terms a preset scores (weight editor tooltips).
const FEATURE_LABELS: Record<FeatureKey, string> = {
  cdrMutationFraction: "CDR mutation fraction",
  aaMutationsCDR: "AA mutations (CDR1 + CDR2)",
  aaMutationsFWR: "AA mutations (FWR)",
  ntMutations: "Nt mutations",
  ntMutationsDistance: `|Nt mutations − ${NT_MUTATIONS_CENTER}|`,
  heavyNtMutationsVJ: "Heavy-chain V+J nt mutations",
  logCells: "Abundance (log cells)",
  negLogPgen: "Generation probability (-log10)",
  negLogLightPgen: "Generation probability, light chain (-log10)",
  nbFreq: "Convergence (neighbour frequency)",
  fastStar: "Convergence (fast-STAR)",
};
const FEATURE_TOOLTIPS: Partial<Record<FeatureKey, string>> = {
  aaMutationsCDR: "Number of amino-acid changes in CDR1 and CDR2 (antigen-contact loops).",
  ntMutationsDistance: distanceTooltip(NT_MUTATIONS_CENTER),
  heavyNtMutationsVJ:
    "Nucleotide substitutions from the germline in the heavy-chain V and J genes.",
  negLogPgen: "How rare the sequence is under random recombination; higher = rarer.",
  negLogLightPgen:
    "How rare the light-chain sequence is under random recombination; higher = rarer. A separate signal from the heavy chain.",
  nbFreq:
    "How dense the clone's one-amino-acid CDR3 neighbourhood is in its sample (Clonotype Convergence's neighbour frequency) — a dense neighbourhood suggests antigen-driven selection.",
};

// The Custom dropdown lists only tiers reachable with the signals actually present.
const tierOptions = computed(() =>
  (availability.value?.reachableTiers ?? []).map((t) => ({
    value: t,
    label: TIER_LABELS[t],
  })),
);

// The message the run would stop with for this dataset and family (no VDJRegion mutation columns,
// no heavy-chain count), shown before Run.
const blocker = computed(() => {
  const a = availability.value;
  return a ? scoreBlocker(a, app.model.data.presetFamily) : undefined;
});

// Optional signals the family uses but absent from the pool -> the upstream block(s) that would
// supply them.
// Stated as a suggestion (a better score is possible), not an error, and neutrally: the same
// message is correct whether the block simply isn't in the project OR is present but declined
// to emit for this input (e.g. unsupported species). The user reads the block name and runs it
// if their data allows. Only shown once the base (MiXCR) is present and the dataset can be scored.
// Only the signals the selected family scores (standard: convergence; antigen-selected: Pgen) are
// suggested.
const missingSignalBlocks = computed<string[]>(() => {
  const a = availability.value;
  if (!a || !a.hasMixcr || blocker.value) return [];
  const out: string[] = [];
  const used = familySignals(app.model.data.presetFamily);
  if (used.has("pgen") && !a.hasPgen) out.push("Generation Probability");
  if (used.has("convergence") && !a.hasConvergence) out.push("Clonotype Convergence");
  return out;
});

// The suggestions banner is dismissible. Keep it dismissed only for the exact set shown, so it
// reappears if a different signal goes missing (e.g. after switching dataset or preset family).
const dismissedSuggestions = ref<string | null>(null);
const showSuggestions = computed(
  () =>
    missingSignalBlocks.value.length > 0 &&
    dismissedSuggestions.value !== missingSignalBlocks.value.join("|"),
);
function dismissSuggestions() {
  dismissedSuggestions.value = missingSignalBlocks.value.join("|");
}

// Switching to Custom seeds the pinned tier with the current auto pick — a user
// gesture, not a watcher on an output, so it's hairpin-free.
function setTierMode(mode: "default" | "custom") {
  app.model.data.tierMode = mode;
  if (mode === "custom") {
    const reachable = availability.value?.reachableTiers ?? [];
    const pinned = app.model.data.tier;
    const current = pinned && canonicalTier(app.model.data.presetFamily, pinned);
    if (current === undefined || !reachable.includes(current)) {
      const auto = availability.value?.tier;
      app.model.data.tier = auto && auto !== "none" ? auto : reachable[reachable.length - 1];
    }
  }
}

// The pinned tier as the family runs it: a tier the family does not offer (e.g. pinned with an
// earlier version's presets) shows as `canonicalTier` maps it.
const pinnedTier = computed<RunTier | undefined>({
  get: () => {
    const t = app.model.data.tier;
    return t && canonicalTier(app.model.data.presetFamily, t);
  },
  set: (t) => {
    app.model.data.tier = t;
  },
});

// The tier the score would actually use: pinned in custom, else the auto pick.
const resolvedTier = computed<RunTier | undefined>(() => {
  const a = availability.value;
  if (!a || a.tier === "none") return undefined;
  if (app.model.data.tierMode === "custom" && app.model.data.tier) {
    return canonicalTier(app.model.data.presetFamily, app.model.data.tier);
  }
  return a.tier;
});

// The selector picks a dataset, or a dataset narrowed by one of its subset columns. The stored
// anchor may still carry `requireEnrichments` until the signal sync drops it; the options never
// do, so it is left out of the displayed value.
const datasetSelection = computed<DatasetSelection | undefined>({
  get: () => {
    const { inputAnchor, filterRef } = app.model.data;
    if (inputAnchor === undefined) return undefined;
    return createDatasetSelection(createPrimaryRef(withEnrichments(inputAnchor, false), filterRef));
  },
  set: (selection) => {
    app.model.data.inputAnchor = selection?.primary.column;
    app.model.data.filterRef = selection?.primary.filter;
  },
});

// Preset default coefficients for the resolved (family, tier).
const weightDefaults = computed<Partial<Record<FeatureKey, number>>>(() =>
  resolvedTier.value ? defaultFeatureWeights(app.model.data.presetFamily, resolvedTier.value) : {},
);

// The features (rows) of the current preset, in signal-grouped display order.
const presetFeatures = computed<FeatureKey[]>(() =>
  FEATURE_ORDER.filter((f) => f in weightDefaults.value),
);

function setWeight(feature: FeatureKey, v: number | undefined) {
  if (v === undefined || Number.isNaN(v)) return;
  app.model.data.customWeights = { ...(app.model.data.customWeights ?? {}), [feature]: v };
}

// Reset discards custom edits — the display then falls back to the preset defaults.
function resetWeights() {
  app.model.data.customWeights = {};
  app.model.data.ntMutationsCenter = undefined;
}

// Whether the weights are being edited (vs. using the calibrated preset defaults).
const isCustomWeights = computed(() => app.model.data.weightMode === "custom");

// Whether an edit the family scores is set, so Reset has something to undo.
const hasAppliedEdits = computed(() => appliedWeightMode(app.model.data) === "custom");

// The centre k of |Nt mutations − k| the run would use; editable in Custom mode only.
const ntMutationsCenter = computed(() =>
  isCustomWeights.value
    ? (app.model.data.ntMutationsCenter ?? NT_MUTATIONS_CENTER)
    : NT_MUTATIONS_CENTER,
);

// The composite the workflow will apply, as an ordered list of weighted terms (formula order).
// The effective coefficient per feature is mode-dependent: "default" uses the preset coefficients
// (the model drops customWeights from args in that mode), "custom" uses the edited weights. In
// "custom" every preset feature is kept so it can be edited even at 0; in "default" (read-only) a
// feature that contributes nothing is dropped. Terms join with "+" — a negative coefficient
// carries its own minus sign (signed input), so a term reads e.g. "+ -1.19 · Nt mutations".
type FormulaTerm = { operator: string; feature: FeatureKey; value: number; label: string };

const formulaTerms = computed<FormulaTerm[]>(() => {
  if (!resolvedTier.value || presetFeatures.value.length === 0) return [];
  const custom = isCustomWeights.value;
  const feats = presetFeatures.value.filter((f) =>
    custom ? true : Math.round(Math.abs(weightDefaults.value[f] ?? 0) * 100) !== 0,
  );
  return feats.map((f, i) => ({
    operator: i === 0 ? "" : "+",
    feature: f,
    // The distance term's weight is fixed; its centre is edited instead.
    value:
      custom && f !== "ntMutationsDistance"
        ? (app.model.data.customWeights?.[f] ?? weightDefaults.value[f] ?? 0)
        : (weightDefaults.value[f] ?? 0),
    label: FEATURE_LABELS[f],
  }));
});

// Coefficient shown with its sign, rounded to 2 dp (trailing zeros dropped): -1.1914 -> "-1.19".
function formatSigned(v: number): string {
  return Number(v.toFixed(2)).toString();
}

// Commit an edited coefficient on change; ignore blank / non-numeric input.
function onCoefInput(feature: FeatureKey, event: Event) {
  const v = Number.parseFloat((event.target as HTMLInputElement).value);
  setWeight(feature, Number.isNaN(v) ? undefined : Number(v.toFixed(2)));
}

// Commit an edited centre on change: rounded to a whole number; blank or negative is ignored.
function onCenterInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const v = Math.round(Number.parseFloat(input.value));
  if (!Number.isNaN(v) && v >= 0) app.model.data.ntMutationsCenter = v;
  // Show the value in effect, also when the entry was rounded or ignored.
  input.value = String(ntMutationsCenter.value);
}
</script>

<template>
  <PlDatasetSelector
    v-model="datasetSelection"
    :options="app.model.outputs.inputOptions"
    label="Input dataset"
    clearable
    required
  >
    <template #tooltip> MiXCR clonotyping output to score. </template>
  </PlDatasetSelector>

  <PlDropdown v-model="app.model.data.presetFamily" :options="familyOptions" label="Preset family">
    <template #tooltip>
      Describes how the sample was prepared — this selects the scoring recipe.<br />
      <b>Standard</b> — an immunised repertoire with no antigen-binding pre-sort.<br />
      <b>Antigen-selected</b> — cells first enriched for antigen binding (e.g. FACS with a tetramer
      or bait).
    </template>
  </PlDropdown>

  <PlAlert v-if="blocker" type="warn">{{ blocker }}</PlAlert>

  <PlAlert v-if="showSuggestions" type="info" closeable @update:model-value="dismissSuggestions">
    Some variables are missing. Run above the following block(s) to generate a better score:
    <ul :class="$style.suggestionList">
      <li v-for="b in missingSignalBlocks" :key="b">{{ b }}</li>
    </ul>
  </PlAlert>

  <PlSectionSeparator>Score computation</PlSectionSeparator>

  <PlBtnGroup
    :model-value="app.model.data.tierMode"
    :options="tierModeOptions"
    label="Scoring formula variables"
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
    v-model="pinnedTier"
    :options="tierOptions"
    label="Used variables"
  >
    <template #tooltip>
      Each option builds on the <b>Base</b> (mutations, from MiXCR); the higher option adds the
      signal this preset family scores when it is available upstream.
    </template>
  </PlDropdown>

  <!-- Scoring formula. Read-only in Default weight mode; in Custom mode the coefficients become
       inline editable inputs. Terms flow 1-2 per line (see .formulaTerms), leading operator per
       term so a wrapped line starts with the + sign. -->
  <PlBtnGroup
    v-model="app.model.data.weightMode"
    :options="weightModeOptions"
    label="Scoring formula weights"
  >
    <template #tooltip>
      How much each feature contributes to the final score.<br />
      <b>Default</b> — calibrated preset defaults (recommended).<br />
      <b>Custom</b> — edit the coefficients directly in the formula above.
    </template>
  </PlBtnGroup>
  <div v-if="formulaTerms.length > 0">
    <div :class="$style.formulaBox">
      <div :class="$style.formulaTerms">
        <span v-for="t in formulaTerms" :key="t.feature" :class="$style.term">
          <span v-if="t.operator" :class="$style.op">{{ t.operator }}&nbsp;</span>
          <!-- |Nt mutations − k|: the weight is fixed text, the centre k is the editable value. -->
          <template v-if="t.feature === 'ntMutationsDistance'">
            <span :class="$style.fixedCoef">{{ formatSigned(t.value) }}</span>
            <span>&nbsp;·&nbsp;</span>
            <PlTooltip element="span" :class="$style.labelTip" position="top">
              <span>|Nt mutations −</span>
              <template #tooltip>
                <span :class="$style.tooltipText">{{ distanceTooltip(ntMutationsCenter) }}</span>
              </template>
            </PlTooltip>
            <span>&nbsp;</span>
            <input
              :class="[$style.coefInput, $style.centerInput]"
              type="text"
              inputmode="numeric"
              :disabled="!isCustomWeights"
              :value="ntMutationsCenter"
              @change="onCenterInput"
            />
            <span>|</span>
          </template>
          <template v-else>
            <input
              :class="$style.coefInput"
              type="text"
              inputmode="decimal"
              :disabled="!isCustomWeights"
              :value="formatSigned(t.value)"
              @change="(e) => onCoefInput(t.feature, e)"
            />
            <span>&nbsp;·&nbsp;</span>
            <PlTooltip element="span" :class="$style.labelTip" position="top">
              <span>{{ t.label }}</span>
              <template #tooltip>{{ FEATURE_TOOLTIPS[t.feature] }}</template>
            </PlTooltip>
          </template>
        </span>
      </div>
    </div>
  </div>
  <PlBtnGhost
    v-if="hasAppliedEdits && formulaTerms.length > 0"
    :class="$style.resetBtn"
    @click.stop="resetWeights"
  >
    Reset to default
    <template #append>
      <PlMaskIcon24 name="reverse" />
    </template>
  </PlBtnGhost>
</template>

<style module>
/* Scoring-formula box — a monospace equation; coefficients are read-only in Default mode and
   editable inline inputs in Custom mode (mirrors the peptide-extraction pattern preview). */
.formulaLabel {
  font-size: 12px;
  font-weight: 600;
  color: var(--txt-03);
  margin-bottom: 4px;
}
.formulaBox {
  font-family: var(--font-family-monospace, monospace);
  font-size: 12px;
  line-height: 1.8;
  background: var(--chip-bg);
  border-radius: var(--border-radius, 6px);
  padding: 8px 10px;
  color: var(--txt-01);
}
/* Terms flow 1-2 per line (the min-width caps a line at two); the leading +/- sits at the line
   start when a term wraps. */
.formulaTerms {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  align-items: baseline;
}
.term {
  flex: 0 1 auto;
  min-width: 45%;
  white-space: nowrap;
}
.op {
  color: var(--txt-02);
}
/* Feature label: hover for its explanation (dotted underline hints it's hoverable). */
.labelTip {
  cursor: help;
  text-decoration: underline dotted var(--txt-03);
  text-underline-offset: 3px;
}
/* Keeps the line breaks (\n) of a tooltip text. */
.tooltipText {
  white-space: pre-line;
}
.coefInput {
  width: 4.5em;
  text-align: right;
  font: inherit;
  font-weight: 600;
  color: var(--color-accent-default);
  background: var(--bg-elevated-01);
  border: 1px solid var(--border-color-div-grey);
  border-radius: 4px;
  padding: 0 4px;
}
.coefInput:focus {
  outline: none;
  border-color: var(--color-accent-default);
}
/* Default (read-only) mode: same box so nothing shifts on toggle. Transparent so the field
   blends into the formula box background (its --chip-bg) instead of a distinct grey patch. */
.coefInput:disabled {
  background: transparent;
  -webkit-text-fill-color: var(--color-accent-default);
  opacity: 1;
  cursor: default;
}
/* A coefficient that is never editable: plain formula text, in the coefficients' column. */
.fixedCoef {
  display: inline-block;
  width: 4.5em;
  padding: 0 5px;
  text-align: right;
}
/* The centre of |Nt mutations − k|: a short whole number. */
.centerInput {
  width: 2.5em;
}
/* Tighten the section's 24px flex gap above the Reset button. */
.resetBtn {
  margin-top: -16px;
}
/* Missing-signal suggestion list inside the info banner. */
.suggestionList {
  margin: 4px 0 0;
  padding-left: 18px;
}
</style>
