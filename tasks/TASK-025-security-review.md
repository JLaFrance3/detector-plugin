---
id: TASK-025
title: Security review before submission
status: done
milestone: M4
requirements: [REQ-SEC-002, REQ-SEC-004, REQ-SEC-008, REQ-SEC-009, REQ-PRV-001, REQ-PRV-003]
depends_on: [TASK-017, TASK-019, TASK-020]
---

# TASK-025: Security review before submission

Final security pass on the extension and backend.

## Acceptance criteria

- [x] Build check confirms no API-key-like strings in `extension/dist/`
- [x] `npm audit` shows no high or critical issues
- [x] Lint confirms no banned DOM/eval APIs
- [x] Manifest permissions and CSP match REQ-SEC-008
- [x] Network panel shows no requests during browsing except model weights and clicked second opinions; no analytics code in the bundle
- [x] Short threat-model slide drafted (hostile pages, metadata injection, backend abuse, SSRF)

## Notes from implementation (2026-11-16)

- Full write-up, threat model table and the slide draft are in `docs/security-review.md`.
- `npm run security` (`scripts/security-check.mjs`) runs the dependency audit, the bundle checks, a reviewed-hostname and tracker scan of `extension/dist/`, and an independent scan for banned APIs.
- One hardening change came out of the review: images declaring more than 50 megapixels are skipped before decoding (`src/shared/image-size.ts`).
- Network behaviour is asserted by `e2e/pipeline.mjs` (the offscreen document only loads model files from huggingface.co and never fetches images) and `e2e/second-opinion.mjs` (nothing is uploaded until the button is clicked).
- Re-run before submission, after the backend is deployed and the demo samples are added.
