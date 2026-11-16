# Presentation outline

CYB 505 Practitioner Assignment. 15 minutes. Graded on presentation (33), industry knowledge (33) and innovation (34). This is the slide-by-slide content with speaker notes; numbers are the ones measured in this repository and each cites its source.

Timing target: 11 slides, about 9 minutes of talk and 4 minutes of live demo, 2 minutes spare.

---

## 1. Title (0:20)

**Spotting AI images where you browse**
A Chrome extension that marks AI-generated images in the page, on your device.

Notes: one sentence on what it is and that everything shown is running code, not a mock-up.

## 2. The problem (1:00)

- AI images are now good enough that people cannot reliably tell.
- Checking today means leaving the page: upload the image to a checker, one at a time.
- Most "AI detectors" send every image to a server. For a browser add-on that means a third party sees everything you look at.

Notes: frame it as a security and privacy problem, not only a media-literacy one. The question for the talk: can we warn people inside the page without shipping their browsing to anyone?

## 3. The labelling landscape (1:30) — industry knowledge

| Signal | Who uses it | Can a third party verify it? | Survives a screenshot or re-upload? |
| --- | --- | --- | --- |
| C2PA Content Credentials (signed metadata) | Adobe, OpenAI, Google, Meta, Anthropic | **Yes**, with a public trust list | No |
| IPTC/XMP "digital source type" (unsigned tag) | Many tools and stock sites | No, anyone can write it | No |
| Invisible watermarks (SynthID and others) | Google, OpenAI | Only by the owner's checker | Often |
| Statistical detectors | Researchers, vendors | n/a, it is a guess | Yes, with lower accuracy |

Notes: the key insight is that only C2PA is cryptographically checkable by us. Watermarks need the vendor's own tool (synthid.com, openai.com/verify, claude.com/check-content), which is why the extension links to them instead of pretending to read them. Source: research brief and ADR-001.

## 4. The idea: strongest evidence first (1:00) — innovation

1. **Definite**: valid signature + trusted signer + declares AI. Square "AI" badge.
2. **Likely**: unsigned metadata says AI, or the on-device detector scores it above the threshold. Round "AI?" badge.
3. **Otherwise nothing.** The extension never says an image is real.

Image: `images/badges.png`.

Notes: stress the asymmetry. A mark means AI involvement; no mark means nothing. That one rule removes the most dangerous failure, a false "this is authentic".

## 5. Architecture (1:15)

Diagram: page (content script + closed shadow root UI) → service worker (fetch, cache, routing) → offscreen document (C2PA in WASM, ViT detector on WebGPU). Optional backend to the side, dotted line, "only on click".

- Manifest V3, permissions: `storage`, `offscreen`, image host access. Nothing else.
- The AI model runs in the browser: Community Forensics ViT through transformers.js, WebGPU with a WASM fallback.
- No remote code: all JavaScript and WebAssembly ships in the package.

Notes: the innovation claim is running both cryptographic provenance checking and a neural detector locally, inside a browser extension, fast enough to keep up with scrolling.

## 6. Security design: the page is the adversary (1:30)

Use the slide draft from `docs/security-review.md`:

- Hostile pages → closed shadow root, validated messages, the page never sees results
- Poisoned metadata → allowlist, sanitizer, text-only rendering, banned-API lint
- Fake provenance → signature, hash binding and trust list all required for "Definite"
- Backend abuse and SSRF → bytes only, never URLs; rate limits; key stays server-side
- Privacy → on-device by default; one image leaves only on an explicit click, downscaled and stripped

Notes: pick two to explain in depth. Suggested: (a) metadata as an injection vector, since signer names and tool names are attacker-controlled strings shown in our UI; (b) why "valid signature" is not enough without a trust list, using the test-certificate sample.

## 7. Live demo (4:00)

See `demo-script.md`. Fallback: recorded run.

## 8. Does it work? Accuracy (1:15)

Image: `images/threshold-chart.svg`.

- 228 scores: 50 AI images from 7 generators and 64 real photographs, each also recompressed.
- Threshold T = 0.50: **0 of 128 real photos flagged**. In the cross-site run, 0 of 97 real-site images flagged.
- **57 of 100 AI images caught**: 64% of originals, 50% after recompression.
- Uneven by generator: DALL-E 85%, Stable Diffusion 83%, Midjourney 23%.

Notes: be direct that detection is partial and say why this is the right trade: a warning tool that cries wolf gets uninstalled, so the threshold was set for false positives first. Provenance is the reliable path; the detector is a fallback for stripped images. Limits: small set, one source, labels from Commons categories. Source: `extension/eval/RESULTS.md`.

## 9. Does it stay out of the way? Performance (0:45)

| Measure | Result | Budget |
| --- | --- | --- |
| C2PA read, median | 2 ms | 300 ms |
| Detector inference, median (WebGPU) | 55 ms | 1 s |
| Detector inference, median (WASM fallback) | 440 ms | 1 s |
| Longest extension callback on the page | 8.2 ms | 50 ms |
| Layout shift caused by the extension | 0 | 0 |

Notes: measured on 7 real sites including news, social, a dark theme and a strict-CSP site. Source: TASK-023 and TASK-005.

## 10. Engineering practice: traceability (0:45)

Image: a crop of `docs/traceability.md`.

- 38 requirements with IDs, 26 tickets, 8 decision records.
- Every commit names its ticket; every test name starts with the requirement it verifies.
- 209 unit and component tests plus browser suites; 31 of 38 requirements have a test that names them.
- Built with heavy AI assistance under written rules (`CLAUDE.md`): the security rules were the constraints, the tests were the proof.

Notes: one honest sentence about a finding that the process caught: the detector build named in the plan turned out to be a broken export, found in the first spike and recorded as ADR-008.

## 11. Takeaways (0:40)

- Provenance beats detection when it exists; design for both and say which one you are showing.
- A security tool running inside hostile pages has to treat the page, and the data it reads, as the attacker.
- Privacy by architecture: the cheapest way not to leak browsing data is to never send it.
- Next: more signed samples in the wild, a better detector for recent generators, Firefox.

---

## Before the talk

- [ ] Add the signed ChatGPT, Gemini and Firefly downloads to the demo page (`demo/README.md`).
- [ ] Deploy the backend and build with `AID_BACKEND_URL`, or decide to show the second opinion from the recording only.
- [ ] Open the demo page once on the presentation laptop so the 87 MB model is already cached.
- [ ] Record the fallback video of the demo script.
- [ ] Re-run `npm run verify`, `npm run security` and `npm run e2e` and update any number that changed.
