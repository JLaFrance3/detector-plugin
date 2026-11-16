---
id: TASK-012
title: Detector service with queue
status: todo
milestone: M1
requirements: [REQ-F-006, REQ-NF-001, REQ-PRV-001]
depends_on: [TASK-005, TASK-008]
---

# TASK-012: Detector service with queue

Production detector in the offscreen document: lazy model load, WebGPU with WASM fallback, queue with max 2 concurrent jobs, reports model status.

## Acceptance criteria

- [ ] Returns a 0 to 1 score per image
- [ ] No image data leaves the browser (verified in DevTools network panel)
- [ ] Max 2 concurrent inferences
- [ ] Model status (not downloaded / downloading % / ready) available to the popup
- [ ] Model weights cached with the Cache API
