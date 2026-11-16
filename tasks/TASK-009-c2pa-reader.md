---
id: TASK-009
title: C2PA reader with trust check
status: done
milestone: M1
requirements: [REQ-F-003, REQ-SEC-007]
depends_on: [TASK-004, TASK-008, TASK-011]
---

# TASK-009: C2PA reader with trust check

Production version of the spike: read and validate the manifest, check the signer against the C2PA trust list, and return a typed result.

## Acceptance criteria

- [x] Returns present, valid, trusted, signer, tool, digitalSourceType, failure reason
- [x] Untrusted signer never produces `trusted: true`
- [x] Unit tests with valid, tampered and untrusted samples
- [x] All string fields pass through the sanitizer (TASK-011)

## Notes from implementation (2026-11-16)

- `c2pa-reader.ts` returns raw fields; `sanitizeC2pa` (TASK-011) reduces them to the allowlist before they leave the offscreen document. `trusted` is true only for `validation_state === "Trusted"`.
- The valid, tampered and untrusted samples are exercised against the real WASM library in `extension/e2e/pipeline.mjs` (the library needs a browser), and the surrounding logic is unit tested in `analyze.spec.ts` and `sanitize.spec.ts`.
- Interpretation to confirm: a manifest that is valid but from an unrecognized signer and declares an AI source type is treated like unsigned metadata (Likely, confidence "metadata"), never Definite.
