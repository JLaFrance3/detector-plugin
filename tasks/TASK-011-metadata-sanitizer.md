---
id: TASK-011
title: Sanitize C2PA and metadata fields
status: done
milestone: M1
requirements: [REQ-SEC-001]
depends_on: [TASK-001]
---

# TASK-011: Sanitize C2PA and metadata fields

A pure function that allowlists fields and turns untrusted metadata strings into safe plain text.

## Acceptance criteria

- [x] Removes control and Unicode bidi characters, collapses whitespace, caps at 120 characters
- [x] Non-allowlisted fields are dropped
- [x] Tests cover HTML/script injection, bidi override and very long strings; test names include REQ-SEC-001
