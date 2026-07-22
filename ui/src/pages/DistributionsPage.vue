<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import type { PColumnSpec } from "@platforma-sdk/model";
import {
  defaultGraphStateHistogram,
  HISTOGRAM_VALUE_ANNOTATION,
} from "@platforma-open/milaboratories.repertoire-score.model";
import { PlBlockPage } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";

const app = useApp();

// The PFrame is enriched (pool metadata/linker columns available for grouping/labelling),
// but only the score + its features should be offerable as histogram VALUES. The workflow
// stamps HISTOGRAM_VALUE_ANNOTATION on exactly those columns, so this predicate lets the
// value picker show them and nothing else.
function dataColumnPredicate(spec: PColumnSpec): boolean {
  return spec.annotations?.[HISTOGRAM_VALUE_ANNOTATION] === "true";
}

// GraphMaker reads `initialData.optionsState` eagerly, so guarantee a non-undefined object.
const graphState = computed({
  get: () => app.model.data.graphStateHistogram ?? defaultGraphStateHistogram(),
  set: (v) => {
    app.model.data.graphStateHistogram = v;
  },
});

// The histogram covers the composite score and every feature that fed it — all in one PFrame.
// Default the value to the score so the score distribution renders straight away; the user
// re-binds it to any feature via the graph-maker UI.
const SCORE_COLUMN = "pl7.app/vdj/repertoireScore";
const defaultOptions = computed((): PredefinedGraphOption<"histogram">[] | undefined => {
  const pcols = app.model.outputs.histogramPfPcols;
  if (!pcols) return undefined;
  const scoreCol = pcols.find((p) => p.spec.name === SCORE_COLUMN);
  if (!scoreCol) return undefined;
  return [{ inputName: "value", selectedSource: scoreCol.spec }];
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
