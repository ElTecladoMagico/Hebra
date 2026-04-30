import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  }).index("by_user", ["userId"]),

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
