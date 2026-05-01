# Plan 2 — Reddit Ingestion + Intent Scoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full ingestion → scoring → leads pipeline so that, given a configured campaign, Hebra automatically polls Reddit hourly, scores matching posts with Gemini, and inserts leads into the database with hot/warm/cold tier classification.

**Architecture:** Convex internalAction `pollReddit` runs hourly via cron, chunks search per (subreddit × keyword), stores deduped posts, schedules `scoreLead` actions for new posts. `scoreLead` calls Gemini Flash-Lite with `responseSchema` for structured JSON output, falls back gracefully on malformed responses. Cost guard (tripwire $5, kill $50) wraps every Gemini call. Per-user quotas tracked in `usageDaily`.

**Tech Stack:** Convex (cron, internalAction, internalMutation), Gemini API (`gemini-2.5-flash-lite`), Reddit OAuth (app-only with `hebra_app` shared account), msw (mocks), Vitest.

**Reference spec:** `docs/superpowers/specs/2026-04-30-hebra-design.md` sections 4 (schema), 5.2-5.3 (polling+scoring flows), 6.1-6.6 (retry, cost guard, OAuth), 7 (testing).

**Prerequisites:** Plan 1 complete. `hebra_app` Reddit account warmed (30+ days) and registered as "script" app in `reddit.com/prefs/apps`. `GEMINI_API_KEY`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` set in Convex env vars (dev + prod).

---

## File Structure

**Created in this plan:**

```
convex/
├── schema.ts                      # MODIFIED: add redditPosts, leads, usageDaily; expand campaigns
├── data/
│   └── subreddits.ts              # CURATED_SUBREDDITS constant
├── lib/
│   ├── retry.ts                   # withRetry helper with jitter
│   ├── dialect.ts                 # detectDialect from text
│   ├── costGuard.ts               # ensureCostGuardOk
│   ├── quota.ts                   # ensureUserQuotaOk
│   ├── reddit.ts                  # Reddit OAuth + search wrapper
│   └── gemini.ts                  # Gemini wrapper with structured schema
├── crons.ts                       # NEW: hourly pollReddit cron config
├── crons/
│   └── pollReddit.ts              # internalAction polling logic
├── actions/
│   └── scoreLead.ts               # internalAction Gemini scoring
├── posts.ts                       # internalMutation upsertBatch
├── leads.ts                       # internalMutation insert
├── usage.ts                       # totalCostToday, increment helpers
└── campaigns.ts                   # NEW: queries used by polling

tests/
├── lib/
│   ├── retry.test.ts
│   ├── dialect.test.ts
│   ├── costGuard.test.ts
│   └── quota.test.ts
├── convex/
│   ├── posts.test.ts              # idempotency tests
│   ├── leads.test.ts
│   └── usage.test.ts
├── integration/
│   ├── reddit.test.ts             # with msw fixtures
│   └── scoreLead.test.ts          # with Gemini mock
└── fixtures/
    ├── reddit/
    │   ├── post-es-spain.json
    │   ├── post-es-latam.json
    │   ├── post-english.json
    │   ├── post-deleted.json
    │   └── search-page.json
    └── gemini/
        ├── score-hot.json
        ├── score-warm.json
        ├── score-cold.json
        └── score-malformed.json
```

---

### Task 1: Schema expansion

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Open `convex/schema.ts` and replace the entire file**

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    tier: v.union(v.literal("free"), v.literal("trial"), v.literal("pro")),
    trialStartedAt: v.optional(v.number()),
    trialEndsAt: v.optional(v.number()),
    languagePreference: v.union(
      v.literal("es-neutral"),
      v.literal("es-ES"),
      v.literal("es-LATAM")
    ),
    polarCustomerId: v.optional(v.string()),
    createdAt: v.number(),
    lastActiveAt: v.number(),
  })
    .index("by_clerkId", ["clerkUserId"])
    .index("by_polarCustomer", ["polarCustomerId"])
    .index("by_tier_trialEnd", ["tier", "trialEndsAt"]),

  campaigns: defineTable({
    userId: v.id("users"),
    name: v.string(),
    offering: v.string(),
    websiteUrl: v.optional(v.string()),
    keywords: v.array(v.string()),
    subredditSlugs: v.array(v.string()),
    replySettings: v.object({
      tone: v.union(v.literal("casual"), v.literal("professional"), v.literal("friendly")),
      length: v.union(v.literal("short"), v.literal("medium"), v.literal("long")),
      style: v.union(
        v.literal("value-first"),
        v.literal("value-mention"),
        v.literal("direct-offer")
      ),
      includeCTA: v.boolean(),
      personalize: v.boolean(),
      includePhrases: v.optional(v.string()),
      replyDialect: v.union(
        v.literal("es-neutral"),
        v.literal("es-ES"),
        v.literal("es-LATAM")
      ),
    }),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
    lastPolledAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_status_lastPolled", ["status", "lastPolledAt"]),

  redditPosts: defineTable({
    redditId: v.string(),
    subreddit: v.string(),
    title: v.string(),
    body: v.string(),
    author: v.string(),
    authorKarma: v.optional(v.number()),
    url: v.string(),
    permalink: v.string(),
    postedAt: v.number(),
    fetchedAt: v.number(),
    detectedDialect: v.optional(
      v.union(v.literal("es-neutral"), v.literal("es-ES"), v.literal("es-LATAM"))
    ),
    language: v.string(),
  })
    .index("by_redditId", ["redditId"])
    .index("by_subreddit_posted", ["subreddit", "postedAt"]),

  leads: defineTable({
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    postId: v.id("redditPosts"),
    matchedKeyword: v.string(),
    score: v.number(),
    tier: v.union(v.literal("hot"), v.literal("warm"), v.literal("cold")),
    reasoning: v.string(),
    read: v.boolean(),
    archived: v.boolean(),
    scoredAt: v.number(),
  })
    .index("by_user_tier", ["userId", "tier"])
    .index("by_user_unread", ["userId", "read"])
    .index("by_campaign_scored", ["campaignId", "scoredAt"])
    .index("by_post_user", ["postId", "userId"]),

  usageDaily: defineTable({
    userId: v.id("users"),
    dateKey: v.string(),
    scoringCalls: v.number(),
    replyGenerations: v.number(),
    keywordGenerations: v.number(),
    geminiCostCents: v.number(),
  })
    .index("by_user_date", ["userId", "dateKey"])
    .index("by_date", ["dateKey"]),

  errorLog: defineTable({
    service: v.string(),
    operation: v.string(),
    errorMessage: v.string(),
    errorCode: v.optional(v.string()),
    context: v.optional(v.any()),
    severity: v.union(
      v.literal("info"),
      v.literal("warn"),
      v.literal("error"),
      v.literal("critical")
    ),
  })
    .index("by_severity_creation", ["severity"])
    .index("by_service", ["service"]),
});
```

