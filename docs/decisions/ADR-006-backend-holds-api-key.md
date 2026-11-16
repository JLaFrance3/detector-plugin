# ADR-006: Optional Node backend holds the Sightengine key

- **Status:** Accepted, 2026-11-04
- **Requirements:** REQ-F-012, REQ-SEC-004, REQ-SEC-005, REQ-SEC-006, REQ-NF-005

## Context
Any secret shipped in an extension is public. The cloud second opinion needs a Sightengine key. A DigitalOcean droplet is available. Sightengine's free tier allows 2,000 operations a month, 500 a day and 1 request per second; the budget is $5 to 10.

## Decision
A small Node + Fastify service on the droplet, behind Caddy for HTTPS, exposes `POST /v1/check`. It accepts image bytes only (no URLs, to prevent SSRF), caps uploads at 5 MB, rate-limits, and holds the key in its environment.

## Consequences
- The extension works fully without the backend; only the second-opinion button depends on it.
- The backend is a public endpoint and must be hardened and rate-limited.
- Free-tier quota limits demo volume; the daily cap is set conservatively.
