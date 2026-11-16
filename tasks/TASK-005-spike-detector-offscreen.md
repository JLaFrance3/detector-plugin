---
id: TASK-005
title: Spike: run the detector model in the offscreen document
status: todo
milestone: M0
requirements: [REQ-F-006, REQ-NF-001, REQ-SEC-008]
depends_on: [TASK-002]
---

# TASK-005: Spike: run the detector model in the offscreen document

Load `onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX` with transformers.js in the offscreen document, using locally bundled ONNX Runtime WASM files.

## Acceptance criteria

- [ ] One image scored with WebGPU and one with WASM fallback
- [ ] Recorded: model download size, load time, median inference time over 10 images
- [ ] No network request for runtime code (only model weights)

## Notes

Results update the open items in requirements.md section 9.
