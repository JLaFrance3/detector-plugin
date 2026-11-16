# ADR-008: Use the corrected upstream detector weights, pinned to a revision

- **Status:** Proposed, 2026-11-15 (implemented in TASK-005; awaiting owner sign-off)
- **Requirements:** REQ-F-006, REQ-NF-001, REQ-NF-006, REQ-SEC-008
- **Amends:** ADR-003 (same model and approach; different repository for the weights)

## Context
ADR-003 and REQ-F-006 name `onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX` as the on-device detector. The TASK-005 spike found that this export is unusable: on 5 AI images and 5 real photos every score fell between 0.36 and 0.63, with no separation. Its `config.json` shows why: 12 attention heads and an MLP size of 3072, which is not the ViT-Small the paper trained (6 heads, 1536). The file is 144 MB where ViT-Small should be about 87 MB.

The model's upstream repository, `buildborderless/CommunityForensics-DeepfakeDet-ViT`, documents the same bug and replaced its weights in July 2026 with ones regenerated from the authors' training checkpoint. It now ships corrected ONNX files (`onnx/model.onnx` 87 MB, `model_quantized.onnx` 23 MB, `model_q4.onnx` 16 MB). The onnx-community copy was converted before the fix and was never updated.

With the corrected weights the same spike scored 4 of 5 AI images at 0.99 or higher and all 5 real photos at 0.02 or lower. The one miss is a collage of an AI render and a hand-drawn sketch.

## Decision
- Load the detector from `buildborderless/CommunityForensics-DeepfakeDet-ViT` instead of the onnx-community export. It is the same MIT-licensed model that ADR-003 chose.
- Pin the download to commit `ac6ee457bea904a373065754107451793b56db00`, so the weights cannot change without a code change.
- Use full precision (`fp32`, 87 MB) on WebGPU and 8-bit weights (`q8`, 23 MB) on the WASM fallback.
- Apply the training-time preprocessing in code (short side to 440, centre-crop 384) rather than trusting the published preprocessor config.

## Consequences
- The accuracy numbers quoted in ADR-003 came from the model card and are still unverified; TASK-022 measures them on our own set and calibrates the threshold.
- There is no half-precision export in the corrected repository, so the WebGPU download is 87 MB rather than 72 MB.
- A pinned revision means upstream fixes are not picked up automatically; bumping the pin is a deliberate, reviewable change.
- If Hugging Face removes the repository the extension cannot download the model. Mitigation if needed: host the pinned files on the project droplet.
