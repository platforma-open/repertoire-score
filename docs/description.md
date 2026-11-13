# Repertoire Score

Repertoire Score ranks the clonotypes in your dataset by how promising they are as
antibody leads, combining independent sequence signals into one value between 0 and 1. Instead of sorting candidates by a single metric — clone size, or mutation count
alone — it combines complementary lines of evidence into one comparable ranking, so the
clonotypes most worth expressing and testing rise to the top.

## What the Score Combines

Each signal is an independent per-clonotype measure of maturation or antigen-driven
selection:

- **Somatic hypermutation** — how far the sequence has matured from germline: nucleotide
  mutations in the V and J genes, and amino-acid changes in CDR1 and CDR2.
- **Convergence** — the convergent neighbour frequency: how dense the clonotype's
  one-amino-acid CDR3 neighbourhood is in its sample, a hallmark of antigen-driven
  selection. A clonotype left out of the convergence analysis counts as 0.
- **Generation probability** — how unlikely the sequence is to arise by chance from
  random V(D)J recombination.

MiXCR clonotyping supplies the mutations (the Base score); it must be assembled over the
full-length VDJRegion, the assembly that exports the mutation columns. Each preset adds
one more signal from its upstream block: the **Clonotype Convergence** block for Standard,
the **Generation Probability** block for Antigen-selected. Clonal abundance and the CDR
mutation fraction do not enter the score.

Heavy-chain and paired heavy + light data are supported; a dataset of light-chain
clonotypes only is not offered as input.

## Presets Matched to Your Experiment

- **Standard** — post-immunisation repertoires with no antigen-binding pre-sort: which
  clonotypes bind? Clonotypes with a nucleotide mutation count closest to 6 rank highest,
  with a small weight for fewer amino-acid changes in CDR1 and CDR2, plus convergence.
- **Antigen-selected** — repertoires enriched by an antigen-binding sort (FACS tetramer /
  probe / bead): all clones are presumed binders, so which binds best? Clonotypes rank by
  heavy-chain V + J nucleotide mutations and, at a smaller weight, more amino-acid changes
  in CDR1 and CDR2, plus the heavy- and light-chain generation probability.