- [ ] **Step 2: Push to dev**

```bash
npx convex dev --once
```

Expected: "Convex functions ready!" with new indexes added (15 total: existing 6 + 9 new for the expanded tables).

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Must pass.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "$(cat <<'EOF'
feat(schema): expand for reddit ingestion + scoring pipeline

- redditPosts (deduped globally by redditId)
- leads (junction user x post with score, tier, reasoning)
- usageDaily (per-user per-day counters + gemini cost cents)
- campaigns: full fields (offering, keywords, subreddits, replySettings)

Indexes optimized for: feed queries by user+tier, dedup checks by redditId,
campaign polling by status+lastPolled, daily cost rollups.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 2: Subreddit catalog constant

**Files:**
- Create: `convex/data/subreddits.ts`

- [ ] **Step 1: Create file with content:**

```typescript
export type Country = "ES" | "MX" | "AR" | "CO" | "CL" | "PE" | "PAN-HISPANO";
export type Hostility = "low" | "medium" | "high";

export interface SubredditMeta {
  slug: string;
  country: Country;
  hostility: Hostility;
  topics: string[];
}

export const CURATED_SUBREDDITS: SubredditMeta[] = [
  { slug: "españa", country: "ES", hostility: "high", topics: ["general", "trabajo"] },
  { slug: "spain", country: "ES", hostility: "medium", topics: ["expat", "general"] },
  { slug: "mexico", country: "MX", hostility: "medium", topics: ["general"] },
  { slug: "argentina", country: "AR", hostility: "high", topics: ["general"] },
  { slug: "colombia", country: "CO", hostility: "medium", topics: ["general"] },
  { slug: "chile", country: "CL", hostility: "medium", topics: ["general"] },
  { slug: "peru", country: "PE", hostility: "medium", topics: ["general"] },
  { slug: "devsenespanol", country: "PAN-HISPANO", hostility: "medium", topics: ["dev"] },
  { slug: "programacion", country: "PAN-HISPANO", hostility: "medium", topics: ["dev"] },
  { slug: "emprendedores", country: "PAN-HISPANO", hostility: "low", topics: ["business"] },
  { slug: "startups_es", country: "PAN-HISPANO", hostility: "low", topics: ["business"] },
  { slug: "SEO", country: "PAN-HISPANO", hostility: "medium", topics: ["marketing"] },
  { slug: "Marketing", country: "PAN-HISPANO", hostility: "medium", topics: ["marketing"] },
  { slug: "freelance", country: "PAN-HISPANO", hostility: "medium", topics: ["business"] },
];

export function getSubredditMeta(slug: string): SubredditMeta | undefined {
  return CURATED_SUBREDDITS.find((s) => s.slug.toLowerCase() === slug.toLowerCase());
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck
git add convex/data/subreddits.ts
git commit -m "feat(data): curated subreddits catalog with country, hostility, topics

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

### Task 3: Retry helper with jitter (TDD)

**Files:**
- Create: `convex/lib/retry.ts`
- Create: `tests/lib/retry.test.ts`

- [ ] **Step 1: Write failing test `tests/lib/retry.test.ts`**

```typescript
import { describe, expect, test, vi } from "vitest";
import { withRetry } from "../../convex/lib/retry";

