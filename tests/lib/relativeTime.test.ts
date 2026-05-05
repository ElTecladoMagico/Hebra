import { describe, expect, test } from "vitest";
import { formatRelativeTime } from "../../lib/relativeTime";

const NOW = Date.UTC(2026, 4, 4, 12, 0, 0); // 2026-05-04 12:00 UTC, deterministic.

describe("formatRelativeTime", () => {
  test("collapses sub-minute deltas to 'ahora'", () => {
    expect(formatRelativeTime(NOW - 5_000, NOW)).toBe("ahora");
    expect(formatRelativeTime(NOW + 5_000, NOW)).toBe("ahora");
  });

  test("formats minutes under one hour", () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("hace 5min");
    expect(formatRelativeTime(NOW - 59 * 60_000, NOW)).toBe("hace 59min");
  });

  test("formats hours under one day", () => {
    expect(formatRelativeTime(NOW - 2 * 60 * 60_000, NOW)).toBe("hace 2h");
    expect(formatRelativeTime(NOW - 23 * 60 * 60_000, NOW)).toBe("hace 23h");
  });

  test("formats days under one week", () => {
    expect(formatRelativeTime(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe("hace 3d");
  });

  test("formats weeks then falls back to absolute date", () => {
    expect(formatRelativeTime(NOW - 2 * 7 * 24 * 60 * 60_000, NOW)).toBe("hace 2 sem");
    // 90 days ago is past 8 weeks → absolute fallback "DD mmm".
    const ninetyDaysAgo = NOW - 90 * 24 * 60 * 60_000;
    const d = new Date(ninetyDaysAgo);
    const expected = `${d.getUTCDate()} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getUTCMonth()]}`;
    expect(formatRelativeTime(ninetyDaysAgo, NOW)).toBe(expected);
  });
});
