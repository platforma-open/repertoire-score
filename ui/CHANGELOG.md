# @platforma-open/milaboratories.repertoire-score.ui

## 2.1.0

### Minor Changes

- 6b235be: Two Repertoire Score blocks on the same dataset now both appear in the blocks below, each named by its block label.
  Updating re-runs the block and the blocks that use its score.

### Patch Changes

- Updated dependencies [6b235be]
  - @platforma-open/milaboratories.repertoire-score.model@2.1.0

## 2.0.0

### Minor Changes

- 41e7b29: New repertoire score formulas: after this update the block gives different scores that might result in a different clonotype ranking for the same data.

  - Standard now ranks highest the clonotypes with about 6 nucleotide mutations and few CDR1 + CDR2 amino-acid mutations.
  - Antigen-selected now ranks highest the clonotypes with the most heavy-chain V + J nucleotide mutations and CDR1 + CDR2 amino-acid mutations.
  - Your custom weights and a pinned tier are reset to the new defaults.
  - The block now runs only on MiXCR data with clonotypes assembled by VDJRegion, the only assembly that carries the mutation data the scores need.

### Patch Changes

- Updated dependencies [41e7b29]
  - @platforma-open/milaboratories.repertoire-score.model@2.0.0
  - @platforma-open/milaboratories.repertoire-score.kind@1.3.0

## 1.4.5

### Patch Changes

- Updated dependencies [f1916d1]
  - @platforma-open/milaboratories.repertoire-score.kind@1.2.1
  - @platforma-open/milaboratories.repertoire-score.model@1.4.5

## 1.4.4

### Patch Changes

- @platforma-open/milaboratories.repertoire-score.model@1.4.4

## 1.4.3

### Patch Changes

- 4e56a17: Compute the block subtitle's settings part in the model

  The subtitle shows the dataset's (or subset's) label, kept in sync with the result pool and
  written only when it changes, followed by the tier when one is pinned in custom mode. Existing
  blocks show the pinned tier alone (or nothing) until the block is opened. The block's arguments
  do not change, so existing blocks do not become stale.

- Updated dependencies [4e56a17]
  - @platforma-open/milaboratories.repertoire-score.model@1.4.3

## 1.4.2

### Patch Changes

- Updated dependencies [29c6c31]
  - @platforma-open/milaboratories.repertoire-score.model@1.4.2

## 1.2.2

### Patch Changes

- b887d65: Release every package through npm trusted publishing (OIDC) so each package's trusted publisher is used before it expires.
- Updated dependencies [b887d65]
  - @platforma-open/milaboratories.repertoire-score.model@1.4.1

## 1.2.1

### Patch Changes

- Updated dependencies [e437f17]
  - @platforma-open/milaboratories.repertoire-score.model@1.4.0

## 1.2.0

### Minor Changes

- 682aa51: Accept filtered inputs

### Patch Changes

- Updated dependencies [682aa51]
  - @platforma-open/milaboratories.repertoire-score.model@1.3.0
  - @platforma-open/milaboratories.repertoire-score.kind@1.2.0

## 1.1.0

### Minor Changes

- 220ad3d: Avoid re-run triggered by moving unrelated blocks

### Patch Changes

- Updated dependencies [220ad3d]
  - @platforma-open/milaboratories.repertoire-score.model@1.2.0
  - @platforma-open/milaboratories.repertoire-score.kind@1.1.0

## 1.0.2

### Patch Changes

- Updated dependencies [81d303f]
  - @platforma-open/milaboratories.repertoire-score.model@1.1.0

## 1.0.1

### Patch Changes

- 114d0de: Migrate to new column access mechanism
- Updated dependencies [114d0de]
  - @platforma-open/milaboratories.repertoire-score.model@1.0.1

## 1.0.0

### Major Changes

- 3513b46: New block release

### Patch Changes

- Updated dependencies [3513b46]
  - @platforma-open/milaboratories.repertoire-score.model@1.0.0