describe("withRetry", () => {
  test("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on transient 503 then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("does not retry on 400", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toEqual({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("gives up after maxRetries", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 500 });
    await expect(
      withRetry(fn, { baseDelayMs: 1, maxRetries: 2 })
    ).rejects.toEqual({ status: 500 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("delays differ between concurrent retries (jitter)", async () => {
    const sleeps: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (cb: any, ms?: number) => {
        sleeps.push(ms ?? 0);
        return originalSetTimeout(cb, 0);
      }
    );
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue("ok");
    await Promise.all([
      withRetry(fn, { baseDelayMs: 1000 }),
      withRetry(fn, { baseDelayMs: 1000 }),
    ]);
    vi.restoreAllMocks();
    // both calls should have produced different sleep durations due to jitter
    const uniqueSleeps = new Set(sleeps);
    expect(uniqueSleeps.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

```bash
npm test -- retry
```

Expected: FAIL with "Cannot find module '../../convex/lib/retry'".

- [ ] **Step 3: Implement `convex/lib/retry.ts`**

```typescript
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  shouldRetry?: (err: any) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, shouldRetry = isTransient } = opts;
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !shouldRetry(err)) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

function isTransient(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  return (
    status === 429 ||
    (typeof status === "number" && status >= 500 && status < 600) ||
    err?.code === "ECONNRESET" ||
    err?.code === "ETIMEDOUT"
  );
}
```

- [ ] **Step 4: Run tests, expect 5/5 pass**

```bash
npm test -- retry
```

- [ ] **Step 5: Commit**

```bash
git add convex/lib/retry.ts tests/lib/retry.test.ts
git commit -m "feat(lib): retry helper with exponential backoff + jitter

- Retries on 429, 5xx, ECONNRESET, ETIMEDOUT
- Jitter prevents thundering herd: delay * (0.5 + Math.random())
- Configurable maxRetries (default 3) and baseDelayMs (default 1000)
- 5 test cases: success, retry-then-success, no-retry-4xx, max-attempts, jitter

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

### Task 4: Dialect detector (TDD)

**Files:**
- Create: `convex/lib/dialect.ts`
- Create: `tests/lib/dialect.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, expect, test } from "vitest";
import { detectDialect } from "../../convex/lib/dialect";

describe("detectDialect", () => {
  test("detects es-LATAM via 'vos' / 'che'", () => {
    expect(detectDialect("Che, no sabés cómo me ayudó")).toBe("es-LATAM");
    expect(detectDialect("vos podés probarlo")).toBe("es-LATAM");
  });

  test("detects es-ES via 'vosotros' / 'tío'", () => {
    expect(detectDialect("vosotros podéis probarlo")).toBe("es-ES");
    expect(detectDialect("Tío, mira esto")).toBe("es-ES");
  });

  test("falls back to es-neutral when ambiguous", () => {
    expect(detectDialect("Hola, busco un programador para mi proyecto")).toBe("es-neutral");
  });

  test("case-insensitive markers", () => {
    expect(detectDialect("VOSOTROS deberíais saberlo")).toBe("es-ES");
    expect(detectDialect("CHE, vení a verlo")).toBe("es-LATAM");
  });

  test("ignores partial-word matches", () => {
    // 'tio' inside 'estudio' should NOT trigger es-ES
    expect(detectDialect("Estudio diseño desde casa")).toBe("es-neutral");
  });
});
```

- [ ] **Step 2: Run, confirm failure, then implement `convex/lib/dialect.ts`**

```typescript
export type Dialect = "es-neutral" | "es-ES" | "es-LATAM";

const ES_MARKERS = /\b(vosotros|vosotras|vuestro|vuestra|tío|tía|joder|guay|vale)\b/i;
const LATAM_MARKERS = /\b(vos|sos|tenés|querés|sabés|podés|che|órale|chido|bacán|chévere)\b/i;

export function detectDialect(text: string): Dialect {
  const hasES = ES_MARKERS.test(text);
  const hasLatam = LATAM_MARKERS.test(text);
  if (hasLatam && !hasES) return "es-LATAM";
  if (hasES && !hasLatam) return "es-ES";
  return "es-neutral";
}
```

- [ ] **Step 3: Tests pass, commit**

```bash
npm test -- dialect
git add convex/lib/dialect.ts tests/lib/dialect.test.ts
git commit -m "feat(lib): dialect detector for es-ES vs es-LATAM via lexical markers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

### Task 5: Cost guard + quota helpers (TDD)

**Files:**
- Create: `convex/lib/costGuard.ts`
- Create: `convex/lib/quota.ts`
- Create: `convex/usage.ts`
- Create: `tests/lib/costGuard.test.ts`
- Create: `tests/lib/quota.test.ts`

- [ ] **Step 1: Create `convex/usage.ts`**

```typescript
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const totalCostToday = internalQuery({
  args: { dateKey: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("usageDaily")
      .withIndex("by_date", (q) => q.eq("dateKey", args.dateKey))
      .collect();
    return rows.reduce((sum, r) => sum + r.geminiCostCents, 0);
  },
});

export const getOrCreate = internalMutation({
  args: { userId: v.id("users"), dateKey: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("usageDaily")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("dateKey", args.dateKey)
      )
      .unique();
    if (existing) return existing;
    const id = await ctx.db.insert("usageDaily", {
      userId: args.userId,
      dateKey: args.dateKey,
      scoringCalls: 0,
      replyGenerations: 0,
      keywordGenerations: 0,
      geminiCostCents: 0,
    });
    return await ctx.db.get(id);
  },
});

export const incrementScoring = internalMutation({
  args: {
    userId: v.id("users"),
    dateKey: v.string(),
    costCents: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("usageDaily")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("dateKey", args.dateKey)
      )
      .unique();
    if (!row) {
      await ctx.db.insert("usageDaily", {
        userId: args.userId,
        dateKey: args.dateKey,
        scoringCalls: 1,
        replyGenerations: 0,
        keywordGenerations: 0,
        geminiCostCents: args.costCents,
      });
    } else {
      await ctx.db.patch(row._id, {
        scoringCalls: row.scoringCalls + 1,
        geminiCostCents: row.geminiCostCents + args.costCents,
      });
    }
  },
});

export function utcDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Write test for cost guard**

```typescript
// tests/lib/costGuard.test.ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

describe("costGuard", () => {
  test("totalCostToday returns 0 when no usage rows", async () => {
    const t = convexTest(schema);
    const total = await t.query(internal.usage.totalCostToday, {
      dateKey: "2026-04-30",
    });
    expect(total).toBe(0);
  });

  test("totalCostToday sums geminiCostCents across users", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const u1 = await ctx.db.insert("users", {
        clerkUserId: "u1", email: "u1@test.com", tier: "free",
        languagePreference: "es-neutral", createdAt: 0, lastActiveAt: 0,
      });
      const u2 = await ctx.db.insert("users", {
        clerkUserId: "u2", email: "u2@test.com", tier: "free",
        languagePreference: "es-neutral", createdAt: 0, lastActiveAt: 0,
      });
      await ctx.db.insert("usageDaily", {
        userId: u1, dateKey: "2026-04-30",
        scoringCalls: 5, replyGenerations: 0, keywordGenerations: 0,
        geminiCostCents: 150,
      });
      await ctx.db.insert("usageDaily", {
        userId: u2, dateKey: "2026-04-30",
        scoringCalls: 10, replyGenerations: 0, keywordGenerations: 0,
        geminiCostCents: 250,
      });
    });
    const total = await t.query(internal.usage.totalCostToday, {
      dateKey: "2026-04-30",
    });
    expect(total).toBe(400);
  });
});
```

- [ ] **Step 3: Push convex, run tests**

```bash
npx convex dev --once
npm test -- costGuard
```

Both tests must pass.

- [ ] **Step 4: Implement `convex/lib/costGuard.ts`**

```typescript
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { utcDateKey } from "../usage";

export const TRIPWIRE_USD_CENTS = 500;
export const KILL_USD_CENTS = 5000;

export class CostKillSwitchError extends Error {
  constructor(public totalCents: number) {
    super(`Cost kill switch engaged — daily total ${totalCents} cents exceeds ${KILL_USD_CENTS}`);
    this.name = "CostKillSwitchError";
  }
}

export async function ensureCostGuardOk(ctx: ActionCtx, op: string): Promise<void> {
  const today = utcDateKey(Date.now());
  const total = await ctx.runQuery(internal.usage.totalCostToday, { dateKey: today });

  if (total >= KILL_USD_CENTS) {
    await ctx.runMutation(internal.errorLog.insert, {
      service: "costGuard", operation: op,
      errorMessage: `KILL: daily cost ${total} cents exceeds ${KILL_USD_CENTS}`,
      severity: "critical",
    });
    throw new CostKillSwitchError(total);
  }

  if (total >= TRIPWIRE_USD_CENTS) {
    await ctx.runMutation(internal.campaigns.pauseAllActive, {});
    await ctx.runMutation(internal.errorLog.insert, {
      service: "costGuard", operation: op,
      errorMessage: `TRIPWIRE: daily cost ${total} cents exceeds ${TRIPWIRE_USD_CENTS}`,
      severity: "warn",
    });
  }
}
```

- [ ] **Step 5: Quota helper**

```typescript
// convex/lib/quota.ts
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { utcDateKey } from "../usage";

export type QuotaOp = "scoring" | "reply" | "keyword";

const QUOTAS: Record<"free" | "trial" | "pro", Record<QuotaOp, number>> = {
  free:  { scoring: 20,  reply: 5,  keyword: 5 },
  trial: { scoring: 200, reply: 50, keyword: 20 },
  pro:   { scoring: 200, reply: 50, keyword: 20 },
};

export class QuotaExceededError extends Error {
  constructor(public op: QuotaOp, public used: number, public limit: number) {
    super(`Quota exceeded for ${op}: ${used}/${limit}`);
    this.name = "QuotaExceededError";
  }
}

export async function ensureUserQuotaOk(
  ctx: ActionCtx,
  userId: any,
  op: QuotaOp
): Promise<void> {
  const dateKey = utcDateKey(Date.now());
  const user = await ctx.runQuery(internal.users.getInternal, { userId });
  if (!user) throw new Error(`User not found: ${userId}`);
  const limit = QUOTAS[user.tier][op];
  const row = await ctx.runMutation(internal.usage.getOrCreate, { userId, dateKey });
  const counterField =
    op === "scoring" ? "scoringCalls" :
    op === "reply" ? "replyGenerations" : "keywordGenerations";
  const used = row?.[counterField] ?? 0;
  if (used >= limit) {
    throw new QuotaExceededError(op, used, limit);
  }
}
```

- [ ] **Step 6: Add `users.getInternal` and `campaigns.pauseAllActive`**

Append to `convex/users.ts`:

```typescript
import { internalQuery } from "./_generated/server";

export const getInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});
```

Create `convex/campaigns.ts`:

```typescript
import { internalMutation } from "./_generated/server";

export const pauseAllActive = internalMutation({
  handler: async (ctx) => {
    const active = await ctx.db
      .query("campaigns")
      .withIndex("by_status_lastPolled", (q) => q.eq("status", "active"))
      .collect();
    for (const c of active) {
      await ctx.db.patch(c._id, { status: "paused" });
    }
    return active.length;
  },
});
```

- [ ] **Step 7: Push convex, typecheck, commit**

```bash
npx convex dev --once
npm run typecheck
npm test
git add convex tests
git commit -m "feat(lib): cost guard + quota helpers with tests

- usage.totalCostToday, getOrCreate, incrementScoring (internal)
- utcDateKey utility (UTC YYYY-MM-DD)
- costGuard.ensureCostGuardOk: tripwire \$5 (pause active campaigns), kill \$50 (throw)
- quota.ensureUserQuotaOk: per-tier per-op limits
- campaigns.pauseAllActive (used by tripwire)
- users.getInternal (needed for tier lookup from actions)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

### Task 6: Reddit client wrapper (TDD with msw)

**Files:**
- Create: `convex/lib/reddit.ts`
- Create: `tests/integration/reddit.test.ts`
- Create: `tests/fixtures/reddit/*.json`
- Modify: `package.json` (add `msw` devDep)

- [ ] **Step 1: Install msw**

```bash
npm install --save-dev msw@^2.6.0
```

- [ ] **Step 2: Create fixtures**

`tests/fixtures/reddit/search-page.json`:

```json
{
  "kind": "Listing",
  "data": {
    "after": null,
    "children": [
      {
        "kind": "t3",
        "data": {
          "id": "abc123",
          "subreddit": "españa",
          "title": "Busco programador para web",
          "selftext": "Hola, necesito ayuda con mi proyecto. Tío, ¿alguien puede recomendar?",
          "author": "user_test",
          "url": "https://reddit.com/r/españa/abc123",
          "permalink": "/r/españa/comments/abc123/busco_programador/",
          "created_utc": 1714485600,
          "author_flair_text": null
        }
      }
    ]
  }
}
```

`tests/fixtures/reddit/post-deleted.json`:

```json
{
  "kind": "Listing",
  "data": {
    "children": [
      {
        "kind": "t3",
        "data": {
          "id": "del001",
          "subreddit": "españa",
          "title": "[deleted]",
          "selftext": "[deleted]",
          "author": "[deleted]",
          "url": "",
          "permalink": "/r/españa/comments/del001/",
          "created_utc": 1714485600
        }
      }
    ]
  }
}
```

- [ ] **Step 3: Implement `convex/lib/reddit.ts`**

```typescript
import { withRetry } from "./retry";

export interface RedditPostRaw {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  url: string;
  permalink: string;
  created_utc: number;
}

interface SearchListing {
  data: { children: { data: RedditPostRaw }[] };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  if (!id || !secret || !username || !password) {
    throw new Error("Reddit credentials not configured");
  }
  const auth = btoa(`${id}:${secret}`);
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "web:com.gethebra.app:v1.0.0 (by /u/hebra_app)",
    },
    body: `grant_type=password&username=${username}&password=${password}`,
  });
  if (!res.ok) {
    const err = new Error(`Reddit auth failed: ${res.status}`) as any;
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cachedToken.token;
}

export interface FetchedPost {
  redditId: string;
  subreddit: string;
  title: string;
  body: string;
  author: string;
  url: string;
  permalink: string;
  postedAt: number;
}

export async function searchSubreddit(
  subreddit: string,
  keyword: string,
  limit = 25
): Promise<FetchedPost[]> {
  const token = await getToken();
  const url = new URL(`https://oauth.reddit.com/r/${subreddit}/search`);
  url.searchParams.set("q", keyword);
  url.searchParams.set("restrict_sr", "true");
  url.searchParams.set("sort", "new");
  url.searchParams.set("t", "hour");
  url.searchParams.set("limit", String(limit));

  const res = await withRetry(async () => {
    const r = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "web:com.gethebra.app:v1.0.0 (by /u/hebra_app)",
      },
    });
    if (!r.ok) {
      const err = new Error(`Reddit search failed: ${r.status}`) as any;
      err.status = r.status;
      throw err;
    }
    return r;
  });

  const json = (await res.json()) as SearchListing;
  return json.data.children
    .map((c) => c.data)
    .filter((p) => p.author !== "[deleted]" && p.title !== "[deleted]")
    .map((p) => ({
      redditId: `t3_${p.id}`,
      subreddit: p.subreddit,
      title: p.title,
      body: p.selftext ?? "",
      author: p.author,
      url: p.url,
      permalink: `https://reddit.com${p.permalink}`,
      postedAt: p.created_utc * 1000,
    }));
}
```

- [ ] **Step 4: Write integration test using msw**

`tests/integration/reddit.test.ts`:

```typescript
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import searchPage from "../fixtures/reddit/search-page.json";
import deletedPage from "../fixtures/reddit/post-deleted.json";
import { searchSubreddit } from "../../convex/lib/reddit";

