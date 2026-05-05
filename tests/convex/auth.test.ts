import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  getCurrentUser,
  loadOwnedLead,
  requireOwnedLead,
  requireOwnedReply,
  requireUser,
} from "../../convex/lib/auth";
import schema from "../../convex/schema";

/**
 * convex-test issue #50 prevents `withIdentity()` from propagating to
 * `ctx.auth.getUserIdentity()`, so the "happy path" through the auth
 * helpers can't be exercised end-to-end. We cover the post-identity
 * branches by seeding state and calling the helpers from inside
 * `t.run(...)` — same pattern used in `tests/convex/users.test.ts`.
 *
 * This means `getCurrentUser` and `requireUser` only get coverage on the
 * unauthenticated path here. The owned-resource helpers (`requireOwnedLead`,
 * `requireOwnedReply`, `loadOwnedLead`) are stub-tested for their lookup +
 * ownership branches by passing a synthetic ctx whose `auth.getUserIdentity`
 * is mocked, while `db` is the real seeded DB.
 */

const replySettings = {
  tone: "friendly" as const,
  length: "medium" as const,
  style: "value-first" as const,
  includeCTA: false,
  personalize: true,
  replyDialect: "es-neutral" as const,
};

async function seedTwoUsersWithLead(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      clerkUserId: "owner_clerk",
      email: "owner@test.com",
      tier: "free",
      languagePreference: "es-neutral",
      createdAt: 0,
      lastActiveAt: 0,
    });
    const otherId = await ctx.db.insert("users", {
      clerkUserId: "other_clerk",
      email: "other@test.com",
      tier: "free",
      languagePreference: "es-neutral",
      createdAt: 0,
      lastActiveAt: 0,
    });
    const campaignId = await ctx.db.insert("campaigns", {
      userId: ownerId,
      name: "c",
      offering: "o",
      keywords: ["k"],
      subredditSlugs: ["españa"],
      replySettings,
      status: "active",
      createdAt: 0,
    });
    const postId = await ctx.db.insert("redditPosts", {
      redditId: "t3_seed",
      subreddit: "s",
      title: "t",
      body: "b",
      author: "a",
      url: "u",
      permalink: "p",
      postedAt: 0,
      fetchedAt: 0,
      language: "es",
    });
    const leadId = await ctx.db.insert("leads", {
      userId: ownerId,
      campaignId,
      postId,
      matchedKeyword: "k",
      score: 50,
      tier: "hot",
      reasoning: "r",
      read: false,
      archived: false,
      scoredAt: 0,
    });
    const replyId = await ctx.db.insert("replies", {
      leadId,
      userId: ownerId,
      draftText: "draft",
      status: "draft",
      tweaks: [],
      generatedAt: 0,
    });
    return { ownerId, otherId, leadId, replyId };
  });
}

/**
 * Build a ctx-like object that wraps the real `t.run` ctx but overrides
 * `auth.getUserIdentity()` to return a fixed clerkUserId. Used to exercise
 * the post-identity branches that `withIdentity()` can't reach.
 */
function withMockedIdentity<T>(
  realCtx: {
    db: unknown;
    auth: { getUserIdentity: () => Promise<unknown> };
  },
  clerkUserId: string | null,
): T {
  return {
    ...realCtx,
    auth: {
      getUserIdentity: async () =>
        clerkUserId === null ? null : { subject: clerkUserId, tokenIdentifier: clerkUserId },
    },
  } as unknown as T;
}

describe("getCurrentUser", () => {
  test("returns null when no identity is attached", async () => {
    const t = convexTest(schema);
    const result = await t.run(async (ctx) => getCurrentUser(ctx));
    expect(result).toBeNull();
  });

  test("returns null when identity has no matching user row", async () => {
    const t = convexTest(schema);
    await seedTwoUsersWithLead(t);
    const result = await t.run(async (ctx) => {
      const stubbed = withMockedIdentity<Parameters<typeof getCurrentUser>[0]>(
        ctx,
        "unknown_clerk",
      );
      return getCurrentUser(stubbed);
    });
    expect(result).toBeNull();
  });

  test("returns the user when identity matches a seeded row", async () => {
    const t = convexTest(schema);
    await seedTwoUsersWithLead(t);
    const result = await t.run(async (ctx) => {
      const stubbed = withMockedIdentity<Parameters<typeof getCurrentUser>[0]>(ctx, "owner_clerk");
      return getCurrentUser(stubbed);
    });
    expect(result?.clerkUserId).toBe("owner_clerk");
  });
});

describe("requireUser", () => {
  test("throws Unauthenticated when no identity is attached", async () => {
    const t = convexTest(schema);
    await expect(t.run(async (ctx) => requireUser(ctx))).rejects.toThrow(/Unauthenticated/);
  });

  test("throws 'User not found' when identity has no matching user row", async () => {
    const t = convexTest(schema);
    await seedTwoUsersWithLead(t);
    await expect(
      t.run(async (ctx) => {
        const stubbed = withMockedIdentity<Parameters<typeof requireUser>[0]>(ctx, "unknown_clerk");
        return requireUser(stubbed);
      }),
    ).rejects.toThrow(/User not found/);
  });
});

