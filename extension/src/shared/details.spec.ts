import { CAVEAT, CHECKER_LINKS, describeResult, formatSignedDate } from './details';
import type { C2paSignal, ImageSignals } from './types';
import { decideVerdict } from './verdict';

const c2pa = (overrides: Partial<C2paSignal> = {}): C2paSignal => ({
  present: true,
  valid: true,
  trusted: true,
  signer: 'Adobe C2PA',
  tool: 'Adobe Photoshop 26.9.0',
  signedAt: '2025-08-13T16:30:55+00:00',
  aiSource: 'edited',
  cameraCapture: false,
  failureReason: null,
  ...overrides,
});

const view = (signals: Partial<ImageSignals>) =>
  describeResult(decideVerdict({ c2pa: null, iptc: null, detector: null, ...signals }));

const row = (v: ReturnType<typeof describeResult>, name: string) =>
  v.rows.find((r) => r.name.startsWith(name));

describe('describeResult', () => {
  it('REQ-F-008: shows verdict, confidence and every C2PA fact for a Definite image', () => {
    const v = view({ c2pa: c2pa() });
    expect(v.title).toBe('AI-edited');
    expect(v.confidence).toBe('Confirmed by Content Credentials');
    const credentials = row(v, 'Content Credentials');
    expect(credentials?.summary).toBe('Valid, from a trusted signer');
    expect(credentials?.facts).toEqual([
      { label: 'Signer', value: 'Adobe C2PA' },
      { label: 'Tool', value: 'Adobe Photoshop 26.9.0' },
      { label: 'Signed', value: '13 Aug 2025' },
      { label: 'Declares', value: 'AI-edited' },
    ]);
    expect(row(v, 'On-device detector')?.summary).toBe('Not needed');
    expect(row(v, 'Image metadata')?.summary).toBe('Not checked');
  });

  it('REQ-F-008: shows the detector score for a Likely image', () => {
    const v = view({
      c2pa: c2pa({ present: false, valid: false, trusted: false }),
      iptc: { aiSource: null },
      detector: { score: 0.934 },
    });
    expect(v.title).toBe('Likely AI');
    expect(v.confidence).toBe('Detector score 93%');
    expect(row(v, 'Content Credentials')?.summary).toBe('None found');
    expect(row(v, 'Image metadata')?.summary).toBe('No AI tag');
    expect(row(v, 'On-device detector')?.summary).toBe('93% likely AI-generated');
  });

  it('REQ-F-008: shows unsigned metadata as unsigned', () => {
    const v = view({ iptc: { aiSource: 'generated' } });
    expect(v.confidence).toBe('Based on image metadata');
    expect(row(v, 'Image metadata')?.summary).toBe(
      'Says AI-generated (unsigned, can be edited by anyone)',
    );
  });

  it('REQ-SEC-007: an untrusted signer is shown as "signed by an unrecognized signer"', () => {
    const v = view({ c2pa: c2pa({ trusted: false, signer: 'Totally Legit Camera Co' }) });
    expect(row(v, 'Content Credentials')?.summary).toBe('Signed by an unrecognized signer');
    expect(v.title).toBe('Likely AI');
    expect(v.confidence).not.toContain('Confirmed');
  });

  it('REQ-F-003: a failed validation shows its reason and no signer details', () => {
    const v = view({
      c2pa: c2pa({ valid: false, trusted: false, failureReason: 'assertion.dataHash.mismatch' }),
      detector: { score: 0.95 },
    });
    const credentials = row(v, 'Content Credentials');
    expect(credentials?.summary).toBe('Present but failed validation');
    expect(credentials?.facts).toEqual([{ label: 'Reason', value: 'assertion.dataHash.mismatch' }]);
  });

  it('REQ-F-005: camera-capture credentials plus a detector hit are shown with that context', () => {
    const v = view({
      c2pa: c2pa({ aiSource: null, cameraCapture: true }),
      detector: { score: 0.97 },
    });
    expect(row(v, 'Content Credentials')?.facts).toContainEqual({
      label: 'Declares',
      value: 'Camera capture',
    });
    expect(v.note).toContain('came from a camera');
  });

  it('REQ-UI-003: no text claims an image is real or authentic', () => {
    const views = [
      view({ c2pa: c2pa() }),
      view({ c2pa: c2pa({ aiSource: null, cameraCapture: true }), detector: { score: 0.97 } }),
      view({ iptc: { aiSource: 'edited' } }),
      view({ detector: { score: 0.99 } }),
    ];
    const text = JSON.stringify(views).toLowerCase();
    for (const word of ['authentic', 'human-made', 'not ai', 'genuine', 'verified real']) {
      expect(text).not.toContain(word);
    }
  });

  it('REQ-F-008: has the fixed caveat and the three official checker links', () => {
    expect(CAVEAT).toBe('A mark shows AI involvement. No mark does not mean an image is real.');
    expect(CHECKER_LINKS.map((l) => new URL(l.url).hostname)).toEqual([
      'synthid.com',
      'openai.com',
      'claude.com',
    ]);
    expect(CHECKER_LINKS.every((l) => l.url.startsWith('https://'))).toBe(true);
    expect(CHECKER_LINKS[2]?.url).toBe('https://claude.com/check-content');
  });

  it('REQ-F-008: dates are formatted or omitted, never shown raw', () => {
    expect(formatSignedDate('2025-08-13T16:30:55+00:00')).toBe('13 Aug 2025');
    expect(formatSignedDate('not a date')).toBeNull();
    expect(formatSignedDate(null)).toBeNull();
  });
});

describe('neutral marker details (ADR-011)', () => {
  it('REQ-UI-003: an unflagged image is described as not flagged, with the caveat', () => {
    const v = view({
      c2pa: c2pa({ present: false, valid: false, trusted: false }),
      iptc: { aiSource: null },
      detector: { score: 0.02 },
    });
    expect(v.title).toBe('Not flagged');
    expect(v.confidence).toBe('No AI signal found');
    expect(row(v, 'On-device detector')?.summary).toBe('2% likely AI-generated');
    expect(JSON.stringify(v).toLowerCase()).not.toMatch(/authentic|human-made|genuine|is real/);
  });
});