const server = setupServer(
  http.post("https://www.reddit.com/api/v1/access_token", () =>
    HttpResponse.json({ access_token: "fake_token", expires_in: 3600 })
  )
);

beforeAll(() => {
  process.env.REDDIT_CLIENT_ID = "test_id";
  process.env.REDDIT_CLIENT_SECRET = "test_secret";
  process.env.REDDIT_USERNAME = "test_user";
  process.env.REDDIT_PASSWORD = "test_pw";
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("searchSubreddit", () => {
  test("returns mapped FetchedPost array", async () => {
    server.use(
      http.get("https://oauth.reddit.com/r/españa/search", () =>
        HttpResponse.json(searchPage)
      )
    );
    const posts = await searchSubreddit("españa", "programador");
    expect(posts).toHaveLength(1);
    expect(posts[0].redditId).toBe("t3_abc123");
    expect(posts[0].subreddit).toBe("españa");
    expect(posts[0].title).toBe("Busco programador para web");
    expect(posts[0].permalink).toBe("https://reddit.com/r/españa/comments/abc123/busco_programador/");
  });

  test("filters out deleted authors", async () => {
    server.use(
      http.get("https://oauth.reddit.com/r/españa/search", () =>
        HttpResponse.json(deletedPage)
      )
    );
    const posts = await searchSubreddit("españa", "any");
    expect(posts).toHaveLength(0);
  });

  test("retries on 503 then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get("https://oauth.reddit.com/r/españa/search", () => {
        calls++;
        if (calls < 2) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json(searchPage);
      })
    );
    const posts = await searchSubreddit("españa", "any");
    expect(posts).toHaveLength(1);
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests, expect 3/3 pass**

```bash
npm test -- reddit
```

If tests fail because of node fetch / btoa missing in vitest edge runtime, switch test environment for this file to `node`. Add at top of test file: `// @vitest-environment node`.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/reddit.ts tests/integration/reddit.test.ts tests/fixtures/reddit package.json package-lock.json
git commit -m "feat(reddit): oauth client wrapper + msw integration tests

- searchSubreddit: keyword search restricted to subreddit, last hour, sort=new
- Token cache with 60s expiry buffer
- Filters deleted authors and titles
- 3 integration tests with msw fixtures: success, deleted-filter, 503-retry
- User-Agent honest per reddit ToS

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

### Task 7: Gemini wrapper + scoring action (TDD)

**Files:**
- Create: `convex/lib/gemini.ts`
- Create: `convex/actions/scoreLead.ts`
- Create: `convex/posts.ts`
- Create: `convex/leads.ts`
- Create: `tests/fixtures/gemini/*.json`
- Create: `tests/integration/scoreLead.test.ts`

- [ ] **Step 1: Implement `convex/lib/gemini.ts`**

```typescript
import { withRetry } from "./retry";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface ScoringResult {
  score: number;
  reasoning: string;
}

const SCORING_SCHEMA = {
  type: "OBJECT",
  properties: {
    score: { type: "INTEGER" },
    reasoning: { type: "STRING" },
  },
  required: ["score", "reasoning"],
};

export async function scoreIntent(
  postTitle: string,
  postBody: string,
  campaignOffering: string
): Promise<ScoringResult & { costCents: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const prompt = buildScoringPrompt(postTitle, postBody, campaignOffering);
  const url = `${ENDPOINT}/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  const res = await withRetry(async () => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCORING_SCHEMA,
          temperature: 0.2,
        },
      }),
    });
    if (!r.ok) {
      const err = new Error(`Gemini error: ${r.status}`) as any;
      err.status = r.status;
      throw err;
    }
    return r;
  });

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const usage = data?.usageMetadata ?? { promptTokenCount: 0, candidatesTokenCount: 0 };
  const costCents = computeCostCents(usage.promptTokenCount, usage.candidatesTokenCount);

  const parsed = safeParseScoring(text);
  return { ...parsed, costCents };
}

