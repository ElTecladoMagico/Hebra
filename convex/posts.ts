import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { detectDialect } from "./lib/dialect";

export const upsertBatch = internalMutation({
  args: {
    posts: v.array(
      v.object({
        redditId: v.string(),
        subreddit: v.string(),
        title: v.string(),
        body: v.string(),
        author: v.string(),
        url: v.string(),
        permalink: v.string(),
        postedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const newIds: Id<"redditPosts">[] = [];
    for (const p of args.posts) {
      const existing = await ctx.db
        .query("redditPosts")
        .withIndex("by_redditId", (q) => q.eq("redditId", p.redditId))
        .unique();
      if (existing) continue;
      const id = await ctx.db.insert("redditPosts", {
        ...p,
        fetchedAt: Date.now(),
        detectedDialect: detectDialect(`${p.title}\n${p.body}`),
        language: "es",
      });
      newIds.push(id);
    }
    return newIds;
  },
});

export const get = internalQuery({
  args: { postId: v.id("redditPosts") },
  handler: async (ctx, args) => ctx.db.get(args.postId),
});
