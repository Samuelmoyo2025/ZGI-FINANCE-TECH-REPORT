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
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
  home: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
};

const root = document.getElementById('root');
const frames = { dashboard: null, treasury: null, tracker: null };
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
  frames.dashboard = null;
  frames.treasury = null;
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
  const label = view === 'dashboard' ? 'Finance Dashboard' : view === 'treasury' ? 'Treasury Report' : view === 'tracker' ? 'Action Tracker' : '';
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
      '<div class="lede">Three tools, one place — the finance dashboard for payments, debtors and RI receivables, the daily treasury liquidity report, and the finance action tracker.</div>' +
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
      '</div>' +
    '</div>';
  document.getElementById('cardDashboard').addEventListener('click', () => showApp('dashboard'));
  document.getElementById('cardTreasury').addEventListener('click', () => showApp('treasury'));
  document.getElementById('cardTracker').addEventListener('click', () => showApp('tracker'));
  document.getElementById('btnSignOut').addEventListener('click', handleSignOut);
}

function showApp(view) {
  currentView = view;
  root.innerHTML = renderTopbar(view) + '<div class="app-frame-wrap" id="frameWrap"></div>';
  document.getElementById('btnHome').addEventListener('click', () => { currentView = 'home'; renderHome(); });
  document.getElementById('btnSignOut').addEventListener('click', handleSignOut);

  const wrap = document.getElementById('frameWrap');
  if (!frames[view]) {
    const iframe = document.createElement('iframe');
    iframe.className = 'app-frame';
    const srcId = view === 'dashboard' ? 'dashboard-src-b64' : view === 'tracker' ? 'tracker-src-b64' : 'treasury-src-b64';
    const b64 = document.getElementById(srcId).textContent.trim();
    iframe.srcdoc = b64ToUtf8(b64);
    frames[view] = iframe;
  }
  wrap.appendChild(frames[view]);
}

initAuth();
