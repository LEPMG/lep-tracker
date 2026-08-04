# LEP Tracker

A web app for oil & gas field operations: track **down wells & downtime**,
**work orders & action items**, **production via tank gauges** (auto-converted to
BOPD/BWPD), and **vendors & costs** — with logins, roles, and permanent history.

Built with Next.js (App Router) + PostgreSQL. Designed to deploy on Vercel with a
Supabase database. See **[DEPLOY.md](./DEPLOY.md)** for step-by-step hosting.

## What's inside

| Module | What it does |
| --- | --- |
| **Dashboard** | Wells down now, est. BOPD lost, open work orders, cost YTD, at a glance. |
| **Down Wells** | Report a down well with owner + reason; a live clock runs until resolved. Resolved events keep full history. |
| **Work Orders** | Create/assign action items with priority, due dates, status, vendor, and per-WO cost rollups. |
| **Production** | Pumpers enter **tank gauges** (feet + inches). The app converts to barrels via each tank's bbls/inch factor and computes **BOPD/BWPD**, reconciling against oil sales (run tickets). |
| **Vendors & Costs** | Vendor list, cost entries by category, spend-by-category and spend-by-vendor rollups. |
| **Wells & Batteries** | Master list of every location and tank. **Bulk CSV import** for batteries/tanks/wells, and **filter by State (TX/NM/…) and Field**. |
| **Users** | Admin-managed logins with four roles. |

First-run: visit `/setup` on your deployed app to create the first admin (no
terminal needed). Bulk-load your assets from **Wells & Batteries → Bulk Import**
using the CSV templates in `public/templates/`.

## Roles

- **FIELD** (pumper) — report down wells, log gauges, update action items.
- **ADMIN** (office) — full control incl. user management.
- **MGMT_RW** — everything except user management.
- **MGMT_RO** — view-only dashboards and reports.

## The tank-gauge math

Production is reconstructed the way a pumper does it by hand:

```
Oil produced   = (oil bbls now − oil bbls last gauge) + oil sold since
Water produced = (water bbls now − water bbls last gauge) + water hauled since
BOPD = oil produced ÷ days between gaugings
BWPD = water produced ÷ days between gaugings
```

Barrels for a tank = `total inches of gauge × tank's bbls-per-inch`. The engine
lives in `src/lib/gauge.ts` and is covered by tests in
`scripts/test-gauge.ts` (`npx tsx scripts/test-gauge.ts`).

## Local development

```
npm install
# point DATABASE_URL at any Postgres, then:
npm run db:setup        # create tables (or paste db/schema.sql)
npm run db:seed         # optional demo data + 4 logins
npm run dev             # http://localhost:3000
```

Environment variables (see `.env.example`): `DATABASE_URL`, `SESSION_SECRET`.

## Project layout

```
db/schema.sql              # the whole database (paste into Supabase)
src/lib/gauge.ts           # tank-gauge → BOPD/BWPD engine
src/lib/auth.ts            # login sessions + password hashing
src/lib/permissions.ts     # role rules
src/app/(app)/             # the app screens (dashboard + 6 modules)
scripts/seed.ts            # demo data
scripts/create-admin.ts    # create a production admin (no demo data)
```
