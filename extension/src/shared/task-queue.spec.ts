import { TaskQueue } from './task-queue';

/** A job whose completion the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('TaskQueue', () => {
  it('REQ-F-006: runs at most 2 jobs at a time and queues the rest', async () => {
    const queue = new TaskQueue(2);
    const jobs = Array.from({ length: 6 }, () => deferred<number>());
    let running = 0;
    let peak = 0;
    const started: number[] = [];

    const results = jobs.map((job, index) =>
      queue.run(async () => {
        started.push(index);
        running++;
        peak = Math.max(peak, running);
        const value = await job.promise;
        running--;
        return value;
      }),
    );

    await tick();
    expect(started).toEqual([0, 1]);
    expect(queue.active).toBe(2);
    expect(queue.pending).toBe(4);

    jobs[0]?.resolve(10);
    await tick();
    expect(started).toEqual([0, 1, 2]);
    expect(queue.active).toBe(2);

    jobs.forEach((job, index) => job.resolve(index * 10));
    expect(await Promise.all(results)).toEqual([10, 10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
    expect(queue.active).toBe(0);
    expect(queue.pending).toBe(0);
  });

  it('REQ-F-006: a failing job frees its slot and does not stop the queue', async () => {
    const queue = new TaskQueue(1);
    const failing = queue.run(() => Promise.reject(new Error('inference failed')));
    const next = queue.run(() => Promise.resolve('ok'));
    await expect(failing).rejects.toThrow('inference failed');
    await expect(next).resolves.toBe('ok');
    expect(queue.active).toBe(0);
  });

  it('REQ-F-006: jobs start in the order they were queued', async () => {
    const queue = new TaskQueue(1);
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        queue.run(async () => {
          await tick();
          order.push(n);
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('REQ-F-006: rejects an invalid concurrency', () => {
    expect(() => new TaskQueue(0)).toThrow(RangeError);
    expect(() => new TaskQueue(1.5)).toThrow(RangeError);
  });
});
