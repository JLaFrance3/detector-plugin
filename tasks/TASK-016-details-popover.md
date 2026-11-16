---
id: TASK-016
title: Details popover
status: done
milestone: M2
requirements: [REQ-F-008, REQ-UI-005, REQ-SEC-002]
depends_on: [TASK-015, TASK-009, TASK-010, TASK-012]
---

# TASK-016: Details popover

Popover opened from the badge showing verdict, evidence per signal, caveat, checker links and the second-opinion button.

## Acceptance criteria

- [x] Max 320 px wide, stays in viewport
- [x] Closes on Esc, outside click and close button; keyboard operable
- [x] Shows C2PA, IPTC and detector results; untrusted text only via interpolation
- [x] Links: synthid.com, OpenAI verifier, claude.com/check-content
- [x] 'Hide on this page' option

## Notes from implementation (2026-11-16)

- `Popover` component (`projects/in-page/src/app/popover.ts`), text built by the pure `describeResult` in `src/shared/details.ts`, placement by `placePopover` in `src/shared/popover-position.ts` (below the badge, flips above, clamps to the viewport).
- It is a non-modal `role="dialog"` with an accessible name. Opening moves focus into it; Esc and the close button return focus to the badge; an outside click closes it without moving focus.
- Links: https://synthid.com/, https://openai.com/verify and https://claude.com/check-content, opened in a new tab with `rel="noopener noreferrer"`.
- A component test renders hostile strings (`<img onerror>`, `<script>`) as signer, tool and tooltip and confirms they appear as text and create no elements.
- The second-opinion button is added by TASK-019.
