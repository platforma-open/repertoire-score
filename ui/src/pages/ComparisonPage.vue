<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import {
  defaultGraphStateScatter,
  isPlottableColumn,
  NT_MUTATIONS_COLUMN,
  REPERTOIRE_SCORE_COLUMN,
} from "@platforma-open/milaboratories.repertoire-score.model";
import { PlBlockPage } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";

const app = useApp();

// Intended to restrict the X/Y axes to the score + signals; the grouping/color/tooltip
// palette is deliberately left open to the wider pool. NOTE: this predicate does not currently
// take effect on the scatter axes — pool columns (e.g. "Clone Id") still appear as X/Y options.
const dataColumnPredicate = isPlottableColumn;

// GraphMaker reads `initialData.optionsState` eagerly, so guarantee a non-undefined object.
const graphState = computed({
  get: () => app.model.data.graphStateScatter ?? defaultGraphStateScatter(),
  set: (v) => {
    app.model.data.graphStateScatter = v;
  },
});

// Default X = the composite score, Y = Nt mutations (falling back to the first available signal
// if that column isn't present) — a ready-to-read plot the user can re-bind to any pair.
const defaultOptions = computed((): PredefinedGraphOption<"scatterplot">[] | undefined => {
  const pcols = app.model.outputs.histogramPfPcols;
  if (!pcols) return undefined;
  const scoreCol = pcols.find((p) => p.spec.name === REPERTOIRE_SCORE_COLUMN);
  const ntCol = pcols.find((p) => p.spec.name === NT_MUTATIONS_COLUMN);
  const firstFeature = pcols.find((p) => p.spec.name !== REPERTOIRE_SCORE_COLUMN);
  const yCol = ntCol ?? firstFeature;
  if (!scoreCol) return undefined;
  const opts: PredefinedGraphOption<"scatterplot">[] = [
    { inputName: "x", selectedSource: scoreCol.spec },
  ];
  if (yCol) opts.push({ inputName: "y", selectedSource: yCol.spec });
  return opts;
});
</script>

<template>
  <PlBlockPage>
    <GraphMaker
      v-model="graphState"
      chart-type="scatterplot"
      :data-state-key="app.model.outputs.histogramPf"
      :p-frame="app.model.outputs.histogramPf"
      :default-options="defaultOptions"
      :data-column-predicate="dataColumnPredicate"
      :status-text="{
        noPframe: { title: 'Press Run to compute the score, then pick two signals to compare.' },
      }"
    />
  </PlBlockPage>
</template>
