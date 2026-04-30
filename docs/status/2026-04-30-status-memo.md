# Status Memo — Hebra

**Fecha:** 2026-04-30
**Autor:** Pedro Mantese (con Claude Code)
**Propósito:** Snapshot del estado actual del proyecto para poder retomarlo en frío desde aquí.

---

## TL;DR

- **Proyecto:** Hebra — SaaS spanish-first de Reddit lead-generation para freelancers/agencias hispanohablantes (España + LATAM). Clon de Leadverse.ai posicionado para mercado hispano.
- **Estado:** Plan 1 (Foundation) ejecutado y desplegado a producción. Pendiente solo el smoke test final tras configurar Clerk webhook.
- **URL prod:** https://hebra-ten.vercel.app/
- **Repo:** https://github.com/ElTecladoMagico/Hebra (privado)
- **Próximo paso:** Cerrar smoke test → escribir Plan 2 (Reddit ingestion + scoring).

---

## Decisiones del proyecto (cerradas)

| Decisión | Valor |
|---|---|
| Naming + dominio | **Hebra** / `gethebra.com` |
| Mercado | España + LATAM como un solo mercado |
| Plataformas MVP | **Reddit únicamente** (X y LinkedIn son post-MVP) |
| Stack | Next.js 15 + Convex + Clerk + Polar.sh + Gemini + Resend + Vercel |
| LLM | `gemini-2.5-flash-lite` (scoring) + `gemini-2.5-flash` (replies) |
| Pricing | **Free €0** + **Pro €19/mes** (paridad con Leadverse Explorer) |
| Polling Reddit | Horario (no 5 min — ahorro de coste) |
| Auto-posting | NO en MVP. Botón "Copiar y abrir Reddit" |
| Dialecto | Detectado del lead destino, no del user (es-neutral / es-ES / es-LATAM) |
| Estilo respuesta | "Aporta valor primero" (default) / "Valor + menciona servicio" / "Oferta directa" |
| Trial | 7 días Pro sin tarjeta + auto-downgrade vía Polar dunning |
| Cost guard | Tripwire $5/día (pausa ingestion) + Kill $50/día (bloquea Gemini) |
| Cuenta Reddit MVP | Compartida `hebra_app` (warmed-up 30+ días) — Pedro creando ahora |

---

## Lo que se ha construido (Plan 1: Foundation)

Repo bootstrap completo con auth funcionando, schema Convex desplegado, dashboard mínimo y deploy en Vercel.

### Commits (orden cronológico)

| SHA | Descripción |
|---|---|
| `49b42ed` | docs: design doc + implementation plan 1 (foundation) |
| `83ce5e5` | chore: bootstrap repo with Next.js + Convex + Clerk tooling |
| `378f9e3` | chore: bump next to ^15.2.3 to fix CVE and clerk peer-dep |
| `5db2666` | feat: next.js app skeleton with landing page |
| `fbedc6e` | feat: convex schema stub + clerk jwt auth config |
| `3ade05e` | feat: clerk auth with sign-in/sign-up pages and convex provider |
| `5dbe280` | feat: user sync from clerk webhook with convex-test coverage |
| `47295dd` | feat: authed dashboard shell with user provisioning |

### Capas funcionando hoy

1. **Repo + tooling**: Next.js 15.5+, TypeScript estricto, Biome (lint+format), Vitest, convex-test. Build verde, typecheck verde.
2. **Auth (Clerk)**: Email magic link + Google. Sign-in / sign-up catch-all routes. Middleware protege todo excepto landing y webhooks.
3. **Convex**:
   - Dev deployment: `rugged-salamander-939` (Europe/Ireland)
   - Prod deployment: `festive-starfish-619`
   - Schema con 3 tablas: `users`, `campaigns` (stub), `errorLog`
   - JWT issuer `https://fun-mink-79.clerk.accounts.dev` configurado en dev + prod
4. **User sync**: webhook `/api/webhooks/clerk` con HMAC SHA256 (svix) + mutation `users.createOrUpdate` idempotente. Tests TDD 2/2 verde.
5. **Dashboard**: `(app)/dashboard` lee `users.current` con reactive query. Landing redirige autenticados a `/dashboard`.
6. **Deploy Vercel**: build command override `npx convex codegen && npx convex deploy --cmd 'npm run build'`. URL: https://hebra-ten.vercel.app/.

---

## Pendiente para cerrar Plan 1

1. **Configurar Clerk webhook** apuntando a `https://hebra-ten.vercel.app/api/webhooks/clerk`, suscrito a `user.created` y `user.updated`.
2. **Añadir `CLERK_WEBHOOK_SECRET`** en Vercel env vars (Production + Preview + Development).
3. **Redeploy** Vercel para que recoja el nuevo secret.
4. **Smoke test end-to-end:**
   - Sign up con un email real (sugerencia: `pedromantesem+hebra1@gmail.com`)
   - Confirmar magic link
   - Aterrizar en `/dashboard` con "Plan actual: free"
   - Verificar row en https://dashboard.convex.dev/d/festive-starfish-619/data/users

---

## Identidades y secretos

