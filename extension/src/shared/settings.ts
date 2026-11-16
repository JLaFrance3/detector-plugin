// User settings (REQ-F-010), kept in chrome.storage.local (REQ-PRV-004). Pure helpers here;
// the storage calls live with their callers so this module stays testable.
import type { Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

export const SETTINGS_KEY = 'settings';
export const MODEL_STATUS_KEY = 'modelStatus';

const MAX_SITES = 500;
const HOSTNAME = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;

/** Lower-cased hostname of a page URL, or null when it has none (or is not http/https). */
export function hostnameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Validates stored settings, falling back to the defaults field by field. */
export function parseSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS };
  const raw = value as Record<string, unknown>;
  const sites = Array.isArray(raw['disabledSites']) ? raw['disabledSites'] : [];
  return {
    enabled: typeof raw['enabled'] === 'boolean' ? raw['enabled'] : DEFAULT_SETTINGS.enabled,
    disabledSites: [
      ...new Set(
        sites
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.toLowerCase())
          .filter((s) => HOSTNAME.test(s)),
      ),
    ].slice(0, MAX_SITES),
    // Off unless explicitly switched on (REQ-F-010).
    cloudEnabled: raw['cloudEnabled'] === true,
  };
}

/** Whether images on a page with this hostname should be checked. */
export function isActiveOn(settings: Settings, hostname: string | null): boolean {
  if (!settings.enabled) return false;
  return hostname === null || !settings.disabledSites.includes(hostname.toLowerCase());
}

/** Returns new settings with the site switched off or back on. */
export function withSiteDisabled(
  settings: Settings,
  hostname: string,
  disabled: boolean,
): Settings {
  const host = hostname.toLowerCase();
  const others = settings.disabledSites.filter((s) => s !== host);
  return parseSettings({ ...settings, disabledSites: disabled ? [...others, host] : others });
}
