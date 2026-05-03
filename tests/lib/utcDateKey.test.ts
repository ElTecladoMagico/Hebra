import { describe, expect, test } from "vitest";
import { utcDateKey } from "../../convex/usage";

describe("utcDateKey", () => {
  test("formats epoch ms as YYYY-MM-DD UTC", () => {
    // 2026-04-30 18:30:00 UTC
    const ts = Date.UTC(2026, 3, 30, 18, 30, 0);
    expect(utcDateKey(ts)).toBe("2026-04-30");
  });

  test("zero-pads single-digit month and day", () => {
    const ts = Date.UTC(2026, 0, 5, 0, 0, 0);
    expect(utcDateKey(ts)).toBe("2026-01-05");
  });

  test("uses UTC, not local timezone", () => {
    // 2026-04-30 23:30 UTC → still April 30 in UTC
    const ts = Date.UTC(2026, 3, 30, 23, 30, 0);
    expect(utcDateKey(ts)).toBe("2026-04-30");
  });
});
