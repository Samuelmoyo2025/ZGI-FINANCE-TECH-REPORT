function b64ToUtf8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

const ICONS = {
  dashboard: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  treasury: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M4 21V10l8-6 8 6v11"/><path d="M9 21v-6h6v6"/></svg>',
  tracker: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  compliance: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
  home: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
};

const root = document.getElementById('root');
const frames = { dashboard: null, treasury: null, tracker: null, compliance: null };
let currentView = 'home';
const LOGO_SRC = 'data:image/png;base64,' + document.getElementById('zimnat-logo-b64').textContent.trim();

/* -------------------------------------------------------------- */
/* Auth gate — the whole launcher (including the two-card picker)  */
/* sits behind the same treasury sign-in, using the same Supabase   */
/* project/session already used inside Cash Position and Treasury.  */
/* -------------------------------------------------------------- */

const TREASURY_CONFIG_KEY = 'zimnat_treasury_supabase_config_v1';
let sb = null;
let currentUser = null;

function getTreasuryConfig() {
  try {
    const raw = localStorage.getItem(TREASURY_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveTreasuryConfig(url, key) {
  localStorage.setItem(TREASURY_CONFIG_KEY, JSON.stringify({ url, key }));
}
function getClient() {
  if (sb) return sb;
  const cfg = getTreasuryConfig();
  if (!cfg || !cfg.url || !cfg.key) return null;
  sb = supabase.createClient(cfg.url, cfg.key);
  return sb;
}

function renderGateShell(inner) {
  root.innerHTML =
    renderTopbar('home', true) +
    '<div class="gate-wrap"><div class="gate-card">' +
      '<img class="fg-logo" src="' + LOGO_SRC + '" alt="Zimnat General Insurance" />' +
      inner +
    '</div></div>';
}

function renderCheckingGate() {
  renderGateShell('<div class="gate-checking">Checking connection…</div>');
}

function renderConnectGate(error) {
  renderGateShell(
    '<h2>Connect to Finance Treasury</h2>' +
    '<p class="hint">Enter your Supabase project details (same as the treasury report) to sign in.</p>' +
    '<label>Supabase project URL</label>' +
    '<input id="gateUrl" type="text" placeholder="https://xxxxxxxx.supabase.co" />' +
    '<label>Publishable / anon key</label>' +
    '<input id="gateKey" type="text" placeholder="eyJhbGciOi..." />' +
    '<button class="gate-submit" id="gateConnectBtn">Connect</button>' +
    (error ? '<div class="gate-error">' + error + '</div>' : '')
  );
  document.getElementById('gateConnectBtn').addEventListener('click', handleGateConnect);
}

function renderSignInGate(error) {
  renderGateShell(
    '<h2>Sign in</h2>' +
    '<p class="hint">Sign in to access the Finance Treasury dashboard and reports.</p>' +
    '<label>Email</label>' +
    '<input id="gateEmail" type="email" placeholder="you@zimnat.co.zw" />' +
    '<label>Password</label>' +
    '<input id="gatePassword" type="password" placeholder="••••••••" />' +
    '<button class="gate-submit" id="gateSignInBtn">Sign in</button>' +
    (error ? '<div class="gate-error">' + error + '</div>' : '')
  );
  document.getElementById('gateSignInBtn').addEventListener('click', handleGateSignIn);
}

async function handleGateConnect() {
  const url = document.getElementById('gateUrl').value.trim();
  const key = document.getElementById('gateKey').value.trim();
  if (!url || !key) { renderConnectGate('Both fields are required.'); return; }
  try {
    sb = supabase.createClient(url, key);
    const { error } = await sb.auth.getSession();
    if (error) throw error;
    saveTreasuryConfig(url, key);
    renderSignInGate();
  } catch (e) {
    renderConnectGate('Could not reach that project — check the URL and key.');
  }
}

async function handleGateSignIn() {
  const email = document.getElementById('gateEmail').value.trim();
  const password = document.getElementById('gatePassword').value;
  const client = getClient();
  if (!client) { renderConnectGate(); return; }
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const u = data.session.user;
    currentUser = { name: (u.user_metadata && u.user_metadata.full_name) || u.email, email: u.email };
    renderHome();
  } catch (e) {
    renderSignInGate('Sign-in failed — check email and password.');
  }
}

async function handleSignOut() {
  const client = getClient();
  if (client) { try { await client.auth.signOut(); } catch (e) {} }
  currentUser = null;
  currentView = 'home';
  // Drop every open tool so the next person to sign in starts fresh.
  Object.keys(frames).forEach(k => { frames[k] = null; });
  stopComplianceProbe();
  renderSignInGate();
}

async function initAuth() {
  renderCheckingGate();
  const cfg = getTreasuryConfig();
  if (!cfg) { renderConnectGate(); return; }
  const client = getClient();
  if (!client) { renderConnectGate(); return; }
  try {
    const { data } = await client.auth.getSession();
    if (data && data.session) {
      const u = data.session.user;
      currentUser = { name: (u.user_metadata && u.user_metadata.full_name) || u.email, email: u.email };
      renderHome();
    } else {
      renderSignInGate();
    }
  } catch (e) {
    renderConnectGate();
  }
}

function renderTopbar(view, isGate) {
  const label = view === 'dashboard' ? 'Finance Dashboard' : view === 'treasury' ? 'Treasury Report' : view === 'tracker' ? 'Action Tracker' : view === 'compliance' ? 'Compliance Tracker' : '';
  return (
    '<div class="topbar">' +
      '<img class="logo" src="' + LOGO_SRC + '" alt="Zimnat General Insurance" />' +
      '<span class="divider"></span>' +
      '<span class="subtitle">Finance Treasury</span>' +
      (view !== 'home' ? '<span class="divider"></span><span class="current-app">' + label + '</span>' : '') +
      '<span class="spacer"></span>' +
      (!isGate && currentUser ? '<span class="current-app" style="margin-right:8px;">' + currentUser.name + '</span>' : '') +
      (view !== 'home' ? '<button class="home-btn" id="btnHome">' + ICONS.home + ' Home</button>' : '') +
      (!isGate ? '<button class="home-btn" id="btnSignOut" style="margin-left:8px;">Sign out</button>' : '') +
    '</div>'
  );
}

function renderHome() {
  root.innerHTML =
    renderTopbar('home') +
    '<div class="launcher">' +
      '<img class="bg-logo" src="' + LOGO_SRC + '" alt="" />' +
      '<img class="fg-logo" src="' + LOGO_SRC + '" alt="Zimnat General Insurance" />' +
      '<h1>Finance Treasury</h1>' +
      '<div class="lede">Four tools, one place — the finance dashboard, the daily treasury liquidity report, the finance action tracker, and the regulatory compliance tracker.</div>' +
      '<div class="cards">' +
        '<div class="card" id="cardDashboard">' +
          '<div class="icon-badge a">' + ICONS.dashboard + '</div>' +
          '<h2>Finance Dashboard</h2>' +
          '<p>Cash position, payments, debtors, and RI receivables — upload exports and browse each as its own dashboard.</p>' +
          '<div class="enter-link">Open dashboard ' + ICONS.arrow + '</div>' +
        '</div>' +
        '<div class="card" id="cardTreasury">' +
          '<div class="icon-badge b">' + ICONS.treasury + '</div>' +
          '<h2>Treasury Report</h2>' +
          '<p>The daily liquidity report — banks, commitments, cashflow, and checks, saved and shared with the team.</p>' +
          '<div class="enter-link">Open treasury report ' + ICONS.arrow + '</div>' +
        '</div>' +
        '<div class="card" id="cardTracker">' +
          '<div class="icon-badge a">' + ICONS.tracker + '</div>' +
          '<h2>Action Tracker</h2>' +
          '<p>Consolidated finance action items — status, owners, target dates, and a live dashboard, with every change recorded.</p>' +
          '<div class="enter-link">Open tracker ' + ICONS.arrow + '</div>' +
        '</div>' +
        '<div class="card" id="cardCompliance">' +
          '<div class="icon-badge b">' + ICONS.compliance + '</div>' +
          '<h2>Compliance Tracker</h2>' +
          '<p>IPEC, ZIMRA, NSSA and other statutory deadlines — worked out automatically, with what\'s overdue and coming up.</p>' +
          '<div class="ct-badge" id="ctBadge"></div>' +
          '<div class="enter-link">Open compliance tracker ' + ICONS.arrow + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.getElementById('cardDashboard').addEventListener('click', () => showApp('dashboard'));
  document.getElementById('cardTreasury').addEventListener('click', () => showApp('treasury'));
  document.getElementById('cardTracker').addEventListener('click', () => showApp('tracker'));
  document.getElementById('cardCompliance').addEventListener('click', () => showApp('compliance'));
  updateComplianceBadge();
  startComplianceProbe();
  if (complianceSummary) maybeShowComplianceToast();
  document.getElementById('btnSignOut').addEventListener('click', handleSignOut);
}

function showApp(view) {
  currentView = view;
  closeComplianceToast();
  root.innerHTML = renderTopbar(view) + '<div class="app-frame-wrap" id="frameWrap"></div>';
  document.getElementById('btnHome').addEventListener('click', () => { currentView = 'home'; renderHome(); });
  document.getElementById('btnSignOut').addEventListener('click', handleSignOut);

  const wrap = document.getElementById('frameWrap');
  if (!frames[view]) {
    const iframe = document.createElement('iframe');
    iframe.className = 'app-frame';
    const srcId = view === 'dashboard' ? 'dashboard-src-b64' : view === 'tracker' ? 'tracker-src-b64' : view === 'compliance' ? 'compliance-src-b64' : 'treasury-src-b64';
    const b64 = document.getElementById(srcId).textContent.trim();
    iframe.srcdoc = b64ToUtf8(b64);
    frames[view] = iframe;
  }
  wrap.appendChild(frames[view]);
}

/* -------------------------------------------------------------- */
/* Compliance reminders on the launcher.                            */
/* A hidden copy of the Compliance Tracker runs in the background    */
/* after sign-in (same session, same rules) and reports how many     */
/* items are overdue / due soon. The launcher shows that as a        */
/* pop-up on the home screen, a badge on the Compliance card, and —  */
/* if the person has allowed it — a desktop notification, each at    */
/* most once a day.                                                  */
/* -------------------------------------------------------------- */
let complianceProbe = null;
let complianceSummary = null;

function ctKey(k) { return 'zgi_ct_' + k + '|' + (currentUser ? currentUser.email : ''); }
function ctGet(k) { try { return localStorage.getItem(ctKey(k)); } catch (e) { return null; } }
function ctSet(k, v) { try { localStorage.setItem(ctKey(k), v); } catch (e) {} }
function todayLocal() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

function startComplianceProbe() {
  if (complianceProbe || !currentUser) return;
  const src = document.getElementById('compliance-src-b64');
  if (!src) return;
  const f = document.createElement('iframe');
  f.name = 'zgi-compliance-probe';
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.style.cssText = 'position:absolute;left:-10000px;top:0;width:10px;height:10px;border:0;visibility:hidden;';
  f.srcdoc = b64ToUtf8(src.textContent.trim());
  document.body.appendChild(f);
  complianceProbe = f;
}
function stopComplianceProbe() {
  if (complianceProbe) { complianceProbe.remove(); complianceProbe = null; }
  complianceSummary = null;
  closeComplianceToast();
}

window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.type !== 'zgi-compliance-summary' || !currentUser) return;
  const fromUs = (complianceProbe && e.source === complianceProbe.contentWindow) ||
                 (frames.compliance && e.source === frames.compliance.contentWindow);
  if (!fromUs || d.email !== currentUser.email) return;
  complianceSummary = d;
  updateComplianceBadge();
  if (currentView === 'home') maybeShowComplianceToast();
  maybeDesktopNotify();
});

