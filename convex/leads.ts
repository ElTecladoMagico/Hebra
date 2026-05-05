import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getCurrentUser, loadOwnedLead, requireOwnedLead } from "./lib/auth";
import { sortLeadsForFeed } from "./lib/leadOrdering";

export const getInternal = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => ctx.db.get(args.leadId),
});

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
      .withIndex("by_post_user", (q) => q.eq("postId", args.postId).eq("userId", args.userId))
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

/**
 * Get the current user's leads, optionally filtered by tier.
 * Sorted by tier (hot, warm, cold) then `scoredAt` descending — hottest first.
 *
 * Auth-gated via `getCurrentUser`; returns `[]` when unauthenticated
 * or when the identity has no matching user row.
 */
export const feedByUser = query({
  args: {
    tierFilter: v.optional(v.union(v.literal("hot"), v.literal("warm"), v.literal("cold"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const userId = user._id;
    const leads = args.tierFilter
      ? await ctx.db
          .query("leads")
          .withIndex("by_user_tier", (q2) => q2.eq("userId", userId).eq("tier", args.tierFilter!))
          .collect()
      : await ctx.db
          .query("leads")
          .withIndex("by_user_tier", (q2) => q2.eq("userId", userId))
          .collect();

    // Hide archived from the feed. A future "Archive" view would invoke a
    // separate query (or accept an `includeArchived` arg) — out of scope here.
    return sortLeadsForFeed(leads.filter((l) => !l.archived));
  },
});

/**
 * Get a single lead by id, with the joined post for display.
 * Auth-checked: returns `null` unless the lead belongs to the calling user.
 */
export const getById = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const owned = await loadOwnedLead(ctx, args.leadId);
    if (!owned) return null;
    const post = await ctx.db.get(owned.lead.postId);
    return { ...owned.lead, post };
  },
});

/**
 * Mark a lead as read. Idempotent: no-op if already read.
 * Throws when unauthenticated or when the lead is not owned by the caller.
 */
export const markRead = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const { lead } = await requireOwnedLead(ctx, args.leadId);
    if (!lead.read) await ctx.db.patch(args.leadId, { read: true });
  },
});

/**
 * Toggle the archived flag on a lead.
 * Throws when unauthenticated or when the lead is not owned by the caller.
 */
export const setArchived = mutation({
  args: { leadId: v.id("leads"), archived: v.boolean() },
  handler: async (ctx, args) => {
    await requireOwnedLead(ctx, args.leadId);
    await ctx.db.patch(args.leadId, { archived: args.archived });
  },
});
