---
id: TASK-025
title: Security review before submission
status: todo
milestone: M4
requirements: [REQ-SEC-002, REQ-SEC-004, REQ-SEC-008, REQ-SEC-009, REQ-PRV-001, REQ-PRV-003]
depends_on: [TASK-017, TASK-019, TASK-020]
---

# TASK-025: Security review before submission

Final security pass on the extension and backend.

## Acceptance criteria

- [ ] Build check confirms no API-key-like strings in `extension/dist/`
- [ ] `npm audit` shows no high or critical issues
- [ ] Lint confirms no banned DOM/eval APIs
- [ ] Manifest permissions and CSP match REQ-SEC-008
- [ ] Network panel shows no requests during browsing except model weights and clicked second opinions; no analytics code in the bundle
- [ ] Short threat-model slide drafted (hostile pages, metadata injection, backend abuse, SSRF)
