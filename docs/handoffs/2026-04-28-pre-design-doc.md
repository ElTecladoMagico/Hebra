# Hebra — Checkpoint Pre-Design-Doc

**Fecha del checkpoint:** 2026-04-28
**Estado:** Brainstorming en progreso — Sección 1 (Arquitectura) aprobada, nombre+dominio resueltos, próxima sección: Data Model
**Proyecto:** Hebra — SaaS spanish-first de lead-gen sobre Reddit
**Dominio:** `gethebra.com`
**Autor:** Pedro Mantese (GitHub org: `ElTecladoMagico`)

---

## Propósito de este documento

Snapshot del estado de la conversación de brainstorming en el momento en que se resolvió el naming. Cualquier IA o futuro Pedro que retome esta sesión puede leer este documento y continuar sin re-preguntar lo decidido. Documento congelado en el tiempo — los cambios futuros van a nuevos handoffs (`docs/handoffs/<fecha>-<slug>.md`), no a este.

---

# 🤝 PROMPT DE CONTINUACIÓN — Proyecto Hebra (Spanish-First Reddit Lead-Gen SaaS)

Estás retomando una sesión de brainstorming a mitad de camino. Lee TODO este documento antes de actuar. El proyecto, las decisiones y el contexto están aquí. No tienes que repetir preguntas que ya fueron contestadas.

## 1. Quién es el usuario y qué quiere construir

