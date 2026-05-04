# Plan 3 — UI: Feed + Campaign Creator + Reply Generation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hebra usable end-to-end as a human user. After this plan: a freelancer can sign up, create a campaign via a modal, see scored leads in a two-pane "Bandeja de Señales" inbox, generate AI-drafted replies, tweak them with chips, and copy them to Reddit in a single click.

**Architecture:** Pure Convex + Next.js 15 App Router. No new external services. Reactive `useQuery` for the inbox keeps it live as new leads land. Reply generation is a Convex action calling Gemini Flash (the larger model, not Flash-Lite). Tone-tweak chips re-call the same action with appended instructions.

**Tech Stack:** Next.js App Router (client components), Convex reactive queries + mutations + actions, Tailwind, Gemini Flash for reply generation.

**Reference spec:** `docs/superpowers/specs/2026-04-30-hebra-design.md` sections 5.1 (onboarding), 5.4 (reply gen + tweaks).

**Prerequisites:** Plan 1 + Plan 2 ingeniería complete. User can sign in. Cost guard, quotas, and lead-scoring pipeline are in place.

**Independent of Reddit approval status:** The UI development uses leads inserted manually for dogfooding. When Plan 2 Task 9 unblocks (Reddit credentials live), the same UI displays real leads automatically because `useQuery` is reactive.

---

## File Structure

**Created in this plan:**

```
convex/
├── replies.ts                       # NEW: insert + getByLead queries
├── leads.ts                         # MODIFY: add public queries (feedByUser, getById, markRead, archive)
├── campaigns.ts                     # MODIFY: add public createCampaign + listMine + pause/resume/archive
├── lib/
│   └── geminiReply.ts               # NEW: reply generation prompt + invocation
└── actions/
    └── generateReply.ts             # NEW: action with cost guard + quota + tweak history

app/(app)/
├── dashboard/page.tsx               # MODIFY: redirect to /feed if any campaigns, /onboarding otherwise
├── onboarding/page.tsx              # NEW: language preference + first-campaign CTA
├── campaigns/
│   ├── new/page.tsx                 # NEW: campaign creation modal-page
│   └── page.tsx                     # NEW: list user's campaigns
├── feed/
│   ├── page.tsx                     # NEW: two-pane inbox (list + detail)
│   └── [leadId]/page.tsx            # NEW: detail-only route for direct linking
└── layout.tsx                       # MODIFY: add /feed and /campaigns nav links

components/
├── feed/
│   ├── LeadList.tsx                 # left pane: chronological list with score badge
│   ├── LeadDetail.tsx               # right pane: post + draft + chips + copy button
│   ├── ScoreBadge.tsx               # 92 / "Caliente" pill
│   └── DialectChip.tsx              # es-ES / es-LATAM / es-neutral indicator
├── campaign/
│   ├── CampaignForm.tsx             # the full form (offering, keywords, subreddits, replySettings)
│   ├── KeywordRows.tsx              # add/remove keyword inputs with "Generate with AI" button
│   ├── SubredditPicker.tsx          # multi-select from CURATED_SUBREDDITS with hostility badges
│   └── ReplySettingsForm.tsx        # tone, length, style, dialect, CTA toggle, includePhrases
├── reply/
│   ├── DraftEditor.tsx              # textarea showing current draft, editable
│   └── TweakChips.tsx               # "más casual" / "más corto" / "menos comercial" chips
└── ui/
    ├── Card.tsx                     # primitive
    ├── Badge.tsx                    # primitive (used by ScoreBadge, DialectChip)
    └── Textarea.tsx                 # primitive

tests/
├── convex/
│   ├── leadFeed.test.ts             # feedByUser ordering, tier filtering, mark read
│   ├── replies.test.ts              # insert + getByLead
│   └── campaignCreate.test.ts       # public createCampaign validation + ownership
└── integration/
    └── geminiReply.test.ts          # reply generation prompt assembly + tweak append
```

---

### Task 1: Convex layer — public lead queries

**Files:**
- Modify: `convex/leads.ts` (add `feedByUser`, `getById`, `markRead`, `archive`, `unarchive` public queries/mutations)
- Create: `tests/convex/leadFeed.test.ts`

This task adds the queries the UI consumes. Auth is enforced via `ctx.auth.getUserIdentity()`.