function buildScoringPrompt(title: string, body: string, offering: string): string {
  return `You are a lead-scoring agent for a Spanish freelancer/agency platform.
Score this Reddit post on a scale 0-100 for how likely it represents a buying intent for the offering described.

OFFERING: ${offering}

POST TITLE: ${title}

POST BODY: ${body}

Score guidelines:
- 85-100: explicit need, ready to hire, budget mentioned
- 70-84: clear pain point, evaluating options
- 50-69: tangentially related, exploratory
- 0-49: not a fit

Return JSON: { "score": <int 0-100>, "reasoning": "<one sentence in Spanish>" }`;
}

export function safeParseScoring(text: string): ScoringResult {
  try {
    const obj = JSON.parse(text);
    const score = typeof obj.score === "number" ? Math.max(0, Math.min(100, obj.score)) : 0;
    const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "scoring failed";
    return { score, reasoning };
  } catch {
    return { score: 0, reasoning: "scoring failed: malformed response" };
  }
}

// Gemini Flash-Lite pricing approx: $0.075/M input, $0.40/M output
function computeCostCents(inputTokens: number, outputTokens: number): number {
  const cents = (inputTokens * 0.075 + outputTokens * 0.4) / 1000 / 10; // /10 = M to cents
  return Math.ceil(cents * 1000) / 1000; // 3 decimals
}
```

- [ ] **Step 2: Implement `convex/posts.ts` and `convex/leads.ts`**

```typescript
// convex/posts.ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { detectDialect } from "./lib/dialect";

