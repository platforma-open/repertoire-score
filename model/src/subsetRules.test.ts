import type { PColumnSpec } from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";
import type { SignalCandidate } from "./index";
import { applySubsetRules, columnIdFromPlRef, SUBSET_DOMAIN } from "./index";

const F = columnIdFromPlRef({ __isRef: true, blockId: "labeling", name: "labels.F" });
const G = columnIdFromPlRef({ __isRef: true, blockId: "labeling", name: "labels.G" });

let nextId = 0;
const col = (
  signal: SignalCandidate["signal"],
  chain: "A" | "B",
  subset?: string,
): SignalCandidate => {
  const domain: Record<string, string> = { "pl7.app/vdj/scClonotypeChain": chain };
  if (subset !== undefined) domain[SUBSET_DOMAIN] = subset;
  const name =
    signal === "pgen"
      ? "pl7.app/vdj/minlog10GenerationProbability"
      : signal === "convergence"
        ? "pl7.app/vdj/convergence/fastStar"
        : "pl7.app/vdj/sequence/nMutations";
  return {
    id: `${signal}-${chain}-${subset ?? "full"}-${nextId++}`,
    spec: { kind: "PColumn", name, valueType: "Double", domain, axesSpec: [] } as PColumnSpec,
    signal,
  };
};

const kept = (candidates: SignalCandidate[], subsetId: string | undefined) =>
  applySubsetRules(candidates, subsetId).map((c) => c.id);

describe("applySubsetRules", () => {
  test("full-data run: only unmarked Pgen and convergence", () => {
    const pgenFull = col("pgen", "A");
    const pgenF = col("pgen", "A", F);
    const convFull = col("convergence", "A");
    const convF = col("convergence", "A", F);
    expect(kept([pgenFull, pgenF, convFull, convF], undefined)).toEqual([pgenFull.id, convFull.id]);
  });

  test("subset run: convergence only from the same subset", () => {
    const convFull = col("convergence", "A");
    const convF = col("convergence", "A", F);
    const convG = col("convergence", "A", G);
    expect(kept([convFull, convF, convG], F)).toEqual([convF.id]);
  });

  test("subset run: a same-subset Pgen wins over the full-data Pgen of the same chain", () => {
    const pgenFull = col("pgen", "A");
    const pgenF = col("pgen", "A", F);
    expect(kept([pgenFull, pgenF], F)).toEqual([pgenF.id]);
    // Order-independent
    expect(kept([pgenF, pgenFull], F)).toEqual([pgenF.id]);
  });

  test("subset run: full-data Pgen is the fallback, per chain", () => {
    const heavyFull = col("pgen", "A");
    const heavyF = col("pgen", "A", F);
    const lightFull = col("pgen", "B");
    expect(kept([heavyFull, heavyF, lightFull], F)).toEqual([heavyF.id, lightFull.id]);
  });

  test("subset run: Pgen from a different subset is never used", () => {
    const pgenG = col("pgen", "A", G);
    const pgenFull = col("pgen", "A");
    expect(kept([pgenG, pgenFull], F)).toEqual([pgenFull.id]);
  });

  test("MiXCR signals pass through untouched", () => {
    const mutations = col("mutations", "A");
    expect(kept([mutations], undefined)).toEqual([mutations.id]);
    expect(kept([mutations], F)).toEqual([mutations.id]);
  });
});

describe("columnIdFromPlRef", () => {
  test("is the pool's canonical id, the value Generation Probability / Convergence stamp", () => {
    expect(columnIdFromPlRef({ __isRef: true, blockId: "b", name: "n" })).toBe(
      '{"__isRef":true,"blockId":"b","name":"n"}',
    );
  });
});
