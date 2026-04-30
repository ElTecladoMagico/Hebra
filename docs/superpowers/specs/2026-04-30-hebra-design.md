# Hebra — Design Doc

**Fecha:** 2026-04-30
**Autor:** Pedro Mantese
**Estado:** Draft v1 — pendiente de review
**Slug:** `hebra-design`

---

## 1. Resumen ejecutivo

**Hebra** es un SaaS spanish-first de lead-generation sobre Reddit, dirigido a freelancers y agencias hispanohablantes (España + LATAM). Es un clon de [Leadverse.ai](https://leadverse.ai/) reposicionado para el mercado hispano, con tres diferenciadores deliberados:

1. **Detección de dialecto** (es-neutro / es-ES / es-LATAM) en el destino del lead, no en el perfil del usuario.
2. **Estilo de respuesta** (*Aporta valor primero* / *Valor + menciona servicio* / *Oferta directa*) en lugar del "Pitch Level" de Leadverse, calibrado para la **mayor hostilidad de Reddit hispano hacia auto-promoción**.
3. **NO posting automático en MVP** — el usuario copia el draft y abre Reddit en un click. Frame: *"Tú revisas, tú respondes, tú controlas."*

**Stack:** Next.js 15 App Router (Vercel) + Convex (backend) + Clerk (auth) + Polar.sh (billing) + Google Gemini (LLM) + Reddit OAuth API + Resend (email) + PWA Web Push.

**Modelo de negocio:** Freemium con trial Pro de 7 días sin tarjeta, auto-downgrade, emails win-back con loss aversion. Inspiración: Airtable.

**Coste objetivo:** ~$0.24/user/mes en Gemini. Cost guard con tripwire $5/día y kill $50/día.

---

## 2. Scope

### In-scope (MVP)

- Signup vía Clerk (Google + email).
- Creación de campañas: offering (300 chars), website opcional, keywords (manuales o generadas con Gemini), tone/length/style, dialect.
- Polling **horario** de Reddit por subreddit+keyword.
- Intent scoring por post con `gemini-2.5-flash-lite`.
- Reply generation con `gemini-2.5-flash`.
- Bandeja de Señales (inbox dos paneles) con scoring tiers (Caliente 85+, Tibia 70-84, Fría <70).
- Tone-tweak chips inline en draft ("más casual", "más corto", "menos comercial").
- Botón "Copiar y abrir Reddit" (NO auto-post en MVP).
- PWA con Web Push para Calientes (85+).
- Email digest diario (free) + alertas Caliente (Pro).
- Trial Pro 7 días sin tarjeta + auto-downgrade.
- Subscription mgmt vía Polar webhooks.
- Cost guard global + per-user usage limits.

### Out-of-scope (post-MVP / P2)

- X y LinkedIn como fuentes (Reddit-only en MVP).
- Auto-posting a Reddit con OAuth per-user (P2 opt-in con warnings).
- App nativa iOS/Android (PWA cubre).
- Voseo argentino dedicado (es-LATAM agrupa).
- Stripe directo (Polar hasta MRR > €2K).
- GDPR data export/deletion UI (request manual hasta volumen lo justifique).
- Long-running jobs (X scraping, etc.) — añadiría worker Railway si se necesita.
- Diseño visual (colores, tipografía) — sesión separada post-aprobación.

---

## 3. Arquitectura

### 3.1 Diagrama de alto nivel

```
Browser (PWA) → Next.js 15 (Vercel) → [Clerk auth middleware]
                                              │
                                              ▼
                                          Convex
                                              │
              ┌─────────────────┬─────────────┼──────────────┬─────────────────┐
              ▼                 ▼             ▼              ▼                 ▼
        Schema/Queries    Mutations       Crons          Actions          HTTP routes
        (reactive)        (DB writes)   (scheduled)    (outbound HTTP)    (webhooks)
                                                            │                 │
                                                            ▼                 ▼
                                                   Reddit OAuth API    Polar.sh webhook
                                                   Gemini API          Clerk webhook
                                                   Resend (email)
                                                   Web Push (VAPID)
```

### 3.2 Decisión arquitectónica: "Maximally Convex" (Shape A)

Toda la lógica de backend vive en Convex. **No hay servidor Node ni worker externo en MVP.** Razones:

- Reactive queries → dashboard se actualiza solo cuando se score un nuevo lead.
- Crons + Actions + Mutations en un solo runtime → menos infra.
- Free tier generoso (1M function calls/mes).
- Convex actions tienen timeout 60s → suficiente para nuestros polls (chunked si excede).

**Si v2 necesita long-running jobs (X scraping >60s, etc.):** migrar a Shape B con worker en Railway ($5/mo). No previsto para MVP.

### 3.3 Convex action timeout — patrón de chunking

Polling de Reddit puede exceder 60s si una campaña tiene muchos subreddits×keywords. Patrón:

```typescript
// convex/crons/pollReddit.ts
export const pollReddit = internalAction({
  handler: async (ctx, { campaignId, cursor = 0 }) => {
    const batch = await fetchRedditBatch(campaignId, cursor, BATCH_SIZE);
    await ctx.runMutation(internal.posts.upsertBatch, { posts: batch.results });
    if (batch.hasMore) {
      await ctx.scheduler.runAfter(0, internal.crons.pollReddit, {
        campaignId,
        cursor: cursor + BATCH_SIZE,
      });
    }
  },
});
```

### 3.4 Reactive flow del feed

```
1. Cron pollReddit corre → llama Reddit API → upsert a redditPosts
2. Mutation upsertBatch dispara internalAction scoreNewPosts
3. scoreNewPosts llama Gemini → mutation insertLead
4. insertLead notifica subscribers reactivos (queries.feedByCampaign)
5. UI re-renderiza feed sin refetch manual
```

---

## 4. Data model (Convex schema)

### 4.1 Convenciones

- IDs: `v.id("table")` siempre que sea referencia interna.
- Timestamps: `number` (epoch ms vía `Date.now()`).
- Money: `cents: number` (centavos USD).
- Soft delete: campo `deletedAt: v.optional(v.number())` cuando aplica.
- Idempotencia: índices únicos en `redditId`, `polarSubscriptionId`, `clerkUserId`.

### 4.2 Tablas (9 total)

#### `users`

```typescript
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
  .index("by_tier_trialEnd", ["tier", "trialEndsAt"]);
```

#### `campaigns`

```typescript
campaigns: defineTable({
  userId: v.id("users"),
  name: v.string(),
  offering: v.string(), // 300 chars max
  websiteUrl: v.optional(v.string()),
  keywords: v.array(v.string()),
  subredditSlugs: v.array(v.string()), // referencia a CURATED_SUBREDDITS
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
    includePhrases: v.optional(v.string()), // 200 chars max
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
  .index("by_status_lastPolled", ["status", "lastPolledAt"]);
```

#### `redditPosts` (deduped globalmente)

```typescript
redditPosts: defineTable({
  redditId: v.string(), // t3_xxxxx
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
  language: v.string(), // ISO code, "es" o "en" o etc.
})
  .index("by_redditId", ["redditId"])
  .index("by_subreddit_posted", ["subreddit", "postedAt"]);
```

#### `leads` (junction usuario × post con scoring)

```typescript
leads: defineTable({
  userId: v.id("users"), // denormalizado para queries rápidas
  campaignId: v.id("campaigns"),
  postId: v.id("redditPosts"),
  matchedKeyword: v.string(),
  score: v.number(), // 0-100
  tier: v.union(v.literal("hot"), v.literal("warm"), v.literal("cold")),
  reasoning: v.string(), // explicación del LLM
  read: v.boolean(),
  archived: v.boolean(),
  scoredAt: v.number(),
})
  .index("by_user_tier", ["userId", "tier"])
  .index("by_user_unread", ["userId", "read"])
  .index("by_campaign_scored", ["campaignId", "scoredAt"])
  .index("by_post_user", ["postId", "userId"]); // dedupe
```

#### `replies`

```typescript
replies: defineTable({
  leadId: v.id("leads"),
  userId: v.id("users"),
  draftText: v.string(),
  status: v.union(
    v.literal("draft"),
    v.literal("copied"),
    v.literal("dismissed")
  ),
  tweaks: v.array(v.string()), // historial: ["más-casual", "más-corto"]
  generatedAt: v.number(),
  copiedAt: v.optional(v.number()),
})
  .index("by_lead", ["leadId"])
  .index("by_user_status", ["userId", "status"]);
```

#### `alerts`

```typescript
alerts: defineTable({
  userId: v.id("users"),
  leadId: v.id("leads"),
  channel: v.union(
    v.literal("push"),
    v.literal("email"),
    v.literal("inapp")
  ),
  status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
  sentAt: v.optional(v.number()),
  failureReason: v.optional(v.string()),
})
  .index("by_user_status", ["userId", "status"])
  .index("by_lead", ["leadId"]);
```

#### `usageDaily`

```typescript
usageDaily: defineTable({
  userId: v.id("users"),
  dateKey: v.string(), // "YYYY-MM-DD" UTC
  scoringCalls: v.number(),
  replyGenerations: v.number(),
  keywordGenerations: v.number(),
  geminiCostCents: v.number(),
})
  .index("by_user_date", ["userId", "dateKey"])
  .index("by_date", ["dateKey"]); // para cost guard global
```

#### `subscriptions` (sync de Polar)

```typescript
subscriptions: defineTable({
  userId: v.id("users"),
  polarSubscriptionId: v.string(),
  polarProductId: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("past_due"),
    v.literal("canceled"),
    v.literal("incomplete")
  ),
  currentPeriodStart: v.number(),
  currentPeriodEnd: v.number(),
  cancelAtPeriodEnd: v.boolean(),
  updatedAt: v.number(),
})
  .index("by_polarId", ["polarSubscriptionId"])
  .index("by_user", ["userId"]);
```

#### `errorLog`

```typescript
errorLog: defineTable({
  service: v.string(), // "reddit" | "gemini" | "polar" | "resend" | "webpush"
  operation: v.string(),
  errorMessage: v.string(),
  errorCode: v.optional(v.string()),
  context: v.optional(v.any()), // userId, campaignId, etc.
  severity: v.union(
    v.literal("info"),
    v.literal("warn"),
    v.literal("error"),
    v.literal("critical")
  ),
})
  .index("by_severity_creation", ["severity"])
  .index("by_service", ["service"]);
```

### 4.3 Catálogo de subreddits — TS constant

`convex/data/subreddits.ts`:

```typescript
export type Country = "ES" | "MX" | "AR" | "CO" | "CL" | "PE" | "PAN-HISPANO";
export type Hostility = "low" | "medium" | "high";

export interface SubredditMeta {
  slug: string;
  country: Country;
  hostility: Hostility; // tolerancia a self-promo
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
```

### 4.4 Tabla P2 (post-MVP) — `redditCredentials`

Para cuando habilitemos auto-posting opt-in:

```typescript
redditCredentials: defineTable({
  userId: v.id("users"),
  redditUsername: v.string(),
  refreshTokenEncrypted: v.string(), // Web Crypto AES-GCM
  scopes: v.array(v.string()),
  connectedAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
}).index("by_user", ["userId"]);
```

---

## 5. Flujos clave

### 5.1 Onboarding y creación de campaña

1. Signup vía Clerk (Google OAuth o email magic link).
2. Webhook Clerk → mutation `users.createOrUpdate` con `tier: "free"`.
3. Onboarding step 1: idioma preferido (es-neutral default).
4. Onboarding step 2: modal "Nueva campaña" idéntico a Leadverse pero con cambios documentados:
   - **Offering** textarea (300 chars).
   - **Website URL** opcional.
   - **Keywords** rows con botón "Generar con IA" (llama Gemini Flash-Lite).
   - **Subreddits** multi-select desde `CURATED_SUBREDDITS` (con badges de hostility).
   - **Reply Settings:** tone, length, style (`value-first` default), CTA toggle, personalize toggle, includePhrases.
   - **Reply dialect** (es-neutral default).
   - CTA: "Crear y empezar a buscar".
5. Mutation `campaigns.create` → schedula primer poll inmediato.

### 5.2 Polling Reddit (cron horario)

```
Cada hora (cron):
  1. Query: campaigns donde status="active" Y (lastPolledAt < now - 1h O lastPolledAt is null)
  2. Para cada campaña:
     a. Para cada (subreddit, keyword) combo:
        - GET /r/{subreddit}/search?q={kw}&restrict_sr=true&sort=new&t=hour
        - Parse posts; filtrar autor "[deleted]" y language != "es"
        - Detectar dialecto (regex: "vos|che" → LATAM; "vosotros|tío" → ES)
     b. Upsert a redditPosts (idempotente por redditId)
     c. Para cada post nuevo: schedula scoreLead action
     d. Update campaigns.lastPolledAt
```

**Tier-based polling frequency:**
- Free: daily (00:00 UTC).
- Trial/Pro: hourly.

### 5.3 Intent scoring

```typescript
// convex/actions/scoreLead.ts
export const scoreLead = internalAction({
  handler: async (ctx, { postId, campaignId, userId }) => {
    await ensureCostGuardOk(ctx, "scoring");
    await ensureUserQuotaOk(ctx, userId, "scoring");

    const post = await ctx.runQuery(internal.posts.get, { postId });
    const campaign = await ctx.runQuery(internal.campaigns.get, { campaignId });

    const result = await withRetry(() =>
      gemini.generate({
        model: "gemini-2.5-flash-lite",
        prompt: buildScoringPrompt(post, campaign),
        responseMimeType: "application/json",
        responseSchema: SCORING_SCHEMA,
      })
    );

    // fallback a cold si schema malformed
    const { score, reasoning } = safeParseScoring(result) ?? {
      score: 0, reasoning: "scoring failed", tier: "cold"
    };

    const tier = score >= 85 ? "hot" : score >= 70 ? "warm" : "cold";

    await ctx.runMutation(internal.leads.insert, {
      userId, campaignId, postId,
      score, tier, reasoning,
      matchedKeyword: campaign.keywords[0], // primer match
    });

    if (tier === "hot") {
      await ctx.scheduler.runAfter(0, internal.alerts.notify, { userId, leadId });
    }
  },
});
```

### 5.4 Reply generation + tone tweaks

- User clica "Generar respuesta" en lead detail → action `generateReply`.
- Prompt incluye: post original, campaign offering, replySettings (tone, length, style, dialect, includePhrases).
- Output: draft text → insert a `replies` con `status: "draft"`.
- Chips inline ("más casual", "más corto", "menos comercial") → re-llaman `regenerateWithTweak` que añade el tweak al prompt y append al `tweaks[]`.
- Botón "Copiar y abrir Reddit" → copy clipboard + `window.open(post.permalink)` + mutation marca `status: "copied"`.

### 5.5 Trial expiration y downgrade

Cron `trialEnder` corre **horariamente**:

```
1. Query: users donde tier="trial" Y trialEndsAt < now
2. Para cada uno:
   - tier → "free"
   - Schedula email "trial-expired"
   - Lock leads en readonly (UI muestra greyed-out con "Disponible en Pro")
```

### 5.6 Polar webhooks (subscription sync)

Endpoint Convex HTTP route `/webhooks/polar`:

1. Verifica HMAC SHA256 con secret env var → 401 si inválido.
2. Match event type:
   - `subscription.created` → `users.tier = "pro"`, upsert subscription.
   - `subscription.updated` → sync status.
   - `subscription.canceled` → status="canceled", `users.tier` → "free" al final del periodo.
   - `subscription.past_due` → delegamos a Polar dunning (no tocamos tier hasta que Polar nos diga "canceled").
3. Idempotencia: índice único en `polarSubscriptionId`.

### 5.7 Alertas (push + email + inapp)

- Hot lead → `alerts.notify` schedula push (PWA Web Push), email (Resend), in-app dot.
- Push solo a usuarios con `subscription.endpoint` registrado.
- Daily digest (free users): cron diario 09:00 UTC, query unread leads últimas 24h, envía via Resend.

---

## 6. Error handling y cost guards

### 6.1 Retry con backoff exponencial + jitter

`convex/lib/retry.ts`:

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries?: number;
    baseDelayMs?: number;
    shouldRetry?: (err: any) => boolean;
  } = {}
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
      await sleep(delay);
    }
  }
  throw lastErr;
}

