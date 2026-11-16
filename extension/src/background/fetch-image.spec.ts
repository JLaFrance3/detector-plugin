import { fetchImageBytes, sniffImageType } from './fetch-image';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const text = (s: string) => new TextEncoder().encode(s);

const respond = (body: Uint8Array | string, init: ResponseInit = {}) =>
  (() => Promise.resolve(new Response(body as BodyInit, init))) as unknown as typeof fetch;

describe('sniffImageType', () => {
  it('REQ-F-002: recognises raster formats by magic bytes', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(text('RIFF\u0010\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(text('GIF89a....'))).toBe('image/gif');
    expect(sniffImageType(Uint8Array.from([0, 0, 0, 0x1c, ...text('ftypavif')]))).toBe(
      'image/avif',
    );
  });

  it('REQ-F-001: SVG, HTML and unknown data are not images to check', () => {
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageType(text('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('fetchImageBytes', () => {
  it('REQ-F-002: returns the bytes and detected type of an image', async () => {
    const image = await fetchImageBytes('https://cdn.example/a', {
      // A wrong Content-Type does not matter; the bytes decide.
      fetchFn: respond(JPEG, { headers: { 'content-type': 'application/octet-stream' } }),
    });
    expect(image?.mimeType).toBe('image/jpeg');
    expect(Array.from(image?.bytes ?? [])).toEqual(Array.from(JPEG));
  });

  it('REQ-F-002: fetches cross-origin without cookies or referrer', async () => {
    let seen: RequestInit | undefined;
    const fetchFn = ((_url: string, init?: RequestInit) => {
      seen = init;
      return Promise.resolve(new Response(PNG));
    }) as unknown as typeof fetch;
    await fetchImageBytes('https://other-origin.example/a.png', { fetchFn });
    expect(seen?.credentials).toBe('omit');
    expect(seen?.referrerPolicy).toBe('no-referrer');
    expect(seen?.method).toBe('GET');
  });

  it('REQ-F-002: HTTP errors produce no result', async () => {
    for (const status of [403, 404, 500, 503]) {
      const reasons: string[] = [];
      const image = await fetchImageBytes('https://cdn.example/a.jpg', {
        fetchFn: respond(JPEG, { status }),
        onError: (r) => reasons.push(r),
      });
      expect(image).toBeNull();
      expect(reasons).toEqual([`HTTP ${status}`]);
    }
  });

  it('REQ-F-002: network errors produce no result', async () => {
    const fetchFn = (() =>
      Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    expect(await fetchImageBytes('https://down.example/a.jpg', { fetchFn })).toBeNull();
  });

  it('REQ-F-002: a response slower than the timeout produces no result', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as unknown as typeof fetch;
    const reasons: string[] = [];
    const started = Date.now();
    const image = await fetchImageBytes('https://slow.example/a.jpg', {
      fetchFn,
      timeoutMs: 30,
      onError: (r) => reasons.push(r),
    });
    expect(image).toBeNull();
    expect(reasons).toEqual(['timed out']);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('REQ-F-002: the timeout also covers a body that stalls', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(JPEG);
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('aborted', 'AbortError')),
          );
        },
      });
      return Promise.resolve(new Response(body));
    }) as unknown as typeof fetch;
    expect(
      await fetchImageBytes('https://slow.example/a.jpg', { fetchFn, timeoutMs: 30 }),
    ).toBeNull();
  });

  it('REQ-F-001: responses over the size limit are skipped', async () => {
    const big = new Uint8Array(2048);
    big.set(JPEG);
    // Declared size over the limit.
    expect(
      await fetchImageBytes('https://cdn.example/a.jpg', {
        fetchFn: respond(big, { headers: { 'content-length': '2048' } }),
        maxBytes: 1024,
      }),
    ).toBeNull();
    // No declared size: stopped while reading.
    expect(
      await fetchImageBytes('https://cdn.example/a.jpg', { fetchFn: respond(big), maxBytes: 1024 }),
    ).toBeNull();
    expect(
      (
        await fetchImageBytes('https://cdn.example/a.jpg', {
          fetchFn: respond(big),
          maxBytes: 4096,
        })
      )?.bytes.length,
    ).toBe(2048);
  });

  it('REQ-NF-001: an image declaring more than 50 megapixels is skipped, not decoded', async () => {
    const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const bomb = Uint8Array.from([
      ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      ...be(13),
      ...[0x49, 0x48, 0x44, 0x52],
      ...be(60000),
      ...be(60000),
      ...[8, 2, 0, 0, 0],
    ]);
    const reasons: string[] = [];
    const image = await fetchImageBytes('https://cdn.example/bomb.png', {
      fetchFn: respond(bomb),
      onError: (r) => reasons.push(r),
    });
    expect(image).toBeNull();
    expect(reasons).toEqual(['too many pixels']);
  });

  it('REQ-F-001: SVG and non-image responses are skipped even if labelled as images', async () => {
    const svg = respond('<svg xmlns="http://www.w3.org/2000/svg"/>', {
      headers: { 'content-type': 'image/jpeg' },
    });
    expect(await fetchImageBytes('https://cdn.example/logo', { fetchFn: svg })).toBeNull();
  });
});
