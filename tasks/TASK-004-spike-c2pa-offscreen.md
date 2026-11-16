---
id: TASK-004
title: Spike: read C2PA in the offscreen document
status: todo
milestone: M0
requirements: [REQ-F-003, REQ-SEC-007]
depends_on: [TASK-002]
---

# TASK-004: Spike: read C2PA in the offscreen document

Load `@contentauth/c2pa-web` in an offscreen document and read the manifest of a known C2PA sample image (e.g. a ChatGPT or Firefly download).

## Acceptance criteria

- [ ] Manifest fields and validation status logged for 2 sample images
- [ ] Time per read recorded
- [ ] Answer recorded: how trust-list validation is configured (open item in requirements)

## Notes

See ADR-004.
