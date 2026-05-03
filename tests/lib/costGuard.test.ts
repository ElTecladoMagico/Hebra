import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

describe("usage.totalCostToday", () => {
  test("returns 0 when no usage rows", async () => {
    const t = convexTest(schema);
    const total = await t.query(internal.usage.totalCostToday, {
      dateKey: "2026-04-30",
    });
    expect(total).toBe(0);
  });

  test("sums geminiCostCents across users", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const u1 = await ctx.db.insert("users", {
        clerkUserId: "u1", email: "u1@test.com", tier: "free",
        languagePreference: "es-neutral", createdAt: 0, lastActiveAt: 0,
      });
      const u2 = await ctx.db.insert("users", {
        clerkUserId: "u2", email: "u2@test.com", tier: "free",
        languagePreference: "es-neutral", createdAt: 0, lastActiveAt: 0,
      });
      await ctx.db.insert("usageDaily", {
        userId: u1, dateKey: "2026-04-30",
        scoringCalls: 5, replyGenerations: 0, keywordGenerations: 0,
        geminiCostCents: 150,
      });
      await ctx.db.insert("usageDaily", {
        userId: u2, dateKey: "2026-04-30",
        scoringCalls: 10, replyGenerations: 0, keywordGenerations: 0,
        geminiCostCents: 250,
      });
    });
    const total = await t.query(internal.usage.totalCostToday, {
      dateKey: "2026-04-30",
    });
    expect(total).toBe(400);
  });

  test("scoped to specified dateKey", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const u1 = await ctx.db.insert("users", {
        clerkUserId: "u1", email: "u1@test.com", tier: "free",
        languagePreference: "es-neutral", createdAt: 0, lastActiveAt: 0,
      });
      await ctx.db.insert("usageDaily", {
        userId: u1, dateKey: "2026-04-30",
        scoringCalls: 1, replyGenerations: 0, keywordGenerations: 0,
        geminiCostCents: 100,
      });
      await ctx.db.insert("usageDaily", {
        userId: u1, dateKey: "2026-04-29",
        scoringCalls: 1, replyGenerations: 0, keywordGenerations: 0,
        geminiCostCents: 200,
      });
    });
    const today = await t.query(internal.usage.totalCostToday, { dateKey: "2026-04-30" });
    const yesterday = await t.query(internal.usage.totalCostToday, { dateKey: "2026-04-29" });
    expect(today).toBe(100);
    expect(yesterday).toBe(200);
  });
});

describe("usage.incrementScoring", () => {
  test("creates row on first increment", async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkUserId: "u1", email: "u1@test.com", tier: "free",
        languagePreference: "es-neutral", createdAt: 0, lastActiveAt: 0,
      })
    );
    await t.mutation(internal.usage.incrementScoring, {
      userId,
      dateKey: "2026-04-30",
      costCents: 75,
    });
    const total = await t.query(internal.usage.totalCostToday, { dateKey: "2026-04-30" });
    expect(total).toBe(75);
  });

  test("accumulates across multiple increments", async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkUserId: "u1", email: "u1@test.com", tier: "free",
        languagePreference: "es-neutral", createdAt: 0, lastActiveAt: 0,
      })
    );
    await t.mutation(internal.usage.incrementScoring, {
      userId, dateKey: "2026-04-30", costCents: 30,
    });
    await t.mutation(internal.usage.incrementScoring, {
      userId, dateKey: "2026-04-30", costCents: 45,
    });
    const total = await t.query(internal.usage.totalCostToday, { dateKey: "2026-04-30" });
    expect(total).toBe(75);
  });
});
