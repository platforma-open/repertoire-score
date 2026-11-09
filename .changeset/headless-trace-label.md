---
"@platforma-open/milaboratories.repertoire-score.model": patch
"@platforma-open/milaboratories.repertoire-score.ui": patch
---

Compute the block subtitle without opening the block

The subtitle shows the dataset's (or subset's) label, written when the user picks a dataset,
followed by the tier when one is pinned in custom mode. It no longer depends on opening the
block, and opening the block no longer rewrites it. Existing blocks show the pinned tier alone
(or nothing) until the dataset is picked again. The block's arguments do not change, so
existing blocks do not become stale.
