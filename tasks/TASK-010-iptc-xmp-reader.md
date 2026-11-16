---
id: TASK-010
title: Read unsigned IPTC/XMP source type
status: todo
milestone: M1
requirements: [REQ-F-004]
depends_on: [TASK-008, TASK-011]
---

# TASK-010: Read unsigned IPTC/XMP source type

Read the IPTC/XMP `digitalSourceType` field when there is no valid C2PA manifest.

## Acceptance criteria

- [ ] Detects `trainedAlgorithmicMedia` and `compositeWithTrainedAlgorithmicMedia`
- [ ] Unit tests with tagged and untagged samples
