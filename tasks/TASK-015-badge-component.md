---
id: TASK-015
title: Badge component
status: todo
milestone: M2
requirements: [REQ-F-007, REQ-UI-001, REQ-UI-002, REQ-UI-003, REQ-UI-004, REQ-SEC-002]
depends_on: [TASK-003, TASK-007, TASK-013]
---

# TASK-015: Badge component

Small overlay badge on images with a Definite or Likely verdict.

## Acceptance criteria

- [ ] At most 20 x 20 px with a 24 x 24 px hit area, top-right, 4 px inset
- [ ] No layout shift; rest of the image stays clickable
- [ ] 70% opacity at rest, full on hover/focus, tooltip text per REQ-UI-002
- [ ] Definite and Likely differ by icon and text; passes WCAG AA contrast
- [ ] Nothing rendered for None; no 'real' indicator anywhere