function complianceTotal() { return complianceSummary ? (complianceSummary.overdue + complianceSummary.soon + complianceSummary.picked) : 0; }

function updateComplianceBadge() {
  const el = document.getElementById('ctBadge');
  if (!el) return;
  const s = complianceSummary;
  if (!s || !complianceTotal()) { el.innerHTML = ''; return; }
  el.innerHTML =
    (s.overdue ? '<span class="ct-pill red">' + s.overdue + ' overdue</span>' : '') +
    (s.soon ? '<span class="ct-pill amber">' + s.soon + ' due within ' + s.lead + ' days</span>' : '') +
    (s.picked ? '<span class="ct-pill blue">' + s.picked + ' reminder' + (s.picked === 1 ? '' : 's') + '</span>' : '');
}

function closeComplianceToast() { const t = document.getElementById('ctToast'); if (t) t.remove(); }

function showComplianceToast() {
  closeComplianceToast();
  const s = complianceSummary;
  if (!s) return;
  const t = document.createElement('div');
  t.id = 'ctToast';
  t.className = 'ct-toast';
  t.setAttribute('role', 'dialog');
  t.setAttribute('aria-label', 'Compliance reminders');
  const canAsk = ('Notification' in window) && Notification.permission === 'default';
  t.innerHTML =
    '<div class="ct-head"><div><div class="ct-title">🔔 Compliance reminders</div>' +
    '<div class="ct-sub">' + [s.overdue ? s.overdue + ' overdue' : '', s.soon ? s.soon + ' due within ' + s.lead + ' days' : '', s.picked ? s.picked + ' reminder' + (s.picked === 1 ? '' : 's') : ''].filter(Boolean).join(' · ') + '</div></div>' +
    '<button class="ct-x" id="ctClose" aria-label="Close">×</button></div>' +
    '<div class="ct-list">' + (s.top || []).map(i =>
      '<div class="ct-item' + (i.overdue ? ' od' : '') + '"><div><div class="ct-ref">' + escHtml(i.ref) + '</div><div class="ct-per">' + escHtml(i.period) + '</div></div><div class="ct-when">' + escHtml(i.when) + '</div></div>').join('') +
    (complianceTotal() > (s.top || []).length ? '<div class="ct-more">+ ' + (complianceTotal() - s.top.length) + ' more</div>' : '') + '</div>' +
    '<div class="ct-foot"><button class="ct-btn primary" id="ctOpen">Open compliance tracker</button>' +
    (canAsk ? '<button class="ct-btn" id="ctDesktop">Turn on desktop alerts</button>' : '') + '</div>';
  document.body.appendChild(t);
  document.getElementById('ctClose').addEventListener('click', closeComplianceToast);
  document.getElementById('ctOpen').addEventListener('click', () => { closeComplianceToast(); showApp('compliance'); });
  const dk = document.getElementById('ctDesktop');
  if (dk) dk.addEventListener('click', async () => {
    try { await Notification.requestPermission(); } catch (e) {}
    dk.remove();
    maybeDesktopNotify(true);
  });
}

// The pop-up appears by itself once a day (shared with the tracker's own pop-up,
// so nobody sees the same list twice in a day); the card badge is always there.
function maybeShowComplianceToast() {
  if (!complianceTotal() || ctGet('seen') === todayLocal()) return;
  ctSet('seen', todayLocal());
  showComplianceToast();
}

function maybeDesktopNotify(force) {
  if (!complianceTotal() || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!force && ctGet('desktop') === todayLocal()) return;
  ctSet('desktop', todayLocal());
  const s = complianceSummary;
  try {
    const n = new Notification('Zimnat compliance reminders', {
      body: [s.overdue ? s.overdue + ' overdue' : '', s.soon ? s.soon + ' due within ' + s.lead + ' days' : '', s.picked ? s.picked + ' reminder(s)' : ''].filter(Boolean).join(' · ') +
            ((s.top && s.top[0]) ? '\nFirst: ' + s.top[0].ref + ' (' + s.top[0].when + ')' : ''),
      tag: 'zgi-compliance'
    });
    n.onclick = () => { try { window.focus(); } catch (e) {} showApp('compliance'); n.close(); };
  } catch (e) { /* some browsers only allow notifications from a service worker */ }
}

initAuth();
