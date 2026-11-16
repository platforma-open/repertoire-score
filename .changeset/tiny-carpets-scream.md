---
"@platforma-open/milaboratories.repertoire-score": major
"@platforma-open/milaboratories.repertoire-score.workflow": minor
"@platforma-open/milaboratories.repertoire-score.model": minor
"@platforma-open/milaboratories.repertoire-score.kind": minor
"@platforma-open/milaboratories.repertoire-score.ui": minor
---

New preset coefficients for both families; the preset names stay.

- Standard ranks highest the clonotypes whose nucleotide mutation count is closest to 6 (|Nt mutations - k|, k editable in Custom mode), with fewer CDR1 + CDR2 amino-acid mutations; tier 2a adds the convergent neighbour frequency.
- Antigen-selected ranks by heavy-chain V + J nucleotide mutations, with more CDR1 + CDR2 amino-acid mutations; tier 2b adds the heavy- and light-chain generation probability.
- Abundance, CDR mutation fraction and fast-STAR leave the default formulas. Each family offers two tiers.
- Updating from an earlier version resets the block to the new presets: custom weights and a pinned tier are dropped, and the weights and formula go back to Default.
- Datasets without VDJRegion mutation columns, and Antigen-selected datasets without per-gene heavy-chain counts, stop with a message, also shown in Settings before Run. Bulk light-chain-only datasets are no longer offered as input.
- Kind: adds the ntMutationsDistance, heavyNtMutationsVJ and nbFreq feature keys and the optional ntMutationsCenter param.
