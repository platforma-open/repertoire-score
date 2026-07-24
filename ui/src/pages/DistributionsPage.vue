<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import {
  CDR_MUTATION_FRACTION_COLUMN,
  defaultGraphStateHistogram,
  isPlottableColumn,
  REPERTOIRE_SCORE_COLUMN,
} from "@platforma-open/milaboratories.repertoire-score.model";
import { PlBlockPage } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";

const app = useApp();

// The PFrame is enriched (pool metadata/linker columns available for grouping/labelling), but
// only the available per-clonotype signals should be offerable as the histogram value — the
// composite score is deliberately excluded here (it's shown in the Main table / Comparison).
const dataColumnPredicate: typeof isPlottableColumn = (spec) =>
  isPlottableColumn(spec) && spec.name !== REPERTOIRE_SCORE_COLUMN;

// GraphMaker reads `initialData.optionsState` eagerly, so guarantee a non-undefined object.
const graphState = computed({
  get: () => app.model.data.graphStateHistogram ?? defaultGraphStateHistogram(),
  set: (v) => {
    app.model.data.graphStateHistogram = v;
  },
});

// Default the value to CDR mutation fraction so a signal distribution renders straight away;
// fall back to the first available non-score signal if that column isn't present. The score is
// never offered here.
const defaultOptions = computed((): PredefinedGraphOption<"histogram">[] | undefined => {
  const pcols = app.model.outputs.histogramPfPcols;
  if (!pcols) return undefined;
  const cdrCol = pcols.find((p) => p.spec.name === CDR_MUTATION_FRACTION_COLUMN);
  const firstSignal = pcols.find((p) => p.spec.name !== REPERTOIRE_SCORE_COLUMN);
  const valueCol = cdrCol ?? firstSignal;
  if (!valueCol) return undefined;
  return [{ inputName: "value", selectedSource: valueCol.spec }];
});
</script>

<template>
  <PlBlockPage>
    <GraphMaker
      v-model="graphState"
      chart-type="histogram"
      :data-state-key="app.model.outputs.histogramPf"
      :p-frame="app.model.outputs.histogramPf"
      :default-options="defaultOptions"
      :data-column-predicate="dataColumnPredicate"
      :status-text="{
        noPframe: { title: 'Press Run to compute the score, then pick a signal to plot.' },
      }"
    />
  </PlBlockPage>
</template>
