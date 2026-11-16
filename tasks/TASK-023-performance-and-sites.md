---
id: TASK-023
title: Performance and cross-site check
status: done
milestone: M4
requirements: [REQ-NF-001, REQ-UI-006]
depends_on: [TASK-015, TASK-016]
---

# TASK-023: Performance and cross-site check

Measure the extension on real sites and the demo page.

## Acceptance criteria

- [x] No extension-caused layout shift in Chrome DevTools
- [x] Content script tasks under 50 ms
- [x] Median C2PA read and inference times recorded
- [x] Badge appearance verified on 5+ sites including news, social and a dark theme

## Results (2026-11-16)

Measured by `extension/e2e/sites.mjs` on a development build (demo laptop, Edge headless, WebGPU). Each page was loaded, scrolled six screens, and given one known Definite image as a data: URL.

| Site | Kind | Images checked | Badges on site images | Longest extension callback | Layout shift from extension |
| --- | --- | --- | --- | --- | --- |
| bbc.com/news | news | 18 | 0 | 3.1 ms | 0 |
| en.wikipedia.org | encyclopedia | 5 | 0 | 8.2 ms | 0 |
| reddit.com/r/pics | social | 1 | 0 | 1.0 ms | 0 |
| theverge.com | dark theme | 6 | 0 | 1.7 ms | 0 |
| flickr.com/explore | photo site | 57 | 0 | 3.6 ms | 0 |
| github.com/explore | strict CSP | 10 | 0 | 2.6 ms | 0 |
| commons.wikimedia.org | media library | 0 (thumbnails under 128 px) | 0 | 2.5 ms | 0 |

- **Layout shift:** none of the layout-shift entries on any site involved the extension host element. The UI is a zero-size absolutely positioned overlay.
- **Main-thread work:** the longest single content-script or UI callback on any site was 8.2 ms, against a 50 ms budget. Timings come from a log that exists only in development builds (`src/shared/perf.ts`).
- **C2PA read:** median 2 ms, maximum 82 ms over 97 images (budget 300 ms).
- **Detector inference:** median 55 ms, maximum 167 ms over 96 images on WebGPU (budget 1 s). The WASM fallback measured 440 ms in TASK-005.
- **Appearance (REQ-UI-006):** the Definite badge on the injected test image was pixel-identical on six sites, including the dark-themed and strict-CSP ones. On bbc.com a consent dialog covered the test image, so the badge was hidden, which is the intended behaviour for covered images.
- **False positives in the wild:** 97 real-site images were checked and none was flagged.
- Not covered: sites behind a login, and unsplash.com, which served an error page to the automated browser.
