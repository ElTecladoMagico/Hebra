import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

describe("campaigns.listActiveStale", () => {
  test("returns active campaigns with null lastPolledAt", async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkUserId: "u1",
        email: "u1@test.com",
        tier: "free",
        languagePreference: "es-neutral",
        createdAt: 0,
        lastActiveAt: 0,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("campaigns", {
        userId,
        name: "active never polled",
        offering: "x",
        keywords: ["k"],
        subredditSlugs: ["españa"],
        replySettings: {
          tone: "friendly",
          length: "medium",
          style: "value-first",
          includeCTA: false,
          personalize: true,
          replyDialect: "es-neutral",
        },
        status: "active",
        createdAt: 0,
      }),
    );
    const result = await t.query(internal.campaigns.listActiveStale, {
      staleBefore: Date.now(),
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("active never polled");
  });

  test("filters out fresh campaigns (lastPolledAt newer than staleBefore)", async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkUserId: "u1",
        email: "u1@test.com",
        tier: "free",
        languagePreference: "es-neutral",
        createdAt: 0,
        lastActiveAt: 0,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("campaigns", {
        userId,
        name: "fresh",
        offering: "x",
        keywords: ["k"],
        subredditSlugs: ["españa"],
        replySettings: {
          tone: "friendly",
          length: "medium",
          style: "value-first",
          includeCTA: false,
          personalize: true,
          replyDialect: "es-neutral",
        },
        status: "active",
        lastPolledAt: Date.now(),
        createdAt: 0,
      }),
    );
    const result = await t.query(internal.campaigns.listActiveStale, {
      staleBefore: Date.now() - 60_000, // 1min ago
    });
    expect(result).toHaveLength(0);
  });

  test("excludes paused campaigns", async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkUserId: "u1",
        email: "u1@test.com",
        tier: "free",
        languagePreference: "es-neutral",
        createdAt: 0,
        lastActiveAt: 0,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("campaigns", {
        userId,
        name: "paused",
        offering: "x",
        keywords: ["k"],
        subredditSlugs: ["españa"],
        replySettings: {
          tone: "friendly",
          length: "medium",
          style: "value-first",
          includeCTA: false,
          personalize: true,
          replyDialect: "es-neutral",
        },
        status: "paused",
        createdAt: 0,
      }),
    );
    const result = await t.query(internal.campaigns.listActiveStale, {
      staleBefore: Date.now(),
    });
    expect(result).toHaveLength(0);
  });
});
