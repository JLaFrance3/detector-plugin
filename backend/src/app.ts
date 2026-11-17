// The second-opinion service (REQ-F-012): POST /v1/check takes image bytes and returns
// { score, deepfake, provider, checkedAt }. It never accepts or fetches a URL (REQ-SEC-006), keeps
// nothing on disk, and logs neither images, URLs nor client addresses (REQ-PRV-002).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify, { LogController } from 'fastify';
import { MAX_UPLOAD_BYTES, detectImageType } from './image.js';
import { GlobalQuota, KeyedRateLimiter } from './rate-limit.js';
import type { Provider } from './sightengine.js';

export interface AppOptions {
  /** Null when no provider is configured. */
  provider: Provider | null;
  dailyCap?: number;
  /** REQ-SEC-005: requests per minute per IP and per install token. */
  perClientPerMinute?: number;
  /** REQ-NF-005: minimum gap between provider calls. */
  minIntervalMs?: number;
  trustProxy?: string | false;
  now?: () => number;
  logger?: boolean;
  /** Where log lines go; defaults to stdout. */
  logStream?: { write(line: string): void };
}

export interface CheckResponse {
  score: number;
  /** Face-manipulation score, or null when the provider gave none (ADR-009). */
  deepfake: number | null;
  provider: string;
  checkedAt: string;
}

/** Install tokens are random IDs made by the extension; anything else is ignored. */
const INSTALL_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'];

export function buildApp(options: AppOptions): FastifyInstance {
  const now = options.now ?? Date.now;
  const perMinute = options.perClientPerMinute ?? 10;
  const byIp = new KeyedRateLimiter(perMinute, 60_000, now);
  const byToken = new KeyedRateLimiter(perMinute, 60_000, now);
  const quota = new GlobalQuota(options.dailyCap ?? 100, options.minIntervalMs ?? 1000, now);

  const app = Fastify({
    bodyLimit: MAX_UPLOAD_BYTES,
    trustProxy: options.trustProxy ?? false,
    // Requests are logged without URL query, headers, body or client address.
    logController: new LogController({ disableRequestLogging: true }),
    logger: options.logger
      ? {
          level: 'info',
          ...(options.logStream ? { stream: options.logStream } : {}),
          serializers: {
            req: (request: FastifyRequest) => ({ method: request.method }),
            // Error type only: messages and stacks can contain request details.
            err: (error: Error) => ({ type: error.name, message: '', stack: '' }),
          },
        }
      : false,
  });

  // Uploads arrive as the raw request body. Anything else (JSON, forms, text) has no parser
  // and is rejected with 415, so there is no field in which a client could pass a URL.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(UPLOAD_TYPES, { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    // No Access-Control-Allow-Origin: web pages cannot call this service from a browser.
  });

  // REQ-SEC-005: generic errors, never a stack trace or internal message.
  const fail = (reply: FastifyReply, status: number, error: string) =>
    reply.code(status).send({ error });

  app.setErrorHandler((error: { statusCode?: number }, _request, reply) => {
    const status = error.statusCode ?? 500;
    if (status === 413) return fail(reply, 413, 'image_too_large');
    if (status === 415) return fail(reply, 415, 'unsupported_media_type');
    if (status >= 400 && status < 500) return fail(reply, 400, 'bad_request');
    app.log.error({ err: error }, 'request failed');
    return fail(reply, 500, 'internal_error');
  });
  app.setNotFoundHandler((_request, reply) => fail(reply, 404, 'not_found'));

  app.get('/healthz', async () => ({ ok: true }));

  app.post('/v1/check', async (request, reply) => {
    // Per-client limits first, so abuse is cut off before any work is done.
    if (!byIp.take(request.ip)) return fail(reply, 429, 'rate_limited');
    const token = request.headers['x-install-token'];
    if (typeof token === 'string' && INSTALL_TOKEN.test(token) && !byToken.take(token)) {
      return fail(reply, 429, 'rate_limited');
    }

    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return fail(reply, 400, 'bad_request');
    if (body.length > MAX_UPLOAD_BYTES) return fail(reply, 413, 'image_too_large');
    const bytes = new Uint8Array(body);
    const type = detectImageType(bytes);
    if (!type) return fail(reply, 415, 'unsupported_media_type');

    if (!options.provider) return fail(reply, 503, 'not_configured');

    const slot = quota.take();
    if (slot === 'exhausted') return fail(reply, 429, 'quota_exhausted');
    if (slot === 'busy') return fail(reply, 429, 'busy');

    try {
      const result = await options.provider.check(bytes, type);
      // Counts only: no image, URL or client detail is logged (REQ-PRV-002).
      app.log.info(
        { operations: result.operations, remainingToday: quota.remainingToday },
        'check completed',
      );
      const response: CheckResponse = {
        score: result.score,
        deepfake: result.deepfake,
        provider: options.provider.name,
        checkedAt: new Date(now()).toISOString(),
      };
      return response;
    } catch {
      app.log.warn('provider check failed');
      return fail(reply, 502, 'provider_error');
    }
  });

  return app;
}
