// The service worker's image check: cache, fetch, analyze in the offscreen document, decide.
// Dependencies are injected so the flow can be unit tested without Chrome.
import type { AnalyzeRequest, AnalyzeResponse } from '../shared/messages';
import { bytesToBase64 } from '../shared/base64';
import type { ImageResult, ImageSignals } from '../shared/types';
import { decideVerdict, needsDetector } from '../shared/verdict';
import type { FetchedImage } from './fetch-image';

export interface PipelineDeps {
  cacheGet(url: string): Promise<ImageSignals | null>;
  cacheSet(url: string, signals: ImageSignals): Promise<void>;
  fetchImage(url: string): Promise<FetchedImage | null>;
  analyze(request: AnalyzeRequest): Promise<AnalyzeResponse>;
  threshold: number;
}

export class ImagePipeline {
  /** Checks already running for a URL, so the same image is not fetched twice at once. */
  private readonly inFlight = new Map<string, Promise<ImageResult | null>>();

  constructor(private readonly deps: PipelineDeps) {}

  /** The result for an image URL, or null when it could not be checked (shown as None). */
  check(url: string): Promise<ImageResult | null> {
    let pending = this.inFlight.get(url);
    if (!pending) {
      pending = this.run(url).finally(() => this.inFlight.delete(url));
      this.inFlight.set(url, pending);
    }
    return pending;
  }

  private async run(url: string): Promise<ImageResult | null> {
    const { deps } = this;
    // REQ-F-011: a cached image is not fetched or scored again.
    const cached = await deps.cacheGet(url).catch(() => null);
    if (cached) return decideVerdict(cached, deps.threshold);

    const image = await deps.fetchImage(url);
    if (!image) return null; // REQ-F-002: failed fetch means no verdict and no badge

    const response = await deps
      .analyze({
        target: 'offscreen',
        type: 'analyze',
        mimeType: image.mimeType,
        bytesBase64: bytesToBase64(image.bytes),
      })
      .catch((): AnalyzeResponse => ({ ok: false }));
    if (!response.ok) return null;

    const { signals } = response;
    // Do not cache an incomplete check (the detector was needed but could not run), so the
    // image is retried once the model is available.
    const complete = !needsDetector(signals) || signals.detector !== null;
    if (complete) await deps.cacheSet(url, signals).catch(() => undefined);
    return decideVerdict(signals, deps.threshold);
  }
}
