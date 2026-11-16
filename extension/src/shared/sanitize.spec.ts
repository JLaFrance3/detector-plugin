import { classifyAiSource, isCameraCapture, sanitizeC2pa, strongestAiSource } from './sanitize';

const IPTC = 'http://cv.iptc.org/newscodes/digitalsourcetype/';

describe('digital source types', () => {
  it('REQ-F-004: recognises AI-generated and AI-edited source types', () => {
    expect(classifyAiSource(`${IPTC}trainedAlgorithmicMedia`)).toBe('generated');
    expect(classifyAiSource(`${IPTC}compositeWithTrainedAlgorithmicMedia`)).toBe('edited');
    expect(
      classifyAiSource('https://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'),
    ).toBe('generated');
    expect(classifyAiSource('trainedAlgorithmicMedia')).toBe('generated');
  });

  it('REQ-F-004: ignores other and malformed source types', () => {
    expect(classifyAiSource(`${IPTC}digitalCapture`)).toBeNull();
    expect(classifyAiSource(`${IPTC}algorithmicMedia`)).toBeNull();
    expect(classifyAiSource(`http://evil.example/${'trainedAlgorithmicMedia'}`)).toBeNull();
    expect(classifyAiSource(`${IPTC}trainedAlgorithmicMedia<script>`)).toBeNull();
    expect(classifyAiSource('constructor')).toBeNull();
    expect(classifyAiSource('__proto__')).toBeNull();
    expect(classifyAiSource(7)).toBeNull();
    expect(classifyAiSource('x'.repeat(10_000))).toBeNull();
  });

  it('REQ-F-005: recognises camera capture', () => {
    expect(isCameraCapture(`${IPTC}digitalCapture`)).toBe(true);
    expect(isCameraCapture(`${IPTC}trainedAlgorithmicMedia`)).toBe(false);
  });

  it('REQ-F-005: generated wins over edited', () => {
    expect(
      strongestAiSource([
        `${IPTC}compositeWithTrainedAlgorithmicMedia`,
        `${IPTC}trainedAlgorithmicMedia`,
      ]),
    ).toBe('generated');
    expect(strongestAiSource([`${IPTC}digitalCapture`, null, 3])).toBeNull();
  });
});

describe('sanitizeC2pa', () => {
  const raw = {
    present: true,
    validationState: 'Trusted',
    signerName: `Adobe${String.fromCodePoint(0x202e)} C2PA`,
    signerIssuer: 'Adobe Inc.',
    claimGenerator: '<b>Photoshop</b>\n26.9.0',
    signedAt: '2025-08-13T16:30:55+00:00',
    digitalSourceTypes: [`${IPTC}compositeWithTrainedAlgorithmicMedia`],
    failures: [],
    title: 'secret-filename.jpg',
    thumbnail: { data: 'AAAA' },
  };

  it('REQ-SEC-001: keeps only allowlisted fields and sanitizes them', () => {
    const signal = sanitizeC2pa(raw);
    expect(signal).toEqual({
      present: true,
      valid: true,
      trusted: true,
      signer: 'Adobe C2PA',
      tool: '<b>Photoshop</b> 26.9.0',
      signedAt: '2025-08-13T16:30:55+00:00',
      aiSource: 'edited',
      cameraCapture: false,
      failureReason: null,
    });
    // Non-allowlisted fields (title, thumbnail, issuer) are dropped.
    expect(Object.keys(signal).sort()).toEqual(
      [
        'aiSource',
        'cameraCapture',
        'failureReason',
        'present',
        'signedAt',
        'signer',
        'tool',
        'trusted',
        'valid',
      ].sort(),
    );
  });

  it('REQ-SEC-007: a valid signature from an untrusted signer is never trusted', () => {
    const signal = sanitizeC2pa({ ...raw, validationState: 'Valid' });
    expect(signal.valid).toBe(true);
    expect(signal.trusted).toBe(false);
  });

  it('REQ-SEC-007: unknown validation states are neither valid nor trusted', () => {
    for (const validationState of ['trusted', 'TRUSTED', true, 1, null, undefined, { a: 1 }]) {
      const signal = sanitizeC2pa({ ...raw, validationState });
      expect(signal.valid).toBe(false);
      expect(signal.trusted).toBe(false);
    }
  });

  it('REQ-F-003: an invalid manifest keeps its failure reason', () => {
    const signal = sanitizeC2pa({
      ...raw,
      validationState: 'Invalid',
      failures: [
        { code: 'signingCredential.untrusted', explanation: 'x' },
        { code: 'assertion.dataHash.mismatch', explanation: '<script>alert(1)</script>' },
      ],
    });
    expect(signal.valid).toBe(false);
    expect(signal.failureReason).toBe('assertion.dataHash.mismatch');
  });

  it('REQ-SEC-001: rejects failure codes and times that are not in the expected format', () => {
    const signal = sanitizeC2pa({
      ...raw,
      validationState: 'Invalid',
      signedAt: 'yesterday <img src=x>',
      failures: [{ code: '<script>alert(1)</script>' }, { code: 5 }, null, 'x'],
    });
    expect(signal.signedAt).toBeNull();
    expect(signal.failureReason).toBeNull();
  });

  it('REQ-F-003: reports no manifest for missing or malformed input', () => {
    for (const input of [null, undefined, {}, { present: 'yes' }, { present: false }]) {
      const signal = sanitizeC2pa(input as never);
      expect(signal.present).toBe(false);
      expect(signal.valid).toBe(false);
      expect(signal.trusted).toBe(false);
    }
  });
});