- [ ] **Step 1: Read existing `convex/leads.ts`** to know what's already there.

- [ ] **Step 2: Append public exports**

```typescript
import { query, mutation } from "./_generated/server";
// (these are likely already imported; merge cleanly)

/**
 * Get the current user's leads, optionally filtered by tier.
 * Sorted by score descending then scoredAt descending (hottest first).
 *
 * Auth-gated via ctx.auth.getUserIdentity().
 */
export const feedByUser = query({
  args: {
    tierFilter: v.optional(
      v.union(v.literal("hot"), v.literal("warm"), v.literal("cold")),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) return [];

    let q = ctx.db
      .query("leads")
      .withIndex("by_user_tier", (q2) =>
        args.tierFilter
          ? q2.eq("userId", user._id).eq("tier", args.tierFilter)
          : q2.eq("userId", user._id),
      );

    const leads = await q.collect();
    // sort: hot first, then by scoredAt desc
    leads.sort((a, b) => {
      const tierOrder = { hot: 0, warm: 1, cold: 2 };
      const t = tierOrder[a.tier] - tierOrder[b.tier];
      if (t !== 0) return t;
      return b.scoredAt - a.scoredAt;
    });
    return leads;
  },
});

/**
 * Get a single lead by id, with the joined post for display.
 * Auth-checked: only returns if the lead belongs to the calling user.
 */
export const getById = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user || lead.userId !== user._id) return null;
    const post = await ctx.db.get(lead.postId);
    return { ...lead, post };
  },
});

export const markRead = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user || lead.userId !== user._id) {
      throw new Error("Not authorized for this lead");
    }
    if (!lead.read) await ctx.db.patch(args.leadId, { read: true });
  },
});

export const setArchived = mutation({
  args: { leadId: v.id("leads"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user || lead.userId !== user._id) {
      throw new Error("Not authorized for this lead");
    }
    await ctx.db.patch(args.leadId, { archived: args.archived });
  },
});
```

- [ ] **Step 3: Tests**