export const upsertBatch = internalMutation({
  args: {
    posts: v.array(
      v.object({
        redditId: v.string(),
        subreddit: v.string(),
        title: v.string(),
        body: v.string(),
        author: v.string(),
        url: v.string(),
        permalink: v.string(),
        postedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const newIds: any[] = [];
    for (const p of args.posts) {
      const existing = await ctx.db
        .query("redditPosts")
        .withIndex("by_redditId", (q) => q.eq("redditId", p.redditId))
        .unique();
      if (existing) continue;
      const id = await ctx.db.insert("redditPosts", {
        ...p,
        fetchedAt: Date.now(),
        detectedDialect: detectDialect(`${p.title}\n${p.body}`),
        language: "es",
      });
      newIds.push(id);
    }
    return newIds;
  },
});
```

```typescript
// convex/leads.ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const insert = internalMutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    postId: v.id("redditPosts"),
    matchedKeyword: v.string(),
    score: v.number(),
    tier: v.union(v.literal("hot"), v.literal("warm"), v.literal("cold")),
    reasoning: v.string(),
  },
  handler: async (ctx, args) => {
    // dedupe: don't insert if (postId, userId) pair already exists
    const existing = await ctx.db
      .query("leads")
      .withIndex("by_post_user", (q) =>
        q.eq("postId", args.postId).eq("userId", args.userId)
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("leads", {
      ...args,
      read: false,
      archived: false,
      scoredAt: Date.now(),
    });
  },
});
```

- [ ] **Step 3: Implement `convex/actions/scoreLead.ts`**

```typescript
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { ensureCostGuardOk } from "../lib/costGuard";
import { ensureUserQuotaOk, QuotaExceededError } from "../lib/quota";
import { scoreIntent } from "../lib/gemini";
import { utcDateKey } from "../usage";

export const scoreLead = internalAction({
  args: {
    postId: v.id("redditPosts"),
    campaignId: v.id("campaigns"),
    userId: v.id("users"),
    matchedKeyword: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      await ensureCostGuardOk(ctx, "scoreLead");
      await ensureUserQuotaOk(ctx, args.userId, "scoring");
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        // soft skip; not a system failure
        await ctx.runMutation(internal.errorLog.insert, {
          service: "scoreLead", operation: "quota",
          errorMessage: err.message, severity: "info",
          context: { userId: args.userId },
        });
        return;
      }
      throw err;
    }

    const post = await ctx.runQuery(internal.posts.get, { postId: args.postId });
    const campaign = await ctx.runQuery(internal.campaigns.get, { campaignId: args.campaignId });
    if (!post || !campaign) return;

    let result;
    try {
      result = await scoreIntent(post.title, post.body, campaign.offering);
    } catch (err: any) {
      await ctx.runMutation(internal.errorLog.insert, {
        service: "gemini", operation: "scoreIntent",
        errorMessage: err.message ?? "unknown",
        errorCode: String(err.status ?? ""),
        severity: "error",
      });
      return;
    }

    const tier =
      result.score >= 85 ? "hot" :
      result.score >= 70 ? "warm" : "cold";

    await ctx.runMutation(internal.leads.insert, {
      userId: args.userId,
      campaignId: args.campaignId,
      postId: args.postId,
      matchedKeyword: args.matchedKeyword,
      score: result.score,
      tier,
      reasoning: result.reasoning,
    });

    await ctx.runMutation(internal.usage.incrementScoring, {
      userId: args.userId,
      dateKey: utcDateKey(Date.now()),
      costCents: Math.round(result.costCents),
    });
  },
});
```

- [ ] **Step 4: Add helper queries**

Append to `convex/posts.ts`:

```typescript
import { internalQuery } from "./_generated/server";
export const get = internalQuery({
  args: { postId: v.id("redditPosts") },
  handler: async (ctx, args) => ctx.db.get(args.postId),
});
```

Append to `convex/campaigns.ts`:

```typescript
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
export const get = internalQuery({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => ctx.db.get(args.campaignId),
});
```

- [ ] **Step 5: Create gemini fixtures**

`tests/fixtures/gemini/score-hot.json`:
```json
{
  "candidates": [{
    "content": {
      "parts": [{ "text": "{\"score\": 92, \"reasoning\": \"Pide explícitamente programador con presupuesto.\"}" }]
    }
  }],
  "usageMetadata": { "promptTokenCount": 600, "candidatesTokenCount": 50 }
}
```

`tests/fixtures/gemini/score-malformed.json`:
```json
{
  "candidates": [{
    "content": {
      "parts": [{ "text": "this is not json at all" }]
    }
  }],
  "usageMetadata": { "promptTokenCount": 600, "candidatesTokenCount": 10 }
}
```

- [ ] **Step 6: Write integration test**

`tests/integration/scoreLead.test.ts`:

```typescript
// @vitest-environment node
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import scoreHot from "../fixtures/gemini/score-hot.json";
import scoreMalformed from "../fixtures/gemini/score-malformed.json";
import { scoreIntent, safeParseScoring } from "../../convex/lib/gemini";

