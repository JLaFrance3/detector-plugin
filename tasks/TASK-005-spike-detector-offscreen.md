---
id: TASK-005
title: Spike: run the detector model in the offscreen document
status: done
milestone: M0
requirements: [REQ-F-006, REQ-NF-001, REQ-SEC-008]
depends_on: [TASK-002]
---

# TASK-005: Spike: run the detector model in the offscreen document

Load `onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX` (replaced by the corrected upstream weights, see Findings and ADR-008) with transformers.js in the offscreen document, using locally bundled ONNX Runtime WASM files.

## Acceptance criteria

- [x] One image scored with WebGPU and one with WASM fallback
- [x] Recorded: model download size, load time, median inference time over 10 images
- [x] No network request for runtime code (only model weights)

## Notes

Results update the open items in requirements.md section 9.

## Findings (2026-11-15)

ADR-004 holds for the detector, with one change of plan recorded in ADR-008. Run `node e2e/spike-detector.mjs` in `extension/` to reproduce (it downloads 10 sample images from Wikimedia Commons into `e2e/output/`).

- **The model named in this ticket is broken.** `onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX` was exported from the wrong weights and scores every image between 0.36 and 0.63. The upstream repository `buildborderless/CommunityForensics-DeepfakeDet-ViT` carries corrected weights and ONNX files. The spike uses those, pinned to commit `ac6ee45`. See ADR-008.
- **Results with the corrected weights** (demo laptop, Edge headless, 10 images at 960 px):

  | Backend | Weights | Download | Median per image | First load (with download) | Warm load |
  | --- | --- | --- | --- | --- | --- |
  | WebGPU | fp32 | 87.4 MB | 47 ms | 4 to 16 s | 0.3 s |
  | WASM (1 thread) | q8 | 23.0 MB | 440 ms | 4 s | 0.5 s |
  | WASM (1 thread) | fp32 | 87.4 MB | 730 ms | 4 s | 0.2 s |
  | WASM (1 thread) | q4 | 15.8 MB | 716 ms | 3 s | n/a |

  All are inside the 1 s budget of REQ-NF-001. Times include decoding and preprocessing.
- **Scores:** 4 of 5 AI images scored 0.99 or higher and all 5 real photos 0.02 or lower, on both fp32 and q8. The miss is a collage of an AI render and a hand-drawn sketch. This is a smoke test, not an accuracy measurement; that is TASK-022.
- **Output:** the model returns one logit; its sigmoid is the probability that the image is generated. The transformers.js `image-classification` pipeline cannot be used (it applies softmax to the single logit and always returns 1), so the code calls the model and processor directly.
- **No remote code (REQ-SEC-008):** by default transformers.js loads the ONNX Runtime WASM files from the jsDelivr CDN and imports the runtime glue from a blob: URL. Both are disabled: `wasmPaths.wasm` points at `offscreen/vendor/ort-wasm-simd-threaded.asyncify.wasm` (26.9 MB, shipped in the package), the glue is bundled into `offscreen.js` by esbuild, and `useWasmCache` is off. The spike lists every resource the offscreen document loaded: only `config.json`, `preprocessor_config.json` and the `.onnx` weights from huggingface.co.
- **Caching:** transformers.js stores the weights with the Cache API (REQ-F-011), confirmed by the warm load times.
- **Package size:** the unpacked extension is now about 37 MB (ORT WASM 26.9 MB, C2PA WASM 9.2 MB); `offscreen.js` is 0.7 MB.
- **Possible later optimization:** WASM runs single-threaded because extension pages are not cross-origin isolated. Adding COOP/COEP headers to the manifest would allow threads and should cut the WASM time further. Not needed to meet the budget.
- **Test set-up:** WebGPU works in headless Edge with `--enable-unsafe-webgpu`.
