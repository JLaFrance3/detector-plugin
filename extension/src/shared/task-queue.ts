// Runs async jobs with a fixed concurrency limit; the rest wait in order (REQ-F-006: at most
// 2 images are scored at a time).

export class TaskQueue {
  private readonly waiting: (() => void)[] = [];
  private running = 0;

  constructor(readonly concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError('concurrency must be a positive integer');
    }
  }

  /** Jobs currently running. */
  get active(): number {
    return this.running;
  }

  /** Jobs waiting for a free slot. */
  get pending(): number {
    return this.waiting.length;
  }

  /** Runs `job` when a slot is free and resolves or rejects with its outcome. */
  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      // The finishing job hands its slot straight to us, so `running` is already counted.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running++;
    }
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }
}
