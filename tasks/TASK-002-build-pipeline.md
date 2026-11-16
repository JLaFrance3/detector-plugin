---
id: TASK-002
title: Build pipeline: Angular CLI + esbuild + manifest
status: todo
milestone: M0
requirements: [REQ-NF-003, REQ-SEC-008]
depends_on: [TASK-001]
---

# TASK-002: Build pipeline: Angular CLI + esbuild + manifest

Angular CLI builds the popup and the in-page UI bundle; an esbuild script builds the service worker, content script and offscreen document; both write into `extension/dist/`. Hand-written Manifest V3.

## Acceptance criteria

- [ ] `npm run build` produces a loadable unpacked extension in `extension/dist/`
- [ ] `npm run watch` rebuilds both on change
- [ ] Manifest permissions are exactly `storage`, `offscreen` and the host permission for images
- [ ] CSP is `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`
- [ ] No file in `dist/` loads code from a remote URL

## Notes

See ADR-002.
