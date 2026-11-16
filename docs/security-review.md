# Security review

TASK-025, 2026-11-16. Covers the extension at commit time and the backend code (not yet deployed). Re-run `npm run build && npm run security && npm run e2e` before submission.

## Summary

| Check | Result | Evidence |
| --- | --- | --- |
| No API-key-like strings in `extension/dist/` (REQ-SEC-004) | Pass | `extension/scripts/check-dist.mjs`, run by every build |
| `npm audit`: no high or critical issues (REQ-SEC-009) | Pass: 0 critical, 0 high, 7 moderate | `npm run security` |
| No banned DOM/eval APIs in our source (REQ-SEC-002) | Pass: 0 uses in 52 files | ESLint rules, plus an independent scan in `scripts/security-check.mjs` |
| Manifest permissions and CSP match REQ-SEC-008 | Pass | `check-dist.mjs` compares them exactly |
| No remote code (REQ-SEC-008) | Pass | `check-dist.mjs` (static) and `e2e/pipeline.mjs` (resources actually loaded) |
| No network use while browsing beyond images and model weights (REQ-PRV-001) | Pass | `e2e/pipeline.mjs` Network section; `e2e/second-opinion.mjs` |
| No analytics or telemetry (REQ-PRV-003) | Pass | Hostname and tracker scan of the bundle in `security-check.mjs` |
| Lockfile committed (REQ-SEC-009) | Pass | `package-lock.json` |

The 7 moderate advisories are all one issue in `minimatch`, pulled in by `typescript-eslint`. It is development tooling that never ships in the extension or runs on the backend. Fixing it today would mean downgrading the linter; revisit when `typescript-eslint` updates its dependency.

## Threat model

Assets: the user's browsing privacy, the integrity of what the badge claims, the Sightengine key and quota, and the user's browser itself.

| # | Threat | Who | Controls | Residual risk |
| --- | --- | --- | --- | --- |
| T1 | **Hostile page restyles, hides or forges the badge** | Any website | UI lives in a closed shadow root; host element is reset with `!important` rules that win over page CSS; the page cannot read or script the UI. Verified on 7 sites and a hostile-CSS fixture. | A page can draw its own look-alike badge. It cannot open our popover, so the evidence view stays trustworthy. |
| T2 | **Metadata injection (XSS through C2PA or XMP text)** | Anyone who can craft an image | Allowlist of fields; `sanitizeText` strips control, bidi and invisible characters and caps length; values re-validated at every message hop; rendered only by Angular interpolation; lint and a scan ban `innerHTML`, `eval` and friends. Component test renders `<img onerror>` and `<script>` payloads as inert text. | Low. |
| T3 | **Spoofed provenance** (fake "signed by Adobe") | Image author | Definite requires a valid signature chaining to the bundled C2PA trust lists. A valid signature from an unknown signer is labelled as such and never gives Definite. Tampered data or signature fails validation. Tested with trusted, untrusted and tampered samples. | A stolen or misissued trusted key would be believed until the trust list is updated. Trust lists are bundled and need a manual refresh. |
| T4 | **Confused deputy: page makes the extension fetch things** | Any website | The service worker only issues GET requests for `http(s)` image URLs the page already shows, without cookies or referrer, 10 s timeout, 20 MB cap. The response never reaches the page: only a verdict comes back, into a UI the page cannot read. Non-image responses are dropped by magic-byte check. | A page can make the extension request an intranet URL, as it already can with an `<img>` tag. It learns nothing from it. |
| T5 | **Resource exhaustion from hostile images** | Any website | Size cap, pixel-count check from the header before any decoding (50 MP), detector queue of 2, images under 128 px skipped, one check per URL, 7-day cache. Parsing runs in WASM workers in the offscreen document, away from the page. | AVIF and HEIC dimensions are not pre-checked. A crash of the offscreen document only pauses checks; it is recreated on demand. |
| T6 | **Forged internal messages** | Compromised page or another extension | Every message is schema-validated and accepted only from the part allowed to send it (`sender.id` and sender URL). A content script cannot clear the cache, change settings, report model status or reach the offscreen document. Invalid messages get no reply. | A fully compromised renderer could request checks for arbitrary image URLs, which is what the content script does anyway. |
| T7 | **Supply chain** | Dependency or model host | Lockfile; `npm audit`; no remote code (all JS and WASM in the package); C2PA WASM verified against a pinned SHA-512 by the library; detector weights pinned to a commit hash; model files are data, parsed by ONNX Runtime in WASM. | A malicious model at the pinned hash is not possible without breaking the hash. A compromised npm package at install time is the usual residual risk. |
| T8 | **Privacy leak of browsing** | Us, the backend, third parties | Detection is on-device. No analytics. Cache keys are SHA-256 hashes, not URLs. Nothing is uploaded unless the user clicks "Get a second opinion" for one image, and then only re-encoded pixels at up to 1024 px with all metadata removed. | See the note below about image re-fetches. The model download tells Hugging Face that someone installed the extension. |
| T9 | **Backend abuse and quota burn** | Internet | Bytes only, 5 MB cap, magic-byte check, 10/min per IP and per install token, 1/s and 100/day globally, generic errors, no CORS so pages cannot call it from a browser, loopback bind behind Caddy. | The install token is not authentication; a distributed attacker can still exhaust the daily cap, which only disables the optional second opinion. |
| T10 | **SSRF through the backend** | Internet | The backend has no parser for anything but raw image bytes and no code path that takes a URL; its single outbound address is a constant. Tested with JSON, form, multipart and query-string attempts. | None identified. |
| T11 | **Key disclosure** | Internet, repository readers | Key only in the backend environment file (mode 0640), never in the extension or logs; build fails if a key-like string appears in `dist/`; provider errors are replaced with generic ones. | Compromise of the droplet itself. |

