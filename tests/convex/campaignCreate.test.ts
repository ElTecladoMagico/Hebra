import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  campaignCapForTier,
  isCampaignCapReached,
  validateCampaignInput,
} from "../../convex/lib/campaignValidation";

/**
 * Validation rules and tier cap are exercised against the pure helper
 * (`convex/lib/campaignValidation.ts`) — convex-test issue #50 prevents
 * `withIdentity()` from reaching `ctx.auth.getUserIdentity()`, so the
 * auth-gated `createCampaign` mutation is only verifiable on the unauth
 * path. Helper coverage is equivalent: `createCampaign` is a thin wrapper
 * around these functions.
 */

const validReplySettings = {
  tone: "friendly" as const,
  length: "medium" as const,
  style: "value-first" as const,
  includeCTA: false,
  personalize: true,
  replyDialect: "es-neutral" as const,
};

describe("validateCampaignInput", () => {
  const baseInput = {
    offering: "Awesome SaaS for indie hackers",
    keywords: ["saas", "tools"],
    subredditSlugs: ["españa"],
  };

  test("accepts valid input", () => {
    expect(() => validateCampaignInput(baseInput)).not.toThrow();
  });

  test("rejects empty offering", () => {
    expect(() =>
      validateCampaignInput({ ...baseInput, offering: "" }),
    ).toThrow(/Offering must be 1-300/);
  });

  test("rejects offering over 300 chars", () => {
    expect(() =>
      validateCampaignInput({ ...baseInput, offering: "a".repeat(301) }),
    ).toThrow(/Offering must be 1-300/);
  });

  test("accepts offering at the 300-char boundary", () => {
    expect(() =>
      validateCampaignInput({ ...baseInput, offering: "a".repeat(300) }),
    ).not.toThrow();
  });

  test("rejects empty keywords array", () => {
    expect(() =>
      validateCampaignInput({ ...baseInput, keywords: [] }),
    ).toThrow(/1-20 keywords/);
  });

  test("rejects more than 20 keywords", () => {
    const keywords = Array.from({ length: 21 }, (_, i) => `kw${i}`);
    expect(() =>
      validateCampaignInput({ ...baseInput, keywords }),
    ).toThrow(/1-20 keywords/);
  });

  test("accepts exactly 20 keywords", () => {
    const keywords = Array.from({ length: 20 }, (_, i) => `kw${i}`);
    expect(() =>
      validateCampaignInput({ ...baseInput, keywords }),
    ).not.toThrow();
  });

  test("rejects empty subreddit list", () => {
    expect(() =>
      validateCampaignInput({ ...baseInput, subredditSlugs: [] }),
    ).toThrow(/1-10 subreddits/);
  });

  test("rejects more than 10 subreddits", () => {
    // 11 valid slugs from CURATED_SUBREDDITS so we hit the count check first
    const slugs = [
      "españa",
      "spain",
      "mexico",
      "argentina",
      "colombia",
      "chile",
      "peru",
      "devsenespanol",
      "programacion",
      "emprendedores",
      "startups_es",
    ];
    expect(() =>
      validateCampaignInput({ ...baseInput, subredditSlugs: slugs }),
    ).toThrow(/1-10 subreddits/);
  });

  test("accepts exactly 10 valid subreddits", () => {
    const slugs = [
      "españa",
      "spain",
      "mexico",
      "argentina",
      "colombia",
      "chile",
      "peru",
      "devsenespanol",
      "programacion",
      "emprendedores",
    ];
    expect(() =>
      validateCampaignInput({ ...baseInput, subredditSlugs: slugs }),
    ).not.toThrow();
  });

  test("rejects subreddit slugs not in the curated whitelist", () => {
    expect(() =>
      validateCampaignInput({
        ...baseInput,
        subredditSlugs: ["definitelyNotARealCuratedSub"],
      }),
    ).toThrow(/not in curated list/);
  });

  test("subreddit whitelist is case-insensitive", () => {
    expect(() =>
      validateCampaignInput({ ...baseInput, subredditSlugs: ["ESPAÑA"] }),
    ).not.toThrow();
  });
});

