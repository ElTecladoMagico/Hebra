import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { upsertUserFromIdentity } from "./lib/userUpsert";

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
 * Canonical client-side user sync. Called from a useEffect on the dashboard.
 *
 * Reads the Clerk JWT identity from ctx.auth and upserts via the shared
 * helper. Idempotent by clerkUserId. See:
 * https://docs.convex.dev/auth/database-auth
 *
 * The actual upsert lives in lib/userUpsert.ts so it is unit-testable
 * without depending on convex-test's syscall propagation.
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
    return await upsertUserFromIdentity(ctx, {
      subject: identity.subject,
      email: identity.email,
      name: identity.name ?? undefined,
    });
  },
});

export const getInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => ctx.db.get(args.userId),
});

export const getInternalByClerkId = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});