function isTransient(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  return status === 429 || (status >= 500 && status < 600) || err?.code === "ECONNRESET";
}
```

Aplicado a: Reddit fetch, Gemini call, Resend send. **NO** aplicado a Polar webhook handler (Polar reintenta).

### 6.2 Cost guard de dos niveles

`convex/lib/costGuard.ts`:

```typescript
const TRIPWIRE_USD_CENTS = 500;  // $5
const KILL_USD_CENTS = 5000;     // $50

export async function ensureCostGuardOk(ctx: any, op: string): Promise<void> {
  const today = utcDateKey(Date.now());
  const total = await ctx.runQuery(internal.usage.totalCostToday, { dateKey: today });

  if (total >= KILL_USD_CENTS) {
    await ctx.runMutation(internal.errorLog.insert, {
      service: "costGuard", operation: op,
      errorMessage: `KILL: daily cost ${total} cents exceeds ${KILL_USD_CENTS}`,
      severity: "critical",
    });
    throw new Error("Cost kill switch engaged — daily budget exceeded");
  }

  if (total >= TRIPWIRE_USD_CENTS) {
    await ctx.runMutation(internal.campaigns.pauseAllActive, {});
    await ctx.runMutation(internal.errorLog.insert, {
      service: "costGuard", operation: op,
      errorMessage: `TRIPWIRE: daily cost ${total} cents exceeds ${TRIPWIRE_USD_CENTS}`,
      severity: "warn",
    });
    // tripwire pausa pero no bloquea operación actual
  }
}
```

Cron `costGuardReset` a las 00:05 UTC: re-activa campañas pausadas si el día nuevo y total < TRIPWIRE.

### 6.3 Per-user quotas

| Tier | Scoring/día | Replies/día | Keyword gen/día |
|---|---|---|---|
| Free | 20 | 5 | 5 |
| Trial | 200 | 50 | 20 |
| Pro | 200 | 50 | 20 |

Función `ensureUserQuotaOk(ctx, userId, op)` lee `usageDaily` y throws si excede.

### 6.4 Logging vía `errorLog` table

Reemplaza `console.error`. Permite admin dashboard post-MVP. Severidad:
- `info`: eventos esperados (rate limit hit, retry succeeded).
- `warn`: degradación (tripwire, schema fallback usado).
- `error`: falla recuperable (1 retry final exhausto).
- `critical`: kill switch, webhook signature inválida repetida.

### 6.5 Webhook signature verification

```typescript
async function verifyPolarSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["verify"]
  );
  const sigBytes = hexToBytes(signature);
  return await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(body));
}
```

Si falla → 401, log severity `critical`. NUNCA tocar DB con webhook no verificado.

### 6.6 Reddit OAuth (MVP: app-only compartida)

- App tipo "script" registrada en `reddit.com/prefs/apps` con cuenta dedicada `hebra_app`.
- Cuenta debe estar warmed-up 30+ días (subscribir subreddits sin postear) antes de registrar app.
- `client_id` + `client_secret` en Convex env vars.
- Token request: `POST oauth.reddit.com/api/v1/access_token` con basic auth.
- Refresca cada ~50 min (token vive 60 min).
- User-Agent: `web:com.gethebra.app:v1.0.0 (by /u/hebra_app)`.

**Implicaciones del modelo "cuenta compartida" (todos los users leen via `hebra_app`):**

| Implicación | Mitigación |
|---|---|
| Single point of failure: si Reddit suspende `hebra_app`, todos los users dejan de recibir leads | Cuenta backup `hebra_app2` dormante (warmed-up paralelo). Switch via env var |
| Rate limit 100 QPM compartido entre TODOS los users | Polling horario + chunking en `pollReddit` (§3.3) cabe holgadamente hasta ~5K usuarios activos. Si crecemos: pool de cuentas rotativas (P2) |
| Reddit puede detectar patrón anómalo (mismo IP, mismo agent, muchas búsquedas) | User-Agent honesto + ritmo realista + scopes mínimos (`read` solo) |
| No podemos identificar qué user "consumió" qué quota Reddit | Quotas internas son por `usageDaily`, no por Reddit-side — no aplica |

### 6.7 Reddit OAuth per-user (P2)

Tabla `redditCredentials`. Refresh token cifrado con Web Crypto AES-GCM. UI warning antes de conectar:

> *Conectar tu cuenta de Reddit te permite enviar respuestas directamente desde Hebra. Algunos riesgos:*
> - *Reddit puede limitar o suspender cuentas que parecen automatizadas.*
> - *Ciertos subreddits estrictos requieren cuentas con 90+ días de antigüedad.*
> - *Hebra nunca enviará nada sin tu confirmación explícita.*

---

## 7. Testing strategy

### 7.1 Pirámide

| Nivel | Tooling | % esfuerzo |
|---|---|---|
| Unit (lógica pura) | Vitest | 50% |
| Integration (Convex) | `convex-test` | 35% |
| Integration (External) | Vitest + `msw` | 10% |
| E2E (flujo crítico) | Playwright contra preview | 5% |

### 7.2 Tests obligatorios MVP

| Área | Test |
|---|---|
| Cost guard | Tripwire pausa ingestion; kill bloquea Gemini |
| Idempotencia Reddit | Mismo `redditId` 2× no duplica leads |
| Idempotencia Polar | Webhook duplicado no crea 2 subs |
| Scoring schema | Gemini malformed → fallback `score: 0, tier: "cold"` |
| HMAC webhook | Firma inválida → 401 sin tocar DB |
| Dialect detection | Post con "vos/che" → es-LATAM |
| Trial expiration | `trialEndsAt < now` → tier free, leads readonly |
| Retry con jitter | 3 reintentos, delays no idénticos en paralelo |

### 7.3 Fixtures

```
tests/fixtures/
├── reddit/
│   ├── post-es-spain.json
│   ├── post-es-latam.json
│   ├── post-english.json (filtrado)
│   ├── post-deleted.json
│   └── search-response-page.json
├── gemini/
│   ├── score-hot.json
│   ├── score-cold.json
│   ├── score-malformed.json
│   └── reply-value-first.json
├── polar/
│   ├── subscription-created.json
│   ├── subscription-canceled.json
│   └── webhook-with-signature.json
└── clerk/
    └── jwt-decoded.json
