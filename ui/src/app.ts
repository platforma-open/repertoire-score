import { platforma } from "@platforma-open/milaboratories.repertoire-score.model";
import type { PlRef } from "@platforma-sdk/model";
import { plRefsEqual, withEnrichments } from "@platforma-sdk/model";
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

// Ignores `requireEnrichments`: it says how the block depends on a dataset, not which one.
// Counting it would make the flag-stripping write below look like a dataset switch, and the
// reset watcher would wipe the refs that write just made.
const sameDataset = (a: PlRef | undefined, b: PlRef | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && plRefsEqual(a, b, true));

const sameRefs = (a: readonly PlRef[], b: readonly PlRef[]): boolean =>
  a.length === b.length && a.every((ref, i) => plRefsEqual(ref, b[i]));

/**
 * Keep `data.optionalSignalRefs` in step with the optional signals actually in the pool.
 *
 * The args lambda cannot query the result pool, so the refs have to live in `data`. A
 * snapshot taken at pick time would not do: a signal block can be added, removed or
 * re-created afterwards, and the score has to follow.
 */
function syncOptionalSignalRefs(model: AppModel) {
  // A new dataset invalidates the previous one's refs. Back to unsynced, not `[]` — nothing
  // knows yet what the new dataset carries.
  watch(
    () => model.data.inputAnchor,
    (anchor, previous) => {
      // No previous anchor is either the first pick (nothing to invalidate) or `data`
      // arriving after mount — resetting on that would wipe a good set on every open.
      if (previous === undefined) return;
      if (sameDataset(anchor, previous)) return;
      if (model.data.optionalSignalRefs !== undefined) model.data.optionalSignalRefs = undefined;
    },
  );

  watch(
    () => [model.data.inputAnchor, model.outputs.featureAvailability] as const,
    ([anchor, availability]) => {
      // No dataset, or the pool is still resolving — keep the last good set rather than
      // clobbering it on a transient. Every write here is persisted and reaches every client.
      if (!anchor || !availability) return;
      // Availability lags the picker by a render; on a switch it can still describe the old
      // dataset.
      if (!sameDataset(availability.anchor, anchor)) return;
      const next = availability.optionalSignalRefs;
      const current = model.data.optionalSignalRefs;
      if (current !== undefined && sameRefs(current, next)) return;
      model.data.optionalSignalRefs = next.map((ref) => ({ ...ref }));
      // Previous version carries `requireEnrichments`, which covered the dependency while
      // the refs were unknown. This is the first moment there is something to replace it with.
      if (anchor.requireEnrichments) model.data.inputAnchor = withEnrichments(anchor, false);
    },
    { immediate: true, deep: true },
  );
}
