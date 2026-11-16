---
id: TASK-009
title: C2PA reader with trust check
status: todo
milestone: M1
requirements: [REQ-F-003, REQ-SEC-007]
depends_on: [TASK-004, TASK-008, TASK-011]
---

# TASK-009: C2PA reader with trust check

Production version of the spike: read and validate the manifest, check the signer against the C2PA trust list, and return a typed result.

## Acceptance criteria

- [ ] Returns present, valid, trusted, signer, tool, digitalSourceType, failure reason
- [ ] Untrusted signer never produces `trusted: true`
- [ ] Unit tests with valid, tampered and untrusted samples
- [ ] All string fields pass through the sanitizer (TASK-011)
