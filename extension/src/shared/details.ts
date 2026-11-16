// REQ-F-008: turns an image result into the lines shown in the details popover.
// Pure text building: every string from the image is already sanitized and is rendered by
// the UI through Angular interpolation only (REQ-SEC-002).
import type { AiSource, ImageResult } from './types';

export interface SignalRow {
  /** Which check this is. */
  name: string;
  /** One-line outcome. */
  summary: string;
  /** Extra facts, each "Label: value". */
  facts: { label: string; value: string }[];
}

export interface DetailsView {
  /** e.g. "AI-edited", "Likely AI". */
  title: string;
  /** e.g. "Confirmed by Content Credentials", "Detector score 93%". */
  confidence: string;
  rows: SignalRow[];
  /** Shown when trusted credentials say "camera" but the detector flagged the image. */
  note: string | null;
}

/** REQ-F-008: fixed caveat shown in every popover. */
export const CAVEAT = 'A mark shows AI involvement. No mark does not mean an image is real.';

/** REQ-F-008: official checkers for watermarks this extension cannot read. */
export const CHECKER_LINKS: readonly { label: string; url: string }[] = [
  { label: 'SynthID Detector (Google)', url: 'https://synthid.com/' },
  { label: 'OpenAI image verification', url: 'https://openai.com/verify' },
  { label: 'Claude Content Checker', url: 'https://claude.com/check-content' },
];

const sourceText = (source: AiSource): string =>
  source === 'generated' ? 'AI-generated' : 'AI-edited';

/** "13 Aug 2025" from an ISO time, or null when it cannot be parsed. */
export function formatSignedDate(iso: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(time);
}

function credentialsRow(result: ImageResult): SignalRow {
  const c2pa = result.signals.c2pa;
  const row: SignalRow = { name: 'Content Credentials (C2PA)', summary: 'None found', facts: [] };
  if (!c2pa?.present) return row;

  if (!c2pa.valid) {
    row.summary = 'Present but failed validation';
    if (c2pa.failureReason) row.facts.push({ label: 'Reason', value: c2pa.failureReason });
    return row;
  }

  // REQ-SEC-007: a valid signature from an unknown signer is called out as such.
  row.summary = c2pa.trusted ? 'Valid, from a trusted signer' : 'Signed by an unrecognized signer';
  if (c2pa.signer) row.facts.push({ label: 'Signer', value: c2pa.signer });
  if (c2pa.tool) row.facts.push({ label: 'Tool', value: c2pa.tool });
  const signed = formatSignedDate(c2pa.signedAt);
  if (signed) row.facts.push({ label: 'Signed', value: signed });
  if (c2pa.aiSource) {
    row.facts.push({ label: 'Declares', value: sourceText(c2pa.aiSource) });
  } else if (c2pa.cameraCapture) {
    row.facts.push({ label: 'Declares', value: 'Camera capture' });
  }
  return row;
}

function metadataRow(result: ImageResult): SignalRow {
  const iptc = result.signals.iptc;
  const row: SignalRow = { name: 'Image metadata (IPTC)', summary: 'Not checked', facts: [] };
  if (!iptc) return row;
  row.summary = iptc.aiSource
    ? `Says ${sourceText(iptc.aiSource)} (unsigned, can be edited by anyone)`
    : 'No AI tag';
  return row;
}

function detectorRow(result: ImageResult): SignalRow {
  const detector = result.signals.detector;
  const row: SignalRow = { name: 'On-device detector', summary: '', facts: [] };
  if (detector) {
    const percent = Math.min(99, Math.max(0, Math.floor(detector.score * 100)));
    row.summary = `${percent}% likely AI-generated`;
  } else if (result.verdict === 'none') {
    row.summary = 'Could not run';
  } else {
    row.summary = 'Not needed';
  }
  return row;
}

export function describeResult(result: ImageResult): DetailsView {
  let confidence = '';
  if (result.confidence?.kind === 'credentials') confidence = 'Confirmed by Content Credentials';
  else if (result.confidence?.kind === 'metadata') confidence = 'Based on image metadata';
  else if (result.confidence?.kind === 'score') {
    confidence = `Detector score ${result.confidence.percent}%`;
  }
  return {
    title: result.label ?? '',
    confidence,
    rows: [credentialsRow(result), metadataRow(result), detectorRow(result)],
    note:
      result.cameraCaptureContext && result.verdict === 'likely'
        ? 'Content Credentials say this image came from a camera, but the detector flagged it.'
        : null,
  };
}
