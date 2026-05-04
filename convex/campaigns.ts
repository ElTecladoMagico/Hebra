import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  campaignCapForTier,
  isCampaignCapReached,
  validateCampaignInput,
} from "./lib/campaignValidation";

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

/**
 * Lists the calling user's campaigns, newest first. Used by the campaigns
 * list page and to gate /feed (no campaigns → /onboarding). Returns `[]`
 * when unauthenticated or when the identity has no matching user row.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) return [];
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id))
      .collect();
    // Sort newest first — drives the campaigns list page where the most
    // recently created campaign is the one the user is most likely working on.
    return campaigns.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Create a campaign owned by the calling user. Validates server-side
 * (offering length, keyword count, subreddit count, subreddit whitelist)
 * and enforces a tier-based cap on active+paused campaigns.
 */
export const createCampaign = mutation({
  args: {
    name: v.string(),
    offering: v.string(),
    websiteUrl: v.optional(v.string()),
    keywords: v.array(v.string()),
    subredditSlugs: v.array(v.string()),
    replySettings: v.object({
      tone: v.union(
        v.literal("casual"),
        v.literal("professional"),
        v.literal("friendly"),
      ),
      length: v.union(
        v.literal("short"),
        v.literal("medium"),
        v.literal("long"),
      ),
      style: v.union(
        v.literal("value-first"),
        v.literal("value-mention"),
        v.literal("direct-offer"),
      ),
      includeCTA: v.boolean(),
      personalize: v.boolean(),
      includePhrases: v.optional(v.string()),
      replyDialect: v.union(
        v.literal("es-neutral"),
        v.literal("es-ES"),
        v.literal("es-LATAM"),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    validateCampaignInput({
      offering: args.offering,
      keywords: args.keywords,
      subredditSlugs: args.subredditSlugs,
    });

    const existing = await ctx.db
      .query("campaigns")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id))
      .collect();
    if (isCampaignCapReached(existing, user.tier)) {
      const cap = campaignCapForTier(user.tier);
      throw new Error(
        `Plan ${user.tier} permite máximo ${cap} campañas activas`,
      );
    }

    return await ctx.db.insert("campaigns", {
      userId: user._id,
      name: args.name,
      offering: args.offering,
      websiteUrl: args.websiteUrl,
      keywords: args.keywords,
      subredditSlugs: args.subredditSlugs,
      replySettings: args.replySettings,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

/**
 * Update a campaign's status (active/paused/archived). Caller must own the
 * campaign; throws when unauthenticated or unauthorized. Silently no-ops
 * if the campaign doesn't exist (idempotent on delete).
 */
export const setStatus = mutation({
  args: {
    campaignId: v.id("campaigns"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) return;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user || campaign.userId !== user._id) {
      throw new Error("Not authorized");
    }
    await ctx.db.patch(args.campaignId, { status: args.status });
  },
});