const server = setupServer();
beforeAll(() => {
  process.env.GEMINI_API_KEY = "test_key";
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("scoreIntent", () => {
  test("returns parsed score from valid response", async () => {
    server.use(
      http.post(/generativelanguage\.googleapis\.com.*/, () =>
        HttpResponse.json(scoreHot)
      )
    );
    const result = await scoreIntent("Busco programador", "necesito web", "Freelance dev");
    expect(result.score).toBe(92);
    expect(result.reasoning).toContain("programador");
    expect(result.costCents).toBeGreaterThan(0);
  });

  test("falls back to score 0 on malformed response", async () => {
    server.use(
      http.post(/generativelanguage\.googleapis\.com.*/, () =>
        HttpResponse.json(scoreMalformed)
      )
    );
    const result = await scoreIntent("title", "body", "offering");
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain("malformed");
  });
});

describe("safeParseScoring", () => {
  test("clamps score above 100", () => {
    expect(safeParseScoring(JSON.stringify({ score: 150, reasoning: "x" })).score).toBe(100);
  });
  test("clamps score below 0", () => {
    expect(safeParseScoring(JSON.stringify({ score: -10, reasoning: "x" })).score).toBe(0);
  });
});
```

- [ ] **Step 7: Run all tests, push convex, commit**

```bash
npx convex dev --once
npm test
npm run typecheck
git add convex tests
git commit -m "feat(scoring): gemini intent scoring action with cost guard + quota

- gemini.scoreIntent: structured JSON via responseSchema, malformed-fallback
- posts.upsertBatch: idempotent insert by redditId, dialect detection
- leads.insert: idempotent by (postId, userId)
- actions/scoreLead: full pipeline with cost guard, quota, error logging
- Pricing-aware costCents calc per call (recorded in usageDaily)
- Integration tests: hot scoring, malformed fallback, score clamping

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

### Task 8: Polling cron + chunking

**Files:**
- Create: `convex/crons.ts`
- Create: `convex/crons/pollReddit.ts`
- Modify: `convex/campaigns.ts` (add `listActiveStale`, `markPolled`)

- [ ] **Step 1: Create `convex/crons.ts`**

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly(
  "poll-active-campaigns",
  { minuteUTC: 0 },
  internal.crons.pollReddit.tick,
);

export default crons;
```

- [ ] **Step 2: Add helpers to `convex/campaigns.ts`**

```typescript
export const listActiveStale = internalQuery({
  args: { staleBefore: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("campaigns")
      .withIndex("by_status_lastPolled", (q) =>
        q.eq("status", "active").lt("lastPolledAt", args.staleBefore)
      )
      .collect();
  },
});

export const markPolled = internalMutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId, { lastPolledAt: Date.now() });
  },
});
```

(Add the imports `v`, `internalQuery`, `internalMutation` if not present.)

- [ ] **Step 3: Create `convex/crons/pollReddit.ts`**

```typescript
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { searchSubreddit } from "../lib/reddit";

