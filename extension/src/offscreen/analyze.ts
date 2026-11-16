// Runs the layered check of ADR-001 on one image's bytes and returns sanitized signals.
// Provenance first; the detector only when no earlier rule decides the verdict (REQ-F-005).
import { sanitizeC2pa } from '../shared/sanitize';
import type { ImageSignals } from '../shared/types';
import { isDefinite, needsDetector } from '../shared/verdict';
import { readXmpAiSource } from '../shared/xmp';
import type { C2paRawResult } from './c2pa-reader';

export interface AnalyzeDeps {
  readC2pa(blob: Blob, mimeType: string | undefined): Promise<C2paRawResult>;
  scoreImage(blob: Blob): Promise<number>;
}

export async function analyzeImage(
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
  deps: AnalyzeDeps,
): Promise<ImageSignals> {
  const blob = new Blob([bytes], { type: mimeType });

  // 1. C2PA Content Credentials. Raw library output is sanitized before it goes anywhere
  //    else (REQ-SEC-001). A read error is treated as "no manifest".
  const raw = await deps.readC2pa(blob, mimeType || undefined).catch(() => null);
  const c2pa = sanitizeC2pa(raw);
  if (isDefinite(c2pa)) return { c2pa, iptc: null, detector: null };

  // 2. Unsigned IPTC/XMP metadata, only when there is no valid manifest (REQ-F-004).
  const iptc = c2pa.valid ? null : { aiSource: readXmpAiSource(bytes) };
  if (!needsDetector({ c2pa, iptc })) return { c2pa, iptc, detector: null };

  // 3. On-device detector. If it cannot run, the image simply gets no detector signal.
  const score = await deps.scoreImage(blob).catch((error: unknown) => {
    if (__DEV__) console.warn('[aid] detector failed', error);
    return null;
  });
  return { c2pa, iptc, detector: score === null ? null : { score } };
}
