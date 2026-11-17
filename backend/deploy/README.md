# Deploying the backend to the droplet (TASK-020)

Target: a DigitalOcean droplet running Ubuntu, with a DNS name pointing at it. Caddy terminates HTTPS and proxies to the Node service on loopback. Replace `check.example.com` throughout.

## One-time set-up (as root)

1. Install Node 22 or newer and Caddy from their official apt repositories.
2. Create the service user and folders:

   ```bash
   useradd --system --home /opt/detector-backend --shell /usr/sbin/nologin detector
   ```

   ```bash
   mkdir -p /opt/detector-backend /etc/detector-backend
   ```

3. Create `/etc/detector-backend/env` from `backend/.env.example`, fill in the Sightengine credentials, then lock it down:

   ```bash
   chown root:detector /etc/detector-backend/env && chmod 0640 /etc/detector-backend/env
   ```

4. Copy `detector-backend.service` to `/etc/systemd/system/` and `Caddyfile` to `/etc/caddy/Caddyfile` (edit the hostname first).
5. Open ports 80 and 443 only (plus SSH): `ufw allow 80,443/tcp`.

## Each release

On your machine, from the repo root:

```bash
npm ci && npm run build --workspace backend
```

Copy `backend/dist/`, `backend/package.json` and the root `package-lock.json` to `/opt/detector-backend/` on the droplet, then on the droplet:

```bash
cd /opt/detector-backend && npm install --omit=dev --ignore-scripts
```

```bash
systemctl daemon-reload && systemctl enable --now detector-backend && systemctl reload caddy
```

## Checks (acceptance criteria)

| Check | Command | Expected |
| --- | --- | --- |
| HTTPS works | `curl -s https://check.example.com/healthz` | `{"ok":true}` |
| HTTP redirects | `curl -sI http://check.example.com/healthz` | `308` with an `https://` Location |
| Service not reachable directly | `curl -m 3 http://check.example.com:8787/healthz` | connection refused or timeout |
| Restarts on failure | `systemctl kill -s KILL detector-backend; sleep 5; systemctl is-active detector-backend` | `active` |
| Starts on boot | `systemctl is-enabled detector-backend` | `enabled` |
| Secrets locked down | `stat -c '%a %U:%G' /etc/detector-backend/env` | `640 root:detector` |
| URL bodies rejected | `curl -s -X POST -H 'content-type: application/json' -d '{"url":"http://169.254.169.254/"}' https://check.example.com/v1/check` | `{"error":"unsupported_media_type"}` |

After the first real check, read the operations count from the service log (`journalctl -u detector-backend | grep operations`) and record it in TASK-018 and in the requirements open items. Each check runs both the `genai` and `deepfake` models (ADR-009), so if 100 checks would use more than 500 operations a day, lower `DAILY_CAP` in `/etc/detector-backend/env` to match.
