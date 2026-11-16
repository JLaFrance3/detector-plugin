---
id: TASK-019
title: Second-opinion flow in the extension
status: done
milestone: M3
requirements: [REQ-F-009, REQ-PRV-002, REQ-NF-002]
depends_on: [TASK-016, TASK-018]
---

# TASK-019: Second-opinion flow in the extension

Popover button that downscales (max 1024 px) and strips metadata, sends the image to the backend, and shows the result as a separate line.

## Acceptance criteria

- [x] Only on click, one image per click
- [x] Hidden when the setting is off
- [x] Shows 'Unavailable' when backend is down or over quota; rest of extension unaffected
- [x] Result does not change the badge verdict

## Notes from implementation (2026-11-16)

- The click travels content script to service worker as a URL only. The service worker checks that the setting is on, fetches the image, downscales it to at most 1024 px and re-encodes it as JPEG on an `OffscreenCanvas` (`background/second-opinion.ts`), which drops every piece of metadata, then posts the bytes to the backend.
- The backend address is fixed at build time from `AID_BACKEND_URL`; without it the button answers "Unavailable" and nothing is sent. Only HTTPS addresses (or localhost for development) are contacted.
- Each installation makes a random 128-bit token on first use, sent as `X-Install-Token` for rate limiting only.
- The result is a separate line in the popover; verdict, badge and cache are untouched. One request per badge.
- `extension/e2e/second-opinion.mjs` runs the flow against the real backend code with a fake provider and inspects the uploaded bytes (size, format, no XMP/EXIF/C2PA).
