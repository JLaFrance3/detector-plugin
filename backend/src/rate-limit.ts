// In-memory rate limits (REQ-SEC-005, REQ-NF-005). Nothing is written to disk: client IPs and
// install tokens exist only as map keys in memory and are forgotten when their window ends
// (REQ-PRV-002). Limits reset when the process restarts, which is acceptable for one small
// instance; the daily cap is deliberately conservative.

/** At most `limit` events per `windowMs` for each key (sliding window). */
export class KeyedRateLimiter {
  private readonly events = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
    /** Upper bound on tracked keys, so a flood of distinct keys cannot exhaust memory. */
    private readonly maxKeys = 10_000,
  ) {}

  /** Records an event for the key and returns true, or returns false when over the limit. */
  take(key: string): boolean {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const recent = (this.events.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.limit) {
      this.events.set(key, recent);
      return false;
    }
    if (!this.events.has(key) && this.events.size >= this.maxKeys) this.sweep(cutoff);
    // Still full after dropping idle keys: fail closed rather than grow without bound.
    if (!this.events.has(key) && this.events.size >= this.maxKeys) return false;
    recent.push(now);
    this.events.set(key, recent);
    return true;
  }

  /** Forgets keys with no events inside the window. */
  sweep(cutoff = this.now() - this.windowMs): void {
    for (const [key, times] of this.events) {
      if (!times.some((t) => t > cutoff)) this.events.delete(key);
    }
  }

  get size(): number {
    return this.events.size;
  }
}

/**
 * Global limits that protect the provider quota: a minimum gap between calls (1 request per
 * second) and a daily cap that resets at midnight UTC.
 */
export class GlobalQuota {
  private lastCall = Number.NEGATIVE_INFINITY;
  private day = '';
  private usedToday = 0;

  constructor(
    readonly dailyCap: number,
    readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** 'ok' reserves one call. 'busy' = too soon after the last call; 'exhausted' = daily cap. */
  take(): 'ok' | 'busy' | 'exhausted' {
    const now = this.now();
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.usedToday = 0;
    }
    if (this.usedToday >= this.dailyCap) return 'exhausted';
    if (now - this.lastCall < this.minIntervalMs) return 'busy';
    this.lastCall = now;
    this.usedToday++;
    return 'ok';
  }

  get remainingToday(): number {
    return Math.max(0, this.dailyCap - this.usedToday);
  }
}