const ONE_HOUR = 60 * 60 * 1000;

export const tick = internalAction({
  handler: async (ctx) => {
    const stale = await ctx.runQuery(internal.campaigns.listActiveStale, {
      staleBefore: Date.now() - ONE_HOUR,
    });
    for (const campaign of stale) {
      await ctx.scheduler.runAfter(0, internal.crons.pollReddit.processCampaign, {
        campaignId: campaign._id,
      });
    }
  },
});

export const processCampaign = internalAction({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.runQuery(internal.campaigns.get, {
      campaignId: args.campaignId,
    });
    if (!campaign || campaign.status !== "active") return;

    for (const subreddit of campaign.subredditSlugs) {
      for (const keyword of campaign.keywords) {
        let posts;
        try {
          posts = await searchSubreddit(subreddit, keyword);
        } catch (err: any) {
          await ctx.runMutation(internal.errorLog.insert, {
            service: "reddit", operation: "search",
            errorMessage: err.message ?? "unknown",
            errorCode: String(err.status ?? ""),
            severity: "warn",
            context: { campaignId: args.campaignId, subreddit, keyword },
          });
          continue;
        }

        const newIds = await ctx.runMutation(internal.posts.upsertBatch, { posts });
        for (const postId of newIds) {
          await ctx.scheduler.runAfter(0, internal.actions.scoreLead.scoreLead, {
            postId,
            campaignId: args.campaignId,
            userId: campaign.userId,
            matchedKeyword: keyword,
          });
        }
      }
    }

    await ctx.runMutation(internal.campaigns.markPolled, {
      campaignId: args.campaignId,
    });
  },
});
```

- [ ] **Step 4: Push convex, typecheck, commit**

```bash
npx convex dev --once
npm run typecheck
git add convex/crons.ts convex/crons convex/campaigns.ts
git commit -m "feat(crons): hourly poll cron with per-campaign chunking

- crons.hourly tick: enumerates stale active campaigns, schedules processCampaign
- processCampaign: per (subreddit x keyword) search, upsert posts, schedule scoreLead
- Errors per (campaign, subreddit, keyword) logged but don't abort the batch
- 60s timeout avoidance: each processCampaign is independently scheduled

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

### Task 9: Manual integration test against Convex dev

**Files:** (no new files — manual verification)

- [ ] **Step 1: Set Reddit + Gemini env vars on Convex dev**

```bash
npx convex env set REDDIT_CLIENT_ID <real_id>
npx convex env set REDDIT_CLIENT_SECRET <real_secret>
npx convex env set REDDIT_USERNAME hebra_app
npx convex env set REDDIT_PASSWORD <real_password>
npx convex env set GEMINI_API_KEY <real_key>
```

- [ ] **Step 2: Insert a test campaign manually via Convex dashboard**

- Open https://dashboard.convex.dev/d/rugged-salamander-939/data/campaigns
- Insert row with your `userId` (from `users` table), keywords like `["programador", "freelance"]`, subredditSlugs `["españa"]`, status `active`, lastPolledAt `null`, valid replySettings.

- [ ] **Step 3: Trigger pollReddit manually**

In Convex dashboard → Functions → `crons/pollReddit:tick` → Run.

- [ ] **Step 4: Verify**

- `redditPosts` table populates with posts from r/españa.
- `leads` table populates with scored entries (score, tier, reasoning in Spanish).
- `usageDaily` increments scoringCalls and geminiCostCents.
- No critical entries in `errorLog`.

If any step fails, fix in iteration before pushing prod env vars.

- [ ] **Step 5: Set the same env vars on prod**

```bash
npx convex env set --prod REDDIT_CLIENT_ID <real_id>
# ... same for the other 4
```

- [ ] **Step 6: Deploy prod**

```bash
npx convex deploy -y
```

Cron will start running on prod immediately on the next hour boundary.

---

## Definition of Done

Plan 2 is complete when ALL of the following are true:

- ✅ Schema deployed to dev + prod with 7 tables and full index list.
- ✅ All Vitest tests pass (`npm test`): retry, dialect, costGuard, reddit, gemini.
- ✅ `npm run typecheck` clean.
- ✅ Manual integration test against dev produces ≥1 lead end-to-end.
- ✅ Cost guard tripwire pauses campaigns when total cost > $5/day (verified by manually inserting `usageDaily` rows summing > 500 cents).
- ✅ Quota errors are logged but don't crash the action.
- ✅ Cron is registered (visible in Convex dashboard → Schedule).
- ✅ Reddit + Gemini env vars set on prod.

---

## Out-of-scope for Plan 2 (covered in later plans)

- UI to create/edit campaigns — Plan 3.
- UI feed showing leads — Plan 3.
- Reply generation with Gemini Flash (full model) — Plan 3.
- Tone-tweak chips — Plan 3.
- Push notifications for hot leads — Plan 5.
- Email digest — Plan 5.
