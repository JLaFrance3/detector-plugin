// Timing log for the performance check (TASK-023, REQ-NF-001). It exists only where a
// development build installs it; in production builds `timed` just calls the function.

export interface PerfSummary {
  count: number;
  max: number;
  median: number;
  total: number;
}

export interface PerfLog {
  record(name: string, ms: number): void;
  summary(): Record<string, PerfSummary>;
}

const GLOBAL = '__aidPerf';
const MAX_SAMPLES = 5000;

type WithPerf = typeof globalThis & { [GLOBAL]?: PerfLog };

export function perfLog(): PerfLog | undefined {
  return (globalThis as WithPerf)[GLOBAL];
}

/** Creates the log on `globalThis` (per JavaScript world) if it is not there yet. */
export function installPerfLog(): PerfLog {
  const existing = perfLog();
  if (existing) return existing;
  const samples = new Map<string, number[]>();
  const log: PerfLog = {
    record(name, ms) {
      let list = samples.get(name);
      if (!list) samples.set(name, (list = []));
      if (list.length < MAX_SAMPLES) list.push(ms);
    },
    summary() {
      const out: Record<string, PerfSummary> = {};
      for (const [name, list] of samples) {
        const sorted = [...list].sort((a, b) => a - b);
        out[name] = {
          count: sorted.length,
          max: sorted.at(-1) ?? 0,
          median: sorted[Math.floor(sorted.length / 2)] ?? 0,
          total: sorted.reduce((sum, value) => sum + value, 0),
        };
      }
      return out;
    },
  };
  (globalThis as WithPerf)[GLOBAL] = log;
  return log;
}

/** Runs `fn`, recording how long it took when a log is installed. */
export function timed<T>(name: string, fn: () => T): T {
  const log = perfLog();
  if (!log) return fn();
  const started = performance.now();
  try {
    return fn();
  } finally {
    log.record(name, performance.now() - started);
  }
}
