---
id: TASK-029
title: Neutral marker on unflagged images
status: done
milestone: M4
requirements: [REQ-F-007, REQ-F-008, REQ-F-009, REQ-UI-003, REQ-UI-004]
depends_on: [TASK-015, TASK-016, TASK-019]
---

# TASK-029: Neutral marker on unflagged images

Give every checked image a marker so the details popover and the second opinion are reachable when nothing was flagged (ADR-011).

## Acceptance criteria

- [x] None results get a grey "i" marker labelled "Not flagged · details"; no wording or symbol implies the image is real
- [x] The marker is hidden and click-through at rest, and appears on hover over the image or on keyboard focus
- [x] It opens the details popover with the second-opinion button
- [x] Unit, component and browser tests cover it (`verdict.spec.ts`, `details.spec.ts`, `ui-bridge.spec.ts`, `app.spec.ts`, `e2e/pipeline.mjs`, `e2e/second-opinion.mjs`, `e2e/demo.mjs`)
