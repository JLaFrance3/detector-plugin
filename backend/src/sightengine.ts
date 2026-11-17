// Client for Sightengine's AI-generated image and deepfake models (REQ-F-012, ADR-009).
// The API credentials come from the environment and are only ever sent to Sightengine
// (REQ-SEC-004). The endpoint URL is a constant: nothing a client sends can change where
// this service connects to (REQ-SEC-006).
import type { AllowedImageType } from './image.js';

const ENDPOINT = 'https://api.sightengine.com/1.0/check.json';
const TIMEOUT_MS = 15_000;

export interface ProviderResult {
  /** Probability from 0 to 1 that the image is AI-generated. */
  score: number;
  /**
   * Probability from 0 to 1 that a face in the image was swapped or manipulated, or null
   * when the provider did not report one. Never fails the check (ADR-009).
   */
  deepfake: number | null;
  /** Operations Sightengine billed for this check, when reported (REQ-NF-005 open item). */
  operations: number | null;
}

export interface Provider {
  readonly name: string;
  check(bytes: Uint8Array<ArrayBuffer>, type: AllowedImageType): Promise<ProviderResult>;
}

export class ProviderError extends Error {}

const extension: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Reads `type.ai_generated` (required) and `type.deepfake` (optional) from a Sightengine
 * response and clamps both to 0..1.
 */
export function normalizeScore(body: unknown): ProviderResult {
  const data = body as {
    status?: unknown;
    type?: { ai_generated?: unknown; deepfake?: unknown };
    request?: { operations?: unknown };
  } | null;
  const score = data?.type?.ai_generated;
  if (data?.status !== 'success' || typeof score !== 'number' || !Number.isFinite(score)) {
    throw new ProviderError('unexpected provider response');
  }
  const operations = data.request?.operations;
  const deepfake = data.type?.deepfake;
  return {
    score: clamp(score),
    deepfake: typeof deepfake === 'number' && Number.isFinite(deepfake) ? clamp(deepfake) : null,
    operations: typeof operations === 'number' ? operations : null,
  };
}

export function createSightengine(
  credentials: { apiUser: string; apiSecret: string },
  fetchFn: typeof fetch = fetch,
): Provider {
  return {
    name: 'sightengine',
    async check(bytes, type) {
      const form = new FormData();
      form.set('models', 'genai,deepfake');
      form.set('api_user', credentials.apiUser);
      form.set('api_secret', credentials.apiSecret);
      form.set('media', new Blob([bytes], { type }), `image.${extension[type]}`);

      let response: Response;
      try {
        response = await fetchFn(ENDPOINT, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: 'error',
        });
      } catch {
        // Never include the cause: it could echo request details.
        throw new ProviderError('provider unreachable');
      }
      if (!response.ok) throw new ProviderError(`provider returned HTTP ${response.status}`);
      return normalizeScore(await response.json().catch(() => null));
    },
  };
}
