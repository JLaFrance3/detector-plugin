---
id: TASK-006
title: Message contracts and validation
status: done
milestone: M1
requirements: [REQ-SEC-003]
depends_on: [TASK-002]
---

# TASK-006: Message contracts and validation

Define typed message schemas between content script, service worker and offscreen document, with runtime validation and a `sender.id` check.

## Acceptance criteria

- [x] All messages defined in one shared module
- [x] Invalid or foreign messages are dropped (unit tested)
- [x] Content script never receives raw image bytes

## Notes from implementation (2026-11-16)

- All messages and validators are in `extension/src/shared/messages.ts`. Validators rebuild each value field by field, so unknown properties (such as image bytes) cannot pass through to a content script.
- Senders are classified from `sender.id` and `sender.url`: content script, popup, offscreen document or service worker. Each message type is accepted only from the part that may send it; for example a content script cannot clear the cache, and only the service worker can ask the offscreen document to analyze bytes.
- Invalid or foreign messages get no reply at all.
