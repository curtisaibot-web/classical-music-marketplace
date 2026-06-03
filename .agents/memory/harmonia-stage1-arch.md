---
name: Harmonia Stage 1 Architecture
description: Key stack decisions, codegen commands, and build order for the Harmonia classical music marketplace
---

## Stack
- **API**: Express 5 + Drizzle ORM + PostgreSQL + Clerk Auth (`@clerk/express`)
- **Frontend**: React + Wouter + React Query v5 + Tailwind v4
- **Codegen**: Orval (OpenAPI → React Query hooks)
- **Monorepo**: pnpm workspaces; lib/db uses TypeScript project references

## Build order after schema changes
```bash
# 1. Apply SQL directly (see harmonia-db-schema.md)
# 2. Rebuild db package
cd lib/db && npx tsc --build
# 3. Update openapi.yaml, then run codegen
cd lib/api-spec && pnpm exec orval --config orval.config.ts
# 4. Rebuild api-client-react
cd lib/api-client-react && npx tsc --build
```

## Express 5 req.params typing
Express 5 types `req.params` values as `string | string[]` (not just `string`).
Always narrow before parseInt or regex: `const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id`.

## Stage 1 completed features
- `/search` — grouped marketplace search (teachers, listings, masterclasses, products)
- `/teachers` — extended filters: country, skillLevel, minRating, verifiedOnly, q
- `/teachers/:userId/verification` — public verification summary
- `/teachers/me/verification` POST — submit verification request  
- `/teachers/me/policies` PUT — update trial/cancellation/rescheduling policies
- `/inquiries` POST + `/inquiries/mine` GET
- `/seo/landing-pages` GET + `/seo/landing-pages/:slug` GET
- Frontend: /search page, /find/:slug SEO page, teacher profile trust UI, profile-edit Stage 1 fields
