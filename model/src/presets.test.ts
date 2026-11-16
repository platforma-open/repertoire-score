import type {
  FeatureKey,
  PresetFamily,
  SelectableTier,
} from "@platforma-open/milaboratories.repertoire-score.kind";
import { FEATURE_KEYS } from "@platforma-open/milaboratories.repertoire-score.kind";
import { describe, expect, test } from "vitest";
import {
  canonicalTier,
  FEATURE_ORDER,
  FEATURE_SIGNAL,
  familySignals,
  familyTiers,
  NT_MUTATIONS_CENTER,
  PRESET_COEFFICIENTS,
  reachableTiersFor,
  tierFor,
} from "./presets";
import type { SignalKind } from "./types";

// The decided vectors (temp_resources/repertoire-score-eval/01-decisions/
// preset-coefficients-2026-11-06.md). The knot −|m − 6| is the distance |m − k| at weight −1.
const STANDARD_BASE = { ntMutationsDistance: -1, aaMutationsCDR: -0.25 };
const STANDARD_CONV = { ...STANDARD_BASE, nbFreq: 1 };
const AS_BASE = { heavyNtMutationsVJ: 1, aaMutationsCDR: 0.25 };
const AS_PGEN = { ...AS_BASE, negLogPgen: 0.5, negLogLightPgen: 0.5 };

const FAMILIES: PresetFamily[] = ["standard", "antigen-selected"];
const TIERS: SelectableTier[] = ["1", "2a", "2b", "3"];

describe("PRESET_COEFFICIENTS", () => {
  test("rows match the decided vectors", () => {
    expect(PRESET_COEFFICIENTS).toEqual({
      standard: { "1": STANDARD_BASE, "2a": STANDARD_CONV },
      "antigen-selected": { "1": AS_BASE, "2b": AS_PGEN },
    });
    expect(NT_MUTATIONS_CENTER).toBe(6);
  });

  test("every preset key is a known, ordered, classified feature", () => {
    for (const family of FAMILIES) {
      for (const row of Object.values(PRESET_COEFFICIENTS[family])) {
        for (const f of Object.keys(row) as FeatureKey[]) {
          expect(FEATURE_KEYS).toContain(f);
          expect(FEATURE_ORDER).toContain(f);
          expect(FEATURE_SIGNAL[f]).toBeDefined();
        }
      }
    }
    expect([...FEATURE_ORDER].sort()).toEqual([...FEATURE_KEYS].sort());
  });
});

describe("family tiers", () => {
  test("each family scores one optional signal", () => {
    expect([...familySignals("standard")].sort()).toEqual(["convergence", "mutations"]);
    expect([...familySignals("antigen-selected")].sort()).toEqual(["mutations", "pgen"]);
  });

  test("a tier the family does not offer runs without the signal the family does not score", () => {
    expect(TIERS.map((t) => canonicalTier("standard", t))).toEqual(["1", "2a", "1", "2a"]);
    expect(TIERS.map((t) => canonicalTier("antigen-selected", t))).toEqual(["1", "1", "2b", "2b"]);
  });

  test("every tier runs a row of the family", () => {
    for (const family of FAMILIES) {
      for (const tier of TIERS) {
        expect(PRESET_COEFFICIENTS[family][canonicalTier(family, tier)]).toBeDefined();
      }
    }
  });

  test("the family's rows pick its tier; a signal it does not score has no say", () => {
    const both = new Set<SignalKind>(["mutations", "pgen", "convergence"]);
    const conv = new Set<SignalKind>(["mutations", "convergence"]);
    const pgen = new Set<SignalKind>(["mutations", "pgen"]);
    const base = new Set<SignalKind>(["mutations"]);
    expect([base, conv, pgen, both].map((p) => tierFor("standard", p))).toEqual([
      "1",
      "2a",
      "1",
      "2a",
    ]);
    expect([base, conv, pgen, both].map((p) => tierFor("antigen-selected", p))).toEqual([
      "1",
      "1",
      "2b",
      "2b",
    ]);
    expect(reachableTiersFor("standard", both)).toEqual(["1", "2a"]);
    expect(reachableTiersFor("antigen-selected", conv)).toEqual(["1"]);
    for (const family of FAMILIES) {
      for (const present of [base, conv, pgen, both]) {
        expect(familyTiers(family)).toContain(tierFor(family, present));
      }
    }
  });

  test("each family offers the tiers it has rows for", () => {
    expect(familyTiers("standard")).toEqual(["1", "2a"]);
    expect(familyTiers("antigen-selected")).toEqual(["1", "2b"]);
    for (const family of FAMILIES) {
      expect(familyTiers(family)).toEqual(Object.keys(PRESET_COEFFICIENTS[family]));
    }
  });
});
