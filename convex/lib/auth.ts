import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Auth + ownership helpers shared across `convex/leads.ts`, `convex/campaigns.ts`,
 * and `convex/replies.ts`. Centralising these keeps the identity → user lookup
 * → ownership-check chain consistent and makes the error strings the
 * single source of truth (any client-side matching depends on them).
 *
 * Tested via `tests/convex/auth.test.ts`. Note: convex-test issue #50 prevents
 * `withIdentity()` from propagating to `ctx.auth.getUserIdentity()`, so we
 * cover the post-identity branches by seeding state and calling the helpers
 * directly inside `t.run(...)`.
 */
type AuthCtx = QueryCtx | MutationCtx;

/**
 * Resolve the authenticated user, or return `null` when there's no identity
 * or no matching user row. For *queries* that should silently return
 * `[]` / `null` to unauthenticated callers (e.g. `feedByUser`, `listMine`).
 */
export async function getCurrentUser(ctx: AuthCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
}

/**
 * Resolve the authenticated user, or throw. For *mutations* and *actions*
 * where unauthenticated callers should fail loudly (e.g. `markRead`,
 * `setStatus`, `createCampaign`). Error strings match the prior inline
 * implementations exactly so existing client-side error matching keeps
 * working.
 */
export async function requireUser(ctx: AuthCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

/**
 * Load a lead and verify it belongs to the calling user. For mutations:
 * throws `"Unauthenticated"` / `"User not found"` / `"Lead not found"` /
 * `"Not authorized for this lead"`. Replaces the inline check repeated in
 * `leads.markRead` and `leads.setArchived`.
 */
export async function requireOwnedLead(
  ctx: AuthCtx,
  leadId: Id<"leads">,
): Promise<{ user: Doc<"users">; lead: Doc<"leads"> }> {
  const user = await requireUser(ctx);
  const lead = await ctx.db.get(leadId);
  if (!lead) throw new Error("Lead not found");
  if (lead.userId !== user._id) {
    throw new Error("Not authorized for this lead");
  }
  return { user, lead };
}

/**
 * Load a reply and verify it belongs to the calling user. Closes the
 * ownership gaps in `replies.markCopied` and `replies.dismiss`.
 */
export async function requireOwnedReply(
  ctx: AuthCtx,
  replyId: Id<"replies">,
): Promise<{ user: Doc<"users">; reply: Doc<"replies"> }> {
  const user = await requireUser(ctx);
  const reply = await ctx.db.get(replyId);
  if (!reply) throw new Error("Reply not found");
  if (reply.userId !== user._id) {
    throw new Error("Not authorized for this reply");
  }
  return { user, reply };
}

/**
 * Variant of `requireOwnedLead` that swallows the auth/ownership failure
 * and returns `null`, for queries that should silently degrade instead
 * of throwing. Used by `leads.getById` and `replies.getByLead` so the
 * inbox doesn't 401-loop.
 */
export async function loadOwnedLead(
  ctx: AuthCtx,
  leadId: Id<"leads">,
): Promise<{ user: Doc<"users">; lead: Doc<"leads"> } | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.userId !== user._id) return null;
  return { user, lead };
}
