// Zimnat Treasury — review & team notification emails.
//
// Called from the Treasury Report with one of two actions:
//   "submit"  — the preparer sends the day's report to ONE chosen reviewer.
//   "approve" — that reviewer confirms it's reviewed; everyone else on the
//               team (every Supabase user with an email, including the
//               other reviewers who didn't review that day) gets an email.
//
// Emails are sent through Resend (https://resend.com). Required secrets
// (Supabase dashboard > Edge Functions > Secrets):
//   RESEND_API_KEY  — API key from Resend
//   NOTIFY_FROM     — sender, e.g. "Zimnat Treasury <treasury@zimnat.co.zw>"
//                     (the domain must be verified in Resend)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function money(v: unknown): string {
  const n = Number(v);
  if (!isFinite(n)) return "—";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? "(" + s + ")" : s;
}

function prettyDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

type Summary = {
  fundingGapZwg?: number; fundingGapUsd?: number;
  fundsAvailZwg?: number; fundsAvailUsd?: number;
  availCashZwg?: number; availCashUsd?: number;
  allocatedTodayZwg?: number; allocatedTodayUsd?: number;
  totalResources?: number; fx?: number;
};

function summaryTable(s: Summary): string {
  const row = (label: string, zwg: unknown, usd: unknown) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #E6E6E0;">${esc(label)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #E6E6E0;text-align:right;font-family:Consolas,monospace;">${esc(zwg)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #E6E6E0;text-align:right;font-family:Consolas,monospace;">${esc(usd)}</td></tr>`;
  const status = (v: unknown) => (Number(v) >= 0 ? " surplus" : " gap");
  return `<table style="border-collapse:collapse;font-size:13px;min-width:420px;">
    <tr style="background:#006B35;color:#fff;"><th style="padding:6px 10px;text-align:left;"></th><th style="padding:6px 10px;text-align:right;">ZWG</th><th style="padding:6px 10px;text-align:right;">USD</th></tr>
    ${row("Funding position", money(s.fundingGapZwg) + status(s.fundingGapZwg), money(s.fundingGapUsd) + status(s.fundingGapUsd))}
    ${row("Funds available", money(s.fundsAvailZwg), money(s.fundsAvailUsd))}
    ${row("Available cash (after allocations)", money(s.availCashZwg), money(s.availCashUsd))}
    ${row("Allocated today", money(s.allocatedTodayZwg), money(s.allocatedTodayUsd))}
  </table>
  <p style="font-size:12px;color:#666;margin-top:8px;">Total resources (USD): ${esc(money(s.totalResources))} · FX (ZWG/USD): ${esc(s.fx ?? "—")}</p>`;
}

function emailHtml(opts: { heading: string; intro: string; summary: Summary; note?: string; appUrl?: string; footer: string }) {
  const link = opts.appUrl && /^https?:\/\//.test(opts.appUrl)
    ? `<p style="margin:18px 0;"><a href="${esc(opts.appUrl)}" style="background:#00A950;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Open the Treasury Report</a></p>`
    : "";
  const note = opts.note && opts.note.trim()
    ? `<div style="border-left:3px solid #00A950;padding:6px 12px;margin:14px 0;background:#F3FAF6;font-size:13px;white-space:pre-wrap;">${esc(opts.note.trim())}</div>`
    : "";
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1F2A24;max-width:640px;">
    <div style="border-bottom:3px solid #00A950;padding-bottom:8px;margin-bottom:14px;">
      <div style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#006B35;font-weight:700;">Zimnat General Insurance · Treasury</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">${esc(opts.heading)}</div>
    </div>
    <p style="font-size:14px;">${opts.intro}</p>
    ${note}
    ${summaryTable(opts.summary || {})}
    ${link}
    <p style="font-size:11.5px;color:#888;margin-top:22px;">${esc(opts.footer)}</p>
  </div>`;
}

async function sendEmails(messages: { to: string; subject: string; html: string }[]) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM");
  if (!key || !from) throw new Error("Email isn't configured yet — set RESEND_API_KEY and NOTIFY_FROM in the function's secrets.");
  // One individual email per person (nobody sees the full list), sent in
  // batches of up to 100, the Resend batch limit.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html }));
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Email provider rejected the send (${res.status}): ${text.slice(0, 300)}`);
    }
  }
}

