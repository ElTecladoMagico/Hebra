import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { loadOwnedLead, requireOwnedReply } from "./lib/auth";

export const insertInternal = internalMutation({
  args: {
    leadId: v.id("leads"),
    userId: v.id("users"),
    draftText: v.string(),
    tweaks: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("replies", {
      leadId: args.leadId,
      userId: args.userId,
      draftText: args.draftText,
      status: "draft",
      tweaks: args.tweaks,
      generatedAt: Date.now(),
    });
  },
});

/**
 * Latest reply for the given lead, or `null` when the lead is missing,
 * not owned by the caller, or the caller is unauthenticated. Ownership
 * is verified through the lead first so callers can't probe replies for
 * leads they don't own.
 */
export const getByLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const owned = await loadOwnedLead(ctx, args.leadId);
    if (!owned) return null;
    return await ctx.db
      .query("replies")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .first();
  },
});

/**
 * Mark a reply as copied. Throws when unauthenticated, when the reply
 * doesn't exist, or when the reply isn't owned by the caller.
 */
export const markCopied = mutation({
  args: { replyId: v.id("replies") },
  handler: async (ctx, args) => {
    await requireOwnedReply(ctx, args.replyId);
    await ctx.db.patch(args.replyId, {
      status: "copied",
      copiedAt: Date.now(),
    });
  },
});

/**
 * Mark a reply as dismissed. Throws when unauthenticated, when the reply
 * doesn't exist, or when the reply isn't owned by the caller.
 */
export const dismiss = mutation({
  args: { replyId: v.id("replies") },
  handler: async (ctx, args) => {
    await requireOwnedReply(ctx, args.replyId);
    await ctx.db.patch(args.replyId, { status: "dismissed" });
  },
});

// Internal: latest reply for a lead. Used by the generateReply action to
// carry forward prior tweaks across regenerations.
export const getLatestByLead = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("replies")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .first();
  },
});
