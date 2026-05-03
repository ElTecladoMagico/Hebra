"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { searchSubreddit } from "../lib/reddit";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Hourly entry point. Enumerates active campaigns whose lastPolledAt is
 * stale (>1h) and schedules a per-campaign processCampaign action so the
 * 60s action timeout applies per-campaign, not across all of them.
 */
export const tick = internalAction({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.runQuery(internal.campaigns.listActiveStale, {
      staleBefore: Date.now() - ONE_HOUR_MS,
    });
    for (const campaign of stale) {
      await ctx.scheduler.runAfter(
        0,
        internal.crons.pollReddit.processCampaign,
        { campaignId: campaign._id },
      );
    }
  },
});

/**
 * Per-campaign poll. Iterates (subreddit x keyword), fetches Reddit search
 * for each pair, upserts new posts, schedules scoreLead actions per new
 * post. Per-pair errors are logged but don't abort the batch — partial
 * progress is better than full failure.
 */
export const processCampaign = internalAction({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.runQuery(internal.campaigns.get, {
      campaignId: args.campaignId,
    });
    if (!campaign || campaign.status !== "active") return;

    for (const subreddit of campaign.subredditSlugs) {
      for (const keyword of campaign.keywords) {
        let posts;
        try {
          posts = await searchSubreddit(subreddit, keyword);
        } catch (err: any) {
          await ctx.runMutation(internal.errorLog.insert, {
            service: "reddit",
            operation: "search",
            errorMessage: err?.message ?? "unknown",
            errorCode: String(err?.status ?? ""),
            severity: "warn",
            context: { campaignId: args.campaignId, subreddit, keyword },
          });
          continue;
        }

        const newIds = await ctx.runMutation(internal.posts.upsertBatch, {
          posts,
        });
        for (const postId of newIds) {
          await ctx.scheduler.runAfter(
            0,
            internal.actions.scoreLead.scoreLead,
            {
              postId,
              campaignId: args.campaignId,
              userId: campaign.userId,
              matchedKeyword: keyword,
            },
          );
        }
      }
    }

    await ctx.runMutation(internal.campaigns.markPolled, {
      campaignId: args.campaignId,
    });
  },
});
