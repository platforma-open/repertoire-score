<script setup lang="ts">
import {
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlMaskIcon24,
  PlSlideModal,
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
  return {
    type: "info" as const,
    text: `Detected Tier ${a.tier} — signals: ${a.signals.join(", ")}`,
  };
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

    <PlAlert v-else-if="summary" :type="summary.type">
      {{ summary.text }}
    </PlAlert>
  </PlBlockPage>

  <PlSlideModal v-model="settingsOpen" :shadow="true">
    <template #title>Settings</template>
    <SettingsPanel />
  </PlSlideModal>
</template>
