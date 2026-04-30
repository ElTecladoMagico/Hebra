# Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the Hebra repo with a working signup flow and empty dashboard deployed to Vercel preview.

**Architecture:** Next.js 15 App Router (Vercel) + Convex backend + Clerk auth. Clerk JWT template authenticates against Convex. Schema stub for `users`, `campaigns`, and `errorLog` tables. No Reddit/Gemini/Polar integration yet — those come in subsequent plans.

**Tech Stack:** Next.js 15, TypeScript, Convex, Clerk, Tailwind CSS, Biome (lint+format), Vitest, convex-test.

**Reference spec:** `docs/superpowers/specs/2026-04-30-hebra-design.md` sections 1-4, 11.

---

## File Structure

**Created in this plan:**

```
Hebra/
├── .gitignore
├── .env.local.example
├── README.md
├── biome.json
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── middleware.ts                    # Clerk auth middleware
├── app/
│   ├── layout.tsx                   # ClerkProvider + ConvexProvider
│   ├── page.tsx                     # Landing (logged-out) / dashboard redirect
│   ├── globals.css                  # Tailwind base
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              # Authed shell
│   │   └── dashboard/page.tsx      # Empty dashboard
│   └── api/
│       └── webhooks/clerk/route.ts # Clerk webhook → users sync
├── components/
│   ├── providers/ConvexClerkProvider.tsx
│   └── ui/Button.tsx
├── convex/
│   ├── schema.ts                   # Stub: users, campaigns, errorLog
│   ├── auth.config.ts              # Clerk JWT verification
│   ├── users.ts                    # createOrUpdate, current
│   ├── errorLog.ts                 # insert helper
│   ├── _generated/                 # auto by Convex codegen
│   └── tsconfig.json
├── lib/
│   └── env.ts                      # zod-validated env vars
└── tests/
    ├── setup.ts
    └── convex/
        └── users.test.ts
```

---

### Task 1: Repo bootstrap and tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.local.example`
- Create: `biome.json`
- Create: `README.md`

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/pedro.mantese@feverup.com/Documents/AfterWork/Proyectos/SaaS/Hebra
git init
git branch -m main
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "hebra",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "convex:dev": "convex dev",
    "convex:deploy": "convex deploy"
  },
  "dependencies": {
    "@clerk/nextjs": "^6.10.0",
    "convex": "^1.17.0",
    "next": "15.1.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitest/ui": "^2.1.0",
    "autoprefixer": "^10.4.20",
    "convex-test": "^0.0.35",
    "postcss": "^8.5.0",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "convex/_generated"]
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules
.next
.env
.env.local
.env*.local
*.tsbuildinfo
.DS_Store
.vercel
convex/_generated
coverage
```

- [ ] **Step 5: Create `.env.local.example`**

```
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Convex
NEXT_PUBLIC_CONVEX_URL=
CONVEX_DEPLOY_KEY=
```

- [ ] **Step 6: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noNonNullAssertion": "off" },
      "suspicious": { "noExplicitAny": "warn" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "ignore": ["node_modules", ".next", "convex/_generated", "coverage"]
  }
}
```

- [ ] **Step 7: Create minimal `README.md`**

```markdown
# Hebra

Spanish-first Reddit lead-generation SaaS for hispanohablante freelancers and agencies.

## Setup

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill values
3. `npx convex dev` (in one terminal)
4. `npm run dev` (in another)

See `docs/superpowers/specs/` for design docs.
```

- [ ] **Step 8: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 9: Commit**

```bash
git add .gitignore .env.local.example package.json package-lock.json tsconfig.json biome.json README.md
git commit -m "chore: bootstrap repo with Next.js + Convex + Clerk tooling"
```

---

### Task 2: Next.js app skeleton

