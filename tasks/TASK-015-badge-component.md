---
id: TASK-015
title: Badge component
status: done
milestone: M2
requirements: [REQ-F-007, REQ-UI-001, REQ-UI-002, REQ-UI-003, REQ-UI-004, REQ-SEC-002]
depends_on: [TASK-003, TASK-007, TASK-013]
---

# TASK-015: Badge component

Small overlay badge on images with a Definite or Likely verdict.

## Acceptance criteria

- [x] At most 20 x 20 px with a 24 x 24 px hit area, top-right, 4 px inset
- [x] No layout shift; rest of the image stays clickable
- [x] 70% opacity at rest, full on hover/focus, tooltip text per REQ-UI-002
- [x] Definite and Likely differ by icon and text; passes WCAG AA contrast
- [x] Nothing rendered for None; no 'real' indicator anywhere

## Notes from implementation (2026-11-16)

- The badge is a `<button>` in the root component template (`projects/in-page/src/app/app.html`), positioned by `OverlayStore` in document coordinates as an absolute overlay. The host element has `pointer-events: none`, so only the 24 px target takes clicks.
- Definite: square chip, solid border, text "AI". Likely: round chip, dashed border, text "AI?".
- Contrast measured in the browser at rest (70% opacity): white text on the chip is about 7.5:1 over a light image and 9:1 over a dark one; at full opacity it is 17.4:1. The white border keeps the chip visible on dark images.
- Badges hide while their image is scrolled out of a container, clipped, or covered by a fixed or sticky element such as a site header.
- Verified by `extension/e2e/ui.mjs` (size, target, placement, tooltip, zero layout shift, image still clickable) on a page with hostile CSS, and by component tests in `app.spec.ts`.
