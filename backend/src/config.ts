// Configuration comes from environment variables only (REQ-SEC-004). See .env.example.

export interface Config {
  host: string;
  port: number;
  /** Null when the service has no provider credentials; /v1/check then answers 503. */
  sightengine: { apiUser: string; apiSecret: string } | null;
  /** REQ-NF-005: daily cap on provider calls. */
  dailyCap: number;
  /** Address of the reverse proxy whose X-Forwarded-For header is trusted, or false. */
  trustProxy: string | false;
}

function intFrom(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiUser = env['SIGHTENGINE_API_USER']?.trim();
  const apiSecret = env['SIGHTENGINE_API_SECRET']?.trim();
  return {
    // Listen on loopback by default; Caddy terminates HTTPS in front (REQ-SEC-005).
    host: env['HOST']?.trim() || '127.0.0.1',
    port: intFrom(env['PORT'], 8787, 1, 65535),
    sightengine: apiUser && apiSecret ? { apiUser, apiSecret } : null,
    dailyCap: intFrom(env['DAILY_CAP'], 100, 0, 100_000),
    trustProxy: env['TRUST_PROXY']?.trim() || false,
  };
}