**Files:**
- Create: `next.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `lib/env.ts`

- [ ] **Step 1: Create `next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 2: Create `tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Create `postcss.config.mjs`**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 4: Create `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body {
  height: 100%;
}
```

- [ ] **Step 5: Create `lib/env.ts`**

```typescript
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_CONVEX_URL: z.string().url(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
});
```

- [ ] **Step 6: Create `app/layout.tsx` (placeholder, providers wired in Task 4)**

```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hebra",
  description: "Encuentra clientes en Reddit hablando español.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Create `app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Hebra</h1>
      <p className="mt-4 text-lg">Tira de la hebra. Encuentra clientes en Reddit.</p>
    </main>
  );
}
```

- [ ] **Step 8: Run dev server, verify landing renders**

```bash
npm run dev
```

Expected: open http://localhost:3000 → see "Hebra" heading + tagline. Stop server with Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git add app lib next.config.ts tailwind.config.ts postcss.config.mjs
git commit -m "feat: next.js app skeleton with landing page"
```

---

### Task 3: Convex initialization and schema stub

**Files:**
- Create: `convex/schema.ts`
- Create: `convex/auth.config.ts`
- Create: `convex/tsconfig.json`

- [ ] **Step 1: Initialize Convex**

```bash
npx convex dev --once --configure=new
```

You'll be prompted: project name (`hebra`), team (your personal). Output: `convex/_generated/` populated, `NEXT_PUBLIC_CONVEX_URL` written to `.env.local`.

Expected: `.env.local` updated, dev deployment created.

- [ ] **Step 2: Create `convex/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ES2021", "dom"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "strict": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "esModuleInterop": true
  },
  "include": ["./**/*"],
  "exclude": ["./_generated"]
}
```

- [ ] **Step 3: Create `convex/schema.ts` with 3 stub tables**

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
  }).index("by_user", ["userId"]),

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

- [ ] **Step 4: Create `convex/auth.config.ts`**

```typescript
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

- [ ] **Step 5: Push schema to Convex**

```bash
npx convex dev --once
```

Expected: schema deploys, `convex/_generated/` regenerated with the new tables.

- [ ] **Step 6: Commit**

```bash
git add convex
git commit -m "feat: convex init with schema stub (users, campaigns, errorLog)"
```

---

### Task 4: Clerk authentication wiring

**Files:**
- Create: `middleware.ts`
- Create: `app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- Create: `app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- Create: `components/providers/ConvexClerkProvider.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create Clerk app + JWT template**

Manual step (no code):
1. Go to https://dashboard.clerk.com → Create application "Hebra".
2. Enable Google + Email Magic Link providers.
3. Copy `Publishable key` and `Secret key` to `.env.local`.
4. Go to JWT Templates → Create from "Convex" preset → save → copy `Issuer URL`.
5. In Convex dashboard (`npx convex dashboard`) → Settings → Environment variables → set `CLERK_JWT_ISSUER_DOMAIN` to the issuer URL (without trailing slash).
6. Run `npx convex dev --once` to push the auth config.

- [ ] **Step 2: Create `middleware.ts`**

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

- [ ] **Step 3: Create `components/providers/ConvexClerkProvider.tsx`**

```tsx
"use client";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClerkProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Modify `app/layout.tsx` to wrap with provider**

```tsx
import "./globals.css";
import type { Metadata } from "next";
import { ConvexClerkProvider } from "@/components/providers/ConvexClerkProvider";

