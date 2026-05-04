# Status Memo — Hebra

**Fecha:** 2026-05-04
**Autor:** Pedro Mantese (con Claude Code)
**Sucesor de:** `2026-04-30-status-memo.md`
**Propósito:** Snapshot del estado tras ejecución de Plan 2 (ingeniería) y escritura de Plan 3.

---

## TL;DR

- **Plan 1 (Foundation):** ✅ Cerrado. Auth + Convex + dashboard live en https://hebra-ten.vercel.app/
- **Plan 2 (Reddit ingestion + scoring):** ✅ 8/9 tasks (toda la ingeniería completa, 40/40 tests verde, schema + libs + scoring + cron desplegados a prod). 🟡 Task 9 (smoke test end-to-end) **bloqueado** esperando aprobación de Reddit API.
- **Plan 3 (UI feed + reply gen):** 📋 Escrito (7 tareas atómicas), pendiente de ejecutar. **Independiente del bloqueo Reddit**.
- **Plan 4 (Billing/trial) y Plan 5 (Notifications/PWA):** ⏳ Sin escribir aún.

**Repo:** https://github.com/ElTecladoMagico/Hebra (PUBLIC desde 2026-05-04 para review de Reddit; volver a privado tras aprobación)
**Prod URL:** https://hebra-ten.vercel.app/
**Convex prod:** `festive-starfish-619`
**Convex dev:** `rugged-salamander-939`

---

## Cambios desde 2026-04-30

### Decisiones arquitectónicas

