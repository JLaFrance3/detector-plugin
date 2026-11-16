---
id: TASK-007
title: Find visible images on the page
status: done
milestone: M1
requirements: [REQ-F-001]
depends_on: [TASK-003, TASK-006]
---

# TASK-007: Find visible images on the page

Content script uses IntersectionObserver and MutationObserver to queue `<img>`/`<picture>` images when they first become visible.

## Acceptance criteria

- [x] Images below 128 px in either dimension are skipped
- [x] SVG and the extension's own UI are skipped; `data:` images up to 20 MB are queued
- [x] Infinite-scroll images are picked up when scrolled into view
- [x] Each image is queued at most once per page

## Notes from implementation (2026-11-16)

- `extension/src/content/image-watcher.ts` uses MutationObserver for added images, IntersectionObserver for visibility and a capturing `load` listener for source changes (lazy loading, carousels). When a badged image changes source the badge is removed and the new source is checked.
- An image is identified by element and URL, so each is queued at most once; the same URL shown several times on a page is requested once.
- The size, SVG and data: URL rules are pure functions in `extension/src/shared/image-filter.ts` with unit tests; the observer behaviour is covered by `extension/e2e/pipeline.mjs`.
