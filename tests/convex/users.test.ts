import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

describe("users.createOrUpdate", () => {
  test("creates a new free-tier user when clerkUserId is unseen", async () => {
    const t = convexTest(schema);
    const userId = await t.mutation(api.users.createOrUpdate, {
      clerkUserId: "user_abc123",
      email: "test@example.com",
      name: "Test User",
    });
    expect(userId).toBeDefined();
    const user = await t.query(api.users.getByClerkId, { clerkUserId: "user_abc123" });
    expect(user?.tier).toBe("free");
    expect(user?.email).toBe("test@example.com");
    expect(user?.languagePreference).toBe("es-neutral");
  });

  test("updates existing user instead of duplicating", async () => {
    const t = convexTest(schema);
    await t.mutation(api.users.createOrUpdate, {
      clerkUserId: "user_abc123",
      email: "old@example.com",
    });
    await t.mutation(api.users.createOrUpdate, {
      clerkUserId: "user_abc123",
      email: "new@example.com",
    });
    const user = await t.query(api.users.getByClerkId, { clerkUserId: "user_abc123" });
    expect(user?.email).toBe("new@example.com");
  });
});
