import { GlobalQuota, KeyedRateLimiter } from './rate-limit.js';

describe('KeyedRateLimiter', () => {
  it('REQ-SEC-005: allows the limit per window for each key separately', () => {
    const clock = { now: 0 };
    const limiter = new KeyedRateLimiter(10, 60_000, () => clock.now);
    for (let i = 0; i < 10; i++) expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    expect(limiter.take('b')).toBe(true);
  });

  it('REQ-SEC-005: the window slides', () => {
    const clock = { now: 0 };
    const limiter = new KeyedRateLimiter(2, 60_000, () => clock.now);
    expect(limiter.take('a')).toBe(true);
    clock.now = 30_000;
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    clock.now = 60_001; // the first event has left the window
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
  });

  it('REQ-PRV-002: idle keys (client addresses) are forgotten', () => {
    const clock = { now: 0 };
    const limiter = new KeyedRateLimiter(10, 60_000, () => clock.now);
    limiter.take('203.0.113.1');
    limiter.take('203.0.113.2');
    expect(limiter.size).toBe(2);
    clock.now = 120_000;
    limiter.sweep();
    expect(limiter.size).toBe(0);
  });

  it('REQ-SEC-005: a flood of distinct keys cannot grow memory without bound', () => {
    const clock = { now: 0 };
    const limiter = new KeyedRateLimiter(10, 60_000, () => clock.now, 100);
    for (let i = 0; i < 100; i++) expect(limiter.take(`key-${i}`)).toBe(true);
    expect(limiter.take('one-more')).toBe(false); // fails closed while full
    expect(limiter.size).toBe(100);
    clock.now = 61_000;
    expect(limiter.take('one-more')).toBe(true); // idle keys were swept
    expect(limiter.size).toBe(1);
  });
});

describe('GlobalQuota', () => {
  it('REQ-NF-005: enforces the minimum interval between provider calls', () => {
    const clock = { now: Date.UTC(2026, 0, 1) };
    const quota = new GlobalQuota(100, 1000, () => clock.now);
    expect(quota.take()).toBe('ok');
    clock.now += 999;
    expect(quota.take()).toBe('busy');
    clock.now += 1;
    expect(quota.take()).toBe('ok');
  });

  it('REQ-NF-005: enforces the daily cap and resets at midnight UTC', () => {
    const clock = { now: Date.UTC(2026, 0, 1, 23, 0, 0) };
    const quota = new GlobalQuota(2, 0, () => clock.now);
    expect(quota.take()).toBe('ok');
    expect(quota.take()).toBe('ok');
    expect(quota.take()).toBe('exhausted');
    expect(quota.remainingToday).toBe(0);
    clock.now = Date.UTC(2026, 0, 2, 0, 0, 1);
    expect(quota.take()).toBe('ok');
    expect(quota.remainingToday).toBe(1);
  });

  it('REQ-NF-005: a rejected call does not use up the quota', () => {
    const clock = { now: Date.UTC(2026, 0, 1) };
    const quota = new GlobalQuota(5, 1000, () => clock.now);
    quota.take();
    for (let i = 0; i < 10; i++) expect(quota.take()).toBe('busy');
    expect(quota.remainingToday).toBe(4);
  });
});
