import type { C2paSignal, ImageSignals } from './types';
import { DEFAULT_THRESHOLD } from './types';
import { badgeTooltip, decideVerdict, isDefinite, needsDetector, scorePercent } from './verdict';

const c2pa = (overrides: Partial<C2paSignal> = {}): C2paSignal => ({
  present: true,
  valid: true,
  trusted: true,
  signer: 'Adobe C2PA',
  tool: 'Adobe Firefly',
  signedAt: '2026-01-01T00:00:00+00:00',
  aiSource: 'generated',
  cameraCapture: false,
  failureReason: null,
  ...overrides,
});

const signals = (overrides: Partial<ImageSignals> = {}): ImageSignals => ({
  c2pa: null,
  iptc: null,
  detector: null,
  ...overrides,
});

describe('decideVerdict', () => {
  it('REQ-F-005: row 1, valid trusted C2PA declaring AI generation is Definite "AI-generated"', () => {
    const result = decideVerdict(signals({ c2pa: c2pa() }));
    expect(result.verdict).toBe('definite');
    expect(result.label).toBe('AI-generated');
    expect(result.confidence).toEqual({ kind: 'credentials' });
  });

  it('REQ-F-005: row 1, valid trusted C2PA declaring AI editing is Definite "AI-edited"', () => {
    const result = decideVerdict(signals({ c2pa: c2pa({ aiSource: 'edited' }) }));
    expect(result.verdict).toBe('definite');
    expect(result.label).toBe('AI-edited');
  });

  it('REQ-F-005: row 1 wins over a low detector score', () => {
    const result = decideVerdict(signals({ c2pa: c2pa(), detector: { score: 0.01 } }));
    expect(result.verdict).toBe('definite');
  });

  it('REQ-F-005: row 2, unsigned IPTC/XMP AI source type is Likely with "metadata" confidence', () => {
    const result = decideVerdict(signals({ iptc: { aiSource: 'generated' } }));
    expect(result.verdict).toBe('likely');
    expect(result.label).toBe('Likely AI');
    expect(result.confidence).toEqual({ kind: 'metadata' });
  });

  it('REQ-F-005: row 2 never produces Definite, even with a perfect detector score', () => {
    const result = decideVerdict(
      signals({ iptc: { aiSource: 'generated' }, detector: { score: 1 } }),
    );
    expect(result.verdict).toBe('likely');
    expect(result.confidence).toEqual({ kind: 'metadata' });
  });

  it('REQ-F-005: row 3, detector score at or above the threshold is Likely with a percentage', () => {
    const at = decideVerdict(signals({ detector: { score: DEFAULT_THRESHOLD } }));
    expect(at.verdict).toBe('likely');
    expect(at.confidence).toEqual({ kind: 'score', percent: 50 });
    // The calibrated default (TASK-022).
    expect(DEFAULT_THRESHOLD).toBe(0.5);

    const above = decideVerdict(signals({ detector: { score: 0.934 } }));
    expect(above.confidence).toEqual({ kind: 'score', percent: 93 });
  });

  it('REQ-F-005: row 3 uses the threshold it is given', () => {
    expect(decideVerdict(signals({ detector: { score: 0.6 } }), 0.5).verdict).toBe('likely');
    expect(decideVerdict(signals({ detector: { score: 0.95 } }), 0.99).verdict).toBe('none');
  });

  it('REQ-F-005: row 4, a score below the threshold is None', () => {
    const result = decideVerdict(signals({ detector: { score: DEFAULT_THRESHOLD - 0.0001 } }));
    expect(result.verdict).toBe('none');
    expect(result.label).toBeNull();
    expect(result.confidence).toBeNull();
  });

  it('REQ-F-005: row 4, no signals at all is None', () => {
    expect(decideVerdict(signals()).verdict).toBe('none');
  });

  it('REQ-F-005: row 4, a non-finite detector score is None', () => {
    for (const score of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(decideVerdict(signals({ detector: { score } })).verdict).toBe('none');
    }
  });

  it('REQ-SEC-007: a valid manifest from an unrecognized signer never produces Definite', () => {
    const result = decideVerdict(signals({ c2pa: c2pa({ trusted: false }) }));
    expect(result.verdict).toBe('likely');
    expect(result.confidence).toEqual({ kind: 'metadata' });
  });

  it('REQ-F-003: a manifest that fails validation is treated as no valid manifest', () => {
    const invalid = c2pa({
      valid: false,
      trusted: false,
      failureReason: 'claimSignature.mismatch',
    });
    expect(decideVerdict(signals({ c2pa: invalid })).verdict).toBe('none');
    expect(decideVerdict(signals({ c2pa: invalid, detector: { score: 0.97 } })).verdict).toBe(
      'likely',
    );
    // The failure reason is kept for the details popover.
    expect(decideVerdict(signals({ c2pa: invalid })).signals.c2pa?.failureReason).toBe(
      'claimSignature.mismatch',
    );
  });

  it('REQ-SEC-007: "trusted" without "valid" is not Definite', () => {
    const inconsistent = c2pa({ valid: false, trusted: true });
    expect(decideVerdict(signals({ c2pa: inconsistent })).verdict).toBe('none');
  });

  it('REQ-F-005: trusted C2PA without an AI source type falls through to the detector', () => {
    const plain = c2pa({ aiSource: null });
    expect(decideVerdict(signals({ c2pa: plain })).verdict).toBe('none');
    expect(decideVerdict(signals({ c2pa: plain, detector: { score: 0.95 } })).verdict).toBe(
      'likely',
    );
  });

  it('REQ-F-005: camera-capture C2PA plus a detector result is flagged for the popover', () => {
    const camera = c2pa({ aiSource: null, cameraCapture: true });
    const flagged = decideVerdict(signals({ c2pa: camera, detector: { score: 0.95 } }));
    expect(flagged.verdict).toBe('likely');
    expect(flagged.cameraCaptureContext).toBe(true);

    const quiet = decideVerdict(signals({ c2pa: camera, detector: { score: 0.1 } }));
    expect(quiet.verdict).toBe('none');
    expect(quiet.cameraCaptureContext).toBe(true);

    // An unverified camera claim gives no such context.
    const untrusted = c2pa({ aiSource: null, cameraCapture: true, trusted: false });
    expect(decideVerdict(signals({ c2pa: untrusted })).cameraCaptureContext).toBe(false);
  });
});

