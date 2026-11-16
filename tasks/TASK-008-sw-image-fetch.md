---
id: TASK-008
title: Fetch image bytes in the service worker
status: done
milestone: M1
requirements: [REQ-F-002]
depends_on: [TASK-006]
---

# TASK-008: Fetch image bytes in the service worker

Service worker fetches image bytes by URL using host permissions and passes them to the offscreen document.

## Acceptance criteria

- [x] Cross-origin images fetch successfully
- [x] Timeouts over 10 s and HTTP errors produce verdict None
- [x] Offscreen document created on demand and reused

## Notes from implementation (2026-11-16)

- Fetches use `credentials: "omit"` and no referrer, so the extension never sends the user’s cookies for an image check. Consequence: images that need a login cannot be fetched and get no verdict. This is a deliberate privacy choice; revisit if it hides too many images on social sites.
- The image type comes from the magic bytes, not the Content-Type header, so SVG or HTML served as an image is rejected.
- Bytes go to the offscreen document as base64 in a runtime message (20 MB cap).
- The offscreen document is created on demand by `offscreen-manager.ts` and reused.
