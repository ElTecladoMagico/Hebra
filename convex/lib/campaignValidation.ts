import type { Doc } from "../_generated/dataModel";
import { CURATED_SUBREDDITS } from "../data/subreddits";

/**
 * Pure validation helpers for campaign creation.
 *
 * Extracted out of `convex/campaigns.ts` so that the rule branches can be
 * unit-tested with `convex-test` without having to push values through the
 * `withIdentity()` syscall (blocked by convex-test issue #50). The public
 * `createCampaign` mutation calls these in sequence.
 */

export interface CampaignInput {
  offering: string;
  keywords: string[];
  subredditSlugs: string[];
}

// Pin to the schema so changes to the tier/status unions fail-fast here.
export type Tier = Doc<"users">["tier"];
export type CampaignStatus = Doc<"campaigns">["status"];

export const OFFERING_MAX_LENGTH = 300;
export const KEYWORDS_MAX = 20;
export const SUBREDDITS_MAX = 10;

const VALID_SUBREDDIT_SLUGS = new Set(
  CURATED_SUBREDDITS.map((s) => s.slug.toLowerCase()),
);

/**
 * Throws an Error with a user-facing message if any input rule fails.
 * Order: offering length → keyword count → subreddit count → subreddit whitelist.
 *
 * The whitelist check is defense-in-depth: the UI's `SubredditPicker` only shows
 * curated entries, but a hand-crafted API call could otherwise insert arbitrary
 * slugs. We lowercase-compare since `CURATED_SUBREDDITS` mixes cases.
 */
export function validateCampaignInput(input: CampaignInput): void {
  if (input.offering.length === 0 || input.offering.length > OFFERING_MAX_LENGTH) {
    throw new Error(`Offering must be 1-${OFFERING_MAX_LENGTH} characters`);
  }
  if (input.keywords.length === 0 || input.keywords.length > KEYWORDS_MAX) {
    throw new Error(`Provide 1-${KEYWORDS_MAX} keywords`);
  }
  if (
    input.subredditSlugs.length === 0 ||
    input.subredditSlugs.length > SUBREDDITS_MAX
  ) {
    throw new Error(`Select 1-${SUBREDDITS_MAX} subreddits`);
  }
  for (const slug of input.subredditSlugs) {
    if (!VALID_SUBREDDIT_SLUGS.has(slug.toLowerCase())) {
      throw new Error(`Subreddit not in curated list: ${slug}`);
    }
  }
}

/**
 * How many concurrent active+paused campaigns a tier can own.
 *
 * Free is 1 (single-campaign teaser). Trial and Pro both get 3 — trial users
 * are previewing paid features, so they should see the same cap as pro to
 * avoid the trial→paid downgrade surprise.
 */
export function campaignCapForTier(tier: Tier): number {
  return tier === "free" ? 1 : 3;
}

/**
 * Returns true if the user has already reached their tier's active campaign cap.
 * Archived campaigns don't count toward the cap.
 */
export function isCampaignCapReached(
  existing: { status: CampaignStatus }[],
  tier: Tier,
): boolean {
  const activeCount = existing.filter((c) => c.status !== "archived").length;
  return activeCount >= campaignCapForTier(tier);
}
