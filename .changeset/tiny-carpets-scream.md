---
"@platforma-open/milaboratories.repertoire-score": major
"@platforma-open/milaboratories.repertoire-score.workflow": minor
"@platforma-open/milaboratories.repertoire-score.model": minor
"@platforma-open/milaboratories.repertoire-score.kind": minor
"@platforma-open/milaboratories.repertoire-score.ui": minor
---

New repertoire score formulas: after this update the block gives different scores that might result in a different clonotype ranking for the same data.

- Standard now ranks highest the clonotypes with about 6 nucleotide mutations and few CDR1 + CDR2 amino-acid mutations.
- Antigen-selected now ranks highest the clonotypes with the most heavy-chain V + J nucleotide mutations and CDR1 + CDR2 amino-acid mutations.
- Your custom weights and a pinned tier are reset to the new defaults.
- The block now runs only on MiXCR data with clonotypes assembled by VDJRegion, the only assembly that carries the mutation data the scores need.
