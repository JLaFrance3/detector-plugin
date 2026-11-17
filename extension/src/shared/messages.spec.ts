import type { SenderLike } from './messages';
import {
  MAX_DATA_URL_LENGTH,
  MAX_URL_LENGTH,
  classifySender,
  isCheckableImageUrl,
  parseAnalyzeResponse,
  parseCheckImageResponse,
  parseImageResult,
  parseModelStatus,
  parseOffscreenRequest,
  parsePageStateResponse,
  parseSecondOpinionResponse,
  parseServiceWorkerRequest,
} from './messages';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const OTHER_ID = 'ponmlkjihgfedcbaponmlkjihgfedcba';
const base = `chrome-extension://${ID}`;

const contentScript: SenderLike = { id: ID, url: 'https://news.example/story', tab: { id: 7 } };
const popup: SenderLike = { id: ID, url: `${base}/popup/index.html` };
const popupInTab: SenderLike = { id: ID, url: `${base}/popup/index.html`, tab: { id: 9 } };
const offscreen: SenderLike = { id: ID, url: `${base}/offscreen/offscreen.html` };
const serviceWorker: SenderLike = { id: ID };
const serviceWorkerWithUrl: SenderLike = { id: ID, url: `${base}/service-worker.js` };
const otherExtension: SenderLike = { id: OTHER_ID, url: `chrome-extension://${OTHER_ID}/x.html` };

describe('classifySender', () => {
  it('REQ-SEC-003: recognises each part of this extension', () => {
    expect(classifySender(contentScript, ID)).toBe('content-script');
    expect(classifySender(popup, ID)).toBe('popup');
    expect(classifySender(popupInTab, ID)).toBe('popup');
    expect(classifySender(offscreen, ID)).toBe('offscreen');
    expect(classifySender(serviceWorker, ID)).toBe('service-worker');
    expect(classifySender(serviceWorkerWithUrl, ID)).toBe('service-worker');
  });

  it('REQ-SEC-003: anything without this extension ID is foreign', () => {
    expect(classifySender(otherExtension, ID)).toBe('foreign');
    expect(classifySender(undefined, ID)).toBe('foreign');
    expect(classifySender({}, ID)).toBe('foreign');
    expect(classifySender({ url: `${base}/popup/index.html` }, ID)).toBe('foreign');
    expect(classifySender({ id: '', url: 'https://x.example', tab: {} }, ID)).toBe('foreign');
  });

  it('REQ-SEC-003: odd senders with this ID are still not trusted', () => {
    // An unknown extension page, a non-http page and a tab-less web URL.
    expect(classifySender({ id: ID, url: `${base}/evil.html` }, ID)).toBe('foreign');
    expect(classifySender({ id: ID, url: 'file:///C:/x.html', tab: {} }, ID)).toBe('foreign');
    expect(classifySender({ id: ID, url: 'https://x.example' }, ID)).toBe('foreign');
    expect(classifySender({ id: ID, tab: {} }, ID)).toBe('foreign');
    // A look-alike prefix must not pass as the popup.
    expect(
      classifySender({ id: ID, url: `chrome-extension://${ID}.evil.example/popup/` }, ID),
    ).toBe('foreign');
  });
});

describe('isCheckableImageUrl', () => {
  it('REQ-F-001: accepts http(s) and data: image URLs', () => {
    expect(isCheckableImageUrl('https://cdn.example/a.jpg?x=1')).toBe(true);
    expect(isCheckableImageUrl('http://cdn.example/a.png')).toBe(true);
    expect(isCheckableImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isCheckableImageUrl('data:image/jpeg,abc')).toBe(true);
  });

  it('REQ-F-001: rejects SVG, other schemes and oversized URLs', () => {
    expect(isCheckableImageUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isCheckableImageUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isCheckableImageUrl('javascript:alert(1)')).toBe(false);
    expect(isCheckableImageUrl('file:///etc/passwd')).toBe(false);
    expect(isCheckableImageUrl('chrome-extension://abc/x.png')).toBe(false);
    expect(isCheckableImageUrl('blob:https://x.example/uuid')).toBe(false);
    expect(isCheckableImageUrl('/relative.png')).toBe(false);
    expect(isCheckableImageUrl('')).toBe(false);
    expect(isCheckableImageUrl(undefined)).toBe(false);
    expect(isCheckableImageUrl({ href: 'https://x.example/a.png' })).toBe(false);
    expect(isCheckableImageUrl(`https://x.example/${'a'.repeat(MAX_URL_LENGTH)}`)).toBe(false);
    expect(isCheckableImageUrl(`data:image/png;base64,${'A'.repeat(MAX_DATA_URL_LENGTH)}`)).toBe(
      false,
    );
  });
});

