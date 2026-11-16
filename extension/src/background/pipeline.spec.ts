import type { AnalyzeRequest, AnalyzeResponse } from '../shared/messages';
import type { ImageSignals } from '../shared/types';
import type { PipelineDeps } from './pipeline';
import { ImagePipeline } from './pipeline';

const URL_A = 'https://cdn.example/a.jpg';
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const likely: ImageSignals = { c2pa: null, iptc: { aiSource: null }, detector: { score: 0.97 } };

function setup(overrides: Partial<PipelineDeps> = {}) {
  const cache = new Map<string, ImageSignals>();
  const calls = { fetch: 0, analyze: 0, requests: [] as AnalyzeRequest[] };
  const deps: PipelineDeps = {
    cacheGet: (url) => Promise.resolve(cache.get(url) ?? null),
    cacheSet: (url, signals) => {
      cache.set(url, signals);
      return Promise.resolve();
    },
    fetchImage: () => {
      calls.fetch++;
      return Promise.resolve({ bytes: JPEG, mimeType: 'image/jpeg' });
    },
    analyze: (request) => {
      calls.analyze++;
      calls.requests.push(request);
      return Promise.resolve<AnalyzeResponse>({ ok: true, signals: likely });
    },
    threshold: 0.9,
    ...overrides,
  };
  return { pipeline: new ImagePipeline(deps), cache, calls };
}

describe('ImagePipeline', () => {
  it('REQ-F-002: fetches the image and passes its bytes to the offscreen document', async () => {
    const { pipeline, calls } = setup();
    const result = await pipeline.check(URL_A);
    expect(result?.verdict).toBe('likely');
    expect(calls.requests[0]).toEqual({
      target: 'offscreen',
      type: 'analyze',
      mimeType: 'image/jpeg',
      bytesBase64: '/9j/4A==',
    });
  });

  it('REQ-F-002: a failed fetch gives no verdict and is not cached', async () => {
    const { pipeline, cache, calls } = setup({ fetchImage: () => Promise.resolve(null) });
    expect(await pipeline.check(URL_A)).toBeNull();
    expect(calls.analyze).toBe(0);
    expect(cache.size).toBe(0);
  });

  it('REQ-F-011: a cached image is not fetched or scored again', async () => {
    const { pipeline, calls } = setup();
    await pipeline.check(URL_A);
    const again = await pipeline.check(URL_A);
    expect(again?.verdict).toBe('likely');
    expect(calls.fetch).toBe(1);
    expect(calls.analyze).toBe(1);
  });

  it('REQ-F-011: simultaneous checks of one URL share a single fetch', async () => {
    const { pipeline, calls } = setup();
    const results = await Promise.all([
      pipeline.check(URL_A),
      pipeline.check(URL_A),
      pipeline.check(URL_A),
    ]);
    expect(results.every((r) => r?.verdict === 'likely')).toBe(true);
    expect(calls.fetch).toBe(1);
  });

  it('REQ-F-005: the verdict of a cached image follows the current threshold', async () => {
    const strict = setup({ threshold: 0.99 });
    strict.cache.set(URL_A, likely);
    expect((await strict.pipeline.check(URL_A))?.verdict).toBe('none');
  });

  it('REQ-F-006: an incomplete check (detector unavailable) is not cached', async () => {
    const noDetector: ImageSignals = { c2pa: null, iptc: { aiSource: null }, detector: null };
    const { pipeline, cache } = setup({
      analyze: () => Promise.resolve({ ok: true, signals: noDetector }),
    });
    expect((await pipeline.check(URL_A))?.verdict).toBe('none');
    expect(cache.size).toBe(0);
  });

  it('REQ-F-002: an offscreen failure gives no verdict', async () => {
    const failed = setup({ analyze: () => Promise.resolve({ ok: false }) });
    expect(await failed.pipeline.check(URL_A)).toBeNull();
    const thrown = setup({ analyze: () => Promise.reject(new Error('document closed')) });
    expect(await thrown.pipeline.check(URL_A)).toBeNull();
  });

  it('REQ-F-011: a storage failure does not break the check', async () => {
    const { pipeline } = setup({
      cacheGet: () => Promise.reject(new Error('quota')),
      cacheSet: () => Promise.reject(new Error('quota')),
    });
    expect((await pipeline.check(URL_A))?.verdict).toBe('likely');
  });
});
