---
id: TASK-020
title: Deploy backend to the droplet
status: blocked
milestone: M3
requirements: [REQ-SEC-005]
depends_on: [TASK-018]
---

# TASK-020: Deploy backend to the droplet

Run the backend on the DigitalOcean droplet behind Caddy with automatic HTTPS, as a systemd service.

## Acceptance criteria

- [ ] HTTPS only; HTTP redirects
- [ ] Restarts on failure and on reboot
- [ ] Secrets in an env file readable only by the service user

## Notes from implementation (2026-11-16)

- Deployment files are ready in `backend/deploy/`: `Caddyfile` (automatic HTTPS, HTTP redirect, only `/v1/check` and `/healthz` proxied, access logs off), `detector-backend.service` (dedicated user, restart on failure, enabled at boot, sandboxed) and `README.md` with the steps and a command for each acceptance criterion.
- **Blocked on:** access to the droplet, its DNS name and the Sightengine credentials. Nothing has been deployed.
