---
id: TASK-020
title: Deploy backend to the droplet
status: todo
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
