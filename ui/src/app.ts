import { platforma } from "@platforma-open/milaboratories.repertoire-score.model";
import type { PlRef } from "@platforma-sdk/model";
import { plRefsEqual } from "@platforma-sdk/model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import { watch } from "vue";
import ComparisonPage from "./pages/ComparisonPage.vue";
import DistributionsPage from "./pages/DistributionsPage.vue";
import MainPage from "./pages/MainPage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  // Keep the optional-signal dependencies (Generation Probability, Convergence) live.
  syncOptionalSignalRefs(app.model);
  return {
    routes: {
      "/": () => MainPage,
      "/distributions": () => DistributionsPage,
      "/scatterplot": () => ComparisonPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;

type AppModel = ReturnType<typeof useApp>["model"];

const sameRefs = (a: readonly PlRef[], b: readonly PlRef[]): boolean =>
  a.length === b.length && a.every((ref, i) => plRefsEqual(ref, b[i]));

/**
 * Keep `data.optionalSignalRefs` in step with the optional signals actually in the pool.
 */
function syncOptionalSignalRefs(model: AppModel) {
  watch(
    () => model.outputs.featureAvailability,
    (availability) => {
      if (!availability) return;
      const next = availability.optionalSignalRefs;
      if (sameRefs(model.data.optionalSignalRefs ?? [], next)) return;
      model.data.optionalSignalRefs = next.map((ref) => ({ ...ref }));
    },
    { immediate: true, deep: true },
  );
}
