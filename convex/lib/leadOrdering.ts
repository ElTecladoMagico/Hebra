import type { Doc } from "../_generated/dataModel";

/**
 * Stable ordering for the lead feed.
 *
 * Sort key: tier ascending (hot < warm < cold), then `scoredAt` descending
 * (newest scored within a tier first). This is the "hottest first" feed
 * order the UI consumes.
 *
 * Extracted as a pure helper so it can be unit-tested without the
 * convex-test issue #50 limitation around `withIdentity()` not propagating
 * to `ctx.auth.getUserIdentity()` (see `convex/lib/userUpsert.ts` for the
 * established pattern).
 */
const TIER_ORDER: Record<Doc<"leads">["tier"], number> = {
  hot: 0,
  warm: 1,
  cold: 2,
};

export function sortLeadsForFeed(
  leads: Doc<"leads">[],
): Doc<"leads">[] {
  // copy first so callers' arrays aren't mutated
  return [...leads].sort((a, b) => {
    const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (t !== 0) return t;
    return b.scoredAt - a.scoredAt;
  });
}
