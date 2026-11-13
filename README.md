# Repertoire Score

Rank clonotypes as antibody leads on several lines of evidence at once. This Platforma block combines somatic hypermutation with convergence or generation probability into a single tunable score between 0 and 1, using a recipe calibrated for how the repertoire was collected — so the clonotypes worth expressing and testing rise to the top, instead of being chosen by whichever single metric you happened to sort by.

Open-source analysis block for Platforma, the biologics discovery platform by MiLaboratories. For the full no-code workflow, see [platforma.bio](https://platforma.bio/).

## What it does

Every individual metric misleads on its own. Sort by clone size and you get whatever expanded, selected or not. Sort by mutation count and you get heavily mutated clones regardless of whether the mutations did anything. Each signal is real but partial, and a candidate that looks good on all of them is a very different prospect from one that looks good on one.

Repertoire Score combines them. Each contributing signal is an independent per-clonotype measure of maturation or antigen-driven selection:

* **Somatic hypermutation** — how far the sequence has matured from germline: nucleotide mutations in the V and J genes, and amino-acid changes in CDR1 and CDR2.
* **Convergence** — the clonotype's convergent neighbour frequency: how dense its one-amino-acid CDR3 neighbourhood is in its sample. A dense neighbourhood suggests antigen-driven selection.
* **Generation probability** — how unlikely the sequence is to arise by chance from V(D)J recombination.

Two presets match the score to how the repertoire was collected, and each answers its own question:

* **Standard** — post-immunization repertoires with no antigen-binding pre-sort. The question is which clonotypes bind. Clonotypes whose nucleotide mutation count (heavy + light on paired data) is closest to 6 rank highest, a small weight favours fewer amino-acid changes in CDR1 and CDR2, and the convergent neighbour frequency is added when [Clonotype Convergence](https://github.com/platforma-open/clonotype-convergence) ran upstream.
* **Antigen-selected** — repertoires already enriched by an antigen-binding sort (FACS tetramer, probe, or bead). All clones are presumed binders, so the question is which binds best. Clonotypes rank by their heavy-chain V + J nucleotide mutations and, at a smaller weight, their amino-acid changes in CDR1 and CDR2, and the heavy- and light-chain generation probability is added when [Generation Probability](https://github.com/platforma-open/generation-probability) ran upstream.

MiXCR clonotyping supplies the mutations, which give the Base score; the preset's second signal comes from its upstream block.

**Nothing is hidden.** The block shows the formula it uses and the weight of each term, and lets you adjust them. It also emits a diagnostic record of the weights and columns that produced each score, so a ranking can be explained and reproduced rather than taken on trust.

Results come with distribution views and a scatterplot for inspecting how the signals relate before acting on the ranking.

## Inputs & outputs

* **Input:** a heavy-chain or paired heavy + light clonotype dataset from MiXCR clonotyping, assembled over the full-length VDJRegion — the assembly that exports the somatic-mutation columns. Optionally a convergence result from [Clonotype Convergence](https://github.com/platforma-open/clonotype-convergence) (Standard) or a Pgen column from [Generation Probability](https://github.com/platforma-open/generation-probability) (Antigen-selected), which adds the preset's second signal. 
* **Output:** a Repertoire Score per clonotype between 0 and 1, plus the diagnostic manifest of contributing variables and weights — consumed directly by [Lead Selection](https://github.com/platforma-open/antibody-tcr-lead-selection), whose In Vivo preset ranks on it.

## Specifications

| | |
|---|---|
| Block title in app | Repertoire Score |
| Output range | 0 to 1, higher is a more promising lead |
| Signals | Somatic hypermutation; convergence (Standard) or generation probability (Antigen-selected) |
| Signal availability | Needs MiXCR VDJRegion mutation columns; convergence and Pgen require their upstream blocks |
| Presets | Standard (no antigen pre-sort: find binders) and Antigen-selected (post-sort: rank binders by affinity) |
| Weights | Preset defaults; the weight of each term in the preset's formula, and the centre of the mutation term, are editable |
| Transparency | Diagnostic manifest of the weights and columns behind every score |
| Views | Main table, signal distributions, scatterplot |

## Use cases

* **In vivo lead ranking:** produce the composite score [Lead Selection](https://github.com/platforma-open/antibody-tcr-lead-selection)'s In Vivo preset ranks on.
* **Post-immunization triage:** rank a post-immunization repertoire when no antigen-binding sort was performed.
* **Ranking within a sorted pool:** use the Antigen-selected preset when every clone is already a presumed binder and the question is which to prioritize.
* **Evidence-weighted shortlists:** favor candidates supported by several independent signals over those strong on one.
* **Tuned scoring:** reweight the preset's terms, or move the centre of the mutation term, for a campaign where, say, convergence matters more than maturation.
* **Auditable rankings:** use the diagnostic manifest to explain why a candidate ranked where it did.

## FAQ

### What does the score combine?

Somatic hypermutation, plus convergence (Standard) or generation probability (Antigen-selected) when its block ran upstream — each an independent line of evidence for maturation or antigen-driven selection. Each preset combines them in the recipe calibrated for its question. The result is one comparable value between 0 and 1.

### What is the minimum I need upstream?

MiXCR clonotyping assembled over the full-length VDJRegion, which supplies the mutation columns. That produces the Base score. Adding Clonotype Convergence (Standard) or Generation Probability (Antigen-selected) contributes the preset's second signal.

### Which preset should I use?

Standard for a post-immunization repertoire with no antigen-binding pre-sort, where the question is which clonotypes bind. Antigen-selected when a binding sort already happened and every clone is a presumed binder, so the question is which binds best.

### Can I change the weights?

Yes. Presets set the defaults. In Custom mode the weight of each term in the preset's formula is editable, and so is the centre of the mutation term (6 by default); terms outside the preset's formula cannot be added. The block shows the formula in use, so you are adjusting a visible formula rather than a black box.

### How do I know what produced a given score?

The block emits a diagnostic manifest of the weights and columns used. That makes a ranking reproducible and explainable — useful when a shortlist needs defending, and when comparing runs configured differently.

### Why not just sort by clone size?

Because expansion alone does not imply selection for your antigen, and the largest clones in a repertoire are frequently not the interesting ones. The score leaves clone size out: adding it did not improve the calibrated ranking. It ranks on maturation, convergence and rarity instead.

## Part of the Platforma ecosystem

This block is part of [Platforma](https://platforma.bio/) by [MiLaboratories](https://github.com/milaboratory). Explore the other open-source blocks at [github.com/platforma-open](https://github.com/platforma-open) and the docs for antibody discovery at [docs.platforma.bio/biology-guides/antibody-discovery](https://docs.platforma.bio/biology-guides/antibody-discovery/).
