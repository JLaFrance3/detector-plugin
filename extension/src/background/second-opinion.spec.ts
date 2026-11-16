import {
  MAX_UPLOAD_SIDE,
  fitWithin,
  isAllowedBackendUrl,
  newInstallToken,
  requestSecondOpinion,
} from './second-opinion';

const image = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
const reply = { score: 0.87, provider: 'sightengine', checkedAt: '2026-11-16T12:00:00.000Z' };
const deps = { backendUrl: 'https://check.example.com', installToken: 'a'.repeat(32) };
const unavailable = { ok: false, reason: 'unavailable' };

describe('fitWithin', () => {
  it('REQ-PRV-002: downscales to at most 1024 px on the long side', () => {
    expect(MAX_UPLOAD_SIDE).toBe(1024);
    expect(fitWithin(4000, 3000)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin(10000, 100)).toEqual({ width: 1024, height: 10 });
    expect(fitWithin(5000, 1)).toEqual({ width: 1024, height: 1 });
  });

  it('REQ-PRV-002: never upscales a smaller image', () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(1024, 1024)).toEqual({ width: 1024, height: 1024 });
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('requestSecondOpinion', () => {
  it('REQ-F-009: posts the image bytes to the backend and returns its score', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const fetchFn = ((u: string, i?: RequestInit) => {
      url = u;
      init = i;
      return Promise.resolve(Response.json(reply));
    }) as unknown as typeof fetch;
    const result = await requestSecondOpinion(image, { ...deps, fetchFn });
    expect(result).toEqual({ ok: true, ...reply });
    expect(url).toBe('https://check.example.com/v1/check');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(image);
    expect(init?.credentials).toBe('omit');
    expect(init?.referrerPolicy).toBe('no-referrer');
    expect(init?.headers).toEqual({
      'content-type': 'image/jpeg',
      'x-install-token': 'a'.repeat(32),
    });
  });

  it('REQ-PRV-001: only image bytes are sent, never the image URL or page URL', async () => {
    let init: RequestInit | undefined;
    const fetchFn = ((_u: string, i?: RequestInit) => {
      init = i;
      return Promise.resolve(Response.json(reply));
    }) as unknown as typeof fetch;
    await requestSecondOpinion(image, { ...deps, fetchFn });
    expect(Object.keys(init?.headers ?? {}).sort()).toEqual(['content-type', 'x-install-token']);
    expect(init?.body).toBeInstanceOf(Blob);
  });

  it('REQ-NF-002: with no backend configured it is unavailable and nothing is sent', async () => {
    let called = false;
    const fetchFn = (() => {
      called = true;
      return Promise.resolve(Response.json(reply));
    }) as unknown as typeof fetch;
    expect(await requestSecondOpinion(image, { ...deps, backendUrl: '', fetchFn })).toEqual(
      unavailable,
    );
    expect(called).toBe(false);
  });

  it('REQ-F-009: an unreachable backend is "unavailable"', async () => {
    const fetchFn = (() =>
      Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    expect(await requestSecondOpinion(image, { ...deps, fetchFn })).toEqual(unavailable);
  });

  it('REQ-F-009: over quota, rate limited and server errors are "unavailable"', async () => {
    for (const [status, error] of [
      [429, 'quota_exhausted'],
      [429, 'rate_limited'],
      [502, 'provider_error'],
      [503, 'not_configured'],
      [500, 'internal_error'],
    ] as const) {
      const fetchFn = (() =>
        Promise.resolve(Response.json({ error }, { status }))) as unknown as typeof fetch;
      expect(await requestSecondOpinion(image, { ...deps, fetchFn })).toEqual(unavailable);
    }
  });

  it('REQ-SEC-003: a malformed or hostile backend reply is "unavailable"', async () => {
    const bodies = [
      '<html>',
      JSON.stringify({ score: 9 }),
      JSON.stringify({ ...reply, provider: '<b>x</b>' }),
    ];
    for (const body of bodies) {
      const fetchFn = (() => Promise.resolve(new Response(body))) as unknown as typeof fetch;
      expect(await requestSecondOpinion(image, { ...deps, fetchFn })).toEqual(unavailable);
    }
  });

  it('REQ-SEC-005: the backend must be HTTPS (plain HTTP only on this machine)', () => {
    expect(isAllowedBackendUrl('https://check.example.com')).toBe(true);
    expect(isAllowedBackendUrl('http://127.0.0.1:8787')).toBe(true);
    expect(isAllowedBackendUrl('http://localhost:8787')).toBe(true);
    expect(isAllowedBackendUrl('http://check.example.com')).toBe(false);
    expect(isAllowedBackendUrl('ftp://check.example.com')).toBe(false);
    expect(isAllowedBackendUrl('not a url')).toBe(false);
  });

  it('REQ-SEC-005: a plain-HTTP remote backend is never contacted', async () => {
    let called = false;
    const fetchFn = (() => {
      called = true;
      return Promise.resolve(Response.json(reply));
    }) as unknown as typeof fetch;
    const result = await requestSecondOpinion(image, {
      ...deps,
      backendUrl: 'http://check.example.com',
      fetchFn,
    });
    expect(result).toEqual(unavailable);
    expect(called).toBe(false);
  });

  it('REQ-SEC-005: install tokens are random and match what the backend accepts', () => {
    const a = newInstallToken();
    const b = newInstallToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});
