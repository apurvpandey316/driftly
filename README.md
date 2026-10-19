# Driftly

Detect database schema differences between environments, without changing the connected databases.

## Stack
Next.js (App Router) + TypeScript · Tailwind v4 · Drizzle ORM · `pg` · Supabase (app DB + auth)

## Getting started (Windows)

1. Install **Node.js 22 LTS** from https://nodejs.org (check: `node -v`).
2. In this folder:
   ```
   npm install
   copy .env.example .env
   ```
3. Fill in `.env`:
   - `DATABASE_URL`: create a free Supabase project for Driftly's own data, then use
     Project Settings → Database → Connection string (URI).
   - `CREDENTIALS_KEY`: run
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
4. Create the app tables: `npm run db:generate` then `npm run db:migrate`
5. Start it: `npm run dev` → http://localhost:3000

## Test databases to compare
`dev-databases/` has two seeded schemas with deliberate drift:
`reference.sql` (Development) and `target.sql` (Production).

- **With Docker Desktop:** `docker compose up -d`. This gives Postgres on ports 5433 (dev) and 5434 (prod),
  user `postgres`, password `postgres`.
- **Without Docker:** create two more free Supabase projects and paste each SQL file into its SQL Editor.

`readonly-role.sql` creates a least-privilege `driftly_reader` user for real databases.

Expected differences (reference → target): missing table `audit_logs`, extra table `feature_flags`,
missing column `users.phone_number`, extra column `users.legacy_id`, `users.email` type
(varchar(255) vs text), `users.display_name` nullability, missing index `users_email_idx`,
FK action on `projects.owner_id` (CASCADE vs NO ACTION). `projects_owner_idx` is written
differently but is equivalent, so it must **not** be reported.

## Layout
```
src/app/        routes (dashboard, connections, comparisons, history, settings)
src/components/ shared UI
src/db/         Driftly's own database schema (Drizzle)
src/engine/     comparison engine (standalone, no Next.js imports)
src/lib/        crypto (AES-256-GCM credential encryption), utils
dev-databases/  seeded test schemas
```

## Build plan
0. Setup ✅ · 1. Engine · 2. Shell + Connections · 3. New Comparison + Results · 4. Schema Explorer · 5. Dashboard
