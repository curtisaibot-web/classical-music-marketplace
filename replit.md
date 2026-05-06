# Classical Music Marketplace (Harmonia)

A full-stack marketplace connecting classical musicians, teachers, students, and fans across eight modules: lesson booking, event/wedding musician booking, live masterclass ticketing, digital products store, fan-funded concert crowdfunding, original score marketplace with tiered licensing, career coaching from industry insiders, and practice partner matching.

## Run & Operate

```bash
# Dev servers
pnpm --filter @workspace/api-server run dev      # API on PORT (default 8080)
pnpm --filter @workspace/marketplace run dev     # Frontend on PORT (default 5173)

# Codegen (after editing openapi.yaml)
cd lib/api-spec && pnpm exec orval --config orval.config.ts

# Rebuild packages
pnpm --filter @workspace/db exec tsc -p tsconfig.json
pnpm --filter @workspace/api-client-react exec tsc -p tsconfig.json

# DB migrations (drizzle-kit has TTY issues — use psql directly)
psql "$DATABASE_URL" -f migration.sql
```

Required env vars: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`. Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (optional — gracefully disabled if absent).

## Stack

- **Runtime**: Node.js 20, TypeScript 5
- **API**: Express 5 + Drizzle ORM + PostgreSQL
- **Auth**: Clerk (Replit-managed white-label, VITE_CLERK_PROXY_URL)
- **Frontend**: React 19 + Vite 7 + Wouter + React Query v5 + Tailwind v4 + shadcn/ui
- **Payments**: Stripe v22 (checkout sessions, Connect payouts, webhooks)
- **Storage**: Replit Object Storage (GCS sidecar at `http://127.0.0.1:1106`)
- **Codegen**: Orval (OpenAPI → React Query hooks + Zod schemas)

## Where things live

```
artifacts/api-server/src/
  routes/          — one file per domain (scores.ts, stripe.ts, webhookHandlers.ts…)
  lib/objectStorage.ts — GCS presigned URL signing
  stripeClient.ts  — Stripe client factory

artifacts/marketplace/src/
  pages/scores/    — /scores browse + /scores/:id detail
  pages/coaching/  — /coaching browse, /coaching/:userId profile, /coaching/apply
  pages/teacher/dashboard.tsx — includes ComposerRoyaltyCard + CoachingCard + PracticePartnersCard
  pages/student/score-licenses.tsx — /my-score-licenses
  pages/practice-partners/index.tsx — /practice-partners browse + matching + session scheduling

lib/db/src/schema/ — source-of-truth for all DB tables
lib/api-spec/openapi.yaml — source-of-truth for API contract
lib/api-client-react/src/generated/api.ts — generated React Query hooks
```

## Architecture decisions

- **Orval codegen**: All API hooks generated from `openapi.yaml`. Run codegen after any spec change; never hand-write hooks.
- **Scores download**: `fullPdfKey` is never returned in public API responses — only exposed in the authenticated `/api/score-licenses/:id/download` endpoint after verifying active license.
- **Score license expiry**: personal and performance licenses are perpetual (`expiresAt = null`); sync licenses expire after 1 year (set at checkout time, enforced at download time).
- **Drizzle-kit push**: Has TTY issues in CI — use `psql $DATABASE_URL` directly for all schema migrations.
- **OG prerendering**: Not full SSR. A tiny Express server (`server.mjs`) proxies crawler UAs to `/api/og/musicians/:slug`; regular users get the SPA.
- **Platform fee**: 15% on bookings/digital products/score licenses; 20% on coaching sessions (constant in `coaches.ts`); 8% on crowdfunding campaigns.
- **Coach profiles**: `coach_profiles` table (approval_status pending→approved→rejected). Admin approves via DB (no UI). Only approved coaches appear in `/coaching` browse; only approved coaches can create coaching listings.

## Product

- `/teachers` — browse teachers; `/musicians/:slug` — public profiles with OG sharing
- `/masterclasses` — ticketed live masterclasses (performer + observer tiers)
- `/events` + `/gigs` — event/wedding musician booking with availability calendar
- `/store` — digital products (sheet music, lesson plans, recordings)
- `/scores` — original score marketplace with 3-tier licensing (personal/performance/sync)
- `/coaching` — career coaching from industry insiders; `/coaching/apply` — coach application form
- `/practice-partners` — practice partner matching: profile setup, browse matches by instrument/format, send/accept requests, schedule sessions with Zoom links, mark complete; AI-ranked "why we matched" blurbs for Business Suite subscribers
- `/concerts` — fan-funded concert crowdfunding (all-or-nothing, Stripe manual capture)
- `/audition-prep` — audition coaching programs with session tracking
- `/schools/join` + `/org-admin` — music school white-label organisations
- `/business-suite` — SaaS subscription (contracts, invoices, expenses)
- `/teacher-dashboard` — teacher hub with royalty card for composers

## User preferences

- Stripe connection intentionally deferred — do NOT use Replit integrations for Stripe without user confirmation.
- `drizzle-kit push` has TTY issues — always use `psql $DATABASE_URL` for migrations.

## Gotchas

- Route ordering: static routes (`/scores/mine`) must be registered BEFORE parameterised routes (`/scores/:id`).
- `drizzle-orm` `sum()` returns `string | null` — always `Number(...)` the result.
- Orval paths must be in the `paths:` section of openapi.yaml, not inside `components:`.
- `useEffect` in `hasLoaded` pattern used in ComposerRoyaltyCard to avoid double-fetching.

## Pointers

- DB schema: `lib/db/src/schema/` (scores.ts, coachProfiles.ts)
- Rebuild db declarations after schema changes: `cd lib/db && npx tsc --build`
- API spec: `lib/api-spec/openapi.yaml`
- Stripe checkout patterns: `artifacts/api-server/src/routes/stripe.ts`
- Webhook handlers: `artifacts/api-server/src/webhookHandlers.ts`
