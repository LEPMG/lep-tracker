# LEP Tracker — Deployment Guide

This gets your app online with a real login link, using two free services:

- **Supabase** — hosts your database (where all your data lives, forever).
- **Vercel** — hosts the app itself (the website your team logs into).

Both have free tiers that comfortably cover a small team. Total setup time is
about 20–30 minutes, and you don't need to be a programmer. Follow the steps in
order. If you get stuck on any step, send me the step number and what you see.

---

## Part 1 — Create the database (Supabase)

1. Go to **https://supabase.com** and click **Start your project** → sign in
   with Google or email.
2. Click **New project**. Give it a name like `lep-tracker`, and set a
   **database password** (save this somewhere — you'll need it once). Pick the
   region closest to you. Click **Create new project** and wait ~2 minutes.
3. In the left sidebar, click the **SQL Editor** (the icon that looks like a
   terminal). Click **+ New query**.
4. Open the file **`db/schema.sql`** from this project, copy **everything** in
   it, paste it into the SQL editor, and click **Run** (bottom right). You
   should see "Success. No rows returned." That built all your tables.
5. Now get your connection string: click the **gear icon (Project Settings)** →
   **Database** → scroll to **Connection string** → choose the **URI** tab.
   Copy that string. It looks like:
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-...pooler.supabase.com:5432/postgres`
   Replace `[YOUR-PASSWORD]` with the database password from step 2. Keep this
   handy — this is your **DATABASE_URL**.

---

## Part 2 — Put the app on the internet (Vercel)

The easiest path is through GitHub, so Vercel can host the code.

1. Create a free account at **https://github.com** if you don't have one.
2. Create a new **private** repository (call it `lep-tracker`). On the next
   screen GitHub shows an "upload an existing file" link — use it to drag in
   **all the files from this project** (everything except the `node_modules`
   and `.next` folders, which aren't included in the zip anyway). Commit.
3. Go to **https://vercel.com** → **Sign up** with your GitHub account.
4. Click **Add New… → Project**, find your `lep-tracker` repo, click **Import**.
5. Before clicking Deploy, expand **Environment Variables** and add these two:

   | Name             | Value                                                        |
   | ---------------- | ------------------------------------------------------------ |
   | `DATABASE_URL`   | the connection string from Part 1, step 5                    |
   | `SESSION_SECRET` | any long random string (see below)                           |

   For `SESSION_SECRET`, just mash the keyboard for ~40+ characters, or use a
   password generator. It only needs to be long and random; you never type it
   again.

6. Click **Deploy**. Wait ~2 minutes. Vercel gives you a link like
   `https://lep-tracker-xxxx.vercel.app` — **that's your app.**

---

## Part 3 — Create your login (no terminal needed)

Just open your app's link with **`/setup`** on the end, e.g.
`https://lep-tracker-xxxx.vercel.app/setup`.

Enter your name, email, and a password — that's your admin account. You're logged
straight in. This page only works once: the moment an admin exists it disables
itself, so it's safe to leave deployed.

From there, add your teammates under **Users**, and your wells/batteries/tanks
under **Wells & Batteries**.

> Optional — sample data to explore first: if you'd like the app pre-filled with
> example wells, downtime, work orders, and production so you can see it working,
> run this once on any computer with [Node.js](https://nodejs.org):
> ```
> npm install
> DATABASE_URL="<your connection string>" npm run db:seed
> ```
> (Admin becomes `admin@lep.local` / `changeme123` — change it from Users.) You
> can also just paste me the connection string and I'll load it for you.

---

## Part 4 — Add your team

Log in as the admin, go to **Users** (bottom of the left menu), and add each
person with the right role:

- **Field / Pumper** — reports down wells, logs tank gauges, updates action items.
- **Office / Admin** — full control, including managing users.
- **Management (read-write)** — everything except user management.
- **Management (view-only)** — dashboards and reports only, no editing.

Give each person the app link and their email/temp password. They change nothing
else — they just open the link and log in.

---

## Loading your real wells & production history

Two ways:

1. **In the app** — add batteries, then their tanks (with the bbls/inch factor),
   then wells, from the **Wells & Batteries** screen. Pumpers then start logging
   gauges under **Production**.
2. **Bulk import** — if you send me your spreadsheet of wells, batteries, tanks
   (with tank sizes + bbls/inch), and any production history, I'll write a
   one-time import so it all loads at once instead of by hand.

---

## Keeping it running

- **Data is safe.** Everything lives in your Supabase database. Redeploying the
  app never touches your data. Supabase keeps automatic backups.
- **Updating the app.** If you change the code in GitHub, Vercel redeploys
  automatically.
- **Costs.** Free tiers cover a small team. If you outgrow them, Supabase and
  Vercel each have low-cost paid plans (~$25/mo each) — you'd only hit these
  with heavy use.

---

## Quick reference — the two secrets

| Setting          | Where it comes from                    | Used by |
| ---------------- | -------------------------------------- | ------- |
| `DATABASE_URL`   | Supabase → Project Settings → Database | Vercel  |
| `SESSION_SECRET` | any long random string you invent      | Vercel  |
