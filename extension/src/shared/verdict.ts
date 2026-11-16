// REQ-F-005: decides the verdict for one image. Pure functions, no browser APIs.
import type { C2paSignal, ImageResult, ImageSignals } from './types';
import { DEFAULT_THRESHOLD } from './types';

/**
 * Rule 1: a valid manifest from a trusted signer that declares an AI source type.
 * When this holds the detector must not run.
 */
export function isDefinite(c2pa: C2paSignal | null): boolean {
  return !!c2pa && c2pa.present && c2pa.valid && c2pa.trusted && c2pa.aiSource !== null;
}

/**
 * Whether an AI source type was declared without trusted proof: unsigned IPTC/XMP metadata,
 * or a manifest that is valid but signed by an unrecognized signer (REQ-SEC-007). Anyone can
 * write such a claim, so it counts toward Likely, never Definite. A manifest that fails
 * validation is treated as no manifest at all (REQ-F-003).
 */
export function hasUnverifiedAiClaim(signals: Pick<ImageSignals, 'c2pa' | 'iptc'>): boolean {
  const { c2pa, iptc } = signals;
  if (iptc?.aiSource) return true;
  return !!c2pa && c2pa.present && c2pa.valid && !c2pa.trusted && c2pa.aiSource !== null;
}

/** The detector is skipped when an earlier rule already decides the verdict. */
export function needsDetector(signals: Pick<ImageSignals, 'c2pa' | 'iptc'>): boolean {
  return !isDefinite(signals.c2pa) && !hasUnverifiedAiClaim(signals);
}

/** Detector score as a whole percentage, never shown as 100% (no certainty is claimed). */
export function scorePercent(score: number): number {
  return Math.min(99, Math.max(0, Math.floor(score * 100)));
}

/**
 * Applies the REQ-F-005 table, first matching rule wins:
 *  1. valid C2PA, trusted signer, AI source type  -> Definite
 *  2. unsigned IPTC/XMP AI source type            -> Likely (metadata)
 *  3. detector score >= threshold                 -> Likely (percentage)
 *  4. anything else                               -> None
 */
export function decideVerdict(signals: ImageSignals, threshold = DEFAULT_THRESHOLD): ImageResult {
  const { c2pa, detector } = signals;
  // Valid, trusted credentials stating a camera capture do not stop the detector; its result
  // is shown with that context in the popover.
  const cameraCaptureContext =
    !!c2pa && c2pa.valid && c2pa.trusted && c2pa.cameraCapture && c2pa.aiSource === null;
  const base = { signals, cameraCaptureContext };

  if (isDefinite(c2pa)) {
    return {
      ...base,
      verdict: 'definite',
      label: c2pa?.aiSource === 'edited' ? 'AI-edited' : 'AI-generated',
      confidence: { kind: 'credentials' },
    };
  }

  if (hasUnverifiedAiClaim(signals)) {
    return { ...base, verdict: 'likely', label: 'Likely AI', confidence: { kind: 'metadata' } };
  }

  const score = detector?.score;
  if (typeof score === 'number' && Number.isFinite(score) && score >= threshold) {
    return {
      ...base,
      verdict: 'likely',
      label: 'Likely AI',
      confidence: { kind: 'score', percent: scorePercent(score) },
    };
  }

  return { ...base, verdict: 'none', label: null, confidence: null };
}

/** Tooltip and accessible name for the badge (REQ-UI-002). Null when there is no badge. */
export function badgeTooltip(result: ImageResult): string | null {
  if (result.verdict === 'definite') return `${result.label} (Content Credentials)`;
  if (result.verdict === 'likely') {
    return result.confidence?.kind === 'score'
      ? `Likely AI · ${result.confidence.percent}%`
      : 'Likely AI · metadata';
  }
  return null;
}