```

### 7.4 Mocks

- **Reddit:** `msw` intercepta `oauth.reddit.com/*`. Helper `mockRedditSearch(subreddit, posts)`.
- **Gemini:** wrapper con interfaz; tests inyectan mock que devuelve fixture. **No usar API real en CI.**
- **Polar:** webhooks construidos con HMAC test secret.

### 7.5 CI gates

```
PR checks:
  ✓ typecheck (tsc --noEmit)
  ✓ lint (biome)
  ✓ unit + integration (vitest run)
  ✓ convex-test suite
  ✗ E2E (solo en main, contra preview Vercel)

Pre-prod:
  ✓ Todo lo anterior
  ✓ Smoke test post-deploy: GET /api/health → 200
```

### 7.6 Cobertura

- Lógica pura: ≥85%.
- Queries/mutations: ≥70%.
- Actions con mocks: ≥50%.
- No enforced global coverage (métrica trampa).

### 7.7 Lo que NO testeamos (decisión consciente)

- UI components aislados (Playwright cubre flujos).
- Convex internals directamente (cubiertos via públicas).
- Performance/load testing (cost guard es el límite real).
- Casos exóticos timezone (UTC para polling, tolerancia ±1h).

---

## 8. Modelo de coste

| Item | Volumen/día | Coste | $/user/día |
|---|---|---|---|
| Reddit polling | 24 calls (hourly) | $0 | $0 |
| Intent scoring (Flash-Lite, ~600 tok) | ~30 posts | $0.075/M in + $0.40/M out | $0.0023 |
| Reply gen (Flash, ~1.6K tok) | ~5 replies | $0.30/M in + $2.50/M out | $0.0057 |
| Convex/Clerk/Vercel | flat | free tiers | $0 |
| **Total** | | | **~$0.008/user/día → ~$0.24/user/mes** |

| Active users | Coste mensual |
|---|---|
| 50 | ~$12 |
| 200 | ~$73 |
| 1,000 | ~$265 |
| 5,000 | ~$1,400 |

---

## 9. Pricing

| Plan | Precio | Campañas | Polling | Scoring/día | Replies/día |
|---|---|---|---|---|---|
| **Free** | €0 | 1 | Daily | 20 | 5 |
| **Pro** | **€19/mes** | 3 | Hourly | 200 | 50 |

Trial Pro 7 días sin tarjeta. Auto-downgrade.

### Justificación del precio

- **Paridad con Leadverse Explorer** ($19, Reddit-only) — mismo scope, evita ser "el clon caro" o "el clon barato".
- **Payback freelancer:** 1 cliente al año amortiza el plan completo.
- **EUR en vez de USD:** Polar maneja VAT EU automático en EUR; España es ~50% del mercado inicial; LATAM ya está habituada a precios SaaS €/$.
- **Margen contribución ≈ 98%** (coste $0.24/user/mes vs €19 ingreso) — espacio para invertir en retención, no en bajar precio.

### Decisiones de pricing diferidas (post-MVP)

- **Annual discount** (€190/año ≈ 2 meses gratis) cuando haya señal de retención.
- **PPP regional** para LATAM (descuento 30-50% verificado por geo) — patrón GitHub/Notion/JetBrains.
- **Lifetime deal** pre-launch (€99 one-time, primeros 50 usuarios) — capital + early evangelistas.

---

## 10. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Reddit cambia ToS / cierra free OAuth | Plan B: scraping vía Exa MCP (Agent-Reach pattern) |
| Gemini sube precios o degrada calidad | Wrapper abstrae provider; podemos swap a Claude Haiku |
| Convex action timeout 60s insuficiente | Chunking pattern con `scheduler.runAfter` (ya documentado §3.3) |
| Spam patterns en respuestas → ban accounts | "Estilo Aporta-valor" default + warning explícito en "Oferta directa" |
| Cuenta `hebra_app` baneada | Cuenta backup dormante creada en paralelo |
| Polar webhook flapping | Idempotencia por `polarSubscriptionId` |
| Cost runaway | Tripwire $5 + kill $50 + per-user quotas |

---

## 11. Secrets management

| Secret | Almacenado en | Rotación |
|---|---|---|
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Convex env vars (prod + dev separados) | On-demand (rotar si leak) |
| `GEMINI_API_KEY` | Convex env vars | Trimestral |
| `POLAR_WEBHOOK_SECRET` | Convex env vars | On-demand (Polar dashboard genera nuevo) |
| `POLAR_API_KEY` | Convex env vars | Trimestral |
| `RESEND_API_KEY` | Convex env vars | Trimestral |
| `WEBPUSH_VAPID_PRIVATE_KEY` | Convex env vars | NO rotar (rompería subscriptions) |
| `WEBPUSH_VAPID_PUBLIC_KEY` | `NEXT_PUBLIC_*` en Vercel env | NO rotar |
| `CLERK_SECRET_KEY` | Vercel env vars | Trimestral |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel env vars | NO rotar |
| `NEXT_PUBLIC_CONVEX_URL` | Vercel env vars | NO rotar |
| `ENCRYPTION_KEY` (P2: refresh tokens cifrados) | Convex env vars | NO rotar (rompe credenciales cifradas) |
| Cuenta `hebra_app` Reddit user/pass | **1Password** (NO en código) | On-demand |
| Cuenta backup `hebra_app2` Reddit user/pass | **1Password** (NO en código) | On-demand |

**Reglas duras:**
- NUNCA commitear secrets — `.env.local` en `.gitignore`.
- Convex CLI (`npx convex env set`) es la ruta canónica para Convex secrets.
- Vercel CLI (`vercel env add`) para Vercel secrets.
- Preview deploys de Vercel usan secrets distintos a prod.
- 1Password vault dedicado "Hebra" para credenciales humanas (Reddit, Polar dashboard, dominio).

## 12. Decisiones diferidas (post-MVP)

- GDPR data export/deletion UI.
- Stripe directo (cuando MRR > €2K).
- X y LinkedIn como fuentes.
- Auto-posting Reddit (P2 opt-in).
- Voseo argentino dedicado.
- Admin dashboard con `errorLog` viewer.
- Mobile native apps (PWA cubre).
- Integración Slack alerts (webhook en lugar de OAuth).

---

## 13. Glosario

- **Lead:** post de Reddit que matchea keywords de una campaña y ha sido scored por LLM.
- **Tier:** clasificación del lead — Caliente (85+) / Tibia (70-84) / Fría (<70).
- **Style:** reemplaza "Pitch Level" de Leadverse — value-first / value-mention / direct-offer.
- **Hostility:** tolerancia del subreddit a auto-promo (low/medium/high).
- **Tripwire:** límite blando de coste diario ($5) que pausa ingestion sin bloquear operación.
- **Kill switch:** límite duro de coste diario ($50) que bloquea todas las llamadas Gemini.
- **Dialect:** registro lingüístico del lead destino — es-neutral / es-ES / es-LATAM.

---

**Fin del design doc v1.** Siguiente paso: self-review, después review del usuario, después `superpowers:writing-plans`.
