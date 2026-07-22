<script setup lang="ts">
import {
  PlAgDataTableV2,
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlMaskIcon24,
  PlSlideModal,
  usePlDataTableSettingsV2,
} from "@platforma-sdk/ui-vue";
import type {
  FeatureKey,
  SelectableTier,
  SignalKind,
} from "@platforma-open/milaboratories.repertoire-score.model";
import {
  defaultFeatureWeights,
  FEATURE_SIGNAL,
} from "@platforma-open/milaboratories.repertoire-score.model";
import { computed, reactive } from "vue";
import { useApp } from "../app";
import { SIGNAL_DISPLAY_ORDER, SIGNAL_LABELS } from "../labels";
import SettingsPanel from "./SettingsPanel.vue";

const app = useApp();

type Panel = "settings" | null;

// Modal state in a local reactive (not BlockData) — hairpin-free. Auto-open
// Settings on first add (no dataset picked yet), mirroring clonotype-convergence.
const ui = reactive({
  activePanel: (app.model.data.inputAnchor === undefined ? "settings" : null) as Panel,
});

function setPanel(panel: Panel) {
  ui.activePanel = panel;
}

const settingsOpen = computed({
  get: () => ui.activePanel === "settings",
  set: (open: boolean) => {
    if (!open && ui.activePanel === "settings") setPanel(null);
  },
});

const availability = computed(() => app.model.outputs.featureAvailability);

const summary = computed(() => {
  const a = availability.value;
  if (!a) return undefined;
  if (a.tier === "none") {
    return {
      type: "warn" as const,
      text: "Cannot score: MiXCR clonotyping features (mutations / abundance) not found for this dataset.",
    };
  }
  // Report the signals the score actually USES, not merely what's detected. In Custom mode the
  // user can pin a lower tier that uses a subset of the available signals. Derive from the
  // applied preset's feature set (the single source of truth in presets.ts), mapped to
  // signals, keeping only present ones.
  const appliedTier: SelectableTier =
    app.model.data.tierMode === "custom" && app.model.data.tier ? app.model.data.tier : a.tier;
  const detected = new Set<SignalKind>(a.signals);
  const used = new Set<SignalKind>();
  for (const f of Object.keys(
    defaultFeatureWeights(app.model.data.presetFamily, appliedTier),
  ) as FeatureKey[]) {
    const signal = FEATURE_SIGNAL[f];
    if (detected.has(signal)) used.add(signal);
  }
  const signalList = SIGNAL_DISPLAY_ORDER.filter((s) => used.has(s))
    .map((s) => SIGNAL_LABELS[s])
    .join(", ");
  return {
    type: "info" as const,
    text: `Scoring on ${signalList}.`,
  };
});

// Results table: Clone Id + score + the metrics that fed it (from the workflow's tablePf).
const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.scoreTable,
});
</script>

<template>
  <PlBlockPage title="Repertoire Score">
    <template #append>
      <PlBtnGhost @click.stop="() => setPanel('settings')">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>

    <PlAlert v-if="!app.model.data.inputAnchor" type="info">
      Select a clonotype dataset in Settings to begin.
    </PlAlert>

    <template v-else>
      <PlAlert v-if="summary" :type="summary.type">
        {{ summary.text }}
      </PlAlert>

      <PlAgDataTableV2
        v-model="app.model.data.tableState"
        :settings="tableSettings"
        show-columns-panel
        show-export-button
        not-ready-text="Press Run to compute the repertoire score."
      />
    </template>
  </PlBlockPage>

  <PlSlideModal v-model="settingsOpen" :shadow="true">
    <template #title>Settings</template>
    <SettingsPanel />
  </PlSlideModal>
</template>
