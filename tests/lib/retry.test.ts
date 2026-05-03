import { describe, expect, test, vi } from "vitest";
import { withRetry } from "../../convex/lib/retry";

describe("withRetry", () => {
  test("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on transient 503 then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("does not retry on 400", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toEqual({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("gives up after maxRetries", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 500 });
    await expect(
      withRetry(fn, { baseDelayMs: 1, maxRetries: 2 })
    ).rejects.toEqual({ status: 500 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("delays differ between concurrent retries (jitter)", async () => {
    const sleeps: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (cb: any, ms?: number) => {
        sleeps.push(ms ?? 0);
        return originalSetTimeout(cb, 0);
      }
    );
    const fnA = vi
      .fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue("ok");
    const fnB = vi
      .fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue("ok");
    await Promise.all([
      withRetry(fnA, { baseDelayMs: 1000 }),
      withRetry(fnB, { baseDelayMs: 1000 }),
    ]);
    vi.restoreAllMocks();
    const uniqueSleeps = new Set(sleeps);
    expect(uniqueSleeps.size).toBeGreaterThan(1);
  });
});