describe('parseServiceWorkerRequest', () => {
  const check = { type: 'image:check', url: 'https://cdn.example/a.jpg' };

  it('REQ-SEC-003: accepts a valid image check from a content script', () => {
    expect(parseServiceWorkerRequest(check, contentScript, ID)).toEqual(check);
  });

  it('REQ-SEC-003: strips unknown fields', () => {
    const parsed = parseServiceWorkerRequest(
      { ...check, bytes: [1, 2], extra: 'x' },
      contentScript,
      ID,
    );
    expect(parsed).toEqual(check);
  });

  it('REQ-SEC-003: drops messages from other extensions and unknown senders', () => {
    expect(parseServiceWorkerRequest(check, otherExtension, ID)).toBeNull();
    expect(parseServiceWorkerRequest(check, undefined, ID)).toBeNull();
    expect(parseServiceWorkerRequest(check, { url: 'https://x.example', tab: {} }, ID)).toBeNull();
  });

  it('REQ-SEC-003: drops invalid messages', () => {
    const invalid: unknown[] = [
      null,
      undefined,
      'image:check',
      42,
      [],
      {},
      { type: 'image:check' },
      { type: 'image:check', url: 7 },
      { type: 'image:check', url: 'javascript:alert(1)' },
      { type: 'image:check', url: 'file:///C:/secret.png' },
      { type: 'IMAGE:CHECK', url: check.url },
      { type: 'unknown' },
      { type: ['image:check'], url: check.url },
    ];
    for (const message of invalid) {
      expect(parseServiceWorkerRequest(message, contentScript, ID)).toBeNull();
    }
  });

  it('REQ-SEC-003: a content script cannot clear the cache or report model status', () => {
    expect(parseServiceWorkerRequest({ type: 'cache:clear' }, contentScript, ID)).toBeNull();
    expect(
      parseServiceWorkerRequest(
        { type: 'model:status', status: { state: 'ready', device: 'wasm' } },
        contentScript,
        ID,
      ),
    ).toBeNull();
  });

  it('REQ-SEC-003: popup and offscreen messages are accepted only from those pages', () => {
    expect(parseServiceWorkerRequest({ type: 'cache:clear' }, popup, ID)).toEqual({
      type: 'cache:clear',
    });
    expect(parseServiceWorkerRequest({ type: 'cache:clear' }, offscreen, ID)).toBeNull();
    const status = { type: 'model:status', status: { state: 'downloading', percent: 41.6 } };
    expect(parseServiceWorkerRequest(status, offscreen, ID)).toEqual({
      type: 'model:status',
      status: { state: 'downloading', percent: 42 },
    });
    expect(parseServiceWorkerRequest(status, popup, ID)).toBeNull();
    expect(parseServiceWorkerRequest({ type: 'page:state' }, contentScript, ID)).toEqual({
      type: 'page:state',
    });
    expect(parseServiceWorkerRequest({ type: 'page:state' }, popup, ID)).toBeNull();
  });
});

