import { InjectionToken } from '@angular/core';
import type { ClearCacheRequest } from '../../../../src/shared/messages';
import { parseModelStatus } from '../../../../src/shared/messages';
import {
  MODEL_STATUS_KEY,
  SETTINGS_KEY,
  hostnameOf,
  parseSettings,
} from '../../../../src/shared/settings';
import type { ModelStatus, Settings } from '../../../../src/shared/types';

/** Everything the popup needs from Chrome, behind an interface so it can be faked in tests. */
export interface ExtensionApi {
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  loadModelStatus(): Promise<ModelStatus>;
  /** Hostname of the active tab, or null when it is not a web page. */
  activeHostname(): Promise<string | null>;
  /** Removes all cached verdicts and resolves to how many were removed. */
  clearCache(): Promise<number>;
  /** Calls back whenever stored settings or the model status change. Returns an unsubscribe. */
  onChange(
    listener: (change: { settings?: Settings; modelStatus?: ModelStatus }) => void,
  ): () => void;
}

export const EXTENSION_API = new InjectionToken<ExtensionApi>('ExtensionApi');

const NOT_DOWNLOADED: ModelStatus = { state: 'not-downloaded' };

export const chromeExtensionApi: ExtensionApi = {
  async loadSettings() {
    return parseSettings((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
  },
  async saveSettings(settings) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: parseSettings(settings) });
  },
  async loadModelStatus() {
    const stored = (await chrome.storage.local.get(MODEL_STATUS_KEY))[MODEL_STATUS_KEY];
    return parseModelStatus(stored) ?? NOT_DOWNLOADED;
  },
  async activeHostname() {
    // The URL is available without the "tabs" permission because the extension already has
    // host access to http and https pages.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return hostnameOf(tab?.url);
  },
  async clearCache() {
    const request: ClearCacheRequest = { type: 'cache:clear' };
    const reply: unknown = await chrome.runtime.sendMessage(request);
    const removed = (reply as { removed?: unknown } | undefined)?.removed;
    return typeof removed === 'number' ? removed : 0;
  },
  onChange(listener) {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
      if (area !== 'local') return;
      const change: { settings?: Settings; modelStatus?: ModelStatus } = {};
      if (changes[SETTINGS_KEY]) change.settings = parseSettings(changes[SETTINGS_KEY].newValue);
      if (changes[MODEL_STATUS_KEY]) {
        change.modelStatus = parseModelStatus(changes[MODEL_STATUS_KEY].newValue) ?? NOT_DOWNLOADED;
      }
      if (change.settings || change.modelStatus) listener(change);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  },
};
