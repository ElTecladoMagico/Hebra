import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { replySettingsValidator } from "./lib/replySettings";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    tier: v.union(v.literal("free"), v.literal("trial"), v.literal("pro")),
    trialStartedAt: v.optional(v.number()),
    trialEndsAt: v.optional(v.number()),
    languagePreference: v.union(
      v.literal("es-neutral"),
      v.literal("es-ES"),
      v.literal("es-LATAM")
    ),
    polarCustomerId: v.optional(v.string()),
    createdAt: v.number(),
    lastActiveAt: v.number(),
  })
    .index("by_clerkId", ["clerkUserId"])
    .index("by_polarCustomer", ["polarCustomerId"])
    .index("by_tier_trialEnd", ["tier", "trialEndsAt"]),

  campaigns: defineTable({
    userId: v.id("users"),
    name: v.string(),
    offering: v.string(),
    websiteUrl: v.optional(v.string()),
    keywords: v.array(v.string()),
    subredditSlugs: v.array(v.string()),
    replySettings: replySettingsValidator,
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
    lastPolledAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_status_lastPolled", ["status", "lastPolledAt"]),

  redditPosts: defineTable({
    redditId: v.string(),
    subreddit: v.string(),
    title: v.string(),
    body: v.string(),
    author: v.string(),
    authorKarma: v.optional(v.number()),
    url: v.string(),
    permalink: v.string(),
    postedAt: v.number(),
    fetchedAt: v.number(),
    detectedDialect: v.optional(
      v.union(v.literal("es-neutral"), v.literal("es-ES"), v.literal("es-LATAM"))
    ),
    language: v.string(),
  })
    .index("by_redditId", ["redditId"])
    .index("by_subreddit_posted", ["subreddit", "postedAt"]),

  leads: defineTable({
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    postId: v.id("redditPosts"),
    matchedKeyword: v.string(),
    score: v.number(),
    tier: v.union(v.literal("hot"), v.literal("warm"), v.literal("cold")),
    reasoning: v.string(),
    read: v.boolean(),
    archived: v.boolean(),
    scoredAt: v.number(),
  })
    .index("by_user_tier", ["userId", "tier"])
    .index("by_user_unread", ["userId", "read"])
    .index("by_campaign_scored", ["campaignId", "scoredAt"])
    .index("by_post_user", ["postId", "userId"]),

  usageDaily: defineTable({
    userId: v.id("users"),
    dateKey: v.string(),
    scoringCalls: v.number(),
    replyGenerations: v.number(),
    keywordGenerations: v.number(),
    geminiCostCents: v.number(),
  })
    .index("by_user_date", ["userId", "dateKey"])
    .index("by_date", ["dateKey"]),

  replies: defineTable({
    leadId: v.id("leads"),
    userId: v.id("users"),
    draftText: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("copied"),
      v.literal("dismissed")
    ),
    tweaks: v.array(v.string()),
    generatedAt: v.number(),
    copiedAt: v.optional(v.number()),
  })
    .index("by_lead", ["leadId"])
    .index("by_user_status", ["userId", "status"]),

  errorLog: defineTable({
    service: v.string(),
    operation: v.string(),
    errorMessage: v.string(),
    errorCode: v.optional(v.string()),
    context: v.optional(v.any()),
    severity: v.union(
      v.literal("info"),
      v.literal("warn"),
      v.literal("error"),
      v.literal("critical")
    ),
  })
    .index("by_severity_creation", ["severity"])
    .index("by_service", ["service"]),
});
