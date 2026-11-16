// Offscreen document: hosts the C2PA reader and the on-device detector (ADR-004).
import { base64ToBytes } from '../shared/base64';
import { readC2pa } from './c2pa-reader';
import type { DetectorConfig } from './detector';
import { defaultConfig, loadDetector, scoreImage } from './detector';

// TASK-004/005 spike plumbing; replaced by the validated contracts of TASK-006.
interface SpikeWork {
  target: 'offscreen';
  type: 'spike:c2pa' | 'spike:detect';
  mimeType: string;
  bytesBase64: string;
  detector?: DetectorConfig;
}

function isSpikeWork(message: unknown): message is SpikeWork {
  const m = message as Partial<SpikeWork> | null;
  return (
    typeof m === 'object' &&
    m !== null &&
    m.target === 'offscreen' &&
    (m.type === 'spike:c2pa' || m.type === 'spike:detect') &&
    typeof m.mimeType === 'string' &&
    typeof m.bytesBase64 === 'string'
  );
}

/** Every resource this document has fetched, for the "no unexpected network" spike checks. */
function networkLog(): { url: string; bytes: number }[] {
  return performance.getEntriesByType('resource').map((entry) => ({
    url: entry.name,
    bytes: (entry as PerformanceResourceTiming).encodedBodySize,
  }));
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const probe = message as { target?: unknown; type?: unknown } | null;
  if (probe?.target === 'offscreen' && probe.type === 'spike:network') {
    sendResponse(networkLog());
    return false;
  }
  if (!isSpikeWork(message)) return false;
  void (async () => {
    try {
      const blob = new Blob([base64ToBytes(message.bytesBase64)], { type: message.mimeType });
      if (message.type === 'spike:c2pa') {
        sendResponse(await readC2pa(blob, message.mimeType || undefined));
      } else {
        const config = message.detector ?? (await defaultConfig());
        const { loadMs } = await loadDetector(config);
        sendResponse({ ...(await scoreImage(blob, config)), loadMs });
      }
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  })();
  return true;
});

if (__DEV__) console.debug('[aid] offscreen document loaded');
