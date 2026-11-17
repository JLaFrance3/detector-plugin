import type { FastifyInstance } from 'fastify';
import type { AppOptions } from './app.js';
import { buildApp } from './app.js';
import { MAX_UPLOAD_BYTES } from './image.js';
import type { Provider } from './sightengine.js';
import { ProviderError } from './sightengine.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
const TOKEN = 'install-token-0123456789abcdef';

function setup(overrides: Partial<AppOptions> = {}) {
  const clock = { now: Date.UTC(2026, 10, 16, 12, 0, 0) };
  const calls: { bytes: number; type: string }[] = [];
  const provider: Provider = {
    name: 'sightengine',
    check: (bytes, type) => {
      calls.push({ bytes: bytes.length, type });
      return Promise.resolve({ score: 0.87, deepfake: 0.12, operations: 5 });
    },
  };
  const app = buildApp({ provider, now: () => clock.now, minIntervalMs: 0, ...overrides });
  const post = (
    body: Buffer | string,
    headers: Record<string, string> = { 'content-type': 'image/jpeg' },
    target: FastifyInstance = app,
  ) => target.inject({ method: 'POST', url: '/v1/check', payload: body, headers });
  return { app, clock, calls, post };
}

describe('POST /v1/check', () => {
  it('REQ-F-012: returns { score, deepfake, provider, checkedAt } for an image', async () => {
    const { post, calls } = setup();
    const response = await post(JPEG);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      score: 0.87,
      deepfake: 0.12,
      provider: 'sightengine',
      checkedAt: '2026-11-16T12:00:00.000Z',
    });
    expect(calls).toEqual([{ bytes: JPEG.length, type: 'image/jpeg' }]);
  });

  it('REQ-F-012: accepts JPEG, PNG and WebP, identified by magic bytes', async () => {
    const { post, calls } = setup();
    // The declared type is deliberately wrong or generic: the bytes decide.
    expect((await post(PNG, { 'content-type': 'image/jpeg' })).statusCode).toBe(200);
    expect((await post(WEBP, { 'content-type': 'application/octet-stream' })).statusCode).toBe(200);
    expect((await post(JPEG, { 'content-type': 'image/webp' })).statusCode).toBe(200);
    expect(calls.map((c) => c.type)).toEqual(['image/png', 'image/webp', 'image/jpeg']);
  });

  it('REQ-SEC-005: rejects other content even when labelled as an image', async () => {
    const { post, calls } = setup();
    const disguised = [
      Buffer.from('GIF89a........'),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      Buffer.from('<!doctype html><script>alert(1)</script>'),
      Buffer.from('MZ\u0090\u0000 this is an executable'),
      Buffer.from([0xff, 0xd8]),
    ];
    for (const body of disguised) {
      const response = await post(body, { 'content-type': 'image/jpeg' });
      expect(response.statusCode).toBe(415);
      expect(response.json()).toEqual({ error: 'unsupported_media_type' });
    }
    expect(calls).toHaveLength(0);
  });

  it('REQ-SEC-005: rejects uploads over 5 MB', async () => {
    const { post, calls } = setup();
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_UPLOAD_BYTES)]);
    const response = await post(big);
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: 'image_too_large' });
    expect(calls).toHaveLength(0);
    const atLimit = Buffer.concat([JPEG, Buffer.alloc(MAX_UPLOAD_BYTES - JPEG.length)]);
    expect((await post(atLimit)).statusCode).toBe(200);
  });

  it('REQ-SEC-006: never accepts a URL: JSON, form and text bodies are rejected', async () => {
    const { post, calls } = setup();
    const attempts: [string, string][] = [
      ['application/json', JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' })],
      ['application/x-www-form-urlencoded', 'url=http%3A%2F%2Flocalhost%3A22%2F'],
      ['text/plain', 'https://internal.example/admin'],
      [
        'multipart/form-data; boundary=x',
        '--x\r\ncontent-disposition: form-data; name="url"\r\n\r\nhttp://10.0.0.1/\r\n--x--',
      ],
    ];
    for (const [type, body] of attempts) {
      const response = await post(body, { 'content-type': type });
      expect(response.statusCode).toBe(415);
    }
    // A URL sent as "image bytes" is just not an image.
    const asBytes = await post(Buffer.from('http://127.0.0.1:8787/healthz'));
    expect(asBytes.statusCode).toBe(415);
    expect(calls).toHaveLength(0);
  });

  it('REQ-SEC-006: query parameters cannot make the service fetch anything', async () => {
    const outbound: string[] = [];
    const provider: Provider = {
      name: 'sightengine',
      check: () => {
        outbound.push('provider');
        return Promise.resolve({ score: 0.1, deepfake: null, operations: 1 });
      },
    };
    const app = buildApp({ provider, minIntervalMs: 0 });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/check?url=http://169.254.169.254/&media=http://localhost/',
      payload: JPEG,
      headers: { 'content-type': 'image/jpeg' },
    });
    expect(response.statusCode).toBe(200);
    // The only outbound call is the fixed provider call with the uploaded bytes.
    expect(outbound).toEqual(['provider']);
  });

  it('REQ-SEC-005: at most 10 requests per minute per IP', async () => {
    const { post, clock } = setup();
    for (let i = 0; i < 10; i++) expect((await post(JPEG)).statusCode).toBe(200);
    const limited = await post(JPEG);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'rate_limited' });
    clock.now += 61_000;
    expect((await post(JPEG)).statusCode).toBe(200);
  });

  it('REQ-SEC-005: at most 10 requests per minute per install token, across IPs', async () => {
    const { app } = setup({ trustProxy: '127.0.0.1' });
    const from = (ip: string) =>
      app.inject({
        method: 'POST',
        url: '/v1/check',
        payload: JPEG,
        remoteAddress: '127.0.0.1',
        headers: { 'content-type': 'image/jpeg', 'x-forwarded-for': ip, 'x-install-token': TOKEN },
      });
    for (let i = 0; i < 10; i++) expect((await from(`203.0.113.${i}`)).statusCode).toBe(200);
    expect((await from('203.0.113.99')).statusCode).toBe(429);
  });

  it('REQ-NF-005: at most 1 provider request per second globally', async () => {
    const { post, clock, calls } = setup({ minIntervalMs: 1000 });
    expect((await post(JPEG)).statusCode).toBe(200);
    const tooSoon = await post(JPEG);
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json()).toEqual({ error: 'busy' });
    clock.now += 1000;
    expect((await post(JPEG)).statusCode).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('REQ-NF-005: daily cap of provider checks, reset the next day', async () => {
    const { post, clock, calls } = setup({ dailyCap: 3, perClientPerMinute: 1000 });
    for (let i = 0; i < 3; i++) expect((await post(JPEG)).statusCode).toBe(200);
    const over = await post(JPEG);
    expect(over.statusCode).toBe(429);
    expect(over.json()).toEqual({ error: 'quota_exhausted' });
    expect(calls).toHaveLength(3);
    clock.now += 24 * 60 * 60 * 1000;
    expect((await post(JPEG)).statusCode).toBe(200);
  });

  it('REQ-NF-005: the default daily cap is 100', async () => {
    const { post, clock } = setup({ perClientPerMinute: 1000 });
    let ok = 0;
    for (let i = 0; i < 105; i++) {
      clock.now += 1;
      if ((await post(JPEG)).statusCode === 200) ok++;
    }
    expect(ok).toBe(100);
  });

  it('REQ-SEC-005: provider failures return a generic error without details', async () => {
    const provider: Provider = {
      name: 'sightengine',
      check: () =>
        Promise.reject(
          new ProviderError('api_secret=TOPSECRET rejected at /srv/app/sightengine.ts:42'),
        ),
    };
    const { post } = setup({ provider });
    const response = await post(JPEG);
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: 'provider_error' });
    expect(response.body).not.toContain('TOPSECRET');
    expect(response.body).not.toContain('.ts');
  });

  it('REQ-SEC-005: unexpected errors return a generic message, never a stack trace', async () => {
    const provider = {
      name: 'sightengine',
      get check(): never {
        throw new TypeError('Cannot read properties of undefined (reading "secret")');
      },
    } as unknown as Provider;
    const { post } = setup({ provider });
    const response = await post(JPEG);
    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(response.body).not.toContain('Cannot read');
    expect(response.body).not.toContain(' at ');
  });

  it('REQ-SEC-004: without credentials the service answers 503 and calls nobody', async () => {
    const { post } = setup({ provider: null });
    const response = await post(JPEG);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'not_configured' });
  });

  it('REQ-SEC-005: empty bodies, other methods and unknown routes are rejected', async () => {
    const { app, post } = setup();
    expect((await post(Buffer.alloc(0))).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/check' })).statusCode).toBe(404);
    const unknown = await app.inject({ method: 'GET', url: '/admin' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: 'not_found' });
    expect((await app.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({ ok: true });
  });

  it('REQ-PRV-002: responses are not cacheable and not readable from web pages', async () => {
    const { post } = setup();
    const response = await post(JPEG, {
      'content-type': 'image/jpeg',
      origin: 'https://evil.example',
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('REQ-PRV-002: logs contain no image data, URL, client address or token', async () => {
    const lines: string[] = [];
    const provider: Provider = {
      name: 'sightengine',
      check: () => Promise.resolve({ score: 0.5, deepfake: 0.5, operations: 5 }),
    };
    const app = buildApp({
      provider,
      minIntervalMs: 0,
      logger: true,
      trustProxy: '127.0.0.1',
      // Capture everything the logger writes.
      logStream: { write: (line: string) => void lines.push(line) },
    });
    const marker = Buffer.concat([JPEG, Buffer.from('SECRET-IMAGE-CONTENT')]);
    await app.inject({
      method: 'POST',
      url: '/v1/check?source=https://private.example/photo.jpg',
      payload: marker,
      remoteAddress: '127.0.0.1',
      headers: {
        'content-type': 'image/jpeg',
        'x-forwarded-for': '198.51.100.7',
        'x-install-token': TOKEN,
      },
    });
    const log = lines.join('');
    expect(log).toContain('check completed');
    expect(log).toContain('"operations":5');
    for (const secret of ['SECRET-IMAGE-CONTENT', 'private.example', '198.51.100.7', TOKEN]) {
      expect(log).not.toContain(secret);
    }
  });
});
