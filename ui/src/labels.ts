import type { SignalKind } from "@platforma-open/milaboratories.repertoire-score.model";

// Biologist-facing names for the composite's upstream signals — no internal jargon
// ("pgen") and no tier ids. Shared by the Main-page summary and the Settings weight-editor
// group headers so the two never drift.
export const SIGNAL_LABELS: Record<SignalKind, string> = {
  mutations: "Mutations",
  abundance: "Abundance",
  pgen: "Generation probability",
  convergence: "Convergence",
};

// Stable display order: the MiXCR base (mutations, abundance) first, then the optional signals.
export const SIGNAL_DISPLAY_ORDER: SignalKind[] = ["mutations", "abundance", "pgen", "convergence"];