`tests/convex/leadFeed.test.ts`: cases — empty feed, multi-tier ordering (hot before warm before cold), tier filter, ownership enforcement (other user's leads not returned), markRead idempotent, setArchived round-trip.

(Use `t.run()` to seed users + posts + leads, then `t.query(api.leads.feedByUser)`. For auth-gated queries the same convex-test issue #50 limitation applies — we can test the "not authenticated" path returns `[]`/`null` but the authenticated path is harder. Pragmatic option: extract the core ordering logic into a pure helper called from the query, and unit-test the helper. Or accept that ownership tests are integration-only.)

- [ ] **Step 4: Push convex, verify tests pass, typecheck.**

- [ ] **Step 5: Commit message**

```
feat(leads): public queries for feed UI (auth-gated, sorted, ownership-enforced)
```

---

### Task 2: Convex layer — public campaign queries + create mutation

**Files:**
- Modify: `convex/campaigns.ts`
- Create: `tests/convex/campaignCreate.test.ts`

- [ ] **Step 1: Append public exports**

```typescript
/**
 * Lists the calling user's campaigns. Used by the campaigns list page
 * and to gate /feed (no campaigns → /onboarding).
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) return [];
    return await ctx.db
      .query("campaigns")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id))
      .collect();
  },
});

/**
 * Create a campaign owned by the calling user. Validates server-side
 * (offering length, keyword count, subreddit slug whitelist).
 */
export const createCampaign = mutation({
  args: {
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
        v.literal("direct-offer"),
      ),
      includeCTA: v.boolean(),
      personalize: v.boolean(),
      includePhrases: v.optional(v.string()),
      replyDialect: v.union(
        v.literal("es-neutral"),
        v.literal("es-ES"),
        v.literal("es-LATAM"),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    if (args.offering.length === 0 || args.offering.length > 300) {
      throw new Error("Offering must be 1-300 characters");
    }
    if (args.keywords.length === 0 || args.keywords.length > 20) {
      throw new Error("Provide 1-20 keywords");
    }
    if (args.subredditSlugs.length === 0 || args.subredditSlugs.length > 10) {
      throw new Error("Select 1-10 subreddits");
    }

    // Tier-based campaign cap: free=1, pro=3
    const existing = await ctx.db
      .query("campaigns")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id))
      .collect();
    const activeCount = existing.filter((c) => c.status !== "archived").length;
    const cap = user.tier === "free" ? 1 : 3;
    if (activeCount >= cap) {
      throw new Error(`Plan ${user.tier} permite máximo ${cap} campañas activas`);
    }

    return await ctx.db.insert("campaigns", {
      userId: user._id,
      name: args.name,
      offering: args.offering,
      websiteUrl: args.websiteUrl,
      keywords: args.keywords,
      subredditSlugs: args.subredditSlugs,
      replySettings: args.replySettings,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

export const setStatus = mutation({
  args: {
    campaignId: v.id("campaigns"),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) return;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user || campaign.userId !== user._id) {
      throw new Error("Not authorized");
    }
    await ctx.db.patch(args.campaignId, { status: args.status });
  },
});
```

- [ ] **Step 2: Tests**

`tests/convex/campaignCreate.test.ts`: validation cases (offering length, keyword count, subreddit count, tier cap free=1 / pro=3). Use `t.run()` to seed users since auth-gated paths can't be exercised through `t.mutation`. Extract the validation logic to a pure helper if you need to test rule logic in isolation.

- [ ] **Step 3: Commit**

```
feat(campaigns): public createCampaign with tier cap + listMine + setStatus
```

---

### Task 3: Convex layer — reply generation action

**Files:**
- Create: `convex/lib/geminiReply.ts` (prompt assembly + Gemini Flash invocation)
- Create: `convex/replies.ts` (insert + getByLead public query + setStatus)
- Create: `convex/actions/generateReply.ts` (action wired with cost guard + quota)
- Create: `tests/integration/geminiReply.test.ts`

- [ ] **Step 1: `convex/lib/geminiReply.ts`**

```typescript
import { withRetry } from "./retry";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface ReplySettings {
  tone: "casual" | "professional" | "friendly";
  length: "short" | "medium" | "long";
  style: "value-first" | "value-mention" | "direct-offer";
  includeCTA: boolean;
  personalize: boolean;
  includePhrases?: string;
  replyDialect: "es-neutral" | "es-ES" | "es-LATAM";
}

export async function generateReplyDraft(
  postTitle: string,
  postBody: string,
  campaignOffering: string,
  websiteUrl: string | undefined,
  settings: ReplySettings,
  appliedTweaks: string[] = [],
): Promise<{ draft: string; costCents: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const prompt = buildReplyPrompt(
    postTitle,
    postBody,
    campaignOffering,
    websiteUrl,
    settings,
    appliedTweaks,
  );
  const url = `${ENDPOINT}/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const res = await withRetry(async () => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    });
    if (!r.ok) {
      const err = new Error(`Gemini reply error: ${r.status}`) as Error & { status: number };
      err.status = r.status;
      throw err;
    }
    return r;
  });

  const data = await res.json();
  const draft = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const usage = data?.usageMetadata ?? { promptTokenCount: 0, candidatesTokenCount: 0 };
  // Gemini Flash pricing approx: $0.30/M in, $2.50/M out
  const usd = (usage.promptTokenCount * 0.3 + usage.candidatesTokenCount * 2.5) / 1_000_000;
  const costCents = usd * 100;
  return { draft, costCents };
}

