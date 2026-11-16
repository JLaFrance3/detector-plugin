---
id: TASK-017
title: Settings popup
status: done
milestone: M2
requirements: [REQ-F-010]
depends_on: [TASK-002, TASK-012, TASK-014]
---

# TASK-017: Settings popup

Toolbar popup with global on/off, per-site off, cloud second-opinion toggle (default off), clear cache and model status.

## Acceptance criteria

- [x] Settings persist across browser restarts
- [x] Per-site disable stops scanning on that hostname after reload
- [x] Model status updates live

## Notes from implementation (2026-11-16)

- Angular popup in `extension/projects/popup`. Chrome APIs sit behind an `ExtensionApi` interface so the component is tested with a fake (`app.spec.ts`, 10 tests).
- Settings live in `chrome.storage.local` under `settings`; the popup writes them directly and the service worker reads them on every request, so it stays stateless.
- The active tab hostname comes from `chrome.tabs.query`, which needs no extra permission because the extension already has host access to web pages.
- Model status is read from storage and follows `chrome.storage.onChanged` live.
- `extension/e2e/popup.mjs` checks persistence across a browser restart, per-site and global off (no badges and no image fetches after reload), live model status and clear cache.
