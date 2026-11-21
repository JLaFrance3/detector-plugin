# Requirements: AI Image Detection Extension

| | |
| --- | --- |
| Project | CYB 505 Practitioner Assignment (Fall 2026) |
| Owner | Jean LaFrance (solo) |
| Version | 0.5 draft, 2026-11-17 (second opinion adds Sightengine's deepfake model, ADR-009) |
| Source | [Research brief](https://claude.ai/artifact/EJUyaN6fcZo5qUfvjfCkLS), decisions agreed 2026-11-04 |

## 1. Purpose and scope

A Chrome extension that checks images as they appear on a web page and shows a small, unintrusive warning when an image is AI-generated. It prefers cryptographic provenance (C2PA Content Credentials) when present, falls back to an on-device AI detector, and offers an optional cloud second opinion through a small backend.

The goal is simple warnings when an image is definitely or very likely AI-generated. It does not prove that an image is real, and it never claims to.

**In scope:** `<img>` and `<picture>` images on desktop Chrome; C2PA and IPTC/XMP provenance; on-device detection; optional cloud check via a Node backend.

**Out of scope:** text detection; video and audio; CSS background images, canvas and SVG; Firefox and mobile; decoding invisible watermarks (SynthID and similar, which only their owners can check); training a custom model; explanation heatmaps.

## 2. Definitions

| Term | Meaning |
| --- | --- |
| C2PA manifest | Signed provenance metadata embedded in an image file (Content Credentials) |
| Trusted signer | A C2PA signing certificate that chains to the C2PA trust list |
| AI source type | IPTC `digitalSourceType` of `trainedAlgorithmicMedia` (AI-generated) or `compositeWithTrainedAlgorithmicMedia` (AI-edited) |
| Detector score | Probability (0 to 1) from the on-device model that an image is AI-generated |
| Threshold (T) | Minimum detector score that produces a "Likely" verdict. Calibrated to 0.50 (TASK-022, REQ-NF-006; see `extension/eval/RESULTS.md`) |
| Verdict | One of: **Definite**, **Likely**, **None** (see REQ-F-005) |

## 3. Architecture summary

| Part | Responsibility |
| --- | --- |
| Content script | Finds visible images, renders badge and details popover in a closed shadow root |
| Service worker | Routes messages, fetches image bytes, manages cache, calls backend |
| Offscreen document | Runs `@contentauth/c2pa-web` and the `@huggingface/transformers` detector |
| Popup (Angular) | Settings and status |
| Backend (Node, Fastify, droplet) | Optional cloud check via Sightengine; holds the API key |

Priority key: **H** = needed for the demo, **M** = should have, **L** = nice to have.

## 4. Functional requirements

### REQ-F-001 Find visible images (H)
The extension shall check each `<img>` or `<picture>` image when it first enters the viewport, including images added after page load.
- Uses IntersectionObserver for visibility and MutationObserver for added images.
- An image added by infinite scroll is checked when scrolled into view.
- Images that never become visible are never fetched or checked.
- Images smaller than 128 px in either rendered dimension are skipped.
- SVG images and images inside the extension's own UI are skipped.
- `data:` URL images up to 20 MB are checked; larger ones are skipped as a sanity guard against runaway memory use.

### REQ-F-002 Fetch image bytes (H)
The service worker shall fetch the image bytes for each candidate image using the extension's host permissions.
- Works for cross-origin images that the page itself could display.
- A failed fetch (network, 4xx/5xx, timeout over 10 s) results in verdict None and no badge, with the error logged in dev builds only.

### REQ-F-003 Read and validate C2PA (H)
The offscreen document shall read any C2PA manifest in the image and validate its signature, hash binding and certificate chain.
- Returns: manifest present (yes/no), validation status, signer name, claim generator (tool), and any `digitalSourceType` assertions.
- A manifest that fails validation is treated as "no valid manifest" and the failure reason is kept for the details popover.

### REQ-F-004 Read unsigned IPTC/XMP metadata (M)
When there is no valid C2PA manifest, the extension shall read the IPTC/XMP `digitalSourceType` field if present.
- An AI source type in unsigned metadata counts toward a "Likely" verdict (REQ-F-005), never "Definite".

### REQ-F-005 Decide the verdict (H)
The extension shall assign exactly one verdict per image, using the first rule that matches:

| Order | Condition | Verdict |
| --- | --- | --- |
| 1 | Valid C2PA manifest, trusted signer, AI source type | **Definite** (label "AI-generated" or "AI-edited") |
| 2 | Unsigned IPTC/XMP AI source type | **Likely**, confidence shown as "metadata" |
| 3 | Detector score >= T | **Likely**, confidence shown as a percentage |
| 4 | Anything else | **None** |

- The detector (REQ-F-006) runs only when rule 1 does not match.
- A valid C2PA manifest stating camera capture still runs the detector, but its result is shown with that context in the popover.
- Verdict logic is a pure function with unit tests covering every row.

### REQ-F-006 On-device AI detection (H)
The offscreen document shall score images with an on-device image classifier (the Community Forensics ViT, loaded from `buildborderless/CommunityForensics-DeepfakeDet-ViT` at a pinned revision; see ADR-008) via transformers.js, using WebGPU when available and WASM otherwise.
- No image data leaves the browser for this step.
- The model is downloaded once on first use and cached (REQ-F-011).
- At most 2 images are scored at a time; others wait in a queue.

### REQ-F-007 Show the badge (H)
For a Definite or Likely verdict, the extension shall show a badge on the image as specified in REQ-UI-001 to REQ-UI-004. For a None verdict, nothing is shown.

### REQ-F-008 Details popover (H)
Clicking the badge shall open a details popover (REQ-UI-005) showing:
- Verdict and confidence.
- Each signal checked and its result: C2PA (present / valid / signer / tool), IPTC metadata, detector score.
- A fixed caveat: a mark shows AI involvement; no mark does not mean an image is real.
- Links to the official checkers: synthid.com, OpenAI's verification tool, and the Claude Content Checker (claude.com/check-content).
- The cloud second-opinion button (REQ-F-009) when enabled.

### REQ-F-009 Cloud second opinion (M)
The popover shall offer a "Get a second opinion" button that sends that one image to the backend, which queries Sightengine and returns a score.
- Runs only on an explicit click, one image per click. Never automatic.
- The result is shown in the popover as a separate line; it does not change the badge verdict.
- When the face-edit score is at least 50%, the same line adds "N% likely face-edited". Below that, the line is unchanged (ADR-009).
- When the backend is unreachable or over quota, the button shows "Unavailable" and the rest of the extension works normally.

### REQ-F-010 Settings popup (M)
The toolbar popup shall let the user:
- Turn the extension on or off globally.
- Turn it off for the current site (stored by hostname).
- Turn the cloud second-opinion feature on or off (default off).
- Clear the verdict cache.
- See model status: not downloaded, downloading (percent), ready.

### REQ-F-011 Cache results (H)
The extension shall cache verdicts in `chrome.storage.local`, keyed by a SHA-256 hash of the image URL, and reuse them for 7 days.
- A cached image is not fetched or scored again within 7 days.
- Model weights are cached with the Cache API, not `chrome.storage`.
- "Clear cache" (REQ-F-010) removes all cached verdicts.

### REQ-F-012 Backend check endpoint (M)
The backend shall expose `POST /v1/check` that accepts image bytes and returns `{ score, deepfake, provider, checkedAt }`.
- Accepts JPEG, PNG and WebP only.
- Calls Sightengine's AI-generated image and deepfake models in one request and normalizes each result to a 0 to 1 score. `deepfake` is null when the provider gives no face-manipulation score; that never fails the check (ADR-009).
- Constraints in REQ-SEC-004 to REQ-SEC-006 and REQ-PRV-002 apply.

### REQ-F-013 Demo sample page (M)
The repo shall include a local demo page with labeled sample images: at least 5 with valid C2PA from AI tools (ChatGPT, Gemini, Firefly), 5 AI images with metadata stripped, and 5 real photos.
- Each verdict path (Definite, Likely, None) is visible on this page.

## 5. User interface requirements

Design intent: small and unintrusive on the user's page.

### REQ-UI-001 Badge size and placement (H)
- The badge is at most 20 x 20 px, with a 24 x 24 px click target.
- It sits inside the image's top-right corner, 4 px from the edges, as an absolute overlay.
- It causes no layout shift and does not block clicks on the rest of the image.
- At rest it is 70% opaque; on hover or focus it is fully opaque and shows a tooltip.

### REQ-UI-002 Distinguishable states (H)
- Definite and Likely differ by icon shape and text, not only by color.
- Tooltip text: "AI-generated (Content Credentials)" or "Likely AI · 93%".
- Meets WCAG 2.1 AA contrast (4.5:1 for text, 3:1 for the icon) on light and dark images, using a solid backing chip.

### REQ-UI-003 No "real" claims (H)
- The extension never shows a badge, checkmark or text implying an image is authentic or human-made.

### REQ-UI-004 Quiet by design (H)
- No page banners, notifications, sounds or animations beyond a 150 ms fade-in.
- The badge can be hidden for the current page from the popover ("Hide on this page").

### REQ-UI-005 Details popover (H)
- Anchored to the badge, at most 320 px wide, and repositions to stay inside the viewport.
- Closes on Esc, on outside click and on a close button.
- Fully keyboard operable; badge is focusable with a visible focus ring; popover has an accessible name.

### REQ-UI-006 Style isolation (H)
- Badge and popover render in a closed shadow root, and page CSS does not change their appearance.
- Verified on at least 5 sites, including a news site, a social site and a dark-themed site.

## 6. Non-functional requirements

### REQ-NF-001 Page performance (H)
- The extension adds no measurable cumulative layout shift.
- Content script work on the main thread stays under 50 ms per task.
- C2PA read takes under 300 ms median per image on the demo laptop.
- Detector inference takes under 1 s median per image after the model is loaded. (To confirm in the first spike.)

### REQ-NF-002 Works without the backend (H)
- All features except REQ-F-009 work with the backend offline or not configured.

### REQ-NF-003 Platform (H)
- Latest stable desktop Chrome, Manifest V3.
- Build: Angular CLI for extension pages and UI, esbuild for the service worker, content script and offscreen document.

### REQ-NF-004 Code quality and traceability (M)
- TypeScript strict mode in extension and backend.
- Unit tests for verdict logic (REQ-F-005), C2PA field sanitizer (REQ-SEC-001) and backend validation.
- Every commit references a TASK ID; every test name references the REQ ID it verifies.
- `scripts/trace.mjs` generates `docs/traceability.md` (REQ to tasks to tests).

### REQ-NF-005 Budget and quotas (H)
- Total paid API spend at most $10; the default plan is Sightengine's free tier.
- The backend enforces the free tier's limits: at most 1 request per second and a daily cap of 100 checks (adjust once the real per-check operation cost is known).

### REQ-NF-006 Accuracy evaluation (M)
- The detector is evaluated on a labeled set of at least 100 images (at least 50 AI from 3 or more generators, 50 real photos), including recompressed copies.
- Report the false positive rate and detection rate at the chosen threshold T.
- Choose T so that the false positive rate on real photos is at most 5%.

## 7. Security requirements

### REQ-SEC-001 Sanitize C2PA and metadata fields (H)
All text taken from C2PA manifests or IPTC/XMP metadata is untrusted.
- Only allowlisted fields are read: signer name, claim generator, digital source type, signing time, validation status.
- Values are treated as plain text: control and Unicode bidirectional characters removed, whitespace collapsed, length capped at 120 characters.
- Unit tests include HTML/script injection, bidi override and very long strings.

### REQ-SEC-002 Safe rendering (H)
- UI renders untrusted text only through Angular text interpolation.
- No `innerHTML`, `bypassSecurityTrust*` or `eval` anywhere in the extension (lint rule enforced).
- Badge and popover live in a closed shadow root (REQ-UI-006).

### REQ-SEC-003 Validate internal messages (H)
- The service worker and offscreen document accept messages only from this extension (`sender.id` check).
- Every message is validated against a schema; invalid messages are dropped.
- Content scripts never receive raw image bytes or API responses beyond the fields needed for display.

### REQ-SEC-004 API key stays on the backend (H)
- The Sightengine key exists only in the backend's environment.
- A build check fails if a key-like string appears in the extension bundle.

### REQ-SEC-005 Backend hardening (H)
- HTTPS only (Caddy with automatic certificates).
- Rate limit: 10 requests per minute per IP and per install token, plus the global caps in REQ-NF-005.
- Uploads at most 5 MB; content type checked by magic bytes, not just the header.
- Errors return generic messages without stack traces.

### REQ-SEC-006 No server-side URL fetching (H)
- The backend accepts image bytes only and never fetches a URL supplied by a client (prevents SSRF).

### REQ-SEC-007 C2PA trust (H)
- A Definite verdict requires a signer that chains to the C2PA trust list.
- A valid signature from an untrusted signer is shown as "signed by an unrecognized signer" and does not produce Definite.

### REQ-SEC-008 Extension platform rules (H)
- No remotely hosted code: all JavaScript and WASM (including ONNX Runtime files) ship in the extension package.
- Extension CSP: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`.
- Permissions limited to `storage`, `offscreen` and host access needed to fetch images. No `tabs`, `history`, `cookies` or `webRequest`.

### REQ-SEC-009 Dependencies (M)
- `npm audit` reports no high or critical vulnerabilities at submission.
- Lockfiles are committed.

## 8. Privacy requirements

### REQ-PRV-001 Local by default (H)
- C2PA reading and on-device detection process images entirely in the browser.
- No image, URL or browsing data leaves the browser unless the user clicks "Get a second opinion".

### REQ-PRV-002 Minimal cloud upload (M)
- Before upload, the extension strips metadata and downscales the image to at most 1024 px on the long side.
- The backend does not store images and does not log image URLs; IP addresses are held in memory only for rate limiting.

### REQ-PRV-003 No telemetry (H)
- The extension sends no analytics or usage data.

### REQ-PRV-004 Local data control (M)
- Cached verdicts and settings stay in local extension storage and can be cleared from the popup.

## 9. Open items

| Item | Affects | Resolve by |
| --- | --- | --- |
| Model download size and inference time in the browser | REQ-F-006, REQ-NF-001 | **Resolved 2026-11-15 (TASK-005):** 87 MB (WebGPU, full precision) or 23 MB (WASM, 8-bit). Median inference 47 ms on WebGPU and 440 ms on WASM, both inside the 1 s budget |
| Sightengine operations per check with the genai and deepfake models (sample genai response shows 5; deepfake is billed on top, ADR-009) | REQ-NF-005 | **Resolved 2026-11-21 (TASK-018):** 10 operations per check, measured on the deployed backend. The free tier (500 a day, 2,000 a month) therefore covers about 200 checks a month. `DAILY_CAP` stays at 100 by the owner’s choice: occasional use, and overage within the $10 budget is acceptable |
| Calibrated threshold T | REQ-F-005, REQ-NF-006 | **Resolved 2026-11-16 (TASK-022):** T = 0.50. On 228 scored images: 0 of 128 real photos flagged, 57 of 100 AI images detected (64% of originals, 50% of recompressed copies) |
| Whether `c2pa-web` exposes trust-list validation directly or it must be configured | REQ-SEC-007 | **Resolved 2026-11-15 (TASK-004):** it must be configured. The extension bundles the C2PA trust lists and passes them as trust anchors; a `validation_state` of `Trusted` is required for Definite |
