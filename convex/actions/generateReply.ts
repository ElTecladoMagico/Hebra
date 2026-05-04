"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureCostGuardOk } from "../lib/costGuard";
import { ensureUserQuotaOk, QuotaExceededError } from "../lib/quota";
import { generateReplyDraft } from "../lib/geminiReply";
import { utcDateKey } from "../usage";

/**
 * Public action: generate (or regenerate with new tweaks) a reply draft.
 * Auth-gated. Cost-guarded. Quota-checked.
 *
 * Tweak idempotence: if `appendTweak` matches the last tweak in the previous
 * reply's tweaks, we still append. Rationale: a user may want to apply the
 * same tweak twice for emphasis ("more concise" → "even more concise"). The
 * model interprets repetition as intensification.
 */
export const generate = action({
  args: {
    leadId: v.id("leads"),
    appendTweak: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"replies">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Explicit type annotations break the TS7022 self-referential inference
    // cycle that arises from action -> internal.* -> api.d.ts -> action.
    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getInternalByClerkId,
      { clerkUserId: identity.subject },
    );
    if (!user) throw new Error("User not found");

    await ensureCostGuardOk(ctx, "generateReply");
    try {
      await ensureUserQuotaOk(ctx, user._id, "reply");
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        throw new Error(
          `Quota daily de respuestas excedida (${err.used}/${err.limit})`,
        );
      }
      throw err;
    }

    const lead: Doc<"leads"> | null = await ctx.runQuery(
      internal.leads.getInternal,
      { leadId: args.leadId },
    );
    if (!lead || lead.userId !== user._id) throw new Error("Lead not found");
    const post: Doc<"redditPosts"> | null = await ctx.runQuery(
      internal.posts.get,
      { postId: lead.postId },
    );
    const campaign: Doc<"campaigns"> | null = await ctx.runQuery(
      internal.campaigns.get,
      { campaignId: lead.campaignId },
    );
    if (!post || !campaign) throw new Error("Post or campaign missing");

    const previous: Doc<"replies"> | null = await ctx.runQuery(
      internal.replies.getLatestByLead,
      { leadId: args.leadId },
    );
    // Defensive copy — Convex serializes runQuery returns so mutating the
    // array would not leak today, but the copy makes intent explicit.
    const tweaks: string[] = previous?.tweaks ? [...previous.tweaks] : [];
    if (args.appendTweak) tweaks.push(args.appendTweak);

    const { draft, costCents } = await generateReplyDraft(
      post.title,
      post.body,
      campaign.offering,
      campaign.websiteUrl,
      campaign.replySettings,
      tweaks,
    );

    // Empty draft = Gemini returned no candidates (rare API instability).
    // Throw before insert/increment so the user can retry without burning
    // quota or polluting the inbox with empty drafts. Daily cost guard
    // still catches an empty-response loop via aggregate spend.
    if (draft.trim() === "") {
      throw new Error("Gemini retornó respuesta vacía. Inténtalo de nuevo.");
    }

    const replyId: Id<"replies"> = await ctx.runMutation(
      internal.replies.insertInternal,
      {
        leadId: args.leadId,
        userId: user._id,
        draftText: draft,
        tweaks,
      },
    );

    // Pass costCents as a float (Convex v.number() stores 64-bit double).
    // Each reply call costs sub-cent — rounding to integer would silently
    // truncate every call to 0 and make the daily cost guard blind. Sum
    // at boundaries (display) instead.
    await ctx.runMutation(internal.usage.incrementReply, {
      userId: user._id,
      dateKey: utcDateKey(Date.now()),
      costCents,
    });

    return replyId;
  },
});
