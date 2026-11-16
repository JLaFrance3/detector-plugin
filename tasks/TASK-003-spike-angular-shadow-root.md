---
id: TASK-003
title: Spike: Angular rendering in a content script shadow root
status: todo
milestone: M0
requirements: [REQ-UI-006, REQ-SEC-002]
depends_on: [TASK-002]
---

# TASK-003: Spike: Angular rendering in a content script shadow root

Prove ADR-005: bootstrap zoneless Angular with `createApplication` in the content script and render a test component into a closed shadow root on any page.

## Acceptance criteria

- [ ] A test badge renders on 3 different sites with identical styling
- [ ] No `customElements` usage
- [ ] Bundle size of the content script recorded in this ticket

## Notes

If this fails, record findings and propose an alternative ADR before continuing.
