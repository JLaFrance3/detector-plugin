# ADR-004: Run C2PA and the model in an offscreen document

- **Status:** Accepted, 2026-11-04
- **Requirements:** REQ-F-003, REQ-F-006, REQ-SEC-008

## Context
In Manifest V3 the background is a service worker. Chrome stops it after about 30 s idle, wiping in-memory state, and it cannot use dynamic `import()`, which transformers.js and ONNX Runtime rely on. Reloading a large model after every suspension would be slow.

## Decision
Create one offscreen document (`chrome.offscreen`) that loads `@contentauth/c2pa-web` and the transformers.js detector and stays alive while work is queued. The service worker routes messages and fetches image bytes.

## Consequences
- Only one offscreen document is allowed, so C2PA and detection share it.
- All WASM and ONNX Runtime files must be bundled locally (no remote code); configure transformers.js `wasmPaths` accordingly.
- Extension CSP must allow `'wasm-unsafe-eval'`.
