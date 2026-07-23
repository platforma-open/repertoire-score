import { platforma } from "@platforma-open/milaboratories.repertoire-score.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import ComparisonPage from "./pages/ComparisonPage.vue";
import DistributionsPage from "./pages/DistributionsPage.vue";
import MainPage from "./pages/MainPage.vue";

export const sdkPlugin = defineAppV3(platforma, () => {
  return {
    routes: {
      "/": () => MainPage,
      "/distributions": () => DistributionsPage,
      "/scatterplot": () => ComparisonPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
