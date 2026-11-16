---
id: TASK-013
title: Verdict decision function
status: done
milestone: M1
requirements: [REQ-F-005]
depends_on: [TASK-001]
---

# TASK-013: Verdict decision function

Pure function implementing the REQ-F-005 table: Definite, Likely or None from C2PA, IPTC and detector inputs, with threshold T (default 0.90).

## Acceptance criteria

- [x] Unit test per table row, named with REQ-F-005
- [x] Detector is not called when rule 1 matches
- [x] Camera-capture C2PA plus detector result is represented for the popover
