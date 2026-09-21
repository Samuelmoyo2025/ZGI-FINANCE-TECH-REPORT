# Zimnat Finance Treasury

A single web launcher for three finance tools, all sharing one sign-in:

- **Treasury Report** — the daily liquidity report: Banks, Claims, Trado, Commitments, Cashflow, Checks
- **Finance Dashboard** — Cash Position, Payments, Debtors, and RI Receivables
- **Finance Action Tracker** — the consolidated finance action list, with a live dashboard and a full audit trail

Everyone signs in once at the launcher and moves between all three from the home screen — no separate logins.

## Files in this package

| File | What it is |
|---|---|
| `index.html` | The launcher page — open this to run the app |
| `app.js` | The launcher's own logic (sign-in, routing between the three tools) |
| `setup.sql` | Run once in Supabase to create the tables the app saves into |
| `README.md` | This file |

The three tools themselves (Treasury Report, Finance Dashboard, Action Tracker) are bundled inside `index.html` — you don't need to host them separately.

## First-time setup

**1. Create a Supabase project** (if you don't already have one) at [supabase.com](https://supabase.com) — the free tier is enough for this.

**2. Run `setup.sql`** — open your project's SQL Editor in Supabase, paste in the contents of `setup.sql`, and run it. This creates the three tables the app needs (one each for Treasury, Finance Dashboard, and the Action Tracker) and sets up access so any signed-in user can read and write them.

**3. Create accounts for your team** — in Supabase, go to Authentication → Users → Add User, and create an email + password for each person who needs access. This is also how you control who can get in — only people with an account here can sign in.

**4. Get your project's connection details** — in Supabase, go to Settings → API. You'll need:
   - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
   - **Publishable / anon key** (the public one, safe to put in client-side code — not the service role key)

## Deploying

This is a static site — `index.html` and `app.js` are all you need. Any of these work:

- **GitHub Pages** — push both files to a repo, enable Pages in the repo settings, done
- **Vercel / Netlify** — drag the folder into their dashboard, or connect the repo
- **Just open it locally** — double-clicking `index.html` works too, though a few browsers restrict `app.js` loading from a plain `file://` URL; serving it (even a simple local web server) avoids that

Whichever route you pick, keep `index.html` and `app.js` in the same folder — the page loads the script from a relative path.

## First time opening it

1. Open the page
2. Enter your Supabase **Project URL** and **Publishable key** (from step 4 above) — this only needs doing once per browser, it's remembered after that
3. Sign in with the email and password you set up in step 3
4. You'll land on the home screen with all three tools — click into whichever you need

## Notes

- All three tools save to the cloud automatically as you work — there's nothing to manually export or email around.
- Every save is stamped with who made it and when. Treasury and Finance Dashboard keep a full day-by-day history; the Action Tracker's history works the same way — every save is a new version, so nothing is ever silently overwritten.
- To add or remove someone's access, add or remove their account in Supabase (Authentication → Users) — nothing to change in the app itself.
