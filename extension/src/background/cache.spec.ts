import type { ImageSignals } from '../shared/types';
import type { KeyValueStore } from './cache';
import { CACHE_TTL_MS, MAX_ENTRIES, VerdictCache, cacheKey } from './cache';

/** In-memory stand-in for chrome.storage.local. */
class FakeStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();

  get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    const wanted = keys === null ? [...this.data.keys()] : [keys].flat();
    const entries = wanted.filter((k) => this.data.has(k)).map((k) => [k, this.data.get(k)]);
    return Promise.resolve(structuredClone(Object.fromEntries(entries)) as Record<string, unknown>);
  }

  set(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) this.data.set(k, structuredClone(v));
    return Promise.resolve();
  }

  remove(keys: string | string[]): Promise<void> {
    for (const k of [keys].flat()) this.data.delete(k);
    return Promise.resolve();
  }
}

const URL_A = 'https://cdn.example/photos/a.jpg?size=large';
const signals: ImageSignals = { c2pa: null, iptc: null, detector: { score: 0.97 } };
const DAY = 24 * 60 * 60 * 1000;

function setup(start = 1_800_000_000_000) {
  const store = new FakeStore();
  const clock = { now: start };
  const cache = new VerdictCache(store, () => clock.now);
  return { store, clock, cache };
}

describe('VerdictCache', () => {
  it('REQ-F-011: the key is a SHA-256 hash of the image URL', async () => {
    const key = await cacheKey('abc');
    // SHA-256("abc") from FIPS 180-2.
    expect(key).toBe('v1:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await cacheKey(URL_A)).not.toBe(await cacheKey(`${URL_A}&x=1`));
  });

  it('REQ-PRV-004: image URLs are not stored in readable form', async () => {
    const { store, cache } = setup();
    await cache.set(URL_A, signals);
    expect(JSON.stringify([...store.data.entries()])).not.toContain('cdn.example');
  });

  it('REQ-F-011: a cached image is reused within 7 days', async () => {
    const { clock, cache } = setup();
    await cache.set(URL_A, signals);
    expect(await cache.get(URL_A)).toEqual(signals);
    clock.now += CACHE_TTL_MS - 1;
    expect(await cache.get(URL_A)).toEqual(signals);
    expect(await cache.get('https://cdn.example/other.jpg')).toBeNull();
  });

  it('REQ-F-011: an entry expires after 7 days and is removed', async () => {
    const { store, clock, cache } = setup();
    await cache.set(URL_A, signals);
    clock.now += 7 * DAY;
    expect(await cache.get(URL_A)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('REQ-F-011: corrupt entries and entries from the future are ignored and removed', async () => {
    const { store, clock, cache } = setup();
    const key = await cacheKey(URL_A);
    for (const bad of [
      'text',
      { t: 'now', s: signals },
      { t: clock.now, s: { detector: { score: 9 } } },
    ]) {
      store.data.set(key, bad);
      expect(await cache.get(URL_A)).toBeNull();
      expect(store.data.has(key)).toBe(false);
    }
    store.data.set(key, { t: clock.now + DAY, s: signals });
    expect(await cache.get(URL_A)).toBeNull();
  });

  it('REQ-F-011: prune removes expired entries and keeps fresh ones and other data', async () => {
    const { store, clock, cache } = setup();
    await cache.set('https://x.example/old.jpg', signals);
    clock.now += 8 * DAY;
    await cache.set('https://x.example/new.jpg', signals);
    store.data.set('settings', { enabled: true });
    expect(await cache.prune()).toBe(1);
    expect(await cache.get('https://x.example/new.jpg')).toEqual(signals);
    expect(store.data.has('settings')).toBe(true);
    expect(store.data.size).toBe(2);
  });

  it('REQ-F-011: prune drops the oldest entries beyond the size limit', async () => {
    const { store, clock, cache } = setup();
    for (let i = 0; i < MAX_ENTRIES + 3; i++) {
      store.data.set(`v1:${i.toString(16).padStart(64, '0')}`, { t: clock.now + i, s: signals });
    }
    clock.now += MAX_ENTRIES + 10;
    expect(await cache.prune()).toBe(3);
    expect(store.data.size).toBe(MAX_ENTRIES);
    expect(store.data.has(`v1:${'0'.repeat(64)}`)).toBe(false);
  });

  it('REQ-F-011: clearCache removes all verdicts but not the settings', async () => {
    const { store, cache } = setup();
    await cache.set(URL_A, signals);
    await cache.set('https://cdn.example/b.jpg', signals);
    store.data.set('settings', { enabled: false });
    expect(await cache.clear()).toBe(2);
    expect(await cache.get(URL_A)).toBeNull();
    expect([...store.data.keys()]).toEqual(['settings']);
    expect(await cache.clear()).toBe(0);
  });
});
