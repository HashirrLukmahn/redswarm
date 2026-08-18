import { describe, it, expect } from "vitest";
import { Semaphore } from "../security/orchestration/concurrency.js";

describe("semaphore concurrency correctness (spec §64)", () => {
  it("never exceeds the configured limit with 100 tasks and limit 7", async () => {
    const sem = new Semaphore(7);
    let active = 0;
    let observedMax = 0;
    const tasks = Array.from({ length: 100 }, () =>
      sem.run(async () => {
        active++;
        observedMax = Math.max(observedMax, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
      })
    );
    await Promise.all(tasks);
    expect(observedMax).toBeLessThanOrEqual(7);
    expect(observedMax).toBeGreaterThan(1);
    expect(sem.peakCount).toBeLessThanOrEqual(7);
  });

  it("runs all tasks to completion", async () => {
    const sem = new Semaphore(3);
    let done = 0;
    await Promise.all(Array.from({ length: 50 }, () => sem.run(async () => { done++; })));
    expect(done).toBe(50);
  });
});
