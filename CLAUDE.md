# CLAUDE.md

Chrome extension (Manifest V3) that flags AI-generated images on web pages with a small badge. Solo CYB 505 project. Read `docs/requirements.md` and `docs/decisions/` before changing behavior.

## Working rules

- Work from a task in `tasks/`. Set its `status: in-progress` when starting and `done` when every acceptance criterion passes.
- Every commit message references the task: `feat(c2pa): parse manifest [TASK-009]`. Conventional Commits types.
- Every test name includes the requirement it verifies: `it('REQ-F-005: definite when trusted C2PA declares AI', ...)`.
- If a change contradicts a requirement or ADR, stop and say so. Propose a requirement change or a new ADR; don't silently diverge.
- Run `npm run lint`, `npm test` and `node scripts/trace.mjs --strict` before finishing a task.

## Architecture (see ADRs)

- `extension/` Angular workspace (popup + in-page UI) and esbuild scripts (service worker, content script, offscreen document). No WXT.
- Content script: finds visible images, renders UI in a **closed shadow root** using zoneless Angular via `createApplication` + `createComponent`. Do not use Angular Elements or `customElements`.
- Service worker: message routing, image fetch, cache, backend calls. Keep it stateless; it gets suspended.
- Offscreen document: `@contentauth/c2pa-web` and `@huggingface/transformers` detector. One instance.
- `backend/` Node + Fastify, `POST /v1/check`, calls Sightengine. Optional: the extension must work without it.

## Security rules (non-negotiable)

- All C2PA and IPTC/XMP text is attacker-controlled. Pass it through the sanitizer (REQ-SEC-001) and render only with Angular `{{ }}` interpolation.
- Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function`, or `DomSanitizer.bypassSecurityTrust*`.
- Validate every runtime message against its schema and check `sender.id` (REQ-SEC-003).
- No remotely hosted code. Bundle all JS, WASM and ONNX Runtime files; point transformers.js `wasmPaths` at local files (REQ-SEC-008).
- Never put API keys or secrets in `extension/`. The Sightengine key lives only in the backend environment (REQ-SEC-004).
- Backend accepts image bytes only, never URLs (REQ-SEC-006); 5 MB cap; check magic bytes; rate-limit.
- Don't add permissions beyond `storage`, `offscreen` and image host access without a new ADR.

## Privacy rules

- No image, URL or browsing data leaves the browser except on an explicit "Get a second opinion" click (REQ-PRV-001).
- No analytics or telemetry (REQ-PRV-003). Backend stores no images and logs no URLs.

## UI rules

- Badge: max 20 x 20 px, top-right inset 4 px, overlay with no layout shift, 70% opacity at rest.
- Show nothing for a None verdict. Never show anything implying an image is real.
- Popover max 320 px, keyboard operable, closes on Esc and outside click.
