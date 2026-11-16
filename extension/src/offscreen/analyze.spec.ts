import type { AnalyzeDeps } from './analyze';
import { analyzeImage } from './analyze';
import type { C2paRawResult } from './c2pa-reader';

vi.stubGlobal('__DEV__', false);

const IPTC = 'http://cv.iptc.org/newscodes/digitalsourcetype/';
const bytes = (text = 'pixels'): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

const raw = (overrides: Partial<C2paRawResult> = {}): C2paRawResult => ({
  present: true,
  validationState: 'Trusted',
  signerName: 'Adobe C2PA',
  signerIssuer: 'Adobe Inc.',
  signedAt: '2025-08-13T16:30:55+00:00',
  claimGenerator: 'Adobe Firefly',
  digitalSourceTypes: [`${IPTC}trainedAlgorithmicMedia`],
  failures: [],
  error: null,
  ms: 5,
  ...overrides,
});

const none = raw({ present: false, validationState: null, digitalSourceTypes: [] });

function deps(c2pa: C2paRawResult | Error, score: number | Error = 0.5) {
  const calls = { c2pa: 0, detector: 0 };
  const d: AnalyzeDeps = {
    readC2pa: () => {
      calls.c2pa++;
      return c2pa instanceof Error ? Promise.reject(c2pa) : Promise.resolve(c2pa);
    },
    scoreImage: () => {
      calls.detector++;
      return score instanceof Error ? Promise.reject(score) : Promise.resolve(score);
    },
  };
  return { d, calls };
}

describe('analyzeImage', () => {
  it('REQ-F-005: the detector is not called when rule 1 matches', async () => {
    const { d, calls } = deps(raw());
    const signals = await analyzeImage(bytes(), 'image/jpeg', d);
    expect(signals.c2pa?.trusted).toBe(true);
    expect(signals.c2pa?.aiSource).toBe('generated');
    expect(signals.detector).toBeNull();
    expect(calls.detector).toBe(0);
  });

  it('REQ-F-006: the detector runs when there is no manifest', async () => {
    const { d, calls } = deps(none, 0.97);
    const signals = await analyzeImage(bytes(), 'image/jpeg', d);
    expect(signals.c2pa?.present).toBe(false);
    expect(signals.iptc).toEqual({ aiSource: null });
    expect(signals.detector).toEqual({ score: 0.97 });
    expect(calls.detector).toBe(1);
  });

  it('REQ-F-005: valid camera-capture C2PA still runs the detector', async () => {
    const { d, calls } = deps(raw({ digitalSourceTypes: [`${IPTC}digitalCapture`] }), 0.2);
    const signals = await analyzeImage(bytes(), 'image/jpeg', d);
    expect(signals.c2pa?.cameraCapture).toBe(true);
    expect(signals.detector).toEqual({ score: 0.2 });
    expect(calls.detector).toBe(1);
  });

  it('REQ-F-004: unsigned XMP is read when there is no valid manifest, and skips the detector', async () => {
    const xmp = bytes(`<x Iptc4xmpExt:DigitalSourceType="${IPTC}trainedAlgorithmicMedia"/>`);
    const { d, calls } = deps(none);
    const signals = await analyzeImage(xmp, 'image/jpeg', d);
    expect(signals.iptc).toEqual({ aiSource: 'generated' });
    expect(signals.detector).toBeNull();
    expect(calls.detector).toBe(0);
  });

  it('REQ-F-004: unsigned XMP is also read when the manifest fails validation', async () => {
    const xmp = bytes(`<x Iptc4xmpExt:DigitalSourceType="${IPTC}trainedAlgorithmicMedia"/>`);
    const tampered = raw({
      validationState: 'Invalid',
      failures: [{ code: 'assertion.dataHash.mismatch', explanation: null }],
    });
    const signals = await analyzeImage(xmp, 'image/jpeg', deps(tampered).d);
    expect(signals.c2pa?.valid).toBe(false);
    expect(signals.c2pa?.failureReason).toBe('assertion.dataHash.mismatch');
    expect(signals.iptc).toEqual({ aiSource: 'generated' });
  });

  it('REQ-F-004: unsigned XMP is ignored when a valid manifest is present', async () => {
    const xmp = bytes(`<x Iptc4xmpExt:DigitalSourceType="${IPTC}trainedAlgorithmicMedia"/>`);
    const plain = raw({ digitalSourceTypes: [] });
    const signals = await analyzeImage(xmp, 'image/jpeg', deps(plain, 0.1).d);
    expect(signals.iptc).toBeNull();
    expect(signals.detector).toEqual({ score: 0.1 });
  });

  it('REQ-SEC-007: an untrusted signer claiming AI is not Definite and skips the detector', async () => {
    const { d, calls } = deps(raw({ validationState: 'Valid' }));
    const signals = await analyzeImage(bytes(), 'image/jpeg', d);
    expect(signals.c2pa?.trusted).toBe(false);
    expect(signals.c2pa?.aiSource).toBe('generated');
    expect(calls.detector).toBe(0);
  });

  it('REQ-SEC-001: C2PA strings are sanitized before they leave the offscreen document', async () => {
    const hostile = raw({
      signerName: `Evil${String.fromCodePoint(0x202e)}Corp${'x'.repeat(500)}`,
      claimGenerator: 'a\n\n\tb',
    });
    const signals = await analyzeImage(bytes(), 'image/jpeg', deps(hostile).d);
    expect(signals.c2pa?.signer).toHaveLength(120);
    expect(signals.c2pa?.signer?.startsWith('EvilCorp')).toBe(true);
    expect(signals.c2pa?.tool).toBe('a b');
  });

  it('REQ-F-003: a C2PA read error is treated as no manifest', async () => {
    const signals = await analyzeImage(bytes(), 'image/jpeg', deps(new Error('wasm trap'), 0.4).d);
    expect(signals.c2pa?.present).toBe(false);
    expect(signals.detector).toEqual({ score: 0.4 });
  });

  it('REQ-F-006: a detector failure leaves the image without a detector signal', async () => {
    const signals = await analyzeImage(bytes(), 'image/jpeg', deps(none, new Error('no gpu')).d);
    expect(signals.detector).toBeNull();
  });
});
