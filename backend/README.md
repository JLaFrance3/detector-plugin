# Second-opinion backend

Optional service behind the extension's "Get a second opinion" button (REQ-F-009, REQ-F-012). It holds the Sightengine API key so the extension never has to (ADR-006). The extension works fully without it.

## API

`POST /v1/check`

- Body: the raw image bytes (JPEG, PNG or WebP, at most 5 MB). `Content-Type` may be `image/jpeg`, `image/png`, `image/webp` or `application/octet-stream`; the real type is read from the file's magic bytes.
- Optional header `X-Install-Token`: a random ID the extension generates once. Used only as a second rate-limit key.
- Response `200`: `{ "score": 0.93, "deepfake": 0.04, "provider": "sightengine", "checkedAt": "2026-11-16T12:00:00.000Z" }` where `score` is the probability from 0 to 1 that the image is AI-generated (Sightengine `genai`) and `deepfake` is the probability that a face was swapped or edited (Sightengine `deepfake`), or `null` when none was reported (ADR-009).

| Status | `error` | Meaning |
| --- | --- | --- |
| 400 | `bad_request` | Empty or malformed request |
| 413 | `image_too_large` | Over 5 MB |
| 415 | `unsupported_media_type` | Not JPEG, PNG or WebP (or not raw bytes at all) |
| 429 | `rate_limited` | More than 10 requests a minute from this IP or install token |
| 429 | `busy` | Another check ran less than a second ago (global 1 request per second) |
| 429 | `quota_exhausted` | Daily cap reached; resets at midnight UTC |
| 502 | `provider_error` | Sightengine failed or was unreachable |
| 503 | `not_configured` | No Sightengine credentials set |

`GET /healthz` returns `{ "ok": true }`.

## Security and privacy properties

- **No URLs, ever (REQ-SEC-006).** The only body parser is for raw image bytes. JSON, form and text bodies are rejected, so there is nowhere to put a URL, and the one outbound address (Sightengine) is a constant.
- **Key in the environment only (REQ-SEC-004).** Read from `SIGHTENGINE_API_USER` and `SIGHTENGINE_API_SECRET`; never logged or returned.
- **Nothing stored (REQ-PRV-002).** Images are held in memory for the duration of the request. Logs contain no image data, URL, client address or token: only counts such as operations used.
- **Rate limits in memory (REQ-SEC-005, REQ-NF-005).** Client addresses exist only as keys in a map and are dropped when their one-minute window ends.
- **Generic errors (REQ-SEC-005).** Responses carry a short code, never a stack trace or an internal message.
- **Not callable from web pages.** No CORS headers are sent. The extension can call it because of its host permission.

## Run locally

```bash
npm run build --workspace backend
```

```bash
npm run start --workspace backend
```

Configuration is read from environment variables; see `.env.example`. With Node 22 or newer you can load a file with `node --env-file=.env dist/index.js` from the `backend/` folder.

## Deploy

See `deploy/README.md` for the Caddy and systemd set-up on the droplet (TASK-020).
