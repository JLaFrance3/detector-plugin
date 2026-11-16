// REQ-F-011: verdict cache in chrome.storage.local, keyed by a SHA-256 hash of the image URL,
// valid for 7 days. The hash means the list of image URLs a user has seen is not stored in
// readable form. What is cached are the signals; the verdict is recomputed on read so a
// change of threshold applies to cached images too.
import { parseSignals } from '../shared/messages';
import type { ImageSignals } from '../shared/types';

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Keeps the cache well under chrome.storage.local's 10 MB quota (about 0.4 kB per entry). */
export const MAX_ENTRIES = 5000;
const PREFIX = 'v1:';

/** The subset of chrome.storage.StorageArea the cache needs (lets tests use a fake). */
export interface KeyValueStore {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface Entry {
  /** When the entry was written, in milliseconds since the epoch. */
  t: number;
  s: ImageSignals;
}

export async function cacheKey(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${PREFIX}${hex}`;
}

function parseEntry(value: unknown): Entry | null {
  if (typeof value !== 'object' || value === null) return null;
  const { t, s } = value as { t?: unknown; s?: unknown };
  const signals = parseSignals(s);
  return typeof t === 'number' && Number.isFinite(t) && signals ? { t, s: signals } : null;
}

export class VerdictCache {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = Date.now,
  ) {}

  private isFresh(entry: Entry): boolean {
    const age = this.now() - entry.t;
    return age >= 0 && age < CACHE_TTL_MS;
  }

  /** Cached signals for a URL, or null when absent, expired or malformed. */
  async get(url: string): Promise<ImageSignals | null> {
    const key = await cacheKey(url);
    const stored = (await this.store.get(key))[key];
    if (stored === undefined) return null;
    const entry = parseEntry(stored);
    if (entry && this.isFresh(entry)) return entry.s;
    await this.store.remove(key); // expired or corrupt
    return null;
  }

  async set(url: string, signals: ImageSignals): Promise<void> {
    const entry: Entry = { t: this.now(), s: signals };
    await this.store.set({ [await cacheKey(url)]: entry });
  }

  /** Removes expired entries, then the oldest ones beyond MAX_ENTRIES. Returns the count. */
  async prune(): Promise<number> {
    const all = await this.store.get(null);
    const remove: string[] = [];
    const fresh: [key: string, time: number][] = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(PREFIX)) continue;
      const entry = parseEntry(value);
      if (entry && this.isFresh(entry)) fresh.push([key, entry.t]);
      else remove.push(key);
    }
    if (fresh.length > MAX_ENTRIES) {
      fresh.sort((a, b) => a[1] - b[1]);
      for (const [key] of fresh.slice(0, fresh.length - MAX_ENTRIES)) remove.push(key);
    }
    if (remove.length > 0) await this.store.remove(remove);
    return remove.length;
  }

  /** REQ-F-010 "Clear cache": removes every cached verdict and nothing else. */
  async clear(): Promise<number> {
    const keys = Object.keys(await this.store.get(null)).filter((k) => k.startsWith(PREFIX));
    if (keys.length > 0) await this.store.remove(keys);
    return keys.length;
  }
}
