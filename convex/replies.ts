import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

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

// TODO: ownership check — does not verify the lead belongs to the caller.
// Plan-level decision: match the plan snippet for now and tighten later.
export const getByLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("replies")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .first();
  },
});

// TODO: ownership check — any authenticated user can patch any reply.
// Plan-level decision: match the plan snippet for now and tighten later.
export const markCopied = mutation({
  args: { replyId: v.id("replies") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    await ctx.db.patch(args.replyId, {
      status: "copied",
      copiedAt: Date.now(),
    });
  },
});

// TODO: ownership check — any authenticated user can patch any reply.
// Plan-level decision: match the plan snippet for now and tighten later.
export const dismiss = mutation({
  args: { replyId: v.id("replies") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
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
