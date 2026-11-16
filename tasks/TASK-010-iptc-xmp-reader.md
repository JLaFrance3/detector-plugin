---
id: TASK-010
title: Read unsigned IPTC/XMP source type
status: done
milestone: M1
requirements: [REQ-F-004]
depends_on: [TASK-008, TASK-011]
---

# TASK-010: Read unsigned IPTC/XMP source type

Read the IPTC/XMP `digitalSourceType` field when there is no valid C2PA manifest.

## Acceptance criteria

- [x] Detects `trainedAlgorithmicMedia` and `compositeWithTrainedAlgorithmicMedia`
- [x] Unit tests with tagged and untagged samples

## Notes from implementation (2026-11-16)

- `extension/src/shared/xmp.ts` scans the file bytes for the XMP `DigitalSourceType` property in its attribute, element and `rdf:resource` forms, so one reader covers JPEG, PNG and WebP.
- Read only when there is no valid C2PA manifest. When it declares AI, the detector is skipped (rule 2 already decides).
