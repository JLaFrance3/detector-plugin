---
id: TASK-018
title: Backend POST /v1/check
status: todo
milestone: M3
requirements: [REQ-F-012, REQ-SEC-004, REQ-SEC-005, REQ-SEC-006, REQ-NF-005, REQ-PRV-002]
depends_on: [TASK-001]
---

# TASK-018: Backend POST /v1/check

Fastify service that accepts image bytes, calls Sightengine's AI-generated image model, and returns `{ score, provider, checkedAt }`.

## Acceptance criteria

- [ ] Accepts JPEG/PNG/WebP up to 5 MB, verified by magic bytes
- [ ] Never fetches client-supplied URLs
- [ ] Rate limits: 10/min per IP and per install token, 1 req/s and 100/day global
- [ ] Key read from environment only; generic error messages
- [ ] No images or URLs persisted or logged
- [ ] Record the real `request.operations` per check (open item)
