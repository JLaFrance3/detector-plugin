---
id: TASK-018
title: Backend POST /v1/check
status: in-progress
milestone: M3
requirements: [REQ-F-012, REQ-SEC-004, REQ-SEC-005, REQ-SEC-006, REQ-NF-005, REQ-PRV-002]
depends_on: [TASK-001]
---

# TASK-018: Backend POST /v1/check

Fastify service that accepts image bytes, calls Sightengine's AI-generated image model, and returns `{ score, provider, checkedAt }`.

## Acceptance criteria

- [x] Accepts JPEG/PNG/WebP up to 5 MB, verified by magic bytes
- [x] Never fetches client-supplied URLs
- [x] Rate limits: 10/min per IP and per install token, 1 req/s and 100/day global
- [x] Key read from environment only; generic error messages
- [x] No images or URLs persisted or logged
- [ ] Record the real `request.operations` per check (open item)

## Notes from implementation (2026-11-16)

- Fastify 5 service in `backend/src`: `app.ts` (route, limits, error handling), `sightengine.ts` (provider client), `rate-limit.ts`, `image.ts` (magic bytes), `config.ts` (environment). See `backend/README.md` for the API.
- The upload is the raw request body. No JSON, form or multipart parser is registered, so a client has no field in which to send a URL, and the only outbound address is the constant Sightengine endpoint (REQ-SEC-006).
- Limits: 10 a minute per IP and per install token (sliding window, in memory), one provider call a second and 100 a day globally. They reset if the process restarts.
- Logs carry counts only (operations used, checks left today); a test asserts that image bytes, URLs, client addresses and tokens never appear in them.
- 32 tests in `backend/src/*.spec.ts`, run against the app with a fake provider.
- **Open:** the last criterion needs one real call with a Sightengine key. The service logs `operations` for every check, so the number can be read from the log after the first real request (see `backend/deploy/README.md`).