export function buildReplyPrompt(
  title: string,
  body: string,
  offering: string,
  websiteUrl: string | undefined,
  s: ReplySettings,
  tweaks: string[],
): string {
  const dialect = s.replyDialect === "es-ES" ? "Spanish from Spain (peninsular: tú/tío/vale)"
    : s.replyDialect === "es-LATAM" ? "Latin American Spanish (vos/che acceptable, neutral if mixed)"
    : "neutral Spanish";
  const styleGuide = {
    "value-first": "Lead with concrete value or a specific tip relevant to their question. Mention your service ONLY if it directly answers them, and do so subtly.",
    "value-mention": "Provide value, then briefly mention what you offer as a possible fit.",
    "direct-offer": "Acknowledge their need and pitch your service directly. WARNING: this style risks downvotes/spam reports on Reddit. Use only when the post explicitly asks for service providers.",
  }[s.style];
  const lengthHint = {
    short: "1-2 sentences",
    medium: "3-5 sentences",
    long: "1-2 paragraphs",
  }[s.length];
  const cta = s.includeCTA
    ? "End with a soft call-to-action (DM offer, website link, or 'happy to chat'). Avoid pushy CTAs."
    : "Do not include any CTA. Just be helpful.";
  const personalize = s.personalize
    ? `Personalize by referencing specifics from the post (e.g., the user's situation, the project type they mentioned).`
    : "";
  const phrases = s.includePhrases
    ? `Try to organically include one of these phrases if natural: "${s.includePhrases}".`
    : "";
  const tweakSection = tweaks.length
    ? `\n\nADDITIONAL ADJUSTMENTS (apply on top of the base style):\n${tweaks.map((t) => `- ${t}`).join("\n")}`
    : "";

  return `You write a helpful, non-spammy reply to a Reddit post on behalf of a freelancer/agency.

DIALECT: write in ${dialect}.

TONE: ${s.tone}.
LENGTH: ${lengthHint}.
STYLE: ${styleGuide}
CTA: ${cta}
PERSONALIZATION: ${personalize}
${phrases}

FREELANCER'S OFFERING: ${offering}
${websiteUrl ? `WEBSITE: ${websiteUrl}` : ""}

POST TITLE: ${title}
POST BODY: ${body}${tweakSection}

Write the reply text only. No greetings like "Hello!" — Reddit replies usually start in-context. No sign-off. No quoting the original post.`;
}
```

- [ ] **Step 2: `convex/replies.ts`**

```typescript
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

export const insertInternal = internalMutation({
  args: {
    leadId: v.id("leads"),
    userId: v.id("users"),
    draftText: v.string(),
    tweaks: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("replies", {
      leadId: args.leadId,
      userId: args.userId,
      draftText: args.draftText,
      status: "draft",
      tweaks: args.tweaks,
      generatedAt: Date.now(),
    });
  },
});

export const getByLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("replies")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .first();
  },
});

export const markCopied = mutation({
  args: { replyId: v.id("replies") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    await ctx.db.patch(args.replyId, {
      status: "copied",
      copiedAt: Date.now(),
    });
  },
});

export const dismiss = mutation({
  args: { replyId: v.id("replies") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    await ctx.db.patch(args.replyId, { status: "dismissed" });
  },
});
```

NOTE: schema needs to confirm `replies` table exists. If Plan 2 didn't create it, add it now. Check `convex/schema.ts` and add if missing:

```typescript
replies: defineTable({
  leadId: v.id("leads"),
  userId: v.id("users"),
  draftText: v.string(),
  status: v.union(
    v.literal("draft"),
    v.literal("copied"),
    v.literal("dismissed"),
  ),
  tweaks: v.array(v.string()),
  generatedAt: v.number(),
  copiedAt: v.optional(v.number()),
})
  .index("by_lead", ["leadId"])
  .index("by_user_status", ["userId", "status"]),
```

- [ ] **Step 3: `convex/actions/generateReply.ts`**

```typescript
"use node";

import { v } from "convex/values";
import { internalAction, action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ensureCostGuardOk } from "../lib/costGuard";
import { ensureUserQuotaOk, QuotaExceededError } from "../lib/quota";
import { generateReplyDraft } from "../lib/geminiReply";
import { utcDateKey } from "../usage";

/**
 * Public action: generate (or regenerate with new tweaks) a reply draft.
 * Auth-gated. Cost-guarded. Quota-checked.
 */
