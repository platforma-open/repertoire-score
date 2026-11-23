# @platforma-open/milaboratories.repertoire-score

## 2.1.0

### Minor Changes

- 6b235be: Two Repertoire Score blocks on the same dataset now both appear in the blocks below, each named by its block label.
  Updating re-runs the block and the blocks that use its score.

## 2.0.0

### Major Changes

- 41e7b29: New repertoire score formulas: after this update the block gives different scores that might result in a different clonotype ranking for the same data.

  - Standard now ranks highest the clonotypes with about 6 nucleotide mutations and few CDR1 + CDR2 amino-acid mutations.
  - Antigen-selected now ranks highest the clonotypes with the most heavy-chain V + J nucleotide mutations and CDR1 + CDR2 amino-acid mutations.
  - Your custom weights and a pinned tier are reset to the new defaults.
  - The block now runs only on MiXCR data with clonotypes assembled by VDJRegion, the only assembly that carries the mutation data the scores need.

## 1.4.5

### Patch Changes

- f1916d1: Bump the kind version. A comment in the kind source changed without a version bump. The registry keeps a published kind version immutable by source hash, so republishing 1.2.0 with different content failed and blocked the block release.

## 1.4.4

### Patch Changes

- a43badf: Point the block's repository link to the current GitHub repository.

## 1.4.3

### Patch Changes

- afaad24: The dataset list no longer shows an error when the project has a MiXCR library.

## 1.4.2

### Patch Changes

- 29c6c31: Update the SDK and build the dataset list with buildDatasetOptions (requireEnrichments: false), replacing the custom merge of datasets and their subset filters. On a subset run, the Distributions and Comparison plots show only the subset's clonotypes.

## 1.4.1

### Patch Changes

- b887d65: Release every package through npm trusted publishing (OIDC) so each package's trusted publisher is used before it expires.

## 1.4.0

### Minor Changes

- e437f17: Update input subset domain annotation

## 1.3.0

### Minor Changes

- 682aa51: Accept filtered inputs

## 1.2.0

### Minor Changes

- 220ad3d: Avoid re-run triggered by moving unrelated blocks

## 1.1.1

### Patch Changes

- 9156ffc: Update SDK: PlAgDataTable no longer recreates its grid in an endless loop

## 1.1.0

### Minor Changes

- 81d303f: Migrate onto the structurer and take the full SDK upgrade (block-tools 2.14.3, tengo-builder 4.0.23, model 1.83.0, ui-vue 1.83.3).

  Adds the mandatory block kind. Its init-params contract is the input dataset plus the whole scoring recipe, so a project template can seed a pre-configured Repertoire Score block.

## 1.0.1

### Patch Changes

- 114d0de: Migrate to new column access mechanism

## 1.0.0

### Major Changes

- 3513b46: New block release