export const metadata: Metadata = {
  title: "Hebra",
  description: "Encuentra clientes en Reddit hablando español.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ConvexClerkProvider>{children}</ConvexClerkProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Create `app/(auth)/sign-in/[[...sign-in]]/page.tsx`**

```tsx
import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn />
    </div>
  );
}
```

- [ ] **Step 6: Create `app/(auth)/sign-up/[[...sign-up]]/page.tsx`**

```tsx
import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp />
    </div>
  );
}
```

- [ ] **Step 7: Install `convex/react-clerk` and verify dev server**

```bash
npm install
npm run dev
```

Open http://localhost:3000/sign-up → Clerk widget renders. Sign up with email or Google. After signup, redirected to `/` (no dashboard yet — next task).

- [ ] **Step 8: Commit**

```bash
git add middleware.ts app components
git commit -m "feat: clerk auth with sign-in/sign-up pages and convex provider"
```

---

### Task 5: User sync from Clerk → Convex

**Files:**
- Create: `convex/users.ts`
- Create: `convex/errorLog.ts`
- Create: `app/api/webhooks/clerk/route.ts`
- Create: `tests/setup.ts`
- Create: `tests/convex/users.test.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    setupFiles: ["./tests/setup.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

- [ ] **Step 2: Create `tests/setup.ts`**

```typescript
import { expect } from "vitest";
import "convex-test/setup";

expect.extend({});
```

- [ ] **Step 3: Write the failing test for `users.createOrUpdate`**

Create `tests/convex/users.test.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `api.users.createOrUpdate is not defined`.

- [ ] **Step 5: Create `convex/errorLog.ts`**

```typescript
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const insert = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("errorLog", args);
  },
});
```

- [ ] **Step 6: Create `convex/users.ts`**

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createOrUpdate = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        lastActiveAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      tier: "free",
      languagePreference: "es-neutral",
      createdAt: now,
      lastActiveAt: now,
    });
  },
});

export const getByClerkId = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});

export const current = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
  },
});
```

- [ ] **Step 7: Run test to verify it passes**

```bash
npx convex dev --once  # regenerate types
npm test
```

Expected: PASS — both tests green.

- [ ] **Step 8: Create Clerk webhook route `app/api/webhooks/clerk/route.ts`**

```typescript
import { Webhook } from "svix";
import { headers } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("Server misconfigured", { status: 500 });

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.text();
  const wh = new Webhook(secret);
  let evt: any;
  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const email = email_addresses?.[0]?.email_address;
    if (!email) return new Response("No email", { status: 400 });
    const name = [first_name, last_name].filter(Boolean).join(" ") || undefined;
    await convex.mutation(api.users.createOrUpdate, {
      clerkUserId: id,
      email,
      name,
    });
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 9: Add `svix` to dependencies**

Edit `package.json`, add to `dependencies`:

```json
"svix": "^1.42.0"
```

Run:

```bash
npm install
```

- [ ] **Step 10: Configure webhook in Clerk dashboard**