// deno-lint-ignore no-explicit-any
async function listAllUsers(admin: SupabaseClient<any, any, any>) {
  const users: { email: string; name: string }[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      // Skip accounts that are banned or have never confirmed their email.
      const banned = (u as { banned_until?: string }).banned_until && new Date((u as { banned_until: string }).banned_until) > new Date();
      if (u.email && !banned) users.push({ email: u.email, name: (u.user_metadata?.full_name as string) || u.email });
    }
    if (data.users.length < 1000) break;
  }
  return users;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // Who is calling — taken from their sign-in token, never from the request body.
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (!user?.email) return json({ error: "You need to be signed in." }, 401);
    const actorEmail = user.email.toLowerCase();
    const actorName = (user.user_metadata?.full_name as string) || user.email;

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const dayDate = String(body.day_date || "");
    const note = typeof body.note === "string" ? body.note.slice(0, 2000) : "";
    const summary: Summary = body.summary && typeof body.summary === "object" ? body.summary : {};
    const appUrl = typeof body.app_url === "string" ? body.app_url : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) return json({ error: "Invalid report date." }, 400);

    const { data: reviewers, error: revErr } = await admin.from("treasury_reviewers").select("email, name");
    if (revErr) throw revErr;
    const reviewerList = (reviewers || []) as { email: string; name: string | null }[];

    if (action === "submit") {
      const wanted = String(body.reviewer_email || "").toLowerCase();
      const reviewer = reviewerList.find((r) => r.email.toLowerCase() === wanted);
      if (!reviewer) return json({ error: "That person isn't on the reviewers list." }, 400);
      if (reviewer.email.toLowerCase() === actorEmail) return json({ error: "You can't send your own report to yourself for review." }, 400);

      const reviewerName = reviewer.name || reviewer.email;
      await sendEmails([{
        to: reviewer.email,
        subject: `Treasury report ${dayDate} — ready for your review`,
        html: emailHtml({
          heading: `Treasury report for ${prettyDate(dayDate)} is ready for review`,
          intro: `Hi ${esc(reviewerName)}, <strong>${esc(actorName)}</strong> has finished the Treasury Report for ${esc(prettyDate(dayDate))} and sent it to you for review. Once you've checked it, open the report and click <strong>Reviewed — notify team</strong> on the Dashboard to let the rest of the team know.`,
          summary, note, appUrl,
          footer: "Sent automatically by the Zimnat Treasury Report.",
        }),
      }]);

      const { error: insErr } = await admin.from("treasury_review_events").insert({
        day_date: dayDate, event: "submitted",
        reviewer_email: reviewer.email, reviewer_name: reviewerName,
        actor_email: user.email, actor_name: actorName,
        recipients: [reviewer.email], note: note || null,
      });
      if (insErr) throw insErr;
      return json({ ok: true, recipients: 1, reviewer: reviewerName });
    }

    if (action === "approve") {
      const { data: subs, error: subErr } = await admin.from("treasury_review_events")
        .select("reviewer_email, reviewer_name, actor_email, actor_name, created_at")
        .eq("day_date", dayDate).eq("event", "submitted")
        .order("created_at", { ascending: false }).limit(1);
      if (subErr) throw subErr;
      const sub = subs && subs[0];
      if (!sub) return json({ error: "This day hasn't been sent for review yet." }, 400);
      if (String(sub.reviewer_email).toLowerCase() !== actorEmail) {
        return json({ error: `Only ${sub.reviewer_name || sub.reviewer_email}, the reviewer this report was sent to, can confirm the review.` }, 403);
      }

      // Everyone except the reviewer themselves — this includes the preparer
      // and the other reviewers, who act as viewers on a day they didn't review.
      const everyone = await listAllUsers(admin);
      const seen = new Set<string>();
      const recipients = everyone.filter((u) => {
        const e = u.email.toLowerCase();
        if (e === actorEmail || seen.has(e)) return false;
        seen.add(e);
        return true;
      });
      if (recipients.length === 0) return json({ error: "No other team members found to notify." }, 400);

      const subject = `Treasury report ${dayDate} — reviewed and ready`;
      await sendEmails(recipients.map((r) => ({
        to: r.email,
        subject,
        html: emailHtml({
          heading: `Treasury report for ${prettyDate(dayDate)} — reviewed`,
          intro: `Hi ${esc(r.name)}, the Treasury Report for ${esc(prettyDate(dayDate))} has been prepared by <strong>${esc(sub.actor_name || sub.actor_email)}</strong> and reviewed by <strong>${esc(actorName)}</strong>. It's now ready for viewing.`,
          summary, note, appUrl,
          footer: "Sent automatically by the Zimnat Treasury Report because you have an account on it.",
        }),
      })));

      const { error: insErr } = await admin.from("treasury_review_events").insert({
        day_date: dayDate, event: "approved",
        reviewer_email: user.email, reviewer_name: actorName,
        actor_email: user.email, actor_name: actorName,
        recipients: recipients.map((r) => r.email), note: note || null,
      });
      if (insErr) throw insErr;
      return json({ ok: true, recipients: recipients.length });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
