import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Identity-like shape we accept for upsert. Mirrors the relevant fields from
 * Convex's UserIdentity (which derives from the Clerk JWT) but is decoupled
 * from the Auth API surface so this helper is unit-testable without needing
 * convex-test's still-incomplete `withIdentity` syscall propagation
 * (see https://github.com/get-convex/convex-test/issues/50).
 */
export interface UserIdentityLike {
  subject: string;
  email: string;
  name?: string;
}

/**
 * Idempotent upsert of a user row from a Clerk-style identity payload.
 *
 * - Uniqueness is enforced via the `by_clerkId` index on `clerkUserId`.
 * - On existing user: patch email, name (preserving prior name when identity
 *   omits it), and bump `lastActiveAt`.
 * - On new user: defaults tier=free, languagePreference=es-neutral.
 *
 * This is the single source of truth for user provisioning. Both the
 * client-side `users.store` mutation and any future admin/import paths
 * should funnel through here.
 */
export async function upsertUserFromIdentity(
  ctx: MutationCtx,
  identity: UserIdentityLike,
): Promise<Id<"users">> {
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
}
