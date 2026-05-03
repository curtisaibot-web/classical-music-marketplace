# Classical Music Marketplace

A full-stack marketplace platform for classical musicians — connecting teachers, students, and event clients through four modules: lesson booking, event/wedding musician booking, live masterclass ticketing, and a digital products store.

## Architecture

**Monorepo** managed with pnpm workspaces.

### Artifacts

| Artifact | Path | Description |
|---|---|---|
| `api-server` | `/api` | Express 5 + Drizzle ORM REST API |

### Shared Libraries

| Library | Description |
|---|---|
| `@workspace/db` | Drizzle ORM schema + PostgreSQL client |
| `@workspace/api-spec` | OpenAPI spec (`lib/api-spec/openapi.yaml`) + Orval codegen |
| `@workspace/api-zod` | Generated Zod validation schemas (server-side) |
| `@workspace/api-client-react` | Generated React Query hooks (client-side) |

## Authentication

**Clerk Auth** (Replit-managed white-label). Keys are auto-provisioned.

- `CLERK_SECRET_KEY` — server-side Clerk secret
- `CLERK_PUBLISHABLE_KEY` — client-side publishable key
- `VITE_CLERK_PUBLISHABLE_KEY` — Vite env var for frontend

Proxy path: `/api/__clerk`

## Database Schema

**PostgreSQL** via Drizzle ORM. Tables:

| Table | Description |
|---|---|
| `users` | Clerk user ID as PK. Roles: `teacher` / `student` |
| `teacher_profiles` | Teacher bio, instruments, rates, Stripe onboarding |
| `student_profiles` | Student goals, skill level, instruments |
| `listings` | Polymorphic: lesson / event / masterclass / digital_product |
| `masterclass_events` | Live masterclass scheduling with performer/observer tiers |
| `digital_products` | Sheet music, lesson plans, recordings |
| `bookings` | Lesson + event bookings (status machine) |
| `orders` | Digital product + masterclass ticket purchases |
| `reviews` | Ratings linked to bookings |

Platform fee: **15%** on all bookings and orders.

## API Endpoints

Base: `/api`

| Domain | Endpoints |
|---|---|
| Health | `GET /healthz` |
| Users | `GET /users/me`, `POST /users/me/onboard` |
| Teachers | `GET /teachers`, `GET /teachers/me`, `PUT /teachers/me`, `GET /teachers/:userId` |
| Students | `GET /students/me`, `PUT /students/me` |
| Listings | CRUD `/listings`, `GET /listings/teacher/:userId` |
| Masterclasses | CRUD `/masterclasses` |
| Digital Products | CRUD `/digital-products` |
| Bookings | CRUD `/bookings` (auth-gated) |
| Orders | CRUD `/orders` (auth-gated) |
| Reviews | `GET /reviews/teacher/:userId`, `POST /reviews` |
| Dashboard | `GET /dashboard/teacher`, `GET /dashboard/student` |

## Codegen

After editing `lib/api-spec/openapi.yaml`:

```bash
pnpm --filter @workspace/api-spec run codegen
```

This regenerates:
- `lib/api-zod/src/generated/api/api.ts` — Zod validation schemas
- `lib/api-client-react/src/generated/api.ts` — React Query hooks

**Important:** `lib/api-zod/src/index.ts` must export from `./generated/api/api` directly (NOT the generated barrel). Do NOT change this line.

## DB Commands

```bash
# Push schema changes
pnpm --filter @workspace/db run push

# Force push (column conflicts)
pnpm --filter @workspace/db run push-force

# Seed demo data
pnpm --filter @workspace/scripts run seed
```

## Pending Tasks

- **Task #2**: Marketplace Web App (React Frontend) — blocked by Task #1 ✅
- **Task #3**: Stripe Payment Integration — blocked by Task #1 ✅
- **Task #4**: Digital Products: Uploads & Secure Downloads
- **Task #5**: Reviews, Search & Launch Polish
