---
id: TASK-019
title: Second-opinion flow in the extension
status: todo
milestone: M3
requirements: [REQ-F-009, REQ-PRV-002, REQ-NF-002]
depends_on: [TASK-016, TASK-018]
---

# TASK-019: Second-opinion flow in the extension

Popover button that downscales (max 1024 px) and strips metadata, sends the image to the backend, and shows the result as a separate line.

## Acceptance criteria

- [ ] Only on click, one image per click
- [ ] Hidden when the setting is off
- [ ] Shows 'Unavailable' when backend is down or over quota; rest of extension unaffected
- [ ] Result does not change the badge verdict
