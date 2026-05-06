# Classical Music Marketplace

A full-stack marketplace platform for classical musicians — connecting teachers, students, and event clients through five modules: lesson booking, event/wedding musician booking, live masterclass ticketing, a digital products store, and fan-funded concert crowdfunding.

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
| `teacher_profiles` | Teacher bio, instruments, rates, Stripe onboarding, `profile_slug` (unique vanity URL) |
| `student_profiles` | Student goals, skill level, instruments |
| `listings` | Polymorphic: lesson / event / masterclass / digital_product |
| `masterclass_events` | Live masterclass scheduling with performer/observer tiers |
| `event_listing_details` | Event-specific fields per listing: event types, venue types, headcount, travel radius, repertoire, deposit |
| `digital_products` | Sheet music, lesson plans, recordings |
| `bookings` | Lesson + event bookings (status machine) with event-specific fields: eventType, eventDate, eventLocation |
| `orders` | Digital product + masterclass ticket purchases |
| `reviews` | Ratings linked to bookings |
| `teacher_recordings` | Up to 5 audio recordings per teacher (url, title, description, sort_order) |
| `concert_campaigns` | Crowdfunding campaigns (pgEnum: active/succeeded/failed/cancelled) |
| `campaign_tickets` | Fan ticket purchases — authorised-only until campaign succeeds (pgEnum: authorised/captured/cancelled) |

Platform fee: **15%** on bookings/orders, **8%** on crowdfunding campaigns.

## API Endpoints

Base: `/api`

| Domain | Endpoints |
|---|---|
| Health | `GET /healthz` |
| Users | `GET /users/me`, `POST /users/me/onboard` |
| Teachers | `GET /teachers`, `GET /teachers/me`, `PUT /teachers/me`, `GET /teachers/:userId`, `GET /teachers/by-slug/:slug`, `PUT /teachers/me/slug`, `GET /teachers/:teacherId/recordings`, `POST /teachers/me/recordings`, `DELETE /teachers/me/recordings/:id` |
| Students | `GET /students/me`, `PUT /students/me` |
| Listings | CRUD `/listings`, `GET /listings/teacher/:userId` |
| Masterclasses | CRUD `/masterclasses` |
| Events | `GET /events`, `GET /events/:id`, `GET /events/availability/:teacherId`, `POST /event-booking-requests` |
| Digital Products | CRUD `/digital-products` (auto-creates listing on POST) |
| Bookings | CRUD `/bookings` (auth-gated) |
| Orders | CRUD `/orders` (auth-gated) |
| Reviews | `GET /reviews/teacher/:userId`, `POST /reviews` |
| Dashboard | `GET /dashboard/teacher`, `GET /dashboard/student` |
| Storage | `POST /storage/uploads/request-url` — request presigned GCS upload URL (teacher-auth) |
| Downloads | `GET /orders/:id/download` — returns signed GCS download URL (buyer-auth, 24h expiry) |

## Object Storage (Digital Products)

Replit object storage (GCS sidecar at `http://127.0.0.1:1106`). Env vars:
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — bucket name
- `PRIVATE_OBJECT_DIR` — private file prefix

Upload flow (two-step presigned URL):
1. Teacher calls `POST /api/storage/uploads/request-url` with `{name, size, contentType}`
2. Server returns `{uploadURL, objectPath}` — teacher PUTs file directly to GCS
3. Teacher saves `objectPath` as `fileKey` on the digital product

Download flow:
1. Buyer (confirmed paid order) calls `GET /api/orders/:id/download`
2. Server validates expiry (`downloadExpiresAt`) and ownership
3. Returns a 1-hour signed GCS URL the browser opens directly

Key files:
- `artifacts/api-server/src/lib/objectStorage.ts` — GCS signing via sidecar
- `artifacts/api-server/src/routes/storage.ts` — presigned upload URL endpoint
- `artifacts/api-server/src/routes/orders.ts` — download endpoint
- `artifacts/api-server/src/webhookHandlers.ts` — `unlockDigitalDownload` sets 24h window on Stripe payment
- `lib/object-storage-web/src/use-upload.ts` — frontend upload hook
- `artifacts/marketplace/src/pages/teacher/digital-products.tsx` — teacher product management UI
- `artifacts/marketplace/src/pages/student/orders.tsx` — student purchase history with download buttons

## Public Musician Pages & OG Sharing

Each teacher has a vanity slug (`profile_slug` on `teacher_profiles`). Public profiles are at `/musicians/:slug`.

**Crawler OG prerendering architecture (not full SSR):**
- `GET /api/og/musicians/:slug` — Express endpoint that returns OG-enriched HTML (og:title, og:description, og:url, og:image, twitter:*) built from DB data. Used as the authoritative social-share HTML source.
- **Production** (`artifacts/marketplace/server.mjs`): tiny Node.js server replaces static file serving. Crawler UAs hitting `/musicians/:slug` are proxied to `/api/og/musicians/:slug`; all other requests receive `dist/public/index.html` (SPA). Static assets served directly with correct MIME types.
- **Development** (`artifacts/marketplace/vite.config.ts` `ogRedirectPlugin`): Vite middleware 302-redirects crawler UAs from `/musicians/:slug` to `/api/og/musicians/:slug`.
- Regular users always receive the SPA; Wouter handles client-side routing to the profile page.
- `/musicians*` routing stays entirely within the marketplace service (API artifact paths unchanged).

