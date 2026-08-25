# Repertoire Score

Rank clonotypes as antibody leads on all the evidence at once. This Platforma block fuses maturation, abundance, convergence, and generation-probability signals into a single tunable score between 0 and 1 — so the clonotypes worth expressing and testing rise to the top, instead of being chosen by whichever single metric you happened to sort by.

Open-source analysis block for Platforma, the biologics discovery platform by MiLaboratories. For the full no-code workflow, see [platforma.bio](https://platforma.bio/).

## What it does

Every individual metric misleads on its own. Sort by clone size and you get whatever expanded, selected or not. Sort by mutation count and you get heavily mutated clones regardless of whether the mutations did anything. Each signal is real but partial, and a candidate that looks good on all of them is a very different prospect from one that looks good on one.

Repertoire Score combines them. Each contributing signal is an independent per-clonotype measure of maturation or antigen-driven selection:

* **Clonal abundance** — how expanded the clone is. Larger clones are more likely to have been selected and amplified.
* **Somatic hypermutation** — how far the sequence has matured from germline.
* **CDR mutation fraction** — what share of those mutations fall in the CDRs rather than the framework. CDR-focused mutation indicates affinity-driven selection; framework-heavy mutation is more often structural risk.
* **Convergence** — whether the clonotype sits in a convergent CDR3 neighborhood, independently rediscovered elsewhere in the repertoire.
* **Generation probability** — how unlikely the sequence is to arise by chance from V(D)J recombination. A rare sequence that also converges means considerably more than a common one that does.

The block uses whichever of these signals are present. MiXCR clonotyping alone supplies mutations and abundance, which gives a solid baseline; adding [Clonotype Convergence](https://github.com/platforma-open/clonotype-convergence) and [Generation Probability](https://github.com/platforma-open/generation-probability) upstream raises the score's quality substantially.

**Nothing is hidden.** The block shows which variables it used and what weight each carried, and lets you override any of them. It also emits a diagnostic record of the weights and columns that produced each score, so a ranking can be explained and reproduced rather than taken on trust.

Two presets match the score to how the repertoire was collected:

* **Standard** — post-immunization repertoires with no antigen-binding pre-sort. The score both filters non-specific clones and ranks the specific ones.
* **Antigen-selected** — repertoires already enriched by an antigen-binding sort (FACS tetramer, probe, or bead). All clones are presumed binders, so the score ranks within that pool rather than trying to separate binders from background.

Results come with distribution views and a scatterplot for inspecting how the signals relate before acting on the ranking.

## Inputs & outputs

* **Input:** a clonotype dataset with per-clonotype mutation and abundance data, from MiXCR clonotyping. Optionally a convergence result from [Clonotype Convergence](https://github.com/platforma-open/clonotype-convergence) and a Pgen column from [Generation Probability](https://github.com/platforma-open/generation-probability), each of which adds a signal.
* **Output:** a Repertoire Score per clonotype between 0 and 1, plus the diagnostic manifest of contributing variables and weights — consumed directly by [Lead Selection](https://github.com/platforma-open/antibody-tcr-lead-selection), whose In Vivo preset ranks on it.

## Specifications

| | |
|---|---|
| Block title in app | Repertoire Score |
| Output range | 0 to 1, higher is a more promising lead |
| Signals | Clonal abundance, somatic hypermutation, CDR mutation fraction, convergence, generation probability |
| Signal availability | Uses whatever is present; convergence and Pgen require their upstream blocks |
| Presets | Standard (no antigen pre-sort) and Antigen-selected (post-sort) |
| Weights | Preset defaults, fully overridable per feature |
| Transparency | Diagnostic manifest of the weights and columns behind every score |
| Views | Main table, signal distributions, scatterplot |

## Use cases

* **In vivo lead ranking:** produce the composite score [Lead Selection](https://github.com/platforma-open/antibody-tcr-lead-selection)'s In Vivo preset ranks on.
* **Post-immunization triage:** rank a post-immunization repertoire when no antigen-binding sort was performed.
* **Ranking within a sorted pool:** use the Antigen-selected preset when every clone is already a presumed binder and the question is which to prioritize.
* **Evidence-weighted shortlists:** favor candidates supported by several independent signals over those strong on one.
* **Tuned scoring:** reweight the signals for a campaign where, say, convergence matters more than expansion.
* **Auditable rankings:** use the diagnostic manifest to explain why a candidate ranked where it did.

## FAQ

### What does the score combine?

Clonal abundance, somatic hypermutation, the fraction of mutations in CDRs, convergence, and generation probability — each an independent line of evidence for maturation or antigen-driven selection. The result is one comparable value between 0 and 1.

### What is the minimum I need upstream?

MiXCR clonotyping, which supplies mutations and abundance. That produces a usable baseline score. Adding Clonotype Convergence and Generation Probability contributes two further independent signals and materially improves the ranking.

### Which preset should I use?

Standard for a post-immunization repertoire with no antigen-binding pre-sort, where the score has to separate specific from non-specific clones as well as rank them. Antigen-selected when a binding sort already happened and every clone is a presumed binder, so the score only needs to rank within that pool.

### Can I change the weights?

Yes. Presets set defaults, and every per-feature weight is editable. The block shows which variables are in use so you are adjusting a visible formula rather than a black box.

### How do I know what produced a given score?

The block emits a diagnostic manifest of the weights and columns used. That makes a ranking reproducible and explainable — useful when a shortlist needs defending, and when comparing runs configured differently.

### Why not just sort by clone size?

Because expansion alone does not imply selection for your antigen, and the largest clones in a repertoire are frequently not the interesting ones. Combining expansion with maturation, convergence, and rarity distinguishes clones that expanded because they were selected from clones that were simply abundant.

## Part of the Platforma ecosystem

This block is part of [Platforma](https://platforma.bio/) by [MiLaboratories](https://github.com/milaboratory). Explore the other open-source blocks at [github.com/platforma-open](https://github.com/platforma-open) and the docs for antibody discovery at [docs.platforma.bio/biology-guides/antibody-discovery](https://docs.platforma.bio/biology-guides/antibody-discovery/).
