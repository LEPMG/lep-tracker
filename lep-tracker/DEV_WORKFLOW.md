# LEP Tracker — scripting workflow (VS Code + Claude Code)

This is how to run the whole thing from your Mac with scripts instead of Excel
uploads: edit the app, load data, and change the database, all from VS Code with
Claude Code doing the work in the terminal.

## The mental model

```
   Your Mac (VS Code)
   ├─ app code ──git push──►  GitHub  ──auto──►  Vercel   (the live website)
   └─ python scripts ─────────────────────────►  Supabase (the database)
```

- **Code changes** go to GitHub; Vercel redeploys automatically (~2 min).
- **Data + schema** go straight to Supabase via Python/SQL scripts.
- **Claude Code** runs in VS Code's terminal and does all of the above for you.

Your data lives in Supabase and is never touched by a code deploy. Vercel keeps
an **Instant Rollback** button if a deploy ever misbehaves.

---

## One-time setup (about 30 minutes)

### 1. Install the tools
On a Mac, the easiest way is Homebrew. Open **Terminal** and run:

```bash
# Homebrew (skip if you already have it)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# the tools
brew install node git python
brew install --cask visual-studio-code
```

Then install **Claude Code**:

```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Get the project onto your Mac
```bash
cd ~/Documents
git clone https://github.com/LEPMG/lep-tracker.git
cd lep-tracker/lep-tracker      # the app lives in this subfolder
npm install
pip3 install -r scripts/py/requirements.txt
```

### 3. Add your secrets
Create a file named `.env` in that folder with:

```
DATABASE_URL="<your Supabase POOLER connection string>"
SESSION_SECRET="<any long random string>"
```

Get `DATABASE_URL` from Supabase → Connect → **Transaction pooler**. **Never
commit `.env`** — it's already in `.gitignore`.

### 4. Start Claude Code
Open the folder in VS Code (`code .`), open the built-in Terminal
(View → Terminal), and run:

```bash
claude
```

Now just tell it what you want in plain English. It can edit code, run the
scripts below, commit, and push.

---

## Everyday tasks

### Load / update wells from a spreadsheet
Point it at an Excel or CSV — it reads `.xlsx` directly, keeps API numbers as
text, and updates existing wells instead of duplicating:

```bash
python3 scripts/py/load_wells.py ~/Downloads/glass_txl_wells.xlsx
```

Accepted columns: `well, api_number, battery, field, county, state, status,
test_oil_bopd, test_water_bwpd, test_gas_mcfd, test_date`. Batteries are created
automatically from the `battery` column.

### Apply a database change (migration)
```bash
python3 scripts/py/run_sql.py db/migrations/001_well_tests.sql
```

### Preview the app locally before publishing
```bash
npm run dev        # opens http://localhost:3000
```

### Publish app changes
```bash
git add -A
git commit -m "what changed"
git push
```
Vercel picks it up and redeploys on its own.

---

## Tips

- Ask Claude Code to do any of the above for you — e.g. "load the wells in this
  spreadsheet," "add a monthly oil-sales report by field," "run the well-test
  migration." It runs the commands and shows you the result.
- Keep source spreadsheets anywhere on your Mac; scripts read them in place.
- The first `git push` from a new Mac may ask you to sign in to GitHub — follow
  the prompt (a browser login) once and it's remembered.