export const generate = action({
  args: {
    leadId: v.id("leads"),
    appendTweak: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.runQuery(internal.users.getInternalByClerkId, {
      clerkUserId: identity.subject,
    });
    if (!user) throw new Error("User not found");

    await ensureCostGuardOk(ctx, "generateReply");
    try {
      await ensureUserQuotaOk(ctx, user._id, "reply");
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        throw new Error(`Quota daily de respuestas excedida (${err.used}/${err.limit})`);
      }
      throw err;
    }

    const lead = await ctx.runQuery(internal.leads.getInternal, { leadId: args.leadId });
    if (!lead || lead.userId !== user._id) throw new Error("Lead not found");
    const post = await ctx.runQuery(internal.posts.get, { postId: lead.postId });
    const campaign = await ctx.runQuery(internal.campaigns.get, { campaignId: lead.campaignId });
    if (!post || !campaign) throw new Error("Post or campaign missing");

    const previous = await ctx.runQuery(internal.replies.getLatestByLead, {
      leadId: args.leadId,
    });
    const tweaks = previous?.tweaks ?? [];
    if (args.appendTweak) tweaks.push(args.appendTweak);

    const { draft, costCents } = await generateReplyDraft(
      post.title,
      post.body,
      campaign.offering,
      campaign.websiteUrl,
      campaign.replySettings,
      tweaks,
    );

    const replyId = await ctx.runMutation(internal.replies.insertInternal, {
      leadId: args.leadId,
      userId: user._id,
      draftText: draft,
      tweaks,
    });

    await ctx.runMutation(internal.usage.incrementReply, {
      userId: user._id,
      dateKey: utcDateKey(Date.now()),
      costCents,
    });

    return replyId;
  },
});
```

This requires adding `internal.users.getInternalByClerkId`, `internal.leads.getInternal`, `internal.replies.getLatestByLead`, `internal.usage.incrementReply` — add these as small internal helpers in their respective files.

- [ ] **Step 4: Tests**

`tests/integration/geminiReply.test.ts`: prompt assembly determinism (same inputs → same prompt), tweak appending, dialect injection, malformed Gemini response handling.

- [ ] **Step 5: Commit**

```
feat(replies): generate action + draft mutations + Gemini Flash prompt
```

---

### Task 4: UI primitives

**Files:**
- Create: `components/ui/Card.tsx`
- Create: `components/ui/Badge.tsx`
- Create: `components/ui/Textarea.tsx`

Small, dumb, pure presentational components. No logic. Tailwind only.

```tsx
// components/ui/Card.tsx
import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-zinc-200 bg-white p-4 shadow-sm ${className}`}
      {...props}
    />
  );
}
```

```tsx
// components/ui/Badge.tsx
import type { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "hot" | "warm" | "cold" | "neutral";
}

const VARIANT = {
  default: "bg-zinc-100 text-zinc-700",
  hot: "bg-red-100 text-red-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-zinc-100 text-zinc-500",
  neutral: "bg-blue-50 text-blue-700",
};

export function Badge({ variant = "default", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${VARIANT[variant]} ${className}`}
      {...props}
    />
  );
}
```

```tsx
// components/ui/Textarea.tsx
import type { TextareaHTMLAttributes } from "react";

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-md border border-zinc-300 p-2 text-sm focus:border-zinc-500 focus:outline-none ${className}`}
      {...props}
    />
  );
}
```

Commit: `feat(ui): card, badge, textarea primitives`.

---

### Task 5: Onboarding + campaign creation flow

