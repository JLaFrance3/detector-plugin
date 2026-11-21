# ADR-011: A neutral marker on unflagged images, shown on hover

- **Status:** Accepted, 2026-11-21 (requested by the owner)
- **Requirements:** REQ-F-007, REQ-F-008, REQ-F-009, REQ-UI-003, REQ-UI-004
- **Amends:** REQ-F-007 ("For a None verdict, nothing is shown")

## Context
The details popover, and with it the "Get a second opinion" button, could only be opened from a Definite or Likely badge. When the detector missed an AI image there was no way to ask for a second opinion on it, which is exactly when one is most useful.

REQ-UI-003 (never imply an image is real) and REQ-UI-004 (quiet by design) still apply.

## Decision
- Every image the extension checked gets a marker. Definite and Likely badges are unchanged.
- A None result gets a **neutral marker**: a grey round chip with an italic "i", labelled "Not flagged · details". No checkmark, no green, no wording that suggests the image is real.
- The neutral marker is invisible and click-through at rest. It appears while the pointer is over the image, and when it has keyboard focus, so pages are not covered in markers and clicks on the image corner still reach the page.
- It opens the same details popover: "Not flagged", "No AI signal found", the evidence per signal, the caveat, the checker links and, when enabled, "Get a second opinion".
- Images that could not be checked (fetch failed, too small, SVG) get no marker; there is nothing to show or send.

## Consequences
- A second opinion can be requested for any checked image.
- Hidden markers are still keyboard focus stops, one per checked image. Acceptable for now; revisit if keyboard users find it noisy.
- If the hover-only marker proves hard to discover, making it visible at rest is a one-line CSS change (`.aid-badge.aid-neutral`).
