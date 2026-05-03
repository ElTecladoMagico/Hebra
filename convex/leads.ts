import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const insert = internalMutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    postId: v.id("redditPosts"),
    matchedKeyword: v.string(),
    score: v.number(),
    tier: v.union(v.literal("hot"), v.literal("warm"), v.literal("cold")),
    reasoning: v.string(),
  },
  handler: async (ctx, args) => {
    // Dedupe: don't insert if (postId, userId) pair already exists.
    const existing = await ctx.db
      .query("leads")
      .withIndex("by_post_user", (q) =>
        q.eq("postId", args.postId).eq("userId", args.userId),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("leads", {
      ...args,
      read: false,
      archived: false,
      scoredAt: Date.now(),
    });
  },
});
