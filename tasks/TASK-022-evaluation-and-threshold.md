---
id: TASK-022
title: Evaluation set and threshold calibration
status: done
milestone: M4
requirements: [REQ-NF-006]
depends_on: [TASK-012, TASK-013]
---

# TASK-022: Evaluation set and threshold calibration

Build a labeled set of at least 100 images and choose threshold T.

## Acceptance criteria

- [x] At least 50 AI images from 3+ generators and 50 real photos, plus recompressed copies
- [x] Script reports false positive rate and detection rate across thresholds
- [x] T chosen so real-photo FPR <= 5%; T updated in code and requirements
- [x] Results chart saved for the presentation

## Notes from implementation (2026-11-16)

- Set: 114 usable images from Wikimedia Commons (50 AI from 7 generators, 64 real photographs), each also scored as a recompressed copy (60% size, JPEG quality 50), 228 scores in total. `extension/eval/manifest.json` lists every image with its source; the files are downloaded by `eval/build-set.mjs` and not committed.
- Scoring runs through the built extension (`eval/run.mjs`), so it measures what users get. `eval/analyze.mjs` writes `eval/RESULTS.md` and `eval/threshold-chart.svg`.
- **Result: T = 0.50.** No real photo scored above 0.06, so the false positive rate is 0 of 128 at every threshold tested; T is the lowest value the rule allows (floor of 0.50). Detection at T: 57 of 100 AI images (64% of originals, 50% of recompressed).
- Detection varies a lot by generator: DALL-E 85%, Stable Diffusion 83%, Leonardo AI 80%, but Midjourney 23% and Meta AI 25%. The detector misses many recent photorealistic images, which is the honest headline for the presentation: provenance is reliable when present, detection is a useful but partial fallback.
- `DEFAULT_THRESHOLD` in `extension/src/shared/types.ts` and the requirements are updated.
- Two mislabelled entries were excluded by hand and are marked in the manifest.