| Decisión | Resolución | Razón |
|---|---|---|
| Webhook Clerk vs client-side sync | **Eliminado el webhook** (Opción A) | Doctrina simplicidad: un solo path canónico. `users.store` cubre todos los casos vía `useEffect` en dashboard. svix dep removed. Tests migrados a helper `upsertUserFromIdentity` testeable vía `t.run()` (workaround a convex-test issue #50). |
| Cuenta Reddit dedicada | `hebra-app-bot` (con hyphens, sufijo `-bot`) | Reddit recomienda sufijo explícito de bot para reducir riesgo de baneo. Reemplaza al `hebra_app` propuesto inicialmente. |
| Smoke test contra qué cuenta | `hebra-app-bot` (no personal) | Pedro prefiere usar la cuenta dedicada desde el primer test para mantener consistencia con el form de aprobación. Costa: bloquea Plan 2 Task 9 hasta aprobación. |
| Repo público vs privado | Público temporal | Reddit reviewers pueden auditar el "read-only claim" desde el código fuente. Volver a privado tras aprobación. **Verificado: cero secrets en historial git** (`.gitignore` presente desde commit 1, sin leaks). |

### Bug operacional importante (capturado y arreglado)

**Pricing math precision** en `scoreLead.ts`: el código original hacía `Math.round(result.costCents)`. Como cada call cuesta ~0.0065¢, **toda llamada redondeaba a 0** y el cost guard quedaba ciego.

Fix aplicado en commit `0de7173`: pasar `costCents` como float. Convex `v.number()` almacena 64-bit double, ample precision para nuestra escala. Comentario inline explica la decisión.

### Convex AI guidelines compliance

Hallazgos importantes que el subagent capturó leyendo `convex/_generated/ai/guidelines.md`:

- **`crons.hourly()` está prohibido** — solo `crons.cron()` y `crons.interval()`. Implementación final: `crons.cron("0 * * * *", ...)`.
- **Validators obligatorios** en TODAS las funciones, incluso con `args: {}`. Cumplido.
- **`ctx.runMutation/runQuery`** desde actions, nunca `ctx.db` directo. Cumplido.

---

## Estado del código (2026-05-04)

### Tests
**40/40 passing** distribuidos en 10 archivos:

| Archivo | Tests | Cubre |
|---|---|---|
| `tests/convex/users.test.ts` | 4 | upsertUserFromIdentity (idempotencia, name preservation, lastActiveAt) |
| `tests/convex/posts.test.ts` | 3 | upsertBatch (insert, dedupe, dialect tagging) |
| `tests/convex/leads.test.ts` | 2 | insert + dedupe by (postId, userId) |
| `tests/convex/campaigns.test.ts` | 3 | listActiveStale (null, fresh, paused) |
| `tests/lib/retry.test.ts` | 5 | withRetry + jitter |
| `tests/lib/dialect.test.ts` | 5 | detectDialect (es-ES, es-LATAM, neutral, case, partial-match) |
| `tests/lib/utcDateKey.test.ts` | 3 | UTC date formatting |
| `tests/lib/costGuard.test.ts` | 5 | usage queries + increments |
| `tests/integration/reddit.test.ts` | 4 | searchSubreddit (success, dedupe, retry, auth fail) |
| `tests/integration/gemini.test.ts` | 6 | scoreIntent + safeParseScoring (clamp, malformed, retry) |

### Schema (Convex prod desplegado)
6 tablas, 15 índices:
- `users`, `campaigns`, `redditPosts`, `leads`, `usageDaily`, `errorLog`
- `replies` table mencionada en design doc — **no creada aún en schema**, se añade en Plan 3 Task 3

### Convex actions desplegadas
- `actions/scoreLead.scoreLead` (`"use node"`)
- `crons/pollReddit.tick` y `crons/pollReddit.processCampaign` (`"use node"`)

### Cron registrado
`crons.cron("poll-active-campaigns", "0 * * * *", internal.crons.pollReddit.tick)` — corre cada hora UTC al minuto 0. **Actualmente sin variables de Reddit configuradas, así que las llamadas fallan silenciosamente con error log "Reddit credentials not configured".**

---

## Variables de entorno

### Convex prod (set vía `npx convex env set --prod`)

| Variable | Valor | Estado |
|---|---|---|
| `CLERK_JWT_ISSUER_DOMAIN` | `https://fun-mink-79.clerk.accounts.dev` | ✅ |
| `REDDIT_CLIENT_ID` | (pendiente) | ❌ Esperando aprobación Reddit |
| `REDDIT_CLIENT_SECRET` | (pendiente) | ❌ |
| `REDDIT_USERNAME` | `hebra-app-bot` (cuando aprueben) | ❌ |
| `REDDIT_PASSWORD` | (pendiente) | ❌ |
| `GEMINI_API_KEY` | (pendiente — Pedro tiene la key) | ❌ Falta hacer `npx convex env set --prod` |

### Convex dev — mismo set, sin las Reddit vars

### Vercel prod env (Production + Preview + Development)
| Variable | Estado |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ |
| `CLERK_SECRET_KEY` | ✅ |
| `NEXT_PUBLIC_CONVEX_URL` | ✅ (`https://festive-starfish-619.convex.cloud`) |
| `CONVEX_DEPLOY_KEY` | ✅ |
| ⚠️ `CLERK_WEBHOOK_SECRET` | **Borrar** — webhook eliminado, no se usa |

### Cleanup manual pendiente (no urgente)

1. **Vercel** → Settings → Environment Variables → borrar `CLERK_WEBHOOK_SECRET` (las 3 envs).
2. **Clerk dashboard** → Webhooks → borrar el endpoint creado en sesión anterior. Ya no procesa nada.

---

## Bloqueos activos

### Reddit API approval para `hebra-app-bot`

Pedro envió formulario de aprobación a Reddit el 2026-05-04. Información del form (resumen):
- Account: `hebra-app-bot`
- Use case: read-only Spanish-first lead-gen SaaS for freelancers
- Scope: 14 hispanic subreddits
- Rate: ~24 queries/h max, ~10 durante MVP
- Compromiso: never auto-post, never DM, never vote
- Source: público en https://github.com/ElTecladoMagico/Hebra

**Tiempo estimado:** 1-14 días según anecdotal de otros developers.

**Mientras tanto:** desarrollar Plan 3 sin Reddit real. Cuando Reddit apruebe, configurar las 4 env vars + GEMINI_API_KEY → Task 9 desbloquea.

---

## Identidades operacionales

| Recurso | Cuenta | Notas |
|---|---|---|
| GitHub repo | `ElTecladoMagico/Hebra` | Public actualmente. `gh auth switch --user ElTecladoMagico` necesario al retomar (active account default es `pedromantesemasegosa`). |
| Git author local | `ElTecladoMagico <126272834+ElTecladoMagico@users.noreply.github.com>` | Configurado en `.git/config` local del repo |
| Vercel | `eltecladomagico's project` | Login via `pedromantesem@gmail.com` |
| Convex | Team `pedro-mantese`, project `hebra` | |
| Clerk | App "Hebra" | Issuer: `fun-mink-79.clerk.accounts.dev` |
| Reddit (cuenta operacional) | `hebra-app-bot` | 4 días de antigüedad, esperando aprobación API |

---

## Próximos pasos al retomar (cualquier sesión nueva)

### Cómo retomar en frío (de 0)

1. Lee este memo + `docs/superpowers/specs/2026-04-30-hebra-design.md` + los plans en `docs/superpowers/plans/`.
2. Verifica gh CLI:
   ```bash
   gh auth status
   gh auth switch --user ElTecladoMagico  # si active no es ElTecladoMagico
   gh auth setup-git  # asegura que git push usa la cuenta correcta
   ```
3. Verifica estado del repo:
   ```bash
   cd /Users/pedro.mantese@feverup.com/Documents/AfterWork/Proyectos/SaaS/Hebra
   git status
   git log --oneline -10
   npm test  # debería ser 40/40
   ```

### Si Reddit ha aprobado `hebra-app-bot`

1. Crear el script app en https://www.reddit.com/prefs/apps con la cuenta `hebra-app-bot`.
2. Setear las 5 env vars:
   ```bash
   rtk proxy npx convex env set REDDIT_CLIENT_ID <14-char-id>
   rtk proxy npx convex env set REDDIT_CLIENT_SECRET <secret>
   rtk proxy npx convex env set REDDIT_USERNAME hebra-app-bot
   rtk proxy npx convex env set REDDIT_PASSWORD <password>
   rtk proxy npx convex env set GEMINI_API_KEY <key>
   # repetir todas con --prod
   ```
3. Ejecutar Plan 2 Task 9 (manual integration test): insertar campaña en Convex dev dashboard, disparar `crons/pollReddit.tick`, verificar redditPosts/leads/usageDaily.
4. Si OK, deploy prod: `rtk proxy npx convex deploy -y`.
5. Cerrar Plan 2 → empezar Plan 3.

### Si Reddit NO ha aprobado todavía

1. Ejecutar **Plan 3** (UI feed + reply gen) — independiente de Reddit.
2. Para verificar el feed UI: insertar leads manualmente en Convex dashboard (necesitas un user, una campaign, un redditPost, y un lead que los una).
3. Tras Plan 3, escribir Plan 4 (billing) y Plan 5 (notifications) — el orden no es estricto.

### Para cualquier subagent que despaches

- **DO NOT COMMIT OR PUSH** desde subagents (permission system bloquea direct-to-main aunque tú lo hayas autorizado). El controller commitea desde el contexto principal.
- **Lee `convex/_generated/ai/guidelines.md` antes de tocar Convex code** — Convex tiene reglas que cambian rápido (ej: `crons.hourly` deprecado en favor de `crons.cron`).
- **TDD estricto** en archivos de lib (retry, dialect, costGuard, etc.): test primero, ver fallar, implementar, ver pasar.

---

## Reglas duras heredadas (no romper)

1. NO escribir en `/Users/pedro.mantese@feverup.com/Documents/data-warehouse/` — repo de empresa, ajeno.
2. Diseño visual (colores, tipografía) sigue **fuera de scope** hasta sesión dedicada de design (post-aprobación design doc).
3. `.env.local` nunca se commitea. `.env.local.example` es el placeholder template.
4. Auto-posting a Reddit está prohibido en MVP. UI siempre debe terminar en "Copiar y abrir Reddit" — el usuario pega manualmente.
5. Pushes directos a `main` están autorizados (Pedro lo aprobó explícitamente). Subagents pueden ser bloqueados por permission system — controller maneja los commits.

---

## Estilo de comunicación con Pedro

- Español por defecto, inglés para términos técnicos universalmente conocidos.
- Bloques `★ Insight` antes/después de decisiones técnicas, específicos al codebase no genéricos.
- Tablas comparativas cuando hay >2 opciones.
- "Mi recomendación" explícita al final de análisis.
- Pedro quiere participar en decisiones arquitectónicas — siempre presentar opciones A/B/C con tradeoffs antes de actuar.
- Auto mode activo: ejecutar sin pedir permisos para tareas de bajo riesgo, parar solo en decisiones que afecten la arquitectura o requieran credenciales humanas.

---

**Fin del memo.** Próximo handoff esperado: tras desbloqueo Reddit + cierre Plan 2 Task 9, o tras completar Plan 3 — lo que ocurra primero.
