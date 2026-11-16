---
id: TASK-004
title: Spike: read C2PA in the offscreen document
status: done
milestone: M0
requirements: [REQ-F-003, REQ-SEC-007]
depends_on: [TASK-002]
---

# TASK-004: Spike: read C2PA in the offscreen document

Load `@contentauth/c2pa-web` in an offscreen document and read the manifest of a known C2PA sample image (e.g. a ChatGPT or Firefly download).

## Acceptance criteria

- [x] Manifest fields and validation status logged for 2 sample images
- [x] Time per read recorded
- [x] Answer recorded: how trust-list validation is configured (open item in requirements)

## Notes

See ADR-004.

## Findings (2026-11-15)

ADR-004 holds for C2PA. Run `node e2e/spike-c2pa.mjs` in `extension/` to reproduce.

- **Works:** `@contentauth/c2pa-web` 0.17.0 reads and validates manifests in the offscreen document. Fields and validation state were logged for 8 sample images (see `extension/e2e/fixtures/c2pa/README.md`): valid, tampered data, tampered signature, trusted Adobe signer with an AI-edited source type, trusted signer without one, remote manifest, and no manifest.
- **Time per read:** median 11 ms, maximum about 40 ms after warm-up (the first trusted-chain validation took about 300 ms). Well inside the 300 ms budget of REQ-NF-001. Images without a manifest return in 1 to 2 ms.
- **Trust list (open item, REQ-SEC-007):** the library ships no trust list and trusts nothing by default. Trust is configured per read with `new Context({ trust: { trustAnchors, trustConfig }, verify: { verifyTrust: true } })`, where `trustAnchors` is PEM text (or a URL). The manifest store then reports `validation_state` as `Trusted` (valid and chains to an anchor), `Valid` (valid, unknown signer, with failure code `signingCredential.untrusted`) or `Invalid`. The extension bundles the official C2PA trust list, the C2PA TSA list and the interim Content Credentials list as text, so no network request is made. Definite requires `Trusted`.
- **Worker and CSP:** the default worker is created from a blob: URL, which the MV3 CSP blocks, and the `workerSrc` option only accepts https: URLs. The build ships `c2pa_worker.js` and `c2pa_bg.wasm` in `offscreen/vendor/` and the reader passes a `URL` subclass that reports `https:` for the packaged chrome-extension: URL. The library checks the WASM file against a pinned SHA-512 hash.
- **Privacy:** remote manifest fetching (on by default) and OCSP fetching are both switched off. An image whose manifest is stored remotely is treated as having no manifest. The spike confirms zero network requests outside the extension.
- **Bundle cost:** `c2pa_bg.wasm` is 9.2 MB; `offscreen.js` grows to about 154 kB.
- **Source type location:** `digitalSourceType` is read from the active manifest assertions (actions and metadata), not from a top-level field.
- **Bytes to the offscreen document:** the spike passes image bytes as base64 over `chrome.runtime` messaging. Fine for now; revisit if large images are slow (TASK-008).
- **Still needed:** real ChatGPT, Gemini and Firefly downloads for the demo page (TASK-021). The public test repositories have no such files.
