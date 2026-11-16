---
id: TASK-006
title: Message contracts and validation
status: todo
milestone: M1
requirements: [REQ-SEC-003]
depends_on: [TASK-002]
---

# TASK-006: Message contracts and validation

Define typed message schemas between content script, service worker and offscreen document, with runtime validation and a `sender.id` check.

## Acceptance criteria

- [ ] All messages defined in one shared module
- [ ] Invalid or foreign messages are dropped (unit tested)
- [ ] Content script never receives raw image bytes