- **Usuario:** Pedro (email personal: `pedromantesem@gmail.com`, GitHub personal org: **`ElTecladoMagico`**).
- **Proyecto:** Side project — un clon en español de **[leadverse.ai](https://leadverse.ai/)** dirigido al público hispano (España + LATAM como un solo mercado). Inspirado en la estrategia de growth orgánico del fundador de Leadverse ($11k revenue / $2.75k MRR sin pagar ads, vía freemium + SEO + cold DMs).
- **Modo de trabajo:** Pedro habla en mezcla español/inglés, tutea, prefiere que respondas en español pero acepta inglés cuando es más claro. Le gustan respuestas estructuradas con tablas, comparativas y "mi recomendación" explícita. **Antes y después de escribir código siempre añade un bloque de "★ Insight" con 2-3 puntos educativos específicos del código o decisión.**

## 2. REGLAS DURAS (no romper)

1. **NO escribir nada dentro de `/Users/pedro.mantese@feverup.com/Documents/data-warehouse/`** — es un repo de empresa, ajeno al proyecto.
2. **El repo nuevo vive en `/Users/pedro.mantese@feverup.com/Documents/Hebra/`** como carpeta hermana de data-warehouse.
3. **Destino final del repo:** `github.com/ElTecladoMagico/Hebra`.
4. **Diseño visual (colores, tipografía, branding) está EXPLÍCITAMENTE fuera de scope ahora.** El usuario lo discutirá después de aprobar el design doc.
5. Estás siguiendo el flujo de la skill `superpowers:brainstorming`. **NO invocar ninguna skill de implementación hasta que el design doc esté aprobado por el usuario.**

## 3. Decisiones bloqueadas (7 preguntas de scoping ya contestadas)

| Pregunta | Decisión final |
|---|---|
| Usuario primario | **Freelancers y agencias** hispanohablantes buscando proyectos (NO B2B SaaS founders) |
| Geografía | **España + LATAM como un solo mercado** — filtrado de dialecto es display-side, no ingestion-side |
| Plataformas MVP | **Reddit ÚNICAMENTE** — X y LinkedIn son post-MVP |
| Scope MVP | **Ciclo completo:** campañas + feed de intent + respuestas IA + alertas (es la "experiencia" que se vende) |
| Stack | **Convex** (backend) + **Next.js 15 App Router** (frontend) + **Vercel** (deploy) + **Clerk** (auth) |
| Billing | **Polar.sh** (merchant of record — maneja VAT EU automático), NO Stripe directo. Migrar a Stripe directo cuando MRR > €2K |
| LLM | **Google Gemini** — `gemini-2.5-flash-lite` para intent scoring, `gemini-2.5-flash` para reply generation. NO Claude, NO OpenAI (motivo: coste 5-10× menor, calidad suficiente para español, contexto largo gratis). |
| Monetización | **Freemium desde día 1** — 7-day Pro trial **sin tarjeta**, auto-downgrade, emails win-back que mencionan features específicas que el user usó durante trial. Inspiración: Airtable (loss aversion ~2× gain bias). |

## 4. La referencia: Leadverse.ai — cómo funciona

- **Pricing actual:** Explorer $19/mo (solo Reddit), Founder $29/mo (+X), Business $39/mo (+LinkedIn). Trial 7 días.
- **Tracción reportada:** "5,303 businesses and freelancers" en homepage, $3,164 last 30 days en TrustMRR.
- **Cycle observado** (de screenshots del modal "New Campaign" del producto):
  1. Textarea **"What are you offering?"** (300 char limit) — descripción narrativa del freelancer
  2. **Website URL** opcional → AI lo usa para personalizar respuestas
  3. **Plataformas** como tabs multi-select (Reddit, X)
  4. **Keywords** — múltiples campos individuales (cada uno se busca por separado), botón **"Generate with AI"** que las deriva del offering
  5. **AI Reply Settings**:
     - Tone (Casual / Professional / Friendly)
     - Reply Length (Short 1-2 / Medium / Long)
     - Pitch Level (Soft value-focused / Balanced / Direct) ← **REEMPLAZAR** en nuestra versión (ver §6)
     - Toggle "Include Call-to-Action"
     - Toggle "Personalize Reply"
     - Textarea "Include Phrases" (200 char, frases concretas a inyectar)
  6. CTA primario: **"Create & Sync"**
- **Disclaimer crítico** que copiamos: *"We never auto-send. You generate a draft per lead and choose whether to send it using your connected account."* En español: *"Nunca enviamos automáticamente. Tú revisas cada respuesta antes de enviarla."*

## 5. Inspiración técnica: Agent-Reach

Repo clonado localmente en `/Users/pedro.mantese@feverup.com/Documents/AfterWork/Proyectos/Repos_importantes/Agent-Reach`. Es un toolkit Python que da a agentes acceso a múltiples plataformas sociales.

- **Para Reddit usa dos vías:** (a) `rdt-cli` (Python CLI, sin login, scrape) y (b) Exa MCP (`web_search_exa` con `includeDomains: ["reddit.com"]` — bypassa el 403 que Reddit da a IPs de datacenter).
- **Importante:** Agent-Reach es para *búsquedas one-shot* desde un agente. Nosotros necesitamos *monitorización continua* — patrón de acceso distinto. Por eso usaremos **Reddit OAuth API oficial** (gratis, 100 QPM, hecha justo para esto), NO scraping. Agent-Reach es inspiración de UX (búsqueda flat, rápida, keyboard-first) no de stack.
- También hay un skill `agent-reach` instalado que lo documenta.

## 6. Hallazgos UX (de un agente UX Researcher dispatched durante la sesión)

### Qué mantener de Leadverse
- Modal único scrolleable (no wizard)
- Botón "Generate with AI" para keywords (high-leverage)
- Offering como textarea narrativa (300 chars max)
- Keywords como filas individuales con X
- Disclaimer "Nunca enviamos automáticamente" (trust signal)
- Tone + Length toggles (no exponer temperature/tokens)
- CTA primario "Crear y empezar a buscar" (verb-led)

### Qué cambiar / añadir
- ❌ **NO usar Reddit OAuth para postear en MVP.** ToS de Reddit hace eso frágil (rate limits anti-spam, account-age thresholds, free tier prohibe automated commercial posting). En su lugar: **"Copiar y abrir Reddit"** en un click. Frame: *"Tú revisas, tú respondes, tú controlas."* OAuth posting es feature P2 opt-in con warnings.
- 🔄 **"Pitch Level" → "Estilo de respuesta"** porque Reddit en español (r/españa, r/mexico, r/argentina, r/programacion, r/emprendedores) es **MUCHO más hostil a auto-promoción** que LinkedIn-en-inglés. Opciones: *Aporta valor primero* (default), *Valor + menciona servicio*, *Oferta directa* (con warning de spam).
- ➕ **Selector de registro lingüístico**: *Español neutro* (default) / *España (tuteo peninsular)* / *LATAM informal (tuteo)*. NO basado en identidad del user — basado en destino del lead. Voseo es post-MVP.
- ➕ **"Bandeja de Señales"** = inbox de dos paneles (lista cronológica + detalle), NO card-grid. Score grande a la izquierda, * para unread, subreddit + tiempo > título de post.
- ➕ **Tone-tweak chips inline** ("más casual" / "más corto" / "menos comercial") en el draft, no buried en menu.
- ➕ **PWA con push notifications** (NO app nativa). iOS 16.4+ soporta PWA push. Push solo para "Calientes" (score 85+) para evitar alert fatigue.
- ➕ **Detalle del lead**: post original arriba (contexto), draft abajo (acción) — STACKED dentro del panel derecho, NO side-by-side.
- ➕ **Loss-aversion durante trial**: día 1-3 silencio, día 4-5 banner suave con número específico ("Ya has encontrado 12 leads"), día 6-7 sticky con loss específico ("Perderás acceso a 8 leads"). Email cadence: día 5 (value recap), día 7 morning (last chance), día 8 (downgrade + reactivar CTA).
- ➕ **Post-downgrade**: features greyed-out con tooltip "Disponible en Pro" (NO escondidas). Mostrar count ("23 nuevos leads esta semana — actualiza para verlos"). Patrón validado en Spotify/Duolingo.

### Tiers de scoring de leads
| Score | Etiqueta | Notificación |
|---|---|---|
| 85+ | **Caliente** | Push (PWA) + email + dot rojo in-app |
| 70-84 | **Tibia** | Dot in-app + daily digest email |
| <70 | **Fría** | Solo visible en inbox, sin notif |

## 7. Arquitectura locked-in (Shape A "Maximally Convex")

```
Browser → Next.js 15 (Vercel) → [Clerk auth] → Convex
                                              ↓
                                  ┌───────────┼───────────┐
                                  ▼           ▼           ▼
                           Schema/Queries  Crons      Actions
                                                          ↓
                                                  Reddit OAuth API
                                                  Gemini API
                                                  Resend (email)
                                                  Slack webhooks
                                                  Polar.sh webhook ←
```

- **Convex actions** = outbound HTTP. Llaman Reddit + Gemini + Resend + Slack.
- **Convex scheduled functions (crons):**
  - `pollReddit` — cada 5 min, por campaña activa
  - `trialEnder` — hourly, downgrade trials caducados
  - `emailDigest` — diario, summary a free users
  - `costGuard` — cada 5 min, pausa si Gemini > $X/día (circuit breaker)
- **Convex realtime queries** → dashboard updates instant cuando se score un nuevo lead.
- **Auth:** Clerk + Convex (par estándar).
- **Billing:** Polar.sh webhooks → Convex mutation → actualiza `users.tier`.
- **Email:** Resend (free tier 3K/mo).
- **Slack:** webhooks (sin OAuth integration).
- **Limitación conocida:** Convex actions tienen timeout 60s. Suficiente para nuestros casos. Si v2 necesita long-running (X, LinkedIn), añadir worker en Railway ($5/mo) → Shape B.

## 8. Modelo de coste (Gemini)

| Item | Volumen/día | Coste | $/user/día |
|---|---|---|---|
| Reddit polling | 480 calls | $0 (free OAuth API) | $0 |
| Intent scoring (Flash-Lite, ~600 tok) | ~30 posts | ~$0.075/M in + $0.40/M out | $0.0023 |
| Reply gen (Flash, ~1.6K tok) | ~5 replies | ~$0.30/M in + $2.50/M out | $0.0057 |
| Convex/Clerk/Vercel | flat | free tiers | $0 |
| **Total** | | | **~$0.008/user/día → ~$0.24/user/mes** |

| Active users | Total $/mes |
|---|---|
| 50 | ~$12 |
| 200 | ~$73 |
| 1,000 | ~$265 |
| 5,000 | ~$1,400 |

**Guardrails obligatorios en MVP:**
- Free tier: max 20 scoring calls + 5 replies / día / user
- Trial/Paid: max 200 scoring + 50 replies / día / user
- Global circuit breaker: si gasto Gemini > $X/día, pausar ingestion + email al admin

## 9. Naming y dominio: RESUELTO ✅

**Nombre del proyecto:** **Hebra**
**Dominio:** **`gethebra.com`**
**Carpeta local:** `/Users/pedro.mantese@feverup.com/Documents/Hebra/`
**GitHub:** `github.com/ElTecladoMagico/Hebra` (pendiente crear cuando se termine design doc)

### Cómo se llegó a la decisión

Se aplicó la skill `pensamiento-lateral` (técnicas: provocación, palabra aleatoria, inversión, extracción de conceptos) para escapar del cluster obvio (`lead/voz/caza/pista`).

Finalistas evaluados:

| Nombre | Origen lateral | Resultado |
|---|---|---|
| Atalaya | Vigilancia (semi-obvia pero ownable) | Descartado — 4 sílabas largo |
| Vigía | Centinela | Descartado — tilde problema |
| Olfato | Frase hecha "olfato para los negocios" | Considerado, asociación animal |
| Pálpito | Premonición/intuición hispanísmo | Considerado, intraducible al inglés |
| **Hebra** ⭐ | Hilo fino + Reddit threads + hebra de oro | **GANADOR** — doble metáfora |
| Yesca | Material que prende con chispa | Descartado — curva de explicación alta |
| Soplo | Inversión: el lead te llega como secreto | Descartado — connotación delación |

### Por qué Hebra

- **Doble metáfora:** thread de Reddit (hilo) + hebra de oro entre el ruido
- **5 caracteres** — corto, brandable
- **Copy memorable:** "Tira de la Hebra", "Cada cliente empieza por una hebra"
- **Pan-hispano** — funciona igual en España y LATAM
- **Pronunciable en inglés** sin destrozarse fonéticamente
- **Permite expansión** a X/LinkedIn sin rebrand (no menciona Reddit ni lead-gen)

### Por qué `gethebra.com` y no otras opciones

| Dominio | Por qué descartado |
|---|---|
| `hebra.com` | No disponible |
| `hebra.es` | No disponible + traiciona decisión "España+LATAM como un mercado" |
| `hebraes.com` | Confusión fonética con "hebreos/hebreas"; domain-hack feel |
| `hebralead.com` | Regresión al cluster obvio que evitamos con pensamiento lateral |
| `usehebra.com` | Choque vocálico en castellano: "u-sé-ébra" |
| `hebra.io` | €54 más caro, audiencia mixta freelancers/agencias prefiere `.com` |
| **`gethebra.com`** ⭐ | **Fonética limpia hispana ("guet-ébra"), patrón validado (getlinear, getlago, getstream), `.com` legítimo para audiencia no-tech, neutral España+LATAM** |

### Acciones defensivas pendientes (post-design doc)

- [ ] Comprar `hebra.es` cuando esté disponible (squatter actual puede liberar)
- [ ] Comprar `gethebra.es` (defensivo, ~€10) — redirige a `gethebra.com`
- [ ] Plan de upgrade a `hebra.com` cuando MRR > €5K (intentar comprar al squatter)

## 10. Estado del flujo de brainstorming

Checklist de la skill `superpowers:brainstorming`:
- [x] **1. Explorar contexto del proyecto** (data-warehouse files, leadverse.ai, agent-reach repo)
- [x] **2. (Skipped) Visual companion** — el usuario dijo que diseño es out-of-scope
- [x] **3. Preguntas clarificadoras** (7/7 respondidas)
- [x] **4. Proponer 2-3 enfoques arquitectónicos** (Shape A elegido)
- [⏳ EN PROGRESO] **5. Presentar diseño en secciones**:
  - [x] Sección 1: Arquitectura overview — APROBADA
  - [x] Naming + dominio — RESUELTO (`Hebra` / `gethebra.com`)
  - [ ] Sección 2: **Data model** (tablas Convex: users, campaigns, keywords, posts, leads, replies, alerts, usage, subscriptions)
  - [ ] Sección 3: **Flujos clave** (campaign creation → polling → scoring → reply gen → alerts → trial expiration)
  - [ ] Sección 4: **Error handling + cost guards** (rate limits, circuit breaker, retry logic)
  - [ ] Sección 5: **Testing strategy** (Convex test framework, Reddit/Gemini mocks)
- [ ] **6. Escribir design doc** a `docs/superpowers/specs/2026-04-XX-hebra-design.md` DENTRO del nuevo repo
- [ ] **7. Spec self-review** (placeholders, contradicciones, scope, ambigüedad)
- [ ] **8. User review del spec**
- [ ] **9. Invocar `superpowers:writing-plans`** para crear plan de implementación. Después: `/implement`.

## 11. Detalles técnicos importantes

- **Reddit API:** OAuth con app type "script" o "web app". 100 QPM gratis. Endpoint principal: `GET /r/{subreddit}/search?q={kw}&restrict_sr=true&sort=new&t=hour`. Refresh token via `grant_type=refresh_token`. Library JS: [`snoowrap`](https://github.com/not-an-aardvark/snoowrap) o `fetch` directo (más simple).
- **Subreddits objetivo (semilla):** r/españa, r/spain, r/mexico, r/argentina, r/colombia, r/chile, r/peru, r/devsenespanol, r/programacion, r/emprendedores, r/startups_es, r/SEO, r/Marketing, r/freelance.
- **Gemini API:** SDK `@google/generative-ai` o REST. Free tier: 15 RPM, 1M TPM, 1500 RPD. Producción: API key con billing. Long context (1M tokens) permite stuffing del subreddit history en prompt sin coste extra significativo.
- **Convex constraints:** action timeout 60s, mutation timeout 1s, query timeout 1s. Internal mutations para escrituras desde actions. `internalAction` vs `action` — usar `internalAction` para crons.
- **Clerk + Convex:** seguir [docs oficiales](https://docs.convex.dev/auth/clerk). Convex JWT template en Clerk dashboard. `auth.getUserIdentity()` en queries/mutations.
- **Polar.sh webhooks:** `subscription.created`, `subscription.updated`, `subscription.canceled` → mutation que sincroniza `users.tier` y `users.trialEndsAt`.
- **Resend:** transactional email. Templates: welcome, trial-day-5, trial-day-7, trial-expired, lead-alert, daily-digest.
- **PWA:** Next.js + `next-pwa` plugin. Web Push API + VAPID keys. Service worker para notif background.

## 12. Estilo de comunicación con el usuario

- Responde en **español por defecto**, switchea a inglés para términos técnicos universalmente conocidos en inglés (SaaS, OAuth, etc.).
- **Bloques "★ Insight"** antes y después de cualquier código o decisión técnica importante. Puntos específicos del codebase, no generales.
- **Tablas comparativas** cuando hay >2 opciones.
- **"Mi recomendación"** explícita cuando le pides que elija.
- **Una pregunta por turno** durante brainstorming (regla de la skill).
- Skills disponibles que conviene usar: `superpowers:brainstorming` (in progress), `superpowers:writing-plans` (next), `superpowers:executing-plans`, `superpowers:test-driven-development`, `frontend-design`, `agent-reach`, `pensamiento-lateral` (ya usada).
- Pedro tiene **agentes especializados disponibles** (UX Researcher, Frontend Developer, Backend Architect, Code Reviewer, etc.). Úsalos para tareas profundas o paralelizables. Siempre menciona qué agente lanzas.

## 13. Qué hacer AHORA al retomar (si la sesión se reanuda en frío)

1. Saluda brevemente. Confirma que has leído este checkpoint.
2. **Naming y dominio están RESUELTOS** (Hebra / gethebra.com) — no abrir esa decisión otra vez.
3. Continúa con **Sección 2 del design doc: Data model**. Diseña las tablas Convex con todos los detalles aprendidos. Aprobar sección por sección.
4. Avanza por Secciones 3, 4, 5 (flujos, error handling, testing).
5. Cuando todas las secciones estén aprobadas, escribe el design doc a `/Users/pedro.mantese@feverup.com/Documents/Hebra/docs/superpowers/specs/2026-04-XX-hebra-design.md`. Hazle git init + primer commit.
6. Self-review del spec, pide review al usuario.
7. Invoca `superpowers:writing-plans`. Después, `/implement`.

---

**Fin del checkpoint.** Próximo handoff (si lo hay): `2026-XX-XX-post-design-doc.md`.
