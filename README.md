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
   - Optional: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` to turn on sign-in (see **Sign-in** below).
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

## Compare two databases from the terminal (Part 1)
With the Docker test databases running:
```
npm run compare -- "postgresql://postgres:postgres@localhost:5433/driftly_dev" "postgresql://postgres:postgres@localhost:5434/driftly_prod"
```
Options: `--schemas public,app` · `--exclude table1,public.table2` · `--ssl require` (needed for Supabase) ·
`--json result.json` · `--csv result.csv` · `--test` (only test both connections).
Exit code: 0 in parity, 1 differences found, 2 scan failed or partial.

## Add your test databases in the app (Part 2)
Run `npm run dev`, open http://localhost:3000/connections and add two connections
(or paste the URL into the quick-fill box):

| Name | Environment | Host | Port | Database | User / password | SSL |
|---|---|---|---|---|---|---|
| Development | Development | localhost | 5433 | driftly_dev | postgres / postgres | Disable |
| Production | Production | localhost | 5434 | driftly_prod | postgres / postgres | Disable |

The "superuser" note after testing is expected for these local test databases.

## Run a comparison (Part 3)
Comparisons → New Comparison → pick Development as reference and Production as target → Run comparison.
Results are saved and never change afterwards; export them as JSON or CSV from the results page.

## Browse a schema (Part 4) and the Overview (Part 5)
- Connections → **Schema** on any row opens a read-only explorer: tables, columns, keys, foreign keys
  (both directions), unique constraints and indexes. From a comparison, **Explore target** opens it with
  the differences highlighted.
- **Overview** shows connections, active differences, healthy pairs, the latest scan, and a chart of the
  last seven scans. Everything comes from saved scans, never assumed to be live.

## Drift History (Phase 2)
- **Drift History** lists every run, filterable by pair, period and result, with what changed since the previous
  successful run of the same pair: new, resolved, persistent.
- Tick two runs (or click "vs previous") to compare them. A difference only counts as **resolved** if the later run
  actually checked that object. If it vanished because of an exclusion, a scope change, an unreadable category, a
  failed run, or because its whole table is now missing, it is shown as **no longer checked** instead.
- On a results page, expand a difference and click **Acknowledge** (optional note) to mark it reviewed. It carries
  across later runs of the same pair and never counts as parity. **Reopen** undoes it; every action is kept.

## Sign-in
Sign-in uses Supabase Auth and turns on when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
are set (Supabase → Project Settings → API). Without them, `npm run dev` runs as one local workspace with no
sign-in, and a production build refuses to serve pages (503) so stored credentials are never exposed by accident.

- Anyone can sign up, and each user gets their own private workspace.
- Data created before sign-in was turned on stays in the "local" workspace and isn't given to anyone. To keep it,
  move it to your account in SQL: `update workspaces set owner_id = '<your auth user id>' where owner_id = 'local';`
  (only if you haven't signed in yet, or delete your empty workspace first).
- Supabase → Authentication → URL Configuration: set **Site URL** to your deployed URL and add
  `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback`) to **Redirect URLs**, so
  confirmation emails land back in the app.

## Deploy (Vercel + Supabase)
1. Push the repo to GitHub, then on vercel.com → **New Project** → import it. No build settings are needed.
2. Add these environment variables in Vercel (Settings → Environment Variables):
   - `DATABASE_URL`: the Supabase **transaction pooler** string (port `6543`, Connect → Transaction pooler).
     The direct `db.xxxx.supabase.co:5432` connection runs out of connections on serverless.
   - `CREDENTIALS_KEY`: the **same** key as your local `.env` if you share the database, or saved connection
     passwords can't be decrypted.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Apply migrations to that database from your machine (with `DATABASE_URL` pointing at it): `npm run db:migrate`.
4. Deploy. Every push to `main` redeploys.

Things to know once it's hosted:
- Databases you compare must be reachable from the internet (the Docker test databases on `localhost` aren't).
  Use SSL `require` for Supabase.
- Vercel has no fixed outbound IP, so databases with an IP allowlist will refuse it. If you need one, run it on a
  VPS instead: `npm ci && npm run build && npm run db:migrate && npm start` with the same environment variables.
- A scan can take up to 300s (`maxDuration` in `src/app/comparisons/new/page.tsx`); raise it on Vercel Pro if needed.

## Layout
```
src/app/        routes (dashboard, connections, comparisons, history, settings)
src/components/ shared UI
src/db/         Driftly's own database schema (Drizzle)
src/engine/     comparison engine (standalone, no Next.js imports)
src/lib/        crypto (AES-256-GCM credential encryption), utils
dev-databases/  seeded test schemas
scripts/        CLI tools (compare.ts)
```

## Build plan
0. Setup ✅ · 1. Engine ✅ · 2. Shell + Connections ✅ · 3. New Comparison + Results ✅ · 4. Schema Explorer ✅ · 5. Dashboard ✅

MVP complete. Phase 2: drift history ✅, scheduled scans + alerts, acknowledgements, advanced objects (RLS, views, functions), ERD, SQL review.
