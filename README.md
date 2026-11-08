# Abundant Trader AI

A governed trading operating system for stocks, options and futures — trade
discovery, risk/reward planning, options logic, futures account governance,
journaling, performance tracking and trade discipline.

Single-file web app. No build step, no bundler, no dependencies to install.

**This repository is public. Never commit a backup file.** See below.

---

## What's in this repo

| Path | What it is |
|---|---|
| `index.html` | The whole app. |
| `.gitignore` | Blocks backups and anything secret-shaped from being committed. |

That's deliberately all. Trade data does not live here.

## Where your data lives

Two places, and it's worth knowing which is which.

**Supabase (Postgres)** — the durable copy. Your trades, watchlist, class
sessions and settings sit in a `app_state` row keyed to your login. This is
what survives a lost laptop or a cleared browser.

**Browser localStorage** — a working cache under the key `at_v2`. The app
reads it instantly on load and writes to it on every change, so it keeps
working if the network drops. The cloud copy follows a couple of seconds
behind.

Signing in on a new device pulls your data down. No file to carry across.

### Security model

The Supabase **publishable key** is embedded in `index.html` and is meant to
be — it is not a secret. Protection comes from **Row Level Security** in
Postgres: a policy allows a user to read and write only the row whose
`user_id` matches their session. Without a valid login, that key returns
nothing at all. The `anon` role is granted no access to the table.

Two things that are genuinely secret and must never land in this repo:

- The Supabase **service_role / secret** key — it bypasses RLS entirely
- Any **backup JSON** — it contains your Alpha Vantage API key in plain text

### When the cloud and the device disagree

The app never silently overwrites a trade log. If the two copies differ on
sign-in, you get a prompt showing both trade counts and when the cloud copy
was saved, and you choose which wins.

## Backups

Still worth taking. The Supabase free tier has no automatic backups, and
free projects pause after 7 days of inactivity.

Settings → **💾 Backup & Restore** → **⬇ Backup All — Download JSON**

If the download doesn't appear, use **📋 Show backup text**, copy, and save
it by hand.

A backup holds every trade across all modules, ORE discoveries, Class Trade
Analysis decisions, imported broker transaction history, withdrawals and all
settings.

**Keep backups outside this repo** — your machine, a private cloud folder, or
a password manager's secure notes. `.gitignore` blocks them, but the habit
matters more than the file.

## Updating the app

Settings → **📦 Export App Source** → **⬇ Download index.html**
(or **Show source text** and paste into a plain-text editor)

Replace `index.html` here and commit. GitHub Pages redeploys within a minute,
and the commit history gives you something to roll back to.

## Hosting

GitHub Pages: repo Settings → Pages → Deploy from a branch → `main` /
`(root)`.

Supabase needs to know this URL. In the Supabase dashboard under
Authentication → URL Configuration, set **Site URL** to the Pages address and
add it to **Redirect URLs** as `https://…/**`.

Note: the app cannot reach Supabase from inside a sandboxed iframe (a `null`
origin fails CORS preflight on requests carrying auth headers). It needs a
normal hosted URL.

## Known limitations

- **Free-tier pause.** Supabase pauses a project after 7 days of inactivity.
  Data is kept; you restore it from the dashboard in one click.
- **Whole-state writes.** The app saves its entire state as one JSON row
  rather than normalised tables. Fine at this size; worth splitting later.
- **Imported broker transactions are grouped.** SPY/XSP E-Trade fills import
  as one trade per session, with individual contracts kept as expandable
  legs. Where buys and sells don't balance, the position crossed days and is
  flagged rather than having a P/L guessed for it.
- **Mixed trade units.** A combined win rate averages individual futures
  trades with whole-day options sessions. Filter by module for an honest
  read.
- **CSV import handles futures orders only** (APEX format).
- **Alpha Vantage key is client-side**, stored in browser settings. Moving it
  into a Supabase Edge Function would fix that properly.

## Governance

The Master System Governor overrides every engine and module:

1. Preserve capital
2. Control risk
3. Evaluate trade quality
4. Enforce discipline
5. Track outcomes
6. Improve performance over time

Risk is defined before entry, always. No recovery-from-loss systems. No
revenge-trading validation. No trade is better than a bad trade.