describe('parseOffscreenRequest', () => {
  const analyze = {
    target: 'offscreen',
    type: 'analyze',
    mimeType: 'image/jpeg',
    bytesBase64: '/9j/4AAQ',
  };

  it('REQ-SEC-003: accepts analyze requests from the service worker only', () => {
    expect(parseOffscreenRequest(analyze, serviceWorker, ID)).toEqual(analyze);
    expect(parseOffscreenRequest(analyze, serviceWorkerWithUrl, ID)).toEqual(analyze);
    expect(parseOffscreenRequest(analyze, contentScript, ID)).toBeNull();
    expect(parseOffscreenRequest(analyze, popup, ID)).toBeNull();
    expect(parseOffscreenRequest(analyze, otherExtension, ID)).toBeNull();
  });

  it('REQ-SEC-003: drops invalid analyze requests', () => {
    const invalid: unknown[] = [
      null,
      { ...analyze, target: 'popup' },
      { ...analyze, type: 'eval' },
      { ...analyze, mimeType: 'image/jpeg; charset=<script>' },
      { ...analyze, mimeType: 5 },
      { ...analyze, bytesBase64: '' },
      { ...analyze, bytesBase64: 'not base64!' },
      { ...analyze, bytesBase64: [255, 216] },
      { type: 'analyze', mimeType: 'image/png', bytesBase64: 'AAAA' },
    ];
    for (const message of invalid) {
      expect(parseOffscreenRequest(message, serviceWorker, ID)).toBeNull();
    }
  });
});