**Files:**
- Create: `app/(app)/onboarding/page.tsx`
- Create: `app/(app)/campaigns/new/page.tsx`
- Create: `app/(app)/campaigns/page.tsx`
- Create: `components/campaign/CampaignForm.tsx`
- Create: `components/campaign/KeywordRows.tsx`
- Create: `components/campaign/SubredditPicker.tsx`
- Create: `components/campaign/ReplySettingsForm.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (redirect logic)

The campaign creation experience is the most decisive feature for first-impression. From design doc §6: textarea offering, "Generate with AI" keywords, subreddit multi-select with hostility badges, full reply settings.

Detailed sub-tasks:

- [ ] **Step 1: `components/campaign/CampaignForm.tsx`**

A controlled form composing the smaller sub-components. Submit calls `useMutation(api.campaigns.createCampaign)` and on success redirects to `/feed`.

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { KeywordRows } from "./KeywordRows";
import { SubredditPicker } from "./SubredditPicker";
import { ReplySettingsForm } from "./ReplySettingsForm";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";

export function CampaignForm() {
  const router = useRouter();
  const create = useMutation(api.campaigns.createCampaign);
  const [name, setName] = useState("");
  const [offering, setOffering] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [keywords, setKeywords] = useState<string[]>([""]);
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [reply, setReply] = useState({
    tone: "friendly" as const,
    length: "medium" as const,
    style: "value-first" as const,
    includeCTA: false,
    personalize: true,
    includePhrases: "",
    replyDialect: "es-neutral" as const,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await create({
        name: name || "Campaña sin nombre",
        offering,
        websiteUrl: websiteUrl || undefined,
        keywords: keywords.filter((k) => k.trim().length > 0),
        subredditSlugs: subreddits,
        replySettings: {
          ...reply,
          includePhrases: reply.includePhrases || undefined,
        },
      });
      router.push("/feed");
    } catch (err: any) {
      setError(err?.message ?? "Error al crear campaña");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Nueva campaña</h1>

      <div>
        <label className="block text-sm font-medium">Nombre</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Freelance dev React"
          className="mt-1 w-full rounded-md border border-zinc-300 p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">¿Qué ofreces? (máx 300 chars)</label>
        <Textarea
          value={offering}
          maxLength={300}
          rows={3}
          onChange={(e) => setOffering(e.target.value)}
          placeholder="Soy desarrollador React/Next.js freelance, ayudo a SaaS y agencias con apps web. Disponible inmediato."
        />
        <p className="mt-1 text-xs text-zinc-500">{offering.length} / 300</p>
      </div>

      <div>
        <label className="block text-sm font-medium">Website (opcional)</label>
        <input
          type="url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://tudominio.com"
          className="mt-1 w-full rounded-md border border-zinc-300 p-2 text-sm"
        />
      </div>

      <KeywordRows
        keywords={keywords}
        onChange={setKeywords}
        offering={offering}
      />

      <SubredditPicker selected={subreddits} onChange={setSubreddits} />

      <ReplySettingsForm value={reply} onChange={setReply} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
        >
          Cancelar
        </button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creando…" : "Crear y empezar a buscar"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: `components/campaign/KeywordRows.tsx`**

Rows with add/remove + a "Generar con IA" button that calls a Convex action `keywords.generateFromOffering` (deferred — for MVP can be plain client-side: split offering into nouns; or a simple Gemini call). Document tradeoff.

(Skeleton — keep it simple for MVP, no AI generation in v1; add a TODO.)

- [ ] **Step 3: `components/campaign/SubredditPicker.tsx`**

Multi-select from `CURATED_SUBREDDITS`. Show hostility badge: "Hostil" (red) / "Neutral" (zinc) / "Amigable" (green).

```tsx
"use client";
import { CURATED_SUBREDDITS } from "@/convex/data/subreddits";
import { Badge } from "../ui/Badge";

interface Props {
  selected: string[];
  onChange: (slugs: string[]) => void;
}

const HOSTILITY_BADGE = {
  high: { label: "Hostil", variant: "hot" as const },
  medium: { label: "Neutral", variant: "default" as const },
  low: { label: "Amigable", variant: "warm" as const },
};

