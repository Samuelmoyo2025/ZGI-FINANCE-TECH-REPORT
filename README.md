# Zimnat Finance Treasury

A single web launcher for four finance tools, all sharing one sign-in:

- **Treasury Report** — the daily liquidity report: Banks, Claims, Trado, Commitments, Cashflow, Checks
- **Finance Dashboard** — Cash Position, Payments, Debtors, and RI Receivables
- **Finance Action Tracker** — the consolidated finance action list, with a live dashboard and a full audit trail
- **Compliance Tracker** — IPEC, ZIMRA, NSSA, ZIMDEF, NEC, FIU and licence deadlines: each obligation has a deadline rule, so the tracker works out every due date, flags what's overdue or coming up, and records when each was done, by whom, with a reference

Everyone signs in once at the launcher and moves between all four from the home screen — no separate logins.

## Files in this package

| File | What it is |
|---|---|
| `index.html` | The launcher page — open this to run the app |
| `app.js` | The launcher's own logic (sign-in, routing between the three tools) |
| `setup.sql` | Run once in Supabase to create the tables the app saves into |
| `supabase/functions/treasury-notify/index.ts` | Sends the Treasury review emails (deployed to Supabase — see below) |
| `README.md` | This file |

The four tools themselves (Treasury Report, Finance Dashboard, Action Tracker, Compliance Tracker) are bundled inside `index.html` — you don't need to host them separately.

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

Browsers can't send email on their own, so a small Supabase Edge Function does the sending. It can send through **Gmail** (simplest — no IT or DNS changes) or through **Resend** with a verified Zimnat domain. If the Gmail secrets are set, Gmail is used.

**a. Tables** — run `setup.sql` again (safe to re-run; it only adds what's missing). This adds `treasury_reviewers` and `treasury_review_events`.

**b. Deploy the function** — in Supabase: *Edge Functions → Deploy a new function → Via Editor*, name it exactly `treasury-notify`, paste in the contents of `supabase/functions/treasury-notify/index.ts`, and deploy. To update it later, open the function, go to *Code*, paste the new version and deploy again.

**c. Email route — Gmail (recommended to start):**
   - Use a dedicated Gmail account for the notifications (e.g. a new one just for Treasury), not someone's personal inbox.
   - In that Google account: *Security → 2-Step Verification* must be on, then search "App passwords" in the account settings, create one called "Treasury", and copy the 16-character password.
   - In Supabase *Edge Functions → Secrets*, add `GMAIL_USER` (the Gmail address) and `GMAIL_APP_PASSWORD` (the app password). Optional: `NOTIFY_FROM_NAME` (defaults to "Zimnat Treasury").
   - Gmail allows around 500 emails a day, far more than this needs.
   - Email style (optional secret `EMAIL_STYLE`): `plain` (default: short plain-text email with the report link, no figures), `minimal` (plain text with no link, for very strict company filters) or `rich` (designed email with the figures table and a button). Company filters are far more likely to let plain emails through.

**c (alternative). Email route — Resend with a Zimnat address:** needs IT to add three DNS records for `mail.zimnat.co.zw` in Resend (*Domains → Add domain*). Once verified, set `RESEND_API_KEY` and `NOTIFY_FROM` (e.g. `Zimnat Treasury <treasury@mail.zimnat.co.zw>`) and delete the Gmail secrets.

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

## Compliance Tracker — first use

1. Run `setup.sql` again (safe to re-run) — it adds the `compliance_tracker_snapshots` table.
2. Open **Compliance Tracker** from the launcher. It starts with the obligations from the original spreadsheet, cleaned up, and tracks deadlines from the 1st of the current month — earlier deadlines are shown greyed out rather than overdue. Change this under *Obligations & setup → Tracking start date* if you want to back-fill earlier months.
3. Click any cell (or **Update** on the dashboard) to record a submission or payment, with the date and a reference. **Download Excel** exports the year for auditors or IPEC.

## Compliance reminders (pop-ups)

- When anyone signs in, the Finance Treasury home screen pops up a summary of compliance items that are **overdue**, **due soon**, or have a **"Remind me on" date** that has arrived — and the Compliance Tracker card shows a badge with the counts. The same pop-up appears inside the Compliance Tracker (the 🔔 Reminders button opens it any time).
- It pops up automatically once a day per person, so it isn't repeated on every page load. "Remind me tomorrow" hides it until the next day.
- **When reminders start:** *Obligations & setup → Pop-up reminders → Start reminding N days before each deadline* (one setting for the whole team; default 7).
- **A specific date:** click any cell and fill in **Remind me on** — it pops up from that date until the item is done.
- **Only my items:** in the same panel, *Remind me about* lets each person choose e.g. only Suica's or Knowledge's items (saved in their own browser).
- **Desktop alerts:** click *Turn on desktop alerts* on the pop-up and allow notifications — the browser then shows a Windows notification once a day while Finance Treasury is open in a tab.
- Pop-ups only appear while Finance Treasury is open in a browser. For reminders when nobody has it open, the review-email function could be extended to send a daily email digest.