| Recurso | Cuenta / valor | Dónde está |
|---|---|---|
| GitHub repo | `ElTecladoMagico/Hebra` (privado) | `gh` CLI active = ElTecladoMagico |
| Git author local | `ElTecladoMagico <126272834+ElTecladoMagico@users.noreply.github.com>` | `git config --local` en repo |
| Vercel | Team `eltecladomagico's project` | login con `pedromantesem@gmail.com` |
| Convex | Team `pedro-mantese`, project `hebra` | login Pedro |
| Clerk | App "Hebra", JWT template "Convex" | Issuer: `https://fun-mink-79.clerk.accounts.dev` |
| Reddit (P2) | Cuenta `hebra_app` | EN PROCESO de creación + warming |

### Variables de entorno críticas

**`.env.local` (local dev):**
- `CONVEX_DEPLOYMENT` = `dev:rugged-salamander-939`
- `NEXT_PUBLIC_CONVEX_URL` = `https://rugged-salamander-939.convex.cloud`
- `NEXT_PUBLIC_CONVEX_SITE_URL` = `https://rugged-salamander-939.convex.site`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_test_...` (en Pedro local)
- `CLERK_SECRET_KEY` = `sk_test_...` (en Pedro local)
- ⚠️ `CLERK_WEBHOOK_SECRET` = pendiente de añadir tras crear el endpoint en Clerk

**Vercel Production:**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` ✅
- `CLERK_SECRET_KEY` ✅
- `NEXT_PUBLIC_CONVEX_URL` = `https://festive-starfish-619.convex.cloud` ✅
- `CONVEX_DEPLOY_KEY` ✅
- ⚠️ `CLERK_WEBHOOK_SECRET` = pendiente

**Convex env vars (set vía `npx convex env set`):**
- Dev: `CLERK_JWT_ISSUER_DOMAIN` = `https://fun-mink-79.clerk.accounts.dev` ✅
- Prod: `CLERK_JWT_ISSUER_DOMAIN` = `https://fun-mink-79.clerk.accounts.dev` ✅

---

## Documentos clave del proyecto

- **Design doc completo:** `docs/superpowers/specs/2026-04-30-hebra-design.md` (13 secciones — scope, arquitectura, data model, flujos, error handling, testing, costes, pricing, secrets, decisiones diferidas, glosario)
- **Plan 1 (Foundation):** `docs/superpowers/plans/2026-04-30-plan-1-foundation.md`
- **Handoff pre-design (histórico):** `docs/handoffs/2026-04-28-pre-design-doc.md`

---

## Próximos planes (no escritos aún)

1. **Plan 2 — Reddit ingestion + scoring**: cron horario que polea Reddit, llama Gemini para intent score, inserta leads. Tests con mocks (msw). Cost guard tripwire.
2. **Plan 3 — UI feed + reply gen**: Bandeja de Señales (inbox 2 paneles), draft de respuestas, tone tweaks, "Copiar y abrir Reddit". Modal "Nueva campaña" estilo Leadverse.
3. **Plan 4 — Billing + trial**: Polar.sh webhooks, trial 7 días, auto-downgrade, emails win-back.
4. **Plan 5 — Notifications + PWA**: Web Push para Calientes (85+), email digest diario, alerts.

**Nota estratégica para retomar:** Pedro quiere usar Hebra él mismo para encontrar clientes (dogfooding). Para eso, el orden importa: Plan 2 + Plan 3 + Plan 5 lo dejan operativo. Plan 4 (billing) puede ir al final — Pedro puede setearse `tier: pro` directo en DB hasta que haya otros usuarios.

---

## Cómo retomar desde aquí (instrucciones para futura sesión)

1. **Lee este memo + `docs/superpowers/specs/2026-04-30-hebra-design.md` + `docs/superpowers/plans/2026-04-30-plan-1-foundation.md`** antes de actuar.
2. **Verifica estado actual** con:
   ```bash
   cd /Users/pedro.mantese@feverup.com/Documents/AfterWork/Proyectos/SaaS/Hebra
   git log --oneline -10
   gh auth status
   ```
3. **Si falta cerrar Plan 1:** completar smoke test (sección "Pendiente para cerrar Plan 1" arriba).
4. **Si Plan 1 está cerrado:** invocar `superpowers:writing-plans` para escribir Plan 2 (Reddit ingestion + scoring) en `docs/superpowers/plans/`. Después ejecutar con `superpowers:subagent-driven-development`.
5. **Reglas duras heredadas del handoff inicial:**
   - NO escribir en `/Users/pedro.mantese@feverup.com/Documents/data-warehouse/` (repo de empresa, ajeno).
   - Diseño visual (colores, tipografía) sigue fuera de scope hasta que se decida explícitamente.
   - Siempre commitear atómicamente, push a `main` (Pedro autorizó este flow para foundation).
6. **Estilo de comunicación con Pedro:**
   - Español por defecto, inglés para términos técnicos universales.
   - Bloques `★ Insight` antes/después de decisiones técnicas.
   - Tablas comparativas cuando hay >2 opciones.
   - "Mi recomendación" explícita.
   - Una pregunta por turno durante brainstorming.

---

**Fin del memo.** Próximo handoff: `docs/handoffs/2026-XX-XX-post-plan-1.md` cuando se cierre Plan 1 y arranque Plan 2.