**Recordings:** `POST/DELETE /api/teachers/me/recordings` (auth-safe `/me/` pattern, not `/:teacherId/`). Max 5 per teacher enforced server-side. Embed types: YouTube, Vimeo, SoundCloud iframes, direct audio fallback (`lib/recording-embed.ts`).

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

## Payments (Stripe)

Stripe integration code is fully implemented but **not yet connected**. The user chose to skip the Stripe connection for now. When ready:

1. Connect Stripe via Replit's integration panel (search "Stripe"), OR
2. Provide `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as environment secrets

Key files:
- `artifacts/api-server/src/stripeClient.ts` — Stripe client factory
- `artifacts/api-server/src/routes/stripe.ts` — 5 payment endpoints
- `artifacts/api-server/src/webhookHandlers.ts` — webhook processing
- `artifacts/api-server/src/stripeInit.ts` — initialization (called at startup)

**NOTE:** Do NOT use the Replit integrations system for Stripe without user confirmation. User dismissed it once — ask before proposing again.

## Images & Visual Assets

All images are AI-generated and stored in `artifacts/marketplace/public/images/`:

| Folder | Contents |
|---|---|
| `images/teachers/` | 8 musician portrait photos (one per seed teacher) |
| `images/masterclasses/` | Event/masterclass cover photos |
| `images/store/` | Digital product cover images (sheet music, workbooks) |
| `images/hero_concert_hall.png` | Homepage hero background |

Image URLs are stored as root-relative paths (e.g. `/images/teachers/sofia_chen.png`) in the DB.
The helper `artifacts/marketplace/src/lib/image-url.ts` → `resolveImageUrl(url, basePath)` prepends
the Vite `BASE_URL` so local paths become e.g. `/marketplace/images/teachers/sofia_chen.png`.

**Seed note:** The seed uses `onConflictDoNothing`. If re-seeding doesn't update existing records
(e.g. `profileImageUrl`), run direct SQL `UPDATE` statements or truncate tables first.

## Events / Wedding Musician Booking Module

The event booking module is fully wired. Key files:
- `lib/db/src/schema/eventListingDetails.ts` — event-specific listing details table
- `artifacts/api-server/src/routes/events.ts` — all 4 event routes
- `lib/api-client-react/src/events.ts` — React Query hooks (manual, not generated)
- `artifacts/marketplace/src/pages/events/index.tsx` — browse page with instrument/city/event-type filters
- `artifacts/marketplace/src/pages/events/detail.tsx` — detail page with availability calendar + booking request form

The availability calendar shows booked dates (red) fetched from confirmed/pending event bookings for the teacher. Booking requests create a `bookings` row with type=`event` and status=`pending`.

## Concert Crowdfunding (Task #34)

All-or-nothing crowdfunding for live concerts at `/concerts`. Stripe `capture_method: manual` — fans authorise payment at checkout; card is only charged if campaign hits its ticket goal.

New DB tables: `concert_campaigns`, `campaign_tickets` (created via direct SQL — drizzle push interactive prompt workaround).

New API routes (all under `/api/campaigns`):
- `GET /campaigns` — public browse
- `GET /campaigns/my` — teacher's campaigns with stats
- `GET /campaigns/:id` — detail + backerCount
- `POST /campaigns` — create (teacher auth, max 60-day deadline)
- `PATCH /campaigns/:id` — update metadata
- `POST /campaigns/:id/cancel` — cancel + void all PaymentIntents + email backers
- `POST /campaigns/:id/checkout` — Stripe Checkout with `capture_method: manual`, 8% platform fee
- `GET /campaigns/:id/tickets` — ticket roster (teacher only)

Webhook: `checkout.session.completed` → stores PaymentIntentId on ticket, checks if goal met → captures all if so.
Cron: hourly sweep (`expireDeadlinedCampaigns`) processes deadline-passed campaigns → success (capture) or failure (cancel).
Email: success/failure/cancel notifications via `sendEmail` (no-op if SMTP not configured).
QR code: UUID access code stored on each ticket, emailed on campaign success.

Frontend:
- `/concerts` — public browse with progress bars, deadline countdown
- `/concerts/:id` — detail page with sticky checkout widget, quantity selector, fee breakdown, how-it-works card
- `/campaigns` — teacher management: create dialog with earnings preview, cancel with AlertDialog
- Navbar: "Concerts" (public) + "Campaigns" (teacher nav)
- Teacher dashboard: "Concert Campaigns" quick-link card

## Business Suite (SaaS — Task #32)

Musician Business Suite at `/business-suite` — Pro subscription ($29/mo or $279/yr via Stripe Checkout).

New DB tables: `subscriptions`, `contracts`, `invoices`, `expenses`. New columns on `teacher_profiles`: `cancellation_policy_hours`, `cancellation_fee_percent`.

New API routes:
- `GET/POST /subscriptions/me` — subscription status; `POST /subscriptions/checkout`, `POST /subscriptions/portal`, `POST /subscriptions/activate`
- CRUD + send/sign/pdf: `/contracts`, `/invoices`, `/expenses`
- Public contract signing: `GET/POST /api/contracts/sign/:token`

Frontend tabs: Subscription (Stripe checkout/portal), Contracts (CRUD + HTML PDF + e-sign flow), Invoices (line items + PDF + mark-paid), Expenses (monthly filter + category bar chart), Cancellation Policy.

Pro badge (`Crown` icon, amber) shown on teacher cards (`/teachers`), musician slug profiles (`/musicians/:slug`), and profile hero. Teachers API joins with `subscriptions` to compute `isProSubscriber`.

## Pending Tasks

- **Task #5**: Reviews, Search & Launch Polish