Manual step:
1. Clerk dashboard → Webhooks → Add endpoint.
2. URL: `https://<your-vercel-preview>/api/webhooks/clerk` (you'll set this after Task 7 deploy; for local testing use `ngrok` or skip until deploy).
3. Subscribe to `user.created` and `user.updated`.
4. Copy signing secret → `CLERK_WEBHOOK_SECRET` in `.env.local`.

- [ ] **Step 11: Commit**

```bash
git add convex/users.ts convex/errorLog.ts app/api tests vitest.config.ts package.json package-lock.json
git commit -m "feat: user sync from clerk webhook with convex-test coverage"
```

---

### Task 6: Authed dashboard shell

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/dashboard/page.tsx`
- Create: `components/ui/Button.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create `components/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Create `app/(app)/layout.tsx`**

```tsx
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/dashboard" className="text-xl font-bold">
          Hebra
        </Link>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/(app)/dashboard/page.tsx`**

```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function DashboardPage() {
  const user = useQuery(api.users.current);

  if (user === undefined) {
    return <p>Cargando…</p>;
  }
  if (user === null) {
    return <p>Sincronizando tu cuenta… (espera unos segundos y refresca)</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Bienvenido, {user.name ?? user.email}</h1>
      <p className="mt-2 text-zinc-600">
        Plan actual: <strong>{user.tier}</strong>
      </p>
      <p className="mt-4 text-zinc-500">
        Aquí aparecerá tu Bandeja de Señales cuando crees una campaña.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Modify `app/page.tsx` to redirect authed users to dashboard**

```tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-5xl font-bold">Hebra</h1>
      <p className="mt-4 text-lg">Tira de la hebra. Encuentra clientes en Reddit.</p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/sign-up"
          className="rounded-md bg-black px-6 py-3 text-white hover:bg-zinc-800"
        >
          Empezar gratis
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md border border-black px-6 py-3 hover:bg-zinc-100"
        >
          Iniciar sesión
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run dev server, verify auth flow**

```bash
npm run dev
```

Manual test:
1. Open http://localhost:3000 → see landing with "Empezar gratis" / "Iniciar sesión".
2. Click "Empezar gratis" → Clerk signup widget.
3. Sign up with email magic link or Google.
4. Redirected to `/dashboard` → see "Bienvenido, …" with `tier: free`.
5. Click UserButton → Sign out → back to landing.

If dashboard shows "Sincronizando tu cuenta…" indefinitely, the Clerk webhook isn't reaching local. For local-only testing, manually call the mutation from Convex dashboard with your `clerkUserId` (find it in Clerk dashboard → Users).

- [ ] **Step 6: Commit**

```bash
git add app components
git commit -m "feat: authed dashboard shell with user provisioning"
```

---

### Task 7: Vercel preview deployment

**Files:**
- (No new files — manual + config in Vercel dashboard)

- [ ] **Step 1: Create GitHub repo**

```bash
gh repo create ElTecladoMagico/Hebra --private --source=. --remote=origin --push
```

Expected: repo created at `github.com/ElTecladoMagico/Hebra`, code pushed to `main`.

- [ ] **Step 2: Connect to Vercel**

Manual:
1. https://vercel.com/new → Import `ElTecladoMagico/Hebra`.
2. Framework: Next.js (auto-detected).
3. Environment variables (add for Production + Preview):
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `CLERK_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_CONVEX_URL` (the **production** URL — get with `npx convex deploy --cmd-url-env-var-name=NEXT_PUBLIC_CONVEX_URL` after step 4)
   - `CONVEX_DEPLOY_KEY` (from Convex dashboard → Settings → Deploy Keys)
4. Build command override: `npx convex deploy --cmd 'npm run build'`
5. Click Deploy.

- [ ] **Step 3: Create Convex production deployment**

```bash
npx convex deploy
```

Expected: production deployment created, prod `NEXT_PUBLIC_CONVEX_URL` printed.

- [ ] **Step 4: Update Vercel env var with prod Convex URL**

Manual: paste the prod `NEXT_PUBLIC_CONVEX_URL` from step 3 into Vercel → redeploy.

- [ ] **Step 5: Update Clerk webhook URL to prod**

Manual: Clerk dashboard → Webhooks → edit endpoint URL to `https://<vercel-prod-url>/api/webhooks/clerk`.

- [ ] **Step 6: Smoke test prod deploy**

Open the Vercel prod URL:
1. Sign up with a fresh email.
2. Land on dashboard → see your tier "free".
3. Check Convex prod dashboard → `users` table → row exists.

If smoke test passes: Plan 1 done.

- [ ] **Step 7: Commit any final config**

If anything was tweaked in tracked files during deploy:

```bash
git add -A
git commit -m "chore: vercel deploy configuration"
git push
```

---

## Definition of Done

Plan 1 is complete when ALL of the following are true:

- ✅ `git log` shows ≥7 commits matching the tasks above.
- ✅ `npm test` passes locally with the 2 user tests.
- ✅ `npm run typecheck` passes with no errors.
- ✅ `npm run lint` passes (warnings ok).
- ✅ Local `npm run dev` lets you sign up → land on dashboard with tier "free".
- ✅ Vercel prod URL works end-to-end (signup → dashboard → user row in Convex prod).
- ✅ Clerk webhook delivers `user.created` events to prod and `users` table populates.

---

## Out-of-scope for Plan 1 (covered in later plans)

- Reddit polling, Gemini scoring, leads — Plan 2.
- Campaign creator UI, feed, reply gen — Plan 3.
- Polar billing, trial expiration — Plan 4.
- Web Push, email digest — Plan 5.
