---
id: TASK-007
title: Find visible images on the page
status: todo
milestone: M1
requirements: [REQ-F-001]
depends_on: [TASK-003, TASK-006]
---

# TASK-007: Find visible images on the page

Content script uses IntersectionObserver and MutationObserver to queue `<img>`/`<picture>` images when they first become visible.

## Acceptance criteria

- [ ] Images below 128 px in either dimension are skipped
- [ ] SVG and the extension's own UI are skipped; `data:` images up to 20 MB are queued
- [ ] Infinite-scroll images are picked up when scrolled into view
- [ ] Each image is queued at most once per page
