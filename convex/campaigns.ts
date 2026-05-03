import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const pauseAllActive = internalMutation({
  args: {},
  handler: async (ctx) => {
    const active = await ctx.db
      .query("campaigns")
      .withIndex("by_status_lastPolled", (q) => q.eq("status", "active"))
      .collect();
    for (const c of active) {
      await ctx.db.patch(c._id, { status: "paused" });
    }
    return active.length;
  },
});

export const get = internalQuery({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => ctx.db.get(args.campaignId),
});
