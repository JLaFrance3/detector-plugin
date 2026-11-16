---
id: TASK-008
title: Fetch image bytes in the service worker
status: todo
milestone: M1
requirements: [REQ-F-002]
depends_on: [TASK-006]
---

# TASK-008: Fetch image bytes in the service worker

Service worker fetches image bytes by URL using host permissions and passes them to the offscreen document.

## Acceptance criteria

- [ ] Cross-origin images fetch successfully
- [ ] Timeouts over 10 s and HTTP errors produce verdict None
- [ ] Offscreen document created on demand and reused
