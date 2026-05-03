"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { ensureCostGuardOk } from "../lib/costGuard";
import { ensureUserQuotaOk, QuotaExceededError } from "../lib/quota";
import { scoreIntent } from "../lib/gemini";
import { utcDateKey } from "../usage";

/**
 * Scores a single Reddit post against a campaign offering and writes a lead.
 *
 * Pipeline:
 *   1. Cost guard: throw if daily budget exhausted (kill switch);
 *      pause campaigns + log warn if tripwire crossed.
 *   2. Quota check: per-tier per-day soft limit. On QuotaExceededError,
 *      log info and return cleanly (not a system failure).
 *   3. Fetch post + campaign. If either is missing, return cleanly.
 *   4. Call Gemini Flash-Lite. On error, log and return.
 *   5. Insert lead (idempotent by postId+userId via leads.insert).
 *   6. Increment usage counters.
 *
 * Note on quota race: the check (step 2) and the increment (step 6)
 * live in separate mutations, so concurrent invocations can each see
 * "used = limit - 1" and both proceed → ±1 over-quota burst. Acceptable
 * for tripwire-style limits.
 */
export const scoreLead = internalAction({
  args: {
    postId: v.id("redditPosts"),
    campaignId: v.id("campaigns"),
    userId: v.id("users"),
    matchedKeyword: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      await ensureCostGuardOk(ctx, "scoreLead");
      await ensureUserQuotaOk(ctx, args.userId, "scoring");
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        await ctx.runMutation(internal.errorLog.insert, {
          service: "scoreLead",
          operation: "quota",
          errorMessage: err.message,
          severity: "info",
          context: { userId: args.userId },
        });
        return;
      }
      throw err;
    }

    const post = await ctx.runQuery(internal.posts.get, { postId: args.postId });
    const campaign = await ctx.runQuery(internal.campaigns.get, {
      campaignId: args.campaignId,
    });
    if (!post || !campaign) return;

    let result;
    try {
      result = await scoreIntent(post.title, post.body, campaign.offering);
    } catch (err: any) {
      await ctx.runMutation(internal.errorLog.insert, {
        service: "gemini",
        operation: "scoreIntent",
        errorMessage: err?.message ?? "unknown",
        errorCode: String(err?.status ?? ""),
        severity: "error",
      });
      return;
    }

    const tier =
      result.score >= 85 ? "hot" : result.score >= 70 ? "warm" : "cold";

    await ctx.runMutation(internal.leads.insert, {
      userId: args.userId,
      campaignId: args.campaignId,
      postId: args.postId,
      matchedKeyword: args.matchedKeyword,
      score: result.score,
      tier,
      reasoning: result.reasoning,
    });

    // Pass costCents as a float (Convex v.number() stores 64-bit double).
    // Each scoring call costs sub-cent (~0.0065¢ for typical token counts);
    // rounding to integer would silently truncate every call to 0 and
    // make the daily cost guard blind. Sum at boundaries (display) instead.
    await ctx.runMutation(internal.usage.incrementScoring, {
      userId: args.userId,
      dateKey: utcDateKey(Date.now()),
      costCents: result.costCents,
    });
  },
});
