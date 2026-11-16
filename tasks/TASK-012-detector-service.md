---
id: TASK-012
title: Detector service with queue
status: done
milestone: M1
requirements: [REQ-F-006, REQ-NF-001, REQ-PRV-001]
depends_on: [TASK-005, TASK-008]
---

# TASK-012: Detector service with queue

Production detector in the offscreen document: lazy model load, WebGPU with WASM fallback, queue with max 2 concurrent jobs, reports model status.

## Acceptance criteria

- [x] Returns a 0 to 1 score per image
- [x] No image data leaves the browser (verified in DevTools network panel)
- [x] Max 2 concurrent inferences
- [x] Model status (not downloaded / downloading % / ready) available to the popup
- [x] Model weights cached with the Cache API

## Notes from implementation (2026-11-16)

- `detector-service.ts`: lazy load on the first image, WebGPU (fp32) with automatic fallback to WASM (q8), and a `TaskQueue` limiting work to 2 images at a time.
- Model status is sent to the service worker, which stores it in `chrome.storage.local` under `modelStatus` for the popup (offscreen documents cannot use chrome.storage).
- Network check: `extension/e2e/pipeline.mjs` inspects every resource the offscreen document loaded; only model files from huggingface.co are allowed, and it never fetches images itself.
- Weights are cached by transformers.js in the Cache API (`transformers-cache`).
- If the detector cannot run, the image gets no detector signal and the result is not cached, so it is retried later.
