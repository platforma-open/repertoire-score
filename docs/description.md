# Repertoire Score

Repertoire Score ranks the clonotypes in your dataset by how promising they are as
antibody leads, fusing several independent sequence signals into one value between 0
and 1. Instead of sorting candidates by a single metric — clone size, or mutation count
alone — it combines complementary lines of evidence into one comparable ranking, so the
clonotypes most worth expressing and testing rise to the top.

## What the Score Combines

Each signal is an independent per-clonotype measure of maturation or antigen-driven
selection:

- **Clonal abundance** — how expanded the clone is; larger clones are more likely to
  have been selected and amplified.
- **Somatic hypermutation** — how far the sequence has matured from germline (CDR and
  framework mutations); evidence of affinity-driven selection.
- **Convergence** — whether the clonotype sits in a convergent CDR3 neighbourhood, i.e.
  independently re-discovered across the repertoire — a hallmark of antigen-driven
  selection.
- **Generation probability** — how unlikely the sequence is to arise by chance from
  random V(D)J recombination; a rare sequence that also converges is far more meaningful
  than a common one.

The score uses the available signals from the list above. MiXCR
clonotyping alone (mutations + abundance) gives a solid baseline; adding the
**Convergence Score** and **Generation Probability** blocks upstream raises its quality.

## Presets Matched to Your Experiment

- **Standard** — post-immunisation repertoires with no antigen-binding pre-sort; the
  score both filters non-specific clones and ranks the specific ones.
- **Antigen-selected** — repertoires enriched by an antigen-binding sort (FACS tetramer /
  probe / bead); all clones are presumed binders, and the score ranks within that pool.
