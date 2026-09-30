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
| `supabase/functions/treasury-notify/index.ts` | Sends the Treasury review emails (deployed to Supabase — see below) |
| `README.md` | This file |

The three tools themselves (Treasury Report, Finance Dashboard, Action Tracker) are bundled inside `index.html` — you don't need to host them separately.

## First-time setup

**1. Create a Supabase project** (if you don't already have one) at [supabase.com](https://supabase.com) — the free tier is enough for this.

**2. Run `setup.sql`** — open your project's SQL Editor in Supabase, paste in the contents of `setup.sql`, and run it. This creates the three tables the app needs (one each for Treasury, Finance Dashboard, and the Action Tracker) and sets up access so any signed-in user can read and write them.

**3. Create accounts for your team** — in Supabase, go to Authentication → Users → Add User, and create an email + password for each person who needs access. This is also how you control who can get in — only people with an account here can sign in.

**4. Get your project's connection details** — in Supabase, go to Settings → API. You'll need:
   - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
   - **Publishable / anon key** (the public one, safe to put in client-side code — not the service role key)

## Treasury review emails (one-time setup)

The Treasury Report's Dashboard has a **Review & notify** panel:

1. **Send for review** — the preparer picks one of the reviewers (up to 3, set under *Manage reviewers*). That reviewer is emailed automatically.
2. **Reviewed — notify team** — only the reviewer it was sent to can click this. Everyone else with an account is emailed, including the other two reviewers (on a day they didn't review, they're just viewers).

Browsers can't send email on their own, so a small Supabase Edge Function does the sending through [Resend](https://resend.com) (free for up to 3,000 emails a month). To switch it on:

**a. Tables** — run `setup.sql` again (safe to re-run; it only adds what's missing). This adds `treasury_reviewers` and `treasury_review_events`.

**b. Resend account** — sign up at resend.com, then:
   - *Domains → Add domain* — add `zimnat.co.zw` (or a subdomain such as `mail.zimnat.co.zw`) and ask IT to add the DNS records Resend shows. **Until the domain is verified, Resend only delivers to the email address you signed up with**, so the team won't receive anything yet — fine for a first test.
   - *API Keys → Create API key* — copy it.

**c. Deploy the function** — in Supabase: *Edge Functions → Deploy a new function → Via Editor*, name it exactly `treasury-notify`, paste in the contents of `supabase/functions/treasury-notify/index.ts`, and deploy. (Or with the Supabase CLI: `supabase functions deploy treasury-notify`.)

**d. Secrets** — in Supabase: *Edge Functions → Secrets*, add:
   - `RESEND_API_KEY` — the key from step b
   - `NOTIFY_FROM` — the sender, e.g. `Zimnat Treasury <treasury@zimnat.co.zw>` (must be on the verified domain; for testing before verification use `Zimnat Treasury <onboarding@resend.dev>`)

**e. Add reviewers** — open the Treasury Report → Dashboard → *Review & notify* → *Manage reviewers*, and add the 3 reviewers' names and emails. Their emails should match the ones they sign in with.

Who gets the team email: every account under Authentication → Users (except the reviewer who clicked), so adding or removing someone's login also adds or removes them from these emails. Every email sent is logged in `treasury_review_events` with who sent it, when, and to whom.

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
