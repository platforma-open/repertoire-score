---
"@platforma-open/milaboratories.repertoire-score.model": patch
"@platforma-open/milaboratories.repertoire-score.ui": patch
---

Compute the block subtitle without opening the block

The subtitle shows the dataset's (or subset's) label, kept in sync with the result pool and
written only when it changes, followed by the tier when one is pinned in custom mode. Existing
blocks show the pinned tier alone (or nothing) until the block is opened. The block's arguments
do not change, so existing blocks do not become stale.
