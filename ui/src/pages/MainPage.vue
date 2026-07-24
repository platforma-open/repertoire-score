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
import { computed, reactive } from "vue";
import { useApp } from "../app";
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

// Blocking error only: the dataset carries no MiXCR mutation/abundance features, so the block
// cannot score. Absent otherwise — the "which signals" read-out lives in Settings, not here.
const scoreError = computed(() => {
  const a = app.model.outputs.featureAvailability;
  return a && a.tier === "none"
    ? "Cannot score: MiXCR clonotyping features (mutations / abundance) not found for this dataset."
    : undefined;
});

// Results table: Clone Id + score + the metrics that fed it (from the workflow's tablePf).
const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.scoreTable,
});

// Editable block label (PlBlockPage subtitle). Surfaced in the left panel via the model's
// `.subtitle()`. Coerce undefined → "" so the subtitle row renders (and its placeholder shows)
// on block instances created before this field existed.
const customBlockLabel = computed({
  get: () => app.model.data.customBlockLabel ?? "",
  set: (v: string) => {
    app.model.data.customBlockLabel = v;
  },
});
</script>

<template>
  <PlBlockPage
    v-model:subtitle="customBlockLabel"
    :subtitle-placeholder="app.model.data.defaultBlockLabel ?? ''"
    title="Repertoire Score"
  >
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
      <PlAlert v-if="scoreError" type="warn">
        {{ scoreError }}
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

  <PlSlideModal v-model="settingsOpen" :shadow="true" width="40%">
    <template #title>Settings</template>
    <SettingsPanel />
  </PlSlideModal>
</template>
