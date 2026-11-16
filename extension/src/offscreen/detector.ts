// On-device AI image detector (REQ-F-006). Runs the Community Forensics ViT classifier with
// transformers.js in the offscreen document. Image data never leaves the browser
// (REQ-PRV-001): the only network access is the one-time download of the model weights.
import type { PreTrainedModel, Processor, ProgressInfo } from '@huggingface/transformers';
import {
  AutoModelForImageClassification,
  AutoProcessor,
  RawImage,
  env,
} from '@huggingface/transformers';

// The upstream repository with the corrected weights (see ADR-008). The onnx-community export
// named in the original requirements was converted from the wrong checkpoint and scores every
// image near 0.5.
export const MODEL_ID = 'buildborderless/CommunityForensics-DeepfakeDet-ViT';
/** Pinned commit, so the weights cannot change underneath the extension. */
export const MODEL_REVISION = 'ac6ee457bea904a373065754107451793b56db00';

export type DetectorDevice = 'webgpu' | 'wasm';
/** Model precision: fp32 (87 MB), q8 (23 MB), q4 (16 MB). */
export type DetectorDtype = 'fp32' | 'q8' | 'q4';

export interface DetectorConfig {
  device: DetectorDevice;
  dtype: DetectorDtype;
}

export interface DetectorScore {
  /** Probability from 0 to 1 that the image is AI-generated. */
  score: number;
  device: DetectorDevice;
  dtype: DetectorDtype;
  /** Preprocessing plus inference time for this image, in milliseconds. */
  ms: number;
}

// --- Runtime configuration (REQ-SEC-008: no remotely hosted code) ---------------------------
// transformers.js would otherwise load the ONNX Runtime WASM files from a CDN. The JavaScript
// glue is bundled into offscreen.js; only the .wasm binary is fetched, from our own package.
env.allowLocalModels = false;
env.allowRemoteModels = true; // model weights only, cached with the Cache API (REQ-F-011)
env.useBrowserCache = true;
// The WASM cache imports the runtime glue from a blob: URL, which the extension CSP blocks.
env.useWasmCache = false;
const onnxWasm = env.backends.onnx.wasm;
if (onnxWasm) {
  onnxWasm.wasmPaths = {
    wasm: chrome.runtime.getURL('offscreen/vendor/ort-wasm-simd-threaded.asyncify.wasm'),
  };
  // Multi-threading needs cross-origin isolation, which extension pages do not have by default.
  onnxWasm.numThreads = 1;
  onnxWasm.proxy = false;
}

export async function webGpuAvailable(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

/** Full precision on WebGPU when available, otherwise 8-bit weights on WASM. */
export async function defaultConfig(): Promise<DetectorConfig> {
  return (await webGpuAvailable())
    ? { device: 'webgpu', dtype: 'fp32' }
    : { device: 'wasm', dtype: 'q8' };
}

interface Loaded {
  config: DetectorConfig;
  model: PreTrainedModel;
  processor: Processor;
  loadMs: number;
}

const loaded = new Map<string, Promise<Loaded>>();

export type ProgressListener = (info: ProgressInfo) => void;

/** Loads (and on first use downloads) the model for a configuration. Loads are shared. */
export function loadDetector(
  config: DetectorConfig,
  onProgress?: ProgressListener,
): Promise<Loaded> {
  const key = `${config.device}/${config.dtype}`;
  let pending = loaded.get(key);
  if (!pending) {
    pending = (async () => {
      const started = performance.now();
      const [model, processor] = await Promise.all([
        AutoModelForImageClassification.from_pretrained(MODEL_ID, {
          revision: MODEL_REVISION,
          device: config.device,
          dtype: config.dtype,
          progress_callback: onProgress,
        }),
        AutoProcessor.from_pretrained(MODEL_ID, { revision: MODEL_REVISION }),
      ]);
      // Enforce the training-time preprocessing regardless of the published config:
      // resize the short side to 440, then centre-crop 384 x 384.
      const imageProcessor = processor.image_processor as unknown as {
        size: unknown;
        do_center_crop: boolean;
        crop_size: unknown;
      };
      imageProcessor.size = { shortest_edge: 440 };
      imageProcessor.do_center_crop = true;
      imageProcessor.crop_size = { width: 384, height: 384 };
      return { config, model, processor, loadMs: Math.round(performance.now() - started) };
    })();
    loaded.set(key, pending);
    pending.catch(() => loaded.delete(key));
  }
  return pending;
}

export async function scoreImage(blob: Blob, config: DetectorConfig): Promise<DetectorScore> {
  const { model, processor } = await loadDetector(config);
  const started = performance.now();
  const image = (await RawImage.fromBlob(blob)).rgb();
  const inputs = (await processor(image)) as Record<string, unknown>;
  const output = (await model(inputs)) as { logits: { data: ArrayLike<number> } };
  // One logit; its sigmoid is the probability that the image is generated.
  const logit = Number(output.logits.data[0]);
  const score = 1 / (1 + Math.exp(-logit));
  return {
    score,
    device: config.device,
    dtype: config.dtype,
    ms: Math.round(performance.now() - started),
  };
}