describe("requireOwnedLead", () => {
  test("throws 'Lead not found' when the lead does not exist", async () => {
    const t = convexTest(schema);
    const { leadId } = await seedTwoUsersWithLead(t);
    // Delete the seeded lead so the id is well-formed but resolves to null.
    await t.run(async (ctx) => ctx.db.delete(leadId));
    await expect(
      t.run(async (ctx) => {
        const stubbed = withMockedIdentity<Parameters<typeof requireOwnedLead>[0]>(
          ctx,
          "owner_clerk",
        );
        return requireOwnedLead(stubbed, leadId);
      }),
    ).rejects.toThrow(/Lead not found/);
  });

  test("throws 'Not authorized for this lead' when caller is not the owner", async () => {
    const t = convexTest(schema);
    const { leadId } = await seedTwoUsersWithLead(t);
    await expect(
      t.run(async (ctx) => {
        const stubbed = withMockedIdentity<Parameters<typeof requireOwnedLead>[0]>(
          ctx,
          "other_clerk",
        );
        return requireOwnedLead(stubbed, leadId);
      }),
    ).rejects.toThrow(/Not authorized for this lead/);
  });

  test("returns { user, lead } on success", async () => {
    const t = convexTest(schema);
    const { leadId, ownerId } = await seedTwoUsersWithLead(t);
    const result = await t.run(async (ctx) => {
      const stubbed = withMockedIdentity<Parameters<typeof requireOwnedLead>[0]>(
        ctx,
        "owner_clerk",
      );
      return requireOwnedLead(stubbed, leadId);
    });
    expect(result.user._id).toBe(ownerId);
    expect(result.lead._id).toBe(leadId);
  });
});

describe("loadOwnedLead", () => {
  test("returns null on no identity (instead of throwing)", async () => {
    const t = convexTest(schema);
    const { leadId } = await seedTwoUsersWithLead(t);
    const result = await t.run(async (ctx) => loadOwnedLead(ctx, leadId));
    expect(result).toBeNull();
  });

  test("returns null when lead is missing (instead of throwing)", async () => {
    const t = convexTest(schema);
    const { leadId } = await seedTwoUsersWithLead(t);
    await t.run(async (ctx) => ctx.db.delete(leadId));
    const result = await t.run(async (ctx) => {
      const stubbed = withMockedIdentity<Parameters<typeof loadOwnedLead>[0]>(ctx, "owner_clerk");
      return loadOwnedLead(stubbed, leadId);
    });
    expect(result).toBeNull();
  });

  test("returns null when caller is not the owner (instead of throwing)", async () => {
    const t = convexTest(schema);
    const { leadId } = await seedTwoUsersWithLead(t);
    const result = await t.run(async (ctx) => {
      const stubbed = withMockedIdentity<Parameters<typeof loadOwnedLead>[0]>(ctx, "other_clerk");
      return loadOwnedLead(stubbed, leadId);
    });
    expect(result).toBeNull();
  });

  test("returns { user, lead } when caller owns the lead", async () => {
    const t = convexTest(schema);
    const { leadId, ownerId } = await seedTwoUsersWithLead(t);
    const result = await t.run(async (ctx) => {
      const stubbed = withMockedIdentity<Parameters<typeof loadOwnedLead>[0]>(ctx, "owner_clerk");
      return loadOwnedLead(stubbed, leadId);
    });
    expect(result?.user._id).toBe(ownerId);
    expect(result?.lead._id).toBe(leadId);
  });
});

describe("requireOwnedReply", () => {
  test("throws 'Reply not found' when the reply does not exist", async () => {
    const t = convexTest(schema);
    const { replyId } = await seedTwoUsersWithLead(t);
    await t.run(async (ctx) => ctx.db.delete(replyId));
    await expect(
      t.run(async (ctx) => {
        const stubbed = withMockedIdentity<Parameters<typeof requireOwnedReply>[0]>(
          ctx,
          "owner_clerk",
        );
        return requireOwnedReply(stubbed, replyId);
      }),
    ).rejects.toThrow(/Reply not found/);
  });

  test("throws 'Not authorized for this reply' when caller is not the owner", async () => {
    const t = convexTest(schema);
    const { replyId } = await seedTwoUsersWithLead(t);
    await expect(
      t.run(async (ctx) => {
        const stubbed = withMockedIdentity<Parameters<typeof requireOwnedReply>[0]>(
          ctx,
          "other_clerk",
        );
        return requireOwnedReply(stubbed, replyId);
      }),
    ).rejects.toThrow(/Not authorized for this reply/);
  });

  test("returns { user, reply } on success", async () => {
    const t = convexTest(schema);
    const { replyId, ownerId } = await seedTwoUsersWithLead(t);
    const result = await t.run(async (ctx) => {
      const stubbed = withMockedIdentity<Parameters<typeof requireOwnedReply>[0]>(
        ctx,
        "owner_clerk",
      );
      return requireOwnedReply(stubbed, replyId);
    });
    expect(result.user._id).toBe(ownerId);
    expect(result.reply._id).toBe(replyId);
  });
});
