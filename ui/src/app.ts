import {
  defaultGraphStateHistogram,
  platforma,
} from "@platforma-open/milaboratories.repertoire-score.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import DistributionsPage from "./pages/DistributionsPage.vue";
import MainPage from "./pages/MainPage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  // Backfill for blocks created before the histogram state existed (GraphMaker reads
  // its initial state eagerly and needs a non-undefined object).
  app.model.data.graphStateHistogram ??= defaultGraphStateHistogram();

  // Normalise the pre-rename weight-mode value ("preset" → "automatic") so the Weights
  // control shows a selection on blocks created before the rename. Args are unchanged
  // (both project to the same non-custom weights), so this triggers no re-run.
  if ((app.model.data.weightMode as string) === "preset") {
    app.model.data.weightMode = "automatic";
  }

  return {
    routes: {
      "/": () => MainPage,
      "/distributions": () => DistributionsPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
