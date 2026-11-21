---
id: TASK-028
title: Score several views of each image
status: done
milestone: M4
requirements: [REQ-F-006, REQ-NF-001, REQ-NF-006]
depends_on: [TASK-012, TASK-022]
---

# TASK-028: Score several views of each image

Score the full image, a half-size copy and a centre crop in one batch and keep the highest score (ADR-010), then re-run the evaluation.

## Acceptance criteria

- [x] Views that would need upscaling are skipped (unit tests in `src/shared/views.spec.ts`)
- [x] Evaluation re-run: real-photo false positives stay at or below 5% at the chosen threshold
- [x] Median detector time stays under 1 s

## Results (2026-11-21)

- T stays at 0.50. Real photos flagged: 0 of 128 (highest score 0.051, unchanged).
- AI images caught: 63 of 100 (was 57). Originals 76% (was 64%), recompressed 50% (unchanged; too small for extra views). Midjourney originals 46% (was 23%). No AI image that was caught before was lost.
- The imagine.art example now scores 0.64 and gets a Likely badge.
- Median detector time on real sites: 58 ms on WebGPU (was 55 ms).
