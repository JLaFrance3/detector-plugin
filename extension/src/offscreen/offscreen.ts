// Offscreen document: hosts the C2PA reader and the on-device detector (ADR-004).
import { base64ToBytes } from '../shared/base64';
import { readC2pa } from './c2pa-reader';

// TASK-004/005 spike plumbing; replaced by the validated contracts of TASK-006.
interface SpikeWork {
  target: 'offscreen';
  type: 'spike:c2pa' | 'spike:detect';
  mimeType: string;
  bytesBase64: string;
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

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isSpikeWork(message)) return false;
  void (async () => {
    try {
      const blob = new Blob([base64ToBytes(message.bytesBase64)], { type: message.mimeType });
      if (message.type === 'spike:c2pa') {
        sendResponse(await readC2pa(blob, message.mimeType || undefined));
      } else {
        sendResponse({ error: 'detector spike not implemented yet' });
      }
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  })();
  return true;
});

if (__DEV__) console.debug('[aid] offscreen document loaded');
