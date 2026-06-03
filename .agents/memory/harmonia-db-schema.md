---
name: Harmonia DB Schema Conventions
description: How to apply schema changes in this project — drizzle-kit push is broken, use executeSql instead
---

## Rule
Do NOT run `pnpm --filter @workspace/db run push` — it spawns an interactive prompt (drizzle-kit confirmation) that hangs in the agent environment.

**Why:** drizzle-kit 0.x `push` requires interactive keyboard confirmation for destructive operations; the agent can't respond.

**How to apply:**
1. Edit the Drizzle schema file in `lib/db/src/schema/`.
2. Apply SQL directly via `executeSql()` in `code_execution`.
3. Rebuild the lib/db package: `cd lib/db && npx tsc --build`.
4. Verify the DB matches the schema with a `information_schema.columns` query.

## Known DB quirks (Stage 1)
- `inquiries.status` must be the `inquiry_status` pgEnum type (not text). It was initially created as text — fixed by adding enum column and renaming.
- `teacher_verification_documents.teacher_id` references `users.id` (not `teacher_profiles.user_id`).
- All three new tables need `updated_at timestamptz NOT NULL DEFAULT now()`.
- `verification_status` enum exists in DB; `inquiry_status` enum was added manually.
