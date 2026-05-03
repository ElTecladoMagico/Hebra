import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

async function setupUserAndPost(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "u1",
      email: "u1@test.com",
      tier: "free",
      languagePreference: "es-neutral",
      createdAt: 0,
      lastActiveAt: 0,
    });
    const campaignId = await ctx.db.insert("campaigns", {
      userId,
      name: "Test campaign",
      offering: "freelance dev",
      keywords: ["programador"],
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
    });
    const postId = await ctx.db.insert("redditPosts", {
      redditId: "t3_xxx",
      subreddit: "españa",
      title: "post",
      body: "body",
      author: "x",
      url: "u",
      permalink: "p",
      postedAt: 0,
      fetchedAt: 0,
      language: "es",
    });
    return { userId, campaignId, postId };
  });
}

describe("leads.insert", () => {
  test("creates a lead row", async () => {
    const t = convexTest(schema);
    const { userId, campaignId, postId } = await setupUserAndPost(t);
    const id = await t.mutation(internal.leads.insert, {
      userId,
      campaignId,
      postId,
      matchedKeyword: "programador",
      score: 92,
      tier: "hot",
      reasoning: "explícito",
    });
    expect(id).toBeDefined();
    const lead = await t.run(async (ctx) => ctx.db.get(id));
    expect(lead?.tier).toBe("hot");
    expect(lead?.read).toBe(false);
  });

  test("dedupes by (postId, userId) pair", async () => {
    const t = convexTest(schema);
    const { userId, campaignId, postId } = await setupUserAndPost(t);
    const first = await t.mutation(internal.leads.insert, {
      userId, campaignId, postId,
      matchedKeyword: "programador",
      score: 92, tier: "hot", reasoning: "x",
    });
    const second = await t.mutation(internal.leads.insert, {
      userId, campaignId, postId,
      matchedKeyword: "programador",
      score: 50, tier: "cold", reasoning: "y",
    });
    expect(second).toBe(first); // same id returned
    const all = await t.run(async (ctx) =>
      ctx.db
        .query("leads")
        .withIndex("by_post_user", (q) =>
          q.eq("postId", postId).eq("userId", userId),
        )
        .collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].score).toBe(92); // first write wins
  });
});