describe("campaignCapForTier", () => {
  test("free tier caps at 1", () => {
    expect(campaignCapForTier("free")).toBe(1);
  });

  test("trial tier caps at 3 (treated like pro to avoid downgrade surprise)", () => {
    expect(campaignCapForTier("trial")).toBe(3);
  });

  test("pro tier caps at 3", () => {
    expect(campaignCapForTier("pro")).toBe(3);
  });
});

describe("isCampaignCapReached", () => {
  test("free user with 0 campaigns is not capped", () => {
    expect(isCampaignCapReached([], "free")).toBe(false);
  });

  test("free user with 1 active campaign is capped", () => {
    expect(isCampaignCapReached([{ status: "active" }], "free")).toBe(true);
  });

  test("free user with 1 paused campaign is capped (paused counts)", () => {
    expect(isCampaignCapReached([{ status: "paused" }], "free")).toBe(true);
  });

  test("free user with 1 archived campaign is NOT capped (archived excluded)", () => {
    expect(isCampaignCapReached([{ status: "archived" }], "free")).toBe(false);
  });

  test("pro user with 2 active campaigns is not yet capped", () => {
    expect(
      isCampaignCapReached(
        [{ status: "active" }, { status: "active" }],
        "pro",
      ),
    ).toBe(false);
  });

  test("pro user with 3 active campaigns is capped", () => {
    expect(
      isCampaignCapReached(
        [{ status: "active" }, { status: "active" }, { status: "active" }],
        "pro",
      ),
    ).toBe(true);
  });

  test("trial user with 3 active campaigns is capped (same cap as pro)", () => {
    expect(
      isCampaignCapReached(
        [{ status: "active" }, { status: "active" }, { status: "active" }],
        "trial",
      ),
    ).toBe(true);
  });

  test("trial user with 2 active campaigns is not yet capped", () => {
    expect(
      isCampaignCapReached(
        [{ status: "active" }, { status: "active" }],
        "trial",
      ),
    ).toBe(false);
  });

  test("pro user with 3 archived + 0 active is NOT capped", () => {
    expect(
      isCampaignCapReached(
        [
          { status: "archived" },
          { status: "archived" },
          { status: "archived" },
        ],
        "pro",
      ),
    ).toBe(false);
  });
});

describe("createCampaign (unauth path only — convex-test #50)", () => {
  test("throws Unauthenticated when no identity is attached", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.campaigns.createCampaign, {
        name: "x",
        offering: "x",
        keywords: ["k"],
        subredditSlugs: ["españa"],
        replySettings: validReplySettings,
      }),
    ).rejects.toThrow(/Unauthenticated/);
  });
});

describe("listMine (unauth path)", () => {
  test("returns [] when unauthenticated", async () => {
    const t = convexTest(schema);
    const result = await t.query(api.campaigns.listMine, {});
    expect(result).toEqual([]);
  });
});

describe("setStatus (unauth path)", () => {
  test("throws Unauthenticated when no identity is attached", async () => {
    const t = convexTest(schema);
    // Seed a campaign so the id is valid; the auth check fires before the lookup,
    // but we still need a real Id<"campaigns"> for the validator.
    const campaignId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "u1",
        email: "u1@test.com",
        tier: "free",
        languagePreference: "es-neutral",
        createdAt: 0,
        lastActiveAt: 0,
      });
      return await ctx.db.insert("campaigns", {
        userId,
        name: "c",
        offering: "x",
        keywords: ["k"],
        subredditSlugs: ["españa"],
        replySettings: validReplySettings,
        status: "active",
        createdAt: 0,
      });
    });
    await expect(
      t.mutation(api.campaigns.setStatus, {
        campaignId,
        status: "paused",
      }),
    ).rejects.toThrow(/Unauthenticated/);
  });
});