describe('response validation', () => {
  const signals = {
    c2pa: {
      present: true,
      valid: true,
      trusted: true,
      signer: 'Adobe C2PA',
      tool: 'Photoshop',
      signedAt: '2025-08-13T16:30:55+00:00',
      aiSource: 'edited',
      cameraCapture: false,
      failureReason: null,
    },
    iptc: null,
    detector: null,
  };
  const result = {
    verdict: 'definite',
    label: 'AI-edited',
    confidence: { kind: 'credentials' },
    signals,
    cameraCaptureContext: false,
  };

  it('REQ-SEC-003: accepts a well-formed result', () => {
    expect(parseCheckImageResponse({ ok: true, result })).toEqual({ ok: true, result });
  });

  it('REQ-SEC-003: content scripts never receive raw image bytes or extra fields', () => {
    const parsed = parseCheckImageResponse({
      ok: true,
      bytesBase64: 'AAAA',
      result: { ...result, bytes: [1, 2, 3], signals: { ...signals, raw: { thumbnail: 'AAAA' } } },
    });
    expect(JSON.stringify(parsed)).not.toContain('AAAA');
    expect(JSON.stringify(parsed)).not.toContain('bytes');
    expect(parsed).toEqual({ ok: true, result });
  });

  it('REQ-SEC-001: text fields are sanitized again on receipt', () => {
    const dirty = { ...signals, c2pa: { ...signals.c2pa, signer: `A${'x'.repeat(500)}` } };
    const parsed = parseImageResult({ ...result, signals: dirty });
    expect(parsed?.signals.c2pa?.signer).toHaveLength(120);
  });

  it('REQ-SEC-007: "trusted" is dropped when the manifest is not valid', () => {
    const odd = { ...signals, c2pa: { ...signals.c2pa, valid: false, trusted: true } };
    expect(parseImageResult({ ...result, signals: odd })?.signals.c2pa?.trusted).toBe(false);
  });

  it('REQ-SEC-003: malformed results are rejected', () => {
    const invalid: unknown[] = [
      null,
      { ...result, verdict: 'real' },
      { ...result, label: '<b>Totally real</b>' },
      { ...result, confidence: null },
      { ...result, confidence: { kind: 'score', percent: 250 } },
      { ...result, signals: null },
      { ...result, signals: { ...signals, detector: { score: 7 } } },
    ];
    for (const value of invalid) expect(parseImageResult(value)).toBeNull();
    expect(parseCheckImageResponse({ ok: true, result: { verdict: 'real' } })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(parseCheckImageResponse(undefined)).toEqual({ ok: false, reason: 'unavailable' });
    expect(parseCheckImageResponse({ ok: false, reason: 'inactive' })).toEqual({
      ok: false,
      reason: 'inactive',
    });
  });

  it('REQ-UI-003: a None result carries no label, so nothing can imply "real"', () => {
    const none = parseImageResult({
      verdict: 'none',
      label: 'Verified real photo',
      confidence: { kind: 'credentials' },
      signals: { c2pa: null, iptc: null, detector: { score: 0.02 } },
    });
    expect(none?.label).toBeNull();
    expect(none?.confidence).toBeNull();
  });

  it('REQ-SEC-003: analyze responses are validated', () => {
    expect(parseAnalyzeResponse({ ok: true, signals })).toEqual({ ok: true, signals });
    expect(parseAnalyzeResponse({ ok: true, signals: 'x' })).toEqual({ ok: false });
    expect(parseAnalyzeResponse({ ok: true, signals: { detector: { score: 'high' } } })).toEqual({
      ok: false,
    });
    expect(parseAnalyzeResponse(undefined)).toEqual({ ok: false });
  });

  it('REQ-F-010: model status and page state are validated', () => {
    expect(parseModelStatus({ state: 'ready', device: 'webgpu' })).toEqual({
      state: 'ready',
      device: 'webgpu',
    });
    expect(parseModelStatus({ state: 'ready', device: 'quantum' })).toBeNull();
    expect(parseModelStatus({ state: 'downloading', percent: 500 })).toBeNull();
    expect(parseModelStatus('ready')).toBeNull();
    expect(parsePageStateResponse({ active: true, cloudEnabled: 'yes' })).toEqual({
      active: true,
      cloudEnabled: false,
    });
    expect(parsePageStateResponse(null)).toEqual({ active: false, cloudEnabled: false });
  });
});

describe('second opinion messages', () => {
  const request = { type: 'image:second-opinion', url: 'https://cdn.example/a.jpg' };
  const reply = {
    score: 0.87,
    deepfake: 0.12,
    provider: 'sightengine',
    checkedAt: '2026-11-16T12:00:00.000Z',
  };

  it('REQ-F-009: a second opinion can only be requested from a page, for a valid image URL', () => {
    expect(parseServiceWorkerRequest(request, contentScript, ID)).toEqual(request);
    expect(parseServiceWorkerRequest(request, popup, ID)).toBeNull();
    expect(parseServiceWorkerRequest(request, offscreen, ID)).toBeNull();
    expect(parseServiceWorkerRequest(request, otherExtension, ID)).toBeNull();
    expect(
      parseServiceWorkerRequest({ ...request, url: 'file:///C:/private.png' }, contentScript, ID),
    ).toBeNull();
  });

  it('REQ-SEC-003: a valid backend result is reduced to its display fields', () => {
    expect(parseSecondOpinionResponse({ ...reply, debug: 'x', image: 'AAAA' })).toEqual({
      ok: true,
      ...reply,
    });
    expect(parseSecondOpinionResponse({ ok: true, ...reply })).toEqual({ ok: true, ...reply });
  });

  it('REQ-F-009: a missing or malformed deepfake score is dropped, not fatal', () => {
    for (const deepfake of [undefined, null, 1.5, -0.1, '0.9']) {
      expect(parseSecondOpinionResponse({ ...reply, deepfake })).toEqual({
        ok: true,
        ...reply,
        deepfake: null,
      });
    }
  });

  it('REQ-F-009: anything else is "unavailable"', () => {
    const unavailable = { ok: false, reason: 'unavailable' };
    const bad: unknown[] = [
      undefined,
      null,
      'ok',
      { error: 'quota_exhausted' },
      { ok: false, reason: 'unavailable' },
      { ...reply, score: 1.5 },
      { ...reply, score: '0.9' },
      { ...reply, provider: '<img src=x onerror=alert(1)>' },
      { ...reply, checkedAt: 'yesterday' },
      { ok: false, ...reply },
    ];
    for (const value of bad) expect(parseSecondOpinionResponse(value)).toEqual(unavailable);
  });
});
