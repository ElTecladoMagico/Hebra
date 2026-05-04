import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { sortLeadsForFeed } from "../../convex/lib/leadOrdering";

/**
 * Authenticated paths for `feedByUser` / `getById` / `markRead` / `setArchived`
 * cannot be exercised end-to-end via convex-test today — `withIdentity()` does
 * not propagate to `ctx.auth.getUserIdentity()` (issue #50). We therefore
 * cover:
 *   - the pure ordering helper (`sortLeadsForFeed`) with deterministic inputs
 *   - the unauthenticated paths of the queries/mutations
 * Authenticated ownership/round-trip behaviour is integration-only.
 */

// ---------- helpers ----------

// Build a Doc<"leads">-shaped object for helper tests. We don't need real ids
// since the helper only inspects `tier` and `scoredAt`.
function fakeLead(
  partial: Partial<Doc<"leads">> & {
    tier: Doc<"leads">["tier"];
    scoredAt: number;
  },
): Doc<"leads"> {
  return {
    _id: ("lead_" + Math.random().toString(36).slice(2)) as Id<"leads">,
    _creationTime: 0,
    userId: "u1" as unknown as Id<"users">,
    campaignId: "c1" as unknown as Id<"campaigns">,
    postId: "p1" as unknown as Id<"redditPosts">,
    matchedKeyword: "kw",
    score: 50,
    reasoning: "",
    read: false,
    archived: false,
    ...partial,
  };
}

async function seedLead(
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{
    tier: Doc<"leads">["tier"];
    scoredAt: number;
    score: number;
    archived: boolean;
    read: boolean;
  }> = {},
) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "u_seed",
      email: "seed@test.com",
      tier: "free",
      languagePreference: "es-neutral",
      createdAt: 0,
      lastActiveAt: 0,
    });
    const campaignId = await ctx.db.insert("campaigns", {
      userId,
      name: "c",
      offering: "o",
      keywords: ["k"],
      subredditSlugs: ["s"],
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
    });
    const postId = await ctx.db.insert("redditPosts", {
      redditId: "t3_seed",
      subreddit: "s",
      title: "t",
      body: "b",
      author: "a",
      url: "u",
      permalink: "p",
      postedAt: 0,
      fetchedAt: 0,
      language: "es",
    });
    const leadId = await ctx.db.insert("leads", {
      userId,
      campaignId,
      postId,
      matchedKeyword: "k",
      score: overrides.score ?? 80,
      tier: overrides.tier ?? "hot",
      reasoning: "r",
      read: overrides.read ?? false,
      archived: overrides.archived ?? false,
      scoredAt: overrides.scoredAt ?? 0,
    });
    return { userId, campaignId, postId, leadId };
  });
}

// ---------- helper: ordering ----------

describe("sortLeadsForFeed", () => {
  test("returns empty array unchanged", () => {
    expect(sortLeadsForFeed([])).toEqual([]);
  });

  test("orders by tier first (hot < warm < cold), regardless of scoredAt", () => {
    const cold = fakeLead({ tier: "cold", scoredAt: 1000 });
    const warm = fakeLead({ tier: "warm", scoredAt: 999 });
    const hot = fakeLead({ tier: "hot", scoredAt: 1 });
    const out = sortLeadsForFeed([cold, warm, hot]);
    expect(out.map((l) => l.tier)).toEqual(["hot", "warm", "cold"]);
  });

  test("breaks ties within tier by scoredAt descending (newest first)", () => {
    const a = fakeLead({ tier: "hot", scoredAt: 100 });
    const b = fakeLead({ tier: "hot", scoredAt: 300 });
    const c = fakeLead({ tier: "hot", scoredAt: 200 });
    const out = sortLeadsForFeed([a, b, c]);
    expect(out.map((l) => l.scoredAt)).toEqual([300, 200, 100]);
  });

  test("handles a mixed feed: hot/warm/cold each ordered by scoredAt desc", () => {
    const leads = [
      fakeLead({ tier: "warm", scoredAt: 5 }),
      fakeLead({ tier: "cold", scoredAt: 50 }),
      fakeLead({ tier: "hot", scoredAt: 1 }),
      fakeLead({ tier: "warm", scoredAt: 50 }),
      fakeLead({ tier: "hot", scoredAt: 10 }),
      fakeLead({ tier: "cold", scoredAt: 5 }),
    ];
    const out = sortLeadsForFeed(leads);
    expect(out.map((l) => `${l.tier}:${l.scoredAt}`)).toEqual([
      "hot:10",
      "hot:1",
      "warm:50",
      "warm:5",
      "cold:50",
      "cold:5",
    ]);
  });

  test("does not mutate the input array", () => {
    const a = fakeLead({ tier: "cold", scoredAt: 1 });
    const b = fakeLead({ tier: "hot", scoredAt: 2 });
    const input = [a, b];
    sortLeadsForFeed(input);
    expect(input[0]).toBe(a);
    expect(input[1]).toBe(b);
  });
});

// ---------- public queries: unauthenticated paths ----------

describe("leads.feedByUser (unauthenticated)", () => {
  test("returns [] when no identity is present", async () => {
    const t = convexTest(schema);
    // Seed something so we'd notice if it leaked.
    await seedLead(t, { tier: "hot", scoredAt: 1 });
    const out = await t.query(api.leads.feedByUser, {});
    expect(out).toEqual([]);
  });

  test("returns [] when no identity is present even with a tier filter", async () => {
    const t = convexTest(schema);
    await seedLead(t, { tier: "warm", scoredAt: 1 });
    const out = await t.query(api.leads.feedByUser, { tierFilter: "warm" });
    expect(out).toEqual([]);
  });
});

describe("leads.getById (unauthenticated)", () => {
  test("returns null when no identity is present", async () => {
    const t = convexTest(schema);
    const { leadId } = await seedLead(t);
    const out = await t.query(api.leads.getById, { leadId });
    expect(out).toBeNull();
  });
});

describe("leads.markRead (unauthenticated)", () => {
  test("throws when no identity is present", async () => {
    const t = convexTest(schema);
    const { leadId } = await seedLead(t);
    await expect(
      t.mutation(api.leads.markRead, { leadId }),
    ).rejects.toThrow(/Unauthenticated/);
  });

  test("does not flip the read flag when unauthenticated", async () => {
    const t = convexTest(schema);
    const { leadId } = await seedLead(t, { read: false });
    await expect(
      t.mutation(api.leads.markRead, { leadId }),
    ).rejects.toThrow();
    const after = await t.run(async (ctx) => ctx.db.get(leadId));
    expect(after?.read).toBe(false);
  });
});

describe("leads.setArchived (unauthenticated)", () => {
  test("throws when no identity is present", async () => {
    const t = convexTest(schema);
    const { leadId } = await seedLead(t);
    await expect(
      t.mutation(api.leads.setArchived, { leadId, archived: true }),
    ).rejects.toThrow(/Unauthenticated/);
  });

  test("does not change archived when unauthenticated", async () => {
    const t = convexTest(schema);
    const { leadId } = await seedLead(t, { archived: false });
    await expect(
      t.mutation(api.leads.setArchived, { leadId, archived: true }),
    ).rejects.toThrow();
    const after = await t.run(async (ctx) => ctx.db.get(leadId));
    expect(after?.archived).toBe(false);
  });
});
