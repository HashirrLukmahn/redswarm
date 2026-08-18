/**
 * Bounded concurrency primitives (spec §6).
 * Independent semaphores per resource class; each exposes run<T>().
 */

export class Semaphore {
  private active = 0;
  private peak = 0;
  private readonly queue: Array<() => void> = [];

  constructor(public readonly limit: number) {
    if (limit < 1) throw new Error("Semaphore limit must be >= 1");
  }

  get activeCount(): number {
    return this.active;
  }

  get peakCount(): number {
    return this.peak;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      this.peak = Math.max(this.peak, this.active);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        this.peak = Math.max(this.peak, this.active);
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

export interface ConcurrencyLimits {
  model: number;
  browser: number;
  api: number;
  verification: number;
  research: number;
}

/** Groups the independent semaphores used across the swarm (spec §6). */
export class ConcurrencyManager {
  readonly model: Semaphore;
  readonly browser: Semaphore;
  readonly api: Semaphore;
  readonly verification: Semaphore;
  readonly research: Semaphore;

  constructor(limits: ConcurrencyLimits) {
    this.model = new Semaphore(limits.model);
    this.browser = new Semaphore(Math.max(1, limits.browser));
    this.api = new Semaphore(limits.api);
    this.verification = new Semaphore(limits.verification);
    this.research = new Semaphore(limits.research);
  }
}
