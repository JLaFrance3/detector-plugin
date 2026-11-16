// Production detector (TASK-012): lazy model load, WebGPU with WASM fallback, at most two
// images in flight, and model status reporting for the popup (REQ-F-006, REQ-F-010).
import { TaskQueue } from '../shared/task-queue';
import type { ModelStatus } from '../shared/types';
import type { DetectorConfig } from './detector';
import { MODEL_ID, defaultConfig, loadDetector, scoreImage } from './detector';

/** REQ-F-006: at most 2 images are scored at a time; others wait in a queue. */
export const MAX_CONCURRENT = 2;

const WASM_FALLBACK: DetectorConfig = { device: 'wasm', dtype: 'q8' };

export class DetectorService {
  private readonly queue = new TaskQueue(MAX_CONCURRENT);
  private ready: Promise<DetectorConfig> | undefined;
  private status: ModelStatus = { state: 'not-downloaded' };
  private lastPercent = -1;

  constructor(private readonly onStatus: (status: ModelStatus) => void) {}

  get modelStatus(): ModelStatus {
    return this.status;
  }

  private setStatus(status: ModelStatus): void {
    this.status = status;
    this.onStatus(status);
  }

  /** Reports whether the weights are already in the Cache API, without loading them. */
  async reportInitialStatus(): Promise<void> {
    if (this.ready) return;
    try {
      const cache = await caches.open('transformers-cache');
      const downloaded = (await cache.keys()).some(
        (request) => request.url.includes(MODEL_ID) && request.url.endsWith('.onnx'),
      );
      if (!this.ready) {
        this.setStatus(
          downloaded
            ? { state: 'ready', device: (await defaultConfig()).device }
            : { state: 'not-downloaded' },
        );
      }
    } catch {
      // Cache API unavailable: leave the status as "not downloaded".
    }
  }

  /** Loads the model once, downloading it on first use. Falls back to WASM if WebGPU fails. */
  private load(): Promise<DetectorConfig> {
    this.ready ??= (async () => {
      const preferred = await defaultConfig();
      const onProgress = (info: { status: string; file?: string; progress?: number }): void => {
        // Only the weights file is large enough to be worth reporting.
        if (info.status !== 'progress' || !info.file?.endsWith('.onnx')) return;
        const percent = Math.max(0, Math.min(99, Math.floor(info.progress ?? 0)));
        if (percent === this.lastPercent) return;
        this.lastPercent = percent;
        this.setStatus({ state: 'downloading', percent });
      };
      try {
        await loadDetector(preferred, onProgress as never);
        this.setStatus({ state: 'ready', device: preferred.device });
        return preferred;
      } catch (error) {
        if (preferred.device === 'wasm') throw error;
        if (__DEV__) console.warn('[aid] WebGPU model load failed, falling back to WASM', error);
        this.lastPercent = -1;
        await loadDetector(WASM_FALLBACK, onProgress as never);
        this.setStatus({ state: 'ready', device: 'wasm' });
        return WASM_FALLBACK;
      }
    })();
    this.ready.catch(() => {
      this.ready = undefined; // allow a retry on the next image
      this.setStatus({ state: 'error' });
    });
    return this.ready;
  }

  /** Probability from 0 to 1 that the image is AI-generated. Rejects if the model cannot run. */
  score(blob: Blob): Promise<number> {
    return this.queue.run(async () => {
      const config = await this.load();
      const result = await scoreImage(blob, config);
      if (__DEV__) console.debug(`[aid] detector ${result.score.toFixed(4)} in ${result.ms} ms`);
      return Math.min(1, Math.max(0, result.score));
    });
  }
}
