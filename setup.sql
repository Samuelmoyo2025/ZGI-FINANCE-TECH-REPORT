-- Zimnat Finance Treasury — Supabase setup
-- Run this once in your Supabase project's SQL Editor before first use.
-- Covers all three apps in the launcher: Treasury Report, Finance Dashboard,
-- and the Finance Action Tracker. All three share the same Supabase project
-- and the same sign-in — this script just creates the tables each one saves
-- its data into.

-- ============================================================
-- Treasury Report — one row per saved day, versioned (every
-- save inserts a new row; the app always loads the latest one
-- for a given day_date, giving you a full history for free).
-- ============================================================
create table if not exists treasury_snapshots (
  id bigint generated always as identity primary key,
  day_date date not null,
  data jsonb not null,
  saved_by_name text,
  saved_by_email text,
  saved_at timestamptz not null default now()
);
create index if not exists treasury_snapshots_day_date_idx on treasury_snapshots (day_date, saved_at desc);
alter table treasury_snapshots enable row level security;
create policy "authenticated read" on treasury_snapshots
  for select to authenticated using (true);
create policy "authenticated insert" on treasury_snapshots
  for insert to authenticated with check (true);

-- ============================================================
-- Finance Dashboard — Cash Position, Payments, Debtors, and RI
-- Receivables each save into this same table, distinguished by
-- the "dataset" column. Same versioned-by-day pattern as above.
-- ============================================================
create table if not exists finance_snapshots (
  id bigint generated always as identity primary key,
  dataset text not null,
  day_date date not null,
  data jsonb not null,
  saved_by_name text,
  saved_by_email text,
  saved_at timestamptz not null default now()
);
create index if not exists finance_snapshots_lookup_idx on finance_snapshots (dataset, day_date, saved_at desc);
alter table finance_snapshots enable row level security;
create policy "authenticated read" on finance_snapshots
  for select to authenticated using (true);
create policy "authenticated insert" on finance_snapshots
  for insert to authenticated with check (true);

-- ============================================================
-- Finance Action Tracker — not day-based like the two above
-- (it's an ongoing list, not a daily report). Every save inserts
-- a fresh full version; the app always loads the most recent
-- one. This also doubles as the tracker's own audit trail —
-- every row here is a complete snapshot of who saved what, when.
-- ============================================================
create table if not exists action_tracker_snapshots (
  id bigint generated always as identity primary key,
  data jsonb not null,
  saved_by_name text,
  saved_by_email text,
  saved_at timestamptz not null default now()
);
create index if not exists action_tracker_snapshots_saved_at_idx on action_tracker_snapshots (saved_at desc);
alter table action_tracker_snapshots enable row level security;
create policy "authenticated read" on action_tracker_snapshots
  for select to authenticated using (true);
create policy "authenticated insert" on action_tracker_snapshots
  for insert to authenticated with check (true);

-- ============================================================
-- Statement timeout — needed for large uploads
-- ============================================================
-- Supabase's default statement_timeout is short (a few seconds) and can
-- cut off the save when Debtors (or any dataset) is a large combined
-- file — tens of thousands of rows produces a save that legitimately
-- takes longer than the default allows, and Postgres cancels it partway
-- through with a "canceling statement due to statement timeout" error.
-- This raises the limit for signed-in users specifically, project-wide.
alter role authenticated set statement_timeout = '60s';

-- ============================================================
-- User accounts
-- ============================================================
-- Create sign-in accounts for your team under Authentication > Users
-- in the Supabase dashboard (email + password). No separate setup is
-- needed beyond that — anyone who can sign in can read and write all
-- three tables above, since access is controlled at the login level,
-- not per-user permissions within the app.

-- ============================================================
-- Treasury review & notification workflow
-- ============================================================
-- Safe to run on an existing project (it only adds what's missing).
--
-- treasury_reviewers: the people a preparer can send the day's report to
-- for review (managed from the Treasury Dashboard, "Manage reviewers").
create table if not exists treasury_reviewers (
  email text primary key,
  name text,
  added_by_email text,
  added_at timestamptz not null default now()
);
alter table treasury_reviewers enable row level security;
drop policy if exists "authenticated read" on treasury_reviewers;
create policy "authenticated read" on treasury_reviewers
  for select to authenticated using (true);
drop policy if exists "authenticated insert" on treasury_reviewers;
create policy "authenticated insert" on treasury_reviewers
  for insert to authenticated with check (true);
drop policy if exists "authenticated delete" on treasury_reviewers;
create policy "authenticated delete" on treasury_reviewers
  for delete to authenticated using (true);

-- treasury_review_events: one row per email actually sent ("submitted" to
-- a reviewer, or "approved" = reviewer notified the team). Only the
-- treasury-notify Edge Function writes here, so every row is a real send;
-- signed-in users can read it to see each day's review status.
create table if not exists treasury_review_events (
  id bigint generated always as identity primary key,
  day_date date not null,
  event text not null check (event in ('submitted','approved')),
  reviewer_email text,
  reviewer_name text,
  actor_email text,
  actor_name text,
  recipients text[],
  note text,
  created_at timestamptz not null default now()
);
create index if not exists treasury_review_events_day_idx on treasury_review_events (day_date, created_at desc);
alter table treasury_review_events enable row level security;
drop policy if exists "authenticated read" on treasury_review_events;
create policy "authenticated read" on treasury_review_events
  for select to authenticated using (true);
