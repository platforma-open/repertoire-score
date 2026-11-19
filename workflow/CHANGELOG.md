# @platforma-open/milaboratories.repertoire-score.workflow

## 2.0.0

### Minor Changes

- 41e7b29: New repertoire score formulas: after this update the block gives different scores that might result in a different clonotype ranking for the same data.

  - Standard now ranks highest the clonotypes with about 6 nucleotide mutations and few CDR1 + CDR2 amino-acid mutations.
  - Antigen-selected now ranks highest the clonotypes with the most heavy-chain V + J nucleotide mutations and CDR1 + CDR2 amino-acid mutations.
  - Your custom weights and a pinned tier are reset to the new defaults.
  - The block now runs only on MiXCR data with clonotypes assembled by VDJRegion, the only assembly that carries the mutation data the scores need.

## 1.4.5

## 1.4.4

## 1.4.3

## 1.4.2

### Patch Changes

- 29c6c31: Update the SDK and build the dataset list with buildDatasetOptions (requireEnrichments: false), replacing the custom merge of datasets and their subset filters. On a subset run, the Distributions and Comparison plots show only the subset's clonotypes.

## 1.3.1

### Patch Changes

- b887d65: Release every package through npm trusted publishing (OIDC) so each package's trusted publisher is used before it expires.

## 1.3.0

### Minor Changes

- e437f17: Update input subset domain annotation

## 1.2.0

### Minor Changes

- 682aa51: Accept filtered inputs

## 1.1.0

### Minor Changes

- 220ad3d: Avoid re-run triggered by moving unrelated blocks

## 1.0.0

### Major Changes

- 3513b46: New block release
