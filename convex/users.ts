import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createOrUpdate = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        lastActiveAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      tier: "free",
      languagePreference: "es-neutral",
      createdAt: now,
      lastActiveAt: now,
    });
  },
});

export const getByClerkId = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});

export const current = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
  },
});

/**
 * Client-side user sync. Called from a useEffect on the dashboard.
 *
 * Reads the Clerk JWT identity from ctx.auth and upserts the corresponding
 * user row. Idempotent by clerkUserId. This is the canonical sync path —
 * the webhook is preemptive but this guarantees a row exists before any
 * authed UI tries to read it. See Convex docs:
 * https://docs.convex.dev/auth/database-auth
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("users.store called without authentication");
    }
    if (!identity.email) {
      throw new Error("users.store: JWT missing email claim — check Clerk JWT template");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: identity.email,
        name: identity.name ?? existing.name,
        lastActiveAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      email: identity.email,
      name: identity.name ?? undefined,
      tier: "free",
      languagePreference: "es-neutral",
      createdAt: now,
      lastActiveAt: now,
    });
  },
});
