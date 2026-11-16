// REQ-SEC-001: every string taken from C2PA manifests or IPTC/XMP metadata is attacker-
// controlled. These pure functions turn it into bounded plain text and reduce structured
// fields to fixed vocabularies. The UI still renders the output only through Angular text
// interpolation (REQ-SEC-002); sanitizing here is defence in depth and stops spoofing with
// invisible or direction-changing characters.
import { MAX_TEXT_LENGTH, sanitizeText } from './sanitize-text';
import type { AiSource, C2paSignal } from './types';

export { MAX_TEXT_LENGTH, sanitizeText };

const SOURCE_TYPE_PREFIXES = [
  'http://cv.iptc.org/newscodes/digitalsourcetype/',
  'https://cv.iptc.org/newscodes/digitalsourcetype/',
  'http://c2pa.org/digitalsourcetype/',
  'https://c2pa.org/digitalsourcetype/',
];

const AI_SOURCE_TYPES: Record<string, AiSource> = {
  trainedAlgorithmicMedia: 'generated',
  compositeWithTrainedAlgorithmicMedia: 'edited',
};

const CAMERA_SOURCE_TYPES = new Set(['digitalCapture', 'computationalCapture']);

/** The code at the end of a digital source type URI, or null if it is not a known form. */
function sourceTypeCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  const trimmed = value.trim();
  const prefix = SOURCE_TYPE_PREFIXES.find((p) => trimmed.startsWith(p));
  // Some tools write the bare code without the IPTC namespace.
  const code = prefix ? trimmed.slice(prefix.length) : trimmed;
  return /^[A-Za-z]{1,60}$/.test(code) ? code : null;
}

/** Maps an IPTC digitalSourceType value to the AI source it declares, if any. */
export function classifyAiSource(value: unknown): AiSource | null {
  const code = sourceTypeCode(value);
  return code !== null && Object.hasOwn(AI_SOURCE_TYPES, code)
    ? (AI_SOURCE_TYPES[code] ?? null)
    : null;
}

export function isCameraCapture(value: unknown): boolean {
  const code = sourceTypeCode(value);
  return code !== null && CAMERA_SOURCE_TYPES.has(code);
}

/**
 * Picks the strongest AI declaration from a list of source types. "generated" wins over
 * "edited" so that a fully generated image is not understated.
 */
export function strongestAiSource(values: readonly unknown[]): AiSource | null {
  let found: AiSource | null = null;
  for (const value of values.slice(0, 50)) {
    const source = classifyAiSource(value);
    if (source === 'generated') return 'generated';
    if (source === 'edited') found = 'edited';
  }
  return found;
}

/** Fields read from a C2PA manifest before sanitizing. Mirrors the reader's raw output. */
export interface RawC2paFields {
  present?: unknown;
  validationState?: unknown;
  signerName?: unknown;
  claimGenerator?: unknown;
  signedAt?: unknown;
  digitalSourceTypes?: unknown;
  failures?: unknown;
  // Anything else the library returns is ignored (allowlist, REQ-SEC-001).
  [other: string]: unknown;
}

const NO_MANIFEST: C2paSignal = {
  present: false,
  valid: false,
  trusted: false,
  signer: null,
  tool: null,
  signedAt: null,
  aiSource: null,
  cameraCapture: false,
  failureReason: null,
};

/** ISO 8601 date-time as written by c2pa-rs, e.g. 2025-08-13T16:30:55+00:00. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
/** C2PA validation status codes look like "assertion.dataHash.mismatch". */
const STATUS_CODE = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+){0,5}$/;

/**
 * Reduces raw C2PA reader output to the allowlisted fields of REQ-SEC-001: signer name,
 * claim generator, digital source type, signing time and validation status. Every other
 * field is dropped and every string is sanitized.
 */
export function sanitizeC2pa(raw: RawC2paFields | null | undefined): C2paSignal {
  if (!raw || raw.present !== true) return { ...NO_MANIFEST };

  const state = raw.validationState;
  const trusted = state === 'Trusted';
  const valid = trusted || state === 'Valid';

  const sourceTypes = Array.isArray(raw.digitalSourceTypes) ? raw.digitalSourceTypes : [];
  const signedAt = sanitizeText(raw.signedAt, 40);

  return {
    present: true,
    valid,
    trusted,
    signer: sanitizeText(raw.signerName),
    tool: sanitizeText(raw.claimGenerator),
    signedAt: signedAt !== null && ISO_TIME.test(signedAt) ? signedAt : null,
    aiSource: strongestAiSource(sourceTypes),
    cameraCapture: sourceTypes.slice(0, 50).some(isCameraCapture),
    failureReason: valid ? null : firstFailureCode(raw.failures),
  };
}

function firstFailureCode(failures: unknown): string | null {
  if (!Array.isArray(failures)) return null;
  const codes: string[] = [];
  for (const failure of failures.slice(0, 20)) {
    const code = sanitizeText((failure as { code?: unknown } | null)?.code, 80);
    if (code !== null && STATUS_CODE.test(code)) codes.push(code);
  }
  // An untrusted signer is reported for every test certificate; prefer the real defect.
  return codes.find((c) => c !== 'signingCredential.untrusted') ?? codes[0] ?? null;
}
