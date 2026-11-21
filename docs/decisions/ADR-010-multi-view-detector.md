# ADR-010: Score several views of each image and keep the highest

- **Status:** Accepted, 2026-11-21 (requested by the owner)
- **Requirements:** REQ-F-006, REQ-NF-001, REQ-NF-006
- **Amends:** ADR-003 (same model, more than one input per image)

## Context
The detector looks at one 384 px window taken from the centre of each image after resizing. One unlucky window decides the result. A hero image from imagine.art (a 54-colour palette PNG) scored 0.10 as served, but 0.64 at half size and 0.79 as a centre crop. The evaluation (TASK-022) also showed weak results on Midjourney-style images: 23% caught.

## Decision
Score up to three views of every image in one batch and use the highest score:

1. the full image (as before),
2. a half-size copy, when its short side is still at least 384 px,
3. the central 60% of each side, when its short side is still at least 384 px.

Views that would need upscaling are skipped, so small images are still scored once. The rule lives in `extension/src/shared/views.ts`.

## Consequences
- Re-running the evaluation at T = 0.50: AI originals caught went from 64% to 76% (Midjourney 23% to 46%), with no AI image lost, and still none of the 128 real-photo scores was flagged (highest 0.051, unchanged). Recompressed copies are below the size limit for the extra views, so their rate did not change (50%).
- Taking the maximum can only raise scores, so false positives are the risk to watch; the threshold rule (at most 5% on real photos) still holds with a wide margin.
- More work per image, batched on the GPU: median detector time on real sites went from 55 ms to 58 ms (WebGPU). The WASM fallback will be slower, up to about three times.