export function SubredditPicker({ selected, onChange }: Props) {
  const toggle = (slug: string) => {
    onChange(
      selected.includes(slug)
        ? selected.filter((s) => s !== slug)
        : [...selected, slug],
    );
  };

  return (
    <div>
      <label className="block text-sm font-medium">Subreddits a monitorizar</label>
      <p className="mt-1 text-xs text-zinc-500">
        "Hostil" indica subreddits poco tolerantes a auto-promo. Empieza con 3-5 amigables/neutrales.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {CURATED_SUBREDDITS.map((s) => {
          const active = selected.includes(s.slug);
          const h = HOSTILITY_BADGE[s.hostility];
          return (
            <button
              type="button"
              key={s.slug}
              onClick={() => toggle(s.slug)}
              className={`flex items-center justify-between rounded-md border p-2 text-left text-sm ${active ? "border-black bg-zinc-50" : "border-zinc-300"}`}
            >
              <span>r/{s.slug}</span>
              <Badge variant={h.variant}>{h.label}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `components/campaign/ReplySettingsForm.tsx`**

Tone (3 buttons), Length (3 buttons), Style (3 buttons with warning on direct-offer), CTA toggle, Personalize toggle, includePhrases textarea.

- [ ] **Step 5: Pages**

`app/(app)/campaigns/new/page.tsx`:
```tsx
import { CampaignForm } from "@/components/campaign/CampaignForm";

export default function NewCampaignPage() {
  return <CampaignForm />;
}
```

`app/(app)/campaigns/page.tsx` lists campaigns with status toggle.

`app/(app)/onboarding/page.tsx` is a soft welcome → CTA to /campaigns/new.

- [ ] **Step 6: Modify dashboard** (redirect):

```tsx
"use client";
import { useEffect } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";

export default function DashboardPage() {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const router = useRouter();
  const user = useQuery(api.users.current);
  const campaigns = useQuery(api.campaigns.listMine);

  useEffect(() => {
    if (!isAuthenticated) return;
    storeUser().catch(console.error);
  }, [isAuthenticated, storeUser]);

  useEffect(() => {
    if (user === null || user === undefined) return;
    if (campaigns === undefined) return;
    if (campaigns.length === 0) router.replace("/onboarding");
    else router.replace("/feed");
  }, [user, campaigns, router]);

  return <p>Cargando…</p>;
}
```

- [ ] **Step 7: Tests + manual verification + commit**

Build, typecheck, manual click-through: signup → onboarding → campaign creation → feed empty state.

Commit: `feat(ui): onboarding + campaign creation flow`.

---

### Task 6: Bandeja de Señales — two-pane inbox

**Files:**
- Create: `app/(app)/feed/page.tsx`
- Create: `app/(app)/feed/[leadId]/page.tsx`
- Create: `components/feed/LeadList.tsx`
- Create: `components/feed/LeadDetail.tsx`
- Create: `components/feed/ScoreBadge.tsx`
- Create: `components/feed/DialectChip.tsx`

Two-pane layout: left list (chronological + tier-grouped), right detail (post + draft + chips + copy button).

`components/feed/ScoreBadge.tsx`:
```tsx
import { Badge } from "../ui/Badge";

const LABEL = { hot: "Caliente", warm: "Tibia", cold: "Fría" };

export function ScoreBadge({ tier, score }: { tier: "hot" | "warm" | "cold"; score: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-bold">{score}</span>
      <Badge variant={tier === "hot" ? "hot" : tier === "warm" ? "warm" : "cold"}>
        {LABEL[tier]}
      </Badge>
    </div>
  );
}
```

`components/feed/LeadList.tsx`: scrollable list. Each row: ScoreBadge + post title (truncated) + subreddit + relative time.

`components/feed/LeadDetail.tsx`:
- Top: post title, body, permalink, dialect chip, score
- Middle: draft editor (Textarea bound to `replies.getByLead`)
- Bottom: tweak chips + "Generar respuesta" / "Regenerar" / "Copiar y abrir Reddit"

`app/(app)/feed/page.tsx`: layout with two panes. `useQuery(api.leads.feedByUser)` for the list. The right pane is empty until selection.

`app/(app)/feed/[leadId]/page.tsx`: same layout but pre-selects a lead via URL (used by future push notification deep links).

Manual test plan:
1. Insert a fake lead manually via Convex dashboard.
2. Navigate to `/feed`, see it in the list.
3. Click → see detail pane.
4. Click "Generar respuesta" → wait for draft.
5. Click "más casual" chip → draft regenerates with the tweak.
6. Click "Copiar y abrir Reddit" → clipboard contains draft + new tab opens permalink.

Commit: `feat(ui): bandeja de señales (two-pane lead inbox + draft + tweaks)`.

---

### Task 7: Manual integration test

**Files:** none — verification only.

- [ ] **Step 1**: Insert a fake lead via Convex dashboard:
  - First create a user, campaign, redditPost manually (or use existing if seeded).
  - Insert a lead pointing to them.
- [ ] **Step 2**: Visit `/feed` → confirm lead appears.
- [ ] **Step 3**: Generate reply → confirm Gemini Flash works (cost > 0 in usageDaily).
- [ ] **Step 4**: Apply tweak → new draft has the tweak.
- [ ] **Step 5**: Copy + open Reddit → status flips to "copied" in DB.

If all pass: Plan 3 done. Move to Plan 4 (billing) or Plan 5 (notifications).

---

## Definition of Done

- ✅ All commits merged to `main`.
- ✅ Tests green (target: 50+ total).
- ✅ Typecheck + build clean.
- ✅ Manual click-through: signup → onboarding → create campaign → see feed → generate reply → tweak → copy.
- ✅ At least one real campaign Pedro created and dogfooded with manually-inserted leads.

## Out-of-scope for Plan 3

- Billing / trial countdown banners (Plan 4).
- Web Push for hot leads (Plan 5).
- Email digest (Plan 5).
- "Generate keywords with AI" — leave as static input for now; add a TODO.
- Mobile native styling polish (just functional, not designed yet).
