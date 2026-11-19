import { readFileSync } from "node:fs";
import type { FeatureKey } from "@platforma-open/milaboratories.repertoire-score.kind";
import type { PColumnSpec } from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";
import { NO_HEAVY_COUNT_MESSAGE, NO_VDJ_REGION_MESSAGE, scoreBlocker } from "./blockers";
import { classifyColumn, isLightChainOnlyDataset } from "./index";

const spec = (name: string, domain?: Record<string, string>): PColumnSpec =>
  ({ kind: "PColumn", name, valueType: "Int", domain, axesSpec: [] }) as PColumnSpec;

const NT_COUNT = "pl7.app/vdj/sequence/nMutationsCount";
const GENE = "pl7.app/vdj/gene";
const SC_CHAIN = "pl7.app/vdj/scClonotypeChain";
const SC_INDEX = "pl7.app/vdj/scClonotypeChain/index";

describe("classifyColumn", () => {
  test("neighbour frequency is convergence, heavy chain only", () => {
    expect(classifyColumn(spec("pl7.app/vdj/convergence/nbFreq"))).toEqual({
      signal: "convergence",
      feature: "nbFreq",
    });
    expect(classifyColumn(spec("pl7.app/vdj/convergence/nbFreq", { [SC_CHAIN]: "B" }))).toEqual({
      signal: "convergence",
    });
  });

  test("the V-gene count is the heavy-chain count; the J count only adds to it", () => {
    expect(classifyColumn(spec(NT_COUNT, { [GENE]: "V" }))).toEqual({
      signal: "mutations",
      feature: "heavyNtMutationsVJ",
    });
    expect(classifyColumn(spec(NT_COUNT, { [GENE]: "J" }))).toEqual({ signal: "mutations" });
    expect(classifyColumn(spec(NT_COUNT, { [GENE]: "D" }))).toBeUndefined();
  });

  test("single cell: primary chains only, and the light-chain V count is not the heavy one", () => {
    const heavyPrimary = { [GENE]: "V", [SC_CHAIN]: "A", [SC_INDEX]: "primary" };
    expect(classifyColumn(spec(NT_COUNT, heavyPrimary))?.feature).toBe("heavyNtMutationsVJ");
    expect(classifyColumn(spec(NT_COUNT, { ...heavyPrimary, [SC_INDEX]: "secondary" }))).toBe(
      undefined,
    );
    expect(classifyColumn(spec(NT_COUNT, { ...heavyPrimary, [SC_CHAIN]: "B" }))).toEqual({
      signal: "mutations",
    });
  });

  test("the amino-acid per-gene count is not used", () => {
    expect(classifyColumn(spec("pl7.app/vdj/sequence/aaMutationsCount", { [GENE]: "V" }))).toBe(
      undefined,
    );
  });

  test("light-chain Pgen feeds the light-chain feature", () => {
    const pgen = "pl7.app/vdj/minlog10GenerationProbability";
    expect(classifyColumn(spec(pgen, { [SC_CHAIN]: "A" }))?.feature).toBe("negLogPgen");
    expect(classifyColumn(spec(pgen, { [SC_CHAIN]: "B" }))?.feature).toBe("negLogLightPgen");
  });
});

describe("scoreBlocker", () => {
  const VDJ_REGION: FeatureKey[] = ["ntMutations", "ntMutationsDistance", "aaMutationsCDR"];
  const avail = (features: FeatureKey[]) => ({ features });

  test("standard needs the VDJRegion mutation columns", () => {
    expect(scoreBlocker(avail(["aaMutationsCDR", "heavyNtMutationsVJ"]), "standard")).toBe(
      NO_VDJ_REGION_MESSAGE,
    );
    expect(scoreBlocker(avail(["logCells"]), "standard")).toBe(NO_VDJ_REGION_MESSAGE);
  });

  test("antigen-selected needs the heavy-chain count and the CDR count", () => {
    expect(scoreBlocker(avail(VDJ_REGION), "antigen-selected")).toBe(NO_HEAVY_COUNT_MESSAGE);
    expect(scoreBlocker(avail(["heavyNtMutationsVJ"]), "antigen-selected")).toBe(
      NO_VDJ_REGION_MESSAGE,
    );
  });

  test("nothing stops a dataset with every mutation column", () => {
    const all = avail([...VDJ_REGION, "heavyNtMutationsVJ"]);
    expect(scoreBlocker(all, "standard")).toBeUndefined();
    expect(scoreBlocker(all, "antigen-selected")).toBeUndefined();
  });

  test("the messages are the workflow's, word for word", () => {
    const workflow = readFileSync(
      new URL("../../workflow/src/main.tpl.tengo", import.meta.url),
      "utf8",
    );
    for (const message of [NO_VDJ_REGION_MESSAGE, NO_HEAVY_COUNT_MESSAGE]) {
      expect(workflow).toContain(`"${message}"`);
    }
  });
});

describe("isLightChainOnlyDataset", () => {
  const dataset = (keyAxis: string, chain?: string): PColumnSpec =>
    ({
      kind: "PColumn",
      name: "pl7.app/vdj/sequence",
      valueType: "String",
      axesSpec: [
        { name: "pl7.app/sampleId", type: "String" },
        { name: keyAxis, type: "String", domain: chain ? { "pl7.app/vdj/chain": chain } : {} },
      ],
    }) as PColumnSpec;

  test("a bulk light-chain dataset is refused", () => {
    expect(isLightChainOnlyDataset(dataset("pl7.app/vdj/clonotypeKey", "IGLight"))).toBe(true);
    expect(isLightChainOnlyDataset(dataset("pl7.app/vdj/clonotypeKey", "IGKappa"))).toBe(true);
  });

  test("bulk heavy-chain and single-cell datasets are offered", () => {
    expect(isLightChainOnlyDataset(dataset("pl7.app/vdj/clonotypeKey", "IGHeavy"))).toBe(false);
    expect(isLightChainOnlyDataset(dataset("pl7.app/vdj/scClonotypeKey"))).toBe(false);
  });
});
