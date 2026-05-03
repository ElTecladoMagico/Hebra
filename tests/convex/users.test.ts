import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../convex/schema";
import { upsertUserFromIdentity } from "../../convex/lib/userUpsert";

/**
 * Tests target the pure helper rather than the `users.store` mutation
 * because convex-test issue #50 means `withIdentity()` does not propagate
 * to the `getUserIdentity` syscall yet. Helper coverage is equivalent —
 * the mutation is a thin wrapper that delegates to this exact function.
 */
describe("upsertUserFromIdentity", () => {
  test("creates a new free-tier user when subject is unseen", async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) =>
      upsertUserFromIdentity(ctx, {
        subject: "user_abc123",
        email: "test@example.com",
        name: "Test User",
      }),
    );
    expect(userId).toBeDefined();
    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user?.clerkUserId).toBe("user_abc123");
    expect(user?.email).toBe("test@example.com");
    expect(user?.name).toBe("Test User");
    expect(user?.tier).toBe("free");
    expect(user?.languagePreference).toBe("es-neutral");
  });

  test("updates existing user instead of duplicating", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) =>
      upsertUserFromIdentity(ctx, {
        subject: "user_abc123",
        email: "old@example.com",
      }),
    );
    await t.run(async (ctx) =>
      upsertUserFromIdentity(ctx, {
        subject: "user_abc123",
        email: "new@example.com",
      }),
    );
    const all = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkUserId", "user_abc123"))
        .collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe("new@example.com");
  });

  test("preserves prior name when identity omits it on update", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) =>
      upsertUserFromIdentity(ctx, {
        subject: "user_abc123",
        email: "test@example.com",
        name: "Initial Name",
      }),
    );
    await t.run(async (ctx) =>
      upsertUserFromIdentity(ctx, {
        subject: "user_abc123",
        email: "test@example.com",
        // no name provided
      }),
    );
    const user = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkUserId", "user_abc123"))
        .unique(),
    );
    expect(user?.name).toBe("Initial Name");
  });

  test("bumps lastActiveAt on every call", async () => {
    const t = convexTest(schema);
    const id = await t.run(async (ctx) =>
      upsertUserFromIdentity(ctx, {
        subject: "user_abc123",
        email: "test@example.com",
      }),
    );
    const first = await t.run(async (ctx) => ctx.db.get(id));
    const firstActive = first?.lastActiveAt ?? 0;
    // ensure clock moves at least 1ms
    await new Promise((r) => setTimeout(r, 2));
    await t.run(async (ctx) =>
      upsertUserFromIdentity(ctx, {
        subject: "user_abc123",
        email: "test@example.com",
      }),
    );
    const second = await t.run(async (ctx) => ctx.db.get(id));
    expect((second?.lastActiveAt ?? 0)).toBeGreaterThan(firstActive);
  });
});
