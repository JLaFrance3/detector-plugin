import { loadConfig } from './config.js';
import { detectImageType } from './image.js';
import { ProviderError, createSightengine, normalizeScore } from './sightengine.js';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const credentials = { apiUser: '123456789', apiSecret: 'test-secret-value' };

const success = (aiGenerated: unknown, operations: unknown = 5, deepfake: unknown = 0.02) => ({
  status: 'success',
  request: { id: 'req_abc', timestamp: 1763294400.1, operations },
  type: { ai_generated: aiGenerated, deepfake },
  media: { id: 'med_abc', uri: 'image.jpg' },
});

describe('normalizeScore', () => {
  it('REQ-F-012: normalizes the provider result to a 0 to 1 score', () => {
    expect(normalizeScore(success(0.99))).toEqual({ score: 0.99, deepfake: 0.02, operations: 5 });
    expect(normalizeScore(success(0))).toEqual({ score: 0, deepfake: 0.02, operations: 5 });
    expect(normalizeScore(success(1.7)).score).toBe(1);
    expect(normalizeScore(success(-0.2)).score).toBe(0);
  });

  it('REQ-F-012: reads the deepfake score as optional, clamped to 0 to 1', () => {
    expect(normalizeScore(success(0.1, 5, 0.93)).deepfake).toBe(0.93);
    expect(normalizeScore(success(0.1, 5, 1.4)).deepfake).toBe(1);
    expect(normalizeScore(success(0.1, 5, -1)).deepfake).toBe(0);
    // A missing or malformed deepfake score never fails the check: genai still counts.
    const noDeepfake = { ...success(0.4), type: { ai_generated: 0.4 } };
    expect(normalizeScore(noDeepfake).deepfake).toBeNull();
    for (const malformed of [null, '0.9', Number.NaN]) {
      expect(normalizeScore(success(0.4, 5, malformed))).toEqual({
        score: 0.4,
        deepfake: null,
        operations: 5,
      });
    }
  });

  it('REQ-NF-005: reports the operations used by a check when the provider says', () => {
    expect(normalizeScore(success(0.5, 5)).operations).toBe(5);
    expect(normalizeScore(success(0.5, 'five')).operations).toBeNull();
  });

  it('REQ-F-012: rejects failure and malformed responses', () => {
    const bad: unknown[] = [
      null,
      'ok',
      {},
      { status: 'failure', error: { type: 'usage_limit', message: 'limit reached' } },
      { status: 'success' },
      success('0.9'),
      success(Number.NaN),
    ];
    for (const body of bad) expect(() => normalizeScore(body)).toThrow(ProviderError);
  });
});

describe('createSightengine', () => {
  it('REQ-F-012: sends the image bytes to the genai and deepfake models at the fixed endpoint', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchFn = ((url: string, init?: RequestInit) => {
      seenUrl = url;
      seenInit = init;
      return Promise.resolve(Response.json(success(0.91)));
    }) as unknown as typeof fetch;

    const result = await createSightengine(credentials, fetchFn).check(JPEG, 'image/jpeg');
    expect(result).toEqual({ score: 0.91, deepfake: 0.02, operations: 5 });
    expect(seenUrl).toBe('https://api.sightengine.com/1.0/check.json');
    expect(seenInit?.method).toBe('POST');
    const form = seenInit?.body as FormData;
    expect(form.get('models')).toBe('genai,deepfake');
    expect(form.get('api_user')).toBe('123456789');
    expect(form.get('api_secret')).toBe('test-secret-value');
    const media = form.get('media') as File;
    expect(media.type).toBe('image/jpeg');
    expect(Array.from(new Uint8Array(await media.arrayBuffer()))).toEqual(Array.from(JPEG));
    // REQ-SEC-006: no field that would make the provider fetch a URL for us.
    expect(form.has('url')).toBe(false);
  });

  it('REQ-SEC-005: errors carry no credentials or response details', async () => {
    const failing = [
      (() =>
        Promise.reject(
          new Error('connect ECONNREFUSED api_secret=test-secret-value'),
        )) as unknown as typeof fetch,
      (() =>
        Promise.resolve(
          new Response('quota exceeded for 123456789', { status: 429 }),
        )) as unknown as typeof fetch,
      (() => Promise.resolve(new Response('<html>not json</html>'))) as unknown as typeof fetch,
    ];
    for (const fetchFn of failing) {
      const error = await createSightengine(credentials, fetchFn)
        .check(JPEG, 'image/jpeg')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ProviderError);
      expect(String(error)).not.toContain('test-secret-value');
      expect(String(error)).not.toContain('123456789');
    }
  });
});

describe('configuration', () => {
  it('REQ-SEC-004: the key is read from the environment only', () => {
    const config = loadConfig({
      SIGHTENGINE_API_USER: ' 123456789 ',
      SIGHTENGINE_API_SECRET: 'abc',
      PORT: '9000',
      DAILY_CAP: '50',
    });
    expect(config.sightengine).toEqual({ apiUser: '123456789', apiSecret: 'abc' });
    expect(config.port).toBe(9000);
    expect(config.dailyCap).toBe(50);
  });

  it('REQ-SEC-004: no credentials means no provider, and safe defaults', () => {
    const config = loadConfig({});
    expect(config.sightengine).toBeNull();
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8787);
    expect(config.dailyCap).toBe(100);
    expect(config.trustProxy).toBe(false);
    expect(loadConfig({ SIGHTENGINE_API_USER: 'only-user' }).sightengine).toBeNull();
    expect(loadConfig({ PORT: 'abc', DAILY_CAP: '-5' }).port).toBe(8787);
  });
});

describe('detectImageType', () => {
  it('REQ-SEC-005: content type is decided by magic bytes', () => {
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(detectImageType(new TextEncoder().encode('RIFFxxxxWEBPVP8L'))).toBe('image/webp');
    expect(detectImageType(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(detectImageType(new TextEncoder().encode('RIFFxxxxWAVEfmt '))).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
  });
});
