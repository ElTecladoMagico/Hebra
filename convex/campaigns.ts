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

/**
 * Returns active campaigns whose lastPolledAt is null OR older than `staleBefore`.
 *
 * Tradeoff: we collect all active campaigns then filter in JS rather than using
 * `withIndex` with `.lt("lastPolledAt", staleBefore)`. The index `by_status_lastPolled`
 * exists, but `lastPolledAt` is `v.optional(v.number())` — Convex range queries on
 * optional fields don't include rows where the field is missing, which would skip
 * never-polled campaigns (the most important ones to poll). For an MVP with a low
 * campaign count this filter-in-JS approach is fine; revisit when active campaigns
 * exceed ~10k.
 */
export const listActiveStale = internalQuery({
  args: { staleBefore: v.number() },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query("campaigns")
      .withIndex("by_status_lastPolled", (q) => q.eq("status", "active"))
      .collect();
    return active.filter((c) => (c.lastPolledAt ?? 0) < args.staleBefore);
  },
});

export const markPolled = internalMutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId, { lastPolledAt: Date.now() });
  },
});