## Findings and notes

1. **Image re-fetch is visible to image hosts (accepted).** To read an image's bytes the service worker requests it again from its origin, without cookies or a referrer. The host therefore sees a second anonymous request for an image the user was already served. No data goes to any party that did not already serve the image. Worth saying on the privacy slide, since "no image data leaves the browser" is true while "no extra requests" is not.
2. **Decompression bombs (fixed in this review).** A small file can declare a huge canvas. `src/shared/image-size.ts` now reads dimensions from the header and skips anything over 50 megapixels before a decoder sees it.
3. **Default CDN path inside transformers.js (mitigated).** The library ships with a jsDelivr address for the ONNX Runtime files. The extension overrides it with a packaged file before any model loads and disables the blob-URL loader. The string remains in the bundle; the e2e network check proves it is never requested, and the extension CSP would block remote script anyway.
4. **`new Function` and `innerHTML` inside third-party bundles (accepted).** One occurrence each, in ONNX Runtime and Angular internals. Neither receives our data, and the extension CSP (`script-src 'self' 'wasm-unsafe-eval'`) blocks string evaluation in extension pages.
5. **The extension is detectable by pages (accepted).** The `<aid-ui-host>` element appears in the DOM once a badge is shown, so a page can tell the extension is installed and that at least one image was flagged. It cannot tell which.
6. **Authenticated images are not checked (by design).** Fetching without cookies means images that need a login get no verdict. Sending cookies would widen T4.
7. **Trust lists and model pin need upkeep.** Both are bundled or pinned on purpose. Refresh `extension/src/offscreen/trust/` and review the model revision before submission.
8. **Backend not yet deployed.** TASK-020's checks (HTTPS only, redirect, service restart, env file permissions) cannot be verified until it is. The commands are in `backend/deploy/README.md`.

## Slide draft: threat model in one view

**"The page is the adversary."**

- **Hostile pages** → closed shadow root, validated messages, the page never sees results
- **Poisoned metadata** → allowlist, sanitizer, text-only rendering, banned-API lint
- **Fake provenance** → signature, hash binding and trust list all required for "Definite"
- **Backend abuse and SSRF** → bytes only, never URLs; rate limits; key stays server-side
- **Privacy** → on-device by default; one image leaves only on an explicit click, downscaled and stripped