describe('needsDetector', () => {
  it('REQ-F-005: the detector is not called when rule 1 matches', () => {
    expect(isDefinite(c2pa())).toBe(true);
    expect(needsDetector({ c2pa: c2pa(), iptc: null })).toBe(false);
  });

  it('REQ-F-005: the detector runs when no earlier rule matches', () => {
    expect(needsDetector({ c2pa: null, iptc: null })).toBe(true);
    expect(needsDetector({ c2pa: c2pa({ aiSource: null }), iptc: null })).toBe(true);
    expect(needsDetector({ c2pa: c2pa({ valid: false, trusted: false }), iptc: null })).toBe(true);
    expect(needsDetector({ c2pa: c2pa({ aiSource: null, cameraCapture: true }), iptc: null })).toBe(
      true,
    );
  });

  it('REQ-F-005: the detector is skipped when metadata already gives Likely', () => {
    expect(needsDetector({ c2pa: null, iptc: { aiSource: 'edited' } })).toBe(false);
  });
});

describe('badge text', () => {
  it('REQ-UI-002: tooltip text for each verdict', () => {
    expect(badgeTooltip(decideVerdict(signals({ c2pa: c2pa() })))).toBe(
      'AI-generated (Content Credentials)',
    );
    expect(badgeTooltip(decideVerdict(signals({ c2pa: c2pa({ aiSource: 'edited' }) })))).toBe(
      'AI-edited (Content Credentials)',
    );
    expect(badgeTooltip(decideVerdict(signals({ detector: { score: 0.93 } })))).toBe(
      'Likely AI · 93%',
    );
    expect(badgeTooltip(decideVerdict(signals({ iptc: { aiSource: 'generated' } })))).toBe(
      'Likely AI · metadata',
    );
  });

  it('REQ-UI-003: there is no badge text for None, so nothing implies "real"', () => {
    expect(badgeTooltip(decideVerdict(signals({ detector: { score: 0.01 } })))).toBeNull();
  });

  it('REQ-UI-002: a score is never shown as 100%', () => {
    expect(scorePercent(1)).toBe(99);
    expect(scorePercent(0.999)).toBe(99);
    expect(scorePercent(0.934)).toBe(93);
  });
});
