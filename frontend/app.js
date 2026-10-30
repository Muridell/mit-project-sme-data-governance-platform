/* SME Metadata Governance Platform — web interface (vanilla JS, no build step).
   Talks to the FastAPI backend on the same origin. */
"use strict";

// ───────────────────────────── helpers ─────────────────────────────
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ROLE_LABEL = { data_owner: "Data Owner", data_steward: "Data Steward", data_analyst: "Data Analyst", data_consumer: "Data Consumer", system_admin: "System Administrator" };
const ROLES = Object.keys(ROLE_LABEL);
const SENS = ["Public", "Internal", "Confidential", "Restricted"];
const OPS = [["read_metadata", "Read metadata"], ["write_metadata", "Write metadata"], ["read_data", "Read data"], ["manage_access", "Manage access"]];
const DEMO_PASSWORD = "Demo@2026";
const DEMO_USERS = [
  { email: "owner@sme.ng", full_name: "Amaka Chukwu", role: "data_owner" },
  { email: "steward@sme.ng", full_name: "Tunde Bakare", role: "data_steward" },
  { email: "analyst@sme.ng", full_name: "Ifeoma Nwosu", role: "data_analyst" },
  { email: "consumer@sme.ng", full_name: "Bola Adigun", role: "data_consumer" },
];
const ADMIN = { email: "admin@smegov.ng", password: "Admin@SMEGov2026" };

const S = {
  token: sessionStorage.getItem("token"),
  user: JSON.parse(sessionStorage.getItem("user") || "null"),
  matrix: null,
};

const parseJ = v => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return v; } };
const fmtDate = iso => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const fmtDay = d => d ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
const sensBadge = s => `<span class="badge b-${esc(s)}">${esc(s)}</span>`;
const stateBadge = s => `<span class="badge b-${esc(s)}">${esc(s)}</span>`;
const scoreColor = s => s >= 90 ? "#2E7D32" : s >= 75 ? "#2E75B6" : s >= 60 ? "#B26A00" : s >= 40 ? "#C55A11" : "#C0392B";
const gradeLetter = s => s >= 90 ? "A" : s >= 75 ? "B" : s >= 60 ? "C" : s >= 40 ? "D" : "F";
const scoreBar = s => (s == null)
  ? `<span class="muted small">Not scored</span>`
  : `<span class="bar"><i style="width:${s}%;background:${scoreColor(s)}"></i></span><b>${Math.round(s)}%</b>`;
const ICON = {
  grid: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-12 7"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  list: '<path d="M9 4h6v3H9z"/><path d="M7 5H5v16h14V5h-2"/><path d="M9 12h6M9 16h6"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M18 14c2.4.3 4 2.2 4 5"/>',
  out: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
};
const icon = n => `<svg viewBox="0 0 24 24">${ICON[n]}</svg>`;

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = "Bearer " + S.token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(path, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    let msg = res.statusText;
    if (data && data.detail) {
      msg = Array.isArray(data.detail)
        ? data.detail.map(d => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ")
        : data.detail;
    }
    if (res.status === 401 && S.token && !path.startsWith("/auth/login")) { logout(true); }
    throw new ApiError(res.status, msg);
  }
  return data;
}

function toast(msg, type = "info", sub = "") {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.innerHTML = esc(msg) + (sub ? `<small>${esc(sub)}</small>` : "");
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), type === "error" ? 7000 : 4500);
}
function fail(e, what = "Request failed") {
  if (e instanceof ApiError && e.status === 403) {
    toast("Access denied by the RBAC policy", "error", `${e.message} — your role: ${ROLE_LABEL[S.user?.role] || S.user?.role}`);
  } else toast(what, "error", e.message);
}
function can(role, sens, op) {
  if (!S.matrix) return true;
  const p = S.matrix.find(x => x.role === role && x.sensitivity === sens && x.operation === op);
  return p ? p.permission === "ALLOW" : false;
}

// ───────────────────────────── auth ─────────────────────────────
async function startSession(email, password) {
  const data = await api("/auth/login", { method: "POST", body: { email, password } });
  S.token = data.access_token;
  S.user = { email: data.email, role: data.role, full_name: email };
  sessionStorage.setItem("token", S.token);
  try { const me = await api("/auth/me"); S.user.full_name = me.full_name; } catch { /* ignore */ }
  sessionStorage.setItem("user", JSON.stringify(S.user));
  try { S.matrix = (await api("/v1/access-matrix")).policies; } catch { S.matrix = null; }
  location.hash = "#/dashboard";
  route();
}
function logout(expired = false) {
  S.token = null; S.user = null; S.matrix = null;
  sessionStorage.clear();
  if (expired) toast("Session expired — please sign in again", "error");
  location.hash = "";
  route();
}

function renderLogin() {
  $("#app").innerHTML = `
  <div class="login">
    <div class="login-l">
      <h1>SME Metadata Management &amp; Data Governance Platform</h1>
      <p class="lead">A lightweight, open-standard governance toolkit for small and medium-sized enterprises — aligned to the Nigeria Data Protection Act 2023.</p>
      <div class="pillar"><i>1</i><div><b>Metadata Catalogue</b><span>DCAT-AP v2.1 / Dublin Core / JSON-LD</span></div></div>
      <div class="pillar"><i>2</i><div><b>Data Lineage Tracker</b><span>OpenLineage events + plain-language YAML manifests</span></div></div>
      <div class="pillar"><i>3</i><div><b>RBAC Policy Engine</b><span>NIST Core RBAC with a hash-chained audit log</span></div></div>
      <div class="pillar"><i>4</i><div><b>FAIR Quality Assurance</b><span>20-item checklist, 0–100 score, remediation advice</span></div></div>
      <div class="pillar"><i>5</i><div><b>Governance Policy Templates</b><span>Five NDPA-aligned policy documents</span></div></div>
    </div>
    <div class="login-r"><div class="login-box">
      <h2 id="lg-title">Sign in</h2>
      <p class="muted" style="margin:0">Use a demo account or your own credentials.</p>
      <div class="seg"><button class="active" data-m="in">Sign in</button><button data-m="up">Create account</button></div>
      <form id="lg-form">
        <div class="field hidden" id="f-name"><label class="f">Full name</label><input id="lg-name" placeholder="e.g. Tunde Bakare"></div>
        <div class="field"><label class="f">Email</label><input id="lg-email" type="email" placeholder="steward@sme.ng" required></div>
        <div class="field"><label class="f">Password</label><input id="lg-pass" type="password" placeholder="••••••••" required></div>
        <div class="field hidden" id="f-role"><label class="f">Role</label>
          <select id="lg-role">${ROLES.filter(r => r !== "system_admin").map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join("")}</select></div>
        <button class="btn btn-p" style="width:100%;padding:12px" id="lg-submit">Sign in</button>
      </form>
      <div class="demo">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <b style="color:var(--navy)">Demo accounts</b>
          <button class="btn btn-s btn-sm" id="mk-demo">Create demo accounts</button>
        </div>
        <div class="small muted" style="margin-bottom:6px">Click “Create demo accounts” once, then click a row to sign in (password <span class="mono">${DEMO_PASSWORD}</span>).</div>
        ${DEMO_USERS.map(u => `<div class="u" data-e="${u.email}" data-p="${DEMO_PASSWORD}"><span>${u.email}</span><span>${ROLE_LABEL[u.role]}</span></div>`).join("")}
        <div class="u" data-e="${ADMIN.email}" data-p="${ADMIN.password}"><span>${ADMIN.email}</span><span>System Administrator</span></div>
      </div>
    </div></div>
  </div>`;
  let mode = "in";
  $$(".seg button").forEach(b => b.onclick = () => {
    mode = b.dataset.m;
    $$(".seg button").forEach(x => x.classList.toggle("active", x === b));
    $("#f-name").classList.toggle("hidden", mode !== "up"); $("#f-role").classList.toggle("hidden", mode !== "up");
    $("#lg-title").textContent = mode === "up" ? "Create account" : "Sign in";
    $("#lg-submit").textContent = mode === "up" ? "Create account & sign in" : "Sign in";
  });
  $("#lg-form").onsubmit = async ev => {
    ev.preventDefault();
    const email = $("#lg-email").value.trim(), password = $("#lg-pass").value;
    try {
      if (mode === "up") await api("/auth/register", { method: "POST", body: { email, password, full_name: $("#lg-name").value.trim() || email, role: $("#lg-role").value } });
      await startSession(email, password);
    } catch (e) { toast(mode === "up" ? "Could not create account" : "Sign-in failed", "error", e.message); }
  };
  $$(".demo .u").forEach(r => r.onclick = async () => {
    try { await startSession(r.dataset.e, r.dataset.p); }
    catch (e) { toast("Sign-in failed", "error", e.status === 401 ? "Account not found — click “Create demo accounts” first." : e.message); }
  });
  $("#mk-demo").onclick = async () => {
    let made = 0;
    for (const u of DEMO_USERS) {
      try { await api("/auth/register", { method: "POST", body: { ...u, password: DEMO_PASSWORD } }); made++; }
      catch (e) { if (e.status !== 409) return fail(e, "Could not create demo accounts"); }
    }
    toast(made ? `${made} demo account(s) created` : "Demo accounts already exist", "ok", `Password for all: ${DEMO_PASSWORD}`);
  };
}

// ───────────────────────────── shell & routing ─────────────────────────────
const NAV = [
  ["Overview", [["dashboard", "Dashboard", "grid"]]],
  ["Governance", [["catalogue", "Metadata Catalogue", "db"], ["register", "Register Dataset", "plus"], ["lineage", "Data Lineage", "branch"], ["access", "Access Control", "shield"], ["audit", "Audit Log", "list"]]],
  ["Reference", [["policies", "Policy Templates", "file"], ["stewards", "Data Stewards", "users"]]],
];
const PAGES = {
  dashboard: { title: "Dashboard", sub: "Catalogue health at a glance", fn: pageDashboard },
  catalogue: { title: "Metadata Catalogue", sub: "Search and inspect registered data assets (Pillar 1)", fn: pageCatalogue },
  register: { title: "Register Dataset", sub: "Describe a new data asset using DCAT-AP / Dublin Core fields", fn: pageRegister },
  lineage: { title: "Data Lineage", sub: "Trace where data came from and what happened to it (Pillar 2)", fn: pageLineage },
  access: { title: "Access Control", sub: "Role-based permissions by data sensitivity (Pillar 3)", fn: pageAccess },
  audit: { title: "Audit Log", sub: "Every access decision, recorded and hash-chained", fn: pageAudit },
  policies: { title: "Policy Templates", sub: "NDPA 2023-aligned governance documents (Pillar 5)", fn: pagePolicies },
  stewards: { title: "Data Stewards", sub: "People accountable for data quality", fn: pageStewards },
};
let auditTimer = null;

function route() {
  clearInterval(auditTimer);
  closeDrawer();
  if (!S.token) { renderLogin(); return; }
  const [name, qs] = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?");
  const key = PAGES[name] ? name : "dashboard";
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  const u = S.user || {};
  $("#app").innerHTML = `
  <div class="shell">
    <nav class="sidebar">
      <div class="brand"><b>SME Governance Platform</b><span>Metadata &amp; Data Governance Toolkit</span></div>
      <div class="nav">${NAV.map(([label, items]) => `<div class="nav-label">${label}</div>` +
        items.map(([k, t, ic]) => `<a href="#/${k}" class="${k === key ? "active" : ""}">${icon(ic)}${t}</a>`).join("")).join("")}</div>
      <div class="userbox"><div class="nm">${esc(u.full_name)}</div><div class="em">${esc(u.email)}</div>
        <span class="role-pill">${esc(ROLE_LABEL[u.role] || u.role)}</span>
        <button class="logout" id="logout">${icon("out")}Sign out</button></div>
    </nav>
    <main class="main">
      <div class="page-head"><div><h1>${PAGES[key].title}</h1><p>${PAGES[key].sub}</p></div><div class="row" id="head-actions"></div></div>
      <div id="page"><div class="loading">Loading…</div></div>
    </main>
  </div>`;
  $("#logout").onclick = () => logout();
  PAGES[key].fn(params).catch(e => { $("#page").innerHTML = `<div class="card"><div class="empty"><b>Something went wrong</b>${esc(e.message)}</div></div>`; });
}
window.addEventListener("hashchange", route);

// ───────────────────────────── sample data ─────────────────────────────
const SAMPLES = [
  { identifier: "DS-RETAIL-ORDERS-Q2", title: "Customer Orders Q2 2026", description: "E-commerce order transactions for Q2 2026 including line items and payment status.", creator: "Sales Department", created_date: "2026-04-01", access_rights: "Confidential", sensitivity_class: "Confidential", subject_tags: ["orders", "retail", "sales"], license_url: "https://internal.sme.ng/data-policy", retention_period: "7 years", data_location: "postgres://erp/sales/orders", temporal_start: "2026-04-01", temporal_end: "2026-06-30" },
  { identifier: "DS-RETAIL-SUPPLIER-INV", title: "Supplier Invoices 2026", description: "Accounts-payable invoices received from upstream suppliers.", creator: "Finance Department", created_date: "2026-01-10", access_rights: "Internal", sensitivity_class: "Internal", subject_tags: ["finance"], retention_period: "10 years" },
  { identifier: "DS-LOGI-DELIVERY-LOGS", title: "Delivery Logs — Lagos Fleet", description: "GPS-tracked delivery completion logs for the last-mile logistics fleet.", creator: "Logistics Operations", created_date: "2026-02-15", access_rights: "Public", sensitivity_class: "Public", subject_tags: ["logistics", "delivery", "gps"], license_url: "https://creativecommons.org/licenses/by/4.0/", retention_period: "3 years", data_location: "s3://sme-logistics/delivery/" },
  { identifier: "DS-LOGI-FLEET-MAINT", title: "Fleet Maintenance Records", description: "Service and repair history for every vehicle in the delivery fleet.", creator: "Logistics Operations", created_date: "2026-03-05", access_rights: "Internal", sensitivity_class: "Internal", subject_tags: ["fleet", "maintenance"], data_location: "postgres://ops/fleet" },
  { identifier: "DS-PROF-CLIENT-NOTES", title: "Client Engagement Notes", description: "Consulting notes and meeting minutes for each client engagement.", creator: "Consulting Team", created_date: "2026-05-20", access_rights: "Restricted", sensitivity_class: "Restricted", subject_tags: ["consulting", "clients"], retention_period: "5 years" },
];
const SAMPLE_LINEAGE = [
  { job_name: "ETL-OrdersToWarehouse", run_state: "COMPLETE", input_datasets: [{ name: "raw_orders_csv" }, { name: "payment_gateway_export" }], output_datasets: [{ name: "DS-RETAIL-ORDERS-Q2" }] },
  { job_name: "ETL-DeliveryIngest", run_state: "COMPLETE", input_datasets: [{ name: "fleet_gps_stream" }], output_datasets: [{ name: "DS-LOGI-DELIVERY-LOGS" }] },
];
async function loadSamples() {
  const btns = $$("[data-samples]"); btns.forEach(b => b.disabled = true);
  let created = 0, skipped = 0, lin = 0, scored = 0, denied = 0;
  const ids = [];
  for (const d of SAMPLES) {
    try { const r = await api("/v1/datasets", { method: "POST", body: d }); ids.push([r.id, d.sensitivity_class]); created++; }
    catch (e) { if (e.status === 409) skipped++; else if (e.status === 403) { denied++; break; } else return fail(e, "Could not load samples"); }
  }
  if (denied) { btns.forEach(b => b.disabled = false); return fail(new ApiError(403, "Your role cannot register datasets"), "Sample data"); }
  for (const l of SAMPLE_LINEAGE) { try { await api("/v1/lineage", { method: "POST", body: l }); lin++; } catch { /* ignore */ } }
  for (const [id, sens] of ids) { try { await api(`/v1/fair/${id}/score`, { method: "POST" }); scored++; } catch { /* Restricted may be refused by RBAC */ } }
  toast(`Sample data loaded`, "ok", `${created} datasets (${skipped} already existed), ${lin} lineage runs, ${scored} FAIR scores`);
  route();
}

// ───────────────────────────── dashboard ─────────────────────────────
async function pageDashboard() {
  const [sum, ds, runs, aud] = await Promise.allSettled([
    api("/v1/fair/catalogue/summary"), api("/v1/datasets?per_page=100"), api("/v1/lineage"), api("/v1/audit?limit=8"),
  ]);
  const val = r => r.status === "fulfilled" ? r.value : null;
  const S_ = val(sum), D = val(ds), R = val(runs), A = val(aud);
  const total = D ? D.total : (S_ ? S_.total_datasets : 0);
  $("#head-actions").innerHTML = `<button class="btn btn-s" data-samples>Load sample data</button>`;
  $("[data-samples]").onclick = loadSamples;
  if (!total && D) {
    $("#page").innerHTML = `<div class="card"><div class="empty"><b>The catalogue is empty</b>Register your first dataset, or load a set of realistic sample datasets (retail, logistics and professional services) to explore the platform.
      <div class="row" style="justify-content:center;margin-top:18px"><button class="btn btn-p" data-samples2>Load sample data</button><a class="btn btn-s" href="#/register" style="text-decoration:none">Register a dataset</a></div></div></div>`;
    $("[data-samples2]").onclick = loadSamples; return;
  }
  const items = D ? D.items : [];
  const bySens = Object.fromEntries(SENS.map(s => [s, items.filter(i => i.sensitivity_class === s).length]));
  const maxS = Math.max(1, ...Object.values(bySens));
  const avg = S_ ? S_.average_fair : null;
  const jobs = R ? new Set(R.runs.map(r => r.job_name)).size : "—";
  $("#page").innerHTML = `
    <div class="grid g4" style="margin-bottom:20px">
      <div class="kpi"><div class="l">Registered datasets</div><div class="v">${total}</div><div class="s">${S_ ? `${S_.scored} scored · ${S_.unscored} unscored` : ""}</div></div>
      <div class="kpi"><div class="l">Average FAIR score</div><div class="v" style="color:${avg != null ? scoreColor(avg) : "inherit"}">${avg != null ? Math.round(avg) + "%" : "—"}</div><div class="s">${S_ ? esc(S_.overall_grade) : ""}</div></div>
      <div class="kpi"><div class="l">Lineage runs</div><div class="v">${R ? R.total : "—"}</div><div class="s">${jobs} distinct job(s)</div></div>
      <div class="kpi"><div class="l">Your access</div><div class="v" style="font-size:20px;padding-top:8px">${esc(ROLE_LABEL[S.user.role])}</div><div class="s"><a href="#/access">View permissions</a></div></div>
    </div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h3>FAIR score by dataset</h3>
        ${S_ && S_.unscored ? `<button class="btn btn-s btn-sm" id="score-all">Score ${S_.unscored} unscored</button>` : ""}</div>
        <table class="t compact"><thead><tr><th>Dataset</th><th>F</th><th>A</th><th>I</th><th>R</th><th>Total</th></tr></thead><tbody>
        ${S_ ? S_.datasets.map(d => `<tr><td><b>${esc(d.title)}</b><div class="small muted">${esc(d.identifier)}</div></td>
          ${["f_score", "a_score", "i_score", "r_score"].map(k => `<td>${d[k] != null ? d[k] : "—"}</td>`).join("")}<td style="white-space:nowrap">${scoreBar(d.fair_score)}</td></tr>`).join("") : `<tr><td colspan="6" class="muted">Not available for your role</td></tr>`}
        </tbody></table></div>
      <div>
        <div class="card"><div class="card-h"><h3>Datasets by sensitivity</h3></div><div class="card-b">
          ${SENS.map(s => `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div style="width:100px">${sensBadge(s)}</div>
            <div class="bar wide" style="flex:1;height:12px"><i style="width:${bySens[s] / maxS * 100}%;background:var(--navy)"></i></div><b style="width:24px;text-align:right">${bySens[s]}</b></div>`).join("")}
        </div></div>
        <div class="card"><div class="card-h"><h3>Recent access decisions</h3><a href="#/audit" class="small">Full audit log →</a></div>
          <table class="t compact"><tbody>${A ? A.entries.slice(0, 6).map(e => `<tr><td>${esc(e.user_email)}<div class="small muted">${esc(e.operation)}</div></td><td style="text-align:right"><span class="badge b-${esc(e.result)}">${esc(e.result)}</span></td></tr>`).join("") : `<tr><td class="muted">Not available</td></tr>`}</tbody></table></div>
      </div>
    </div>`;
  const sa = $("#score-all");
  if (sa) sa.onclick = async () => {
    sa.disabled = true; let n = 0;
    for (const d of S_.datasets.filter(x => x.fair_score == null)) {
      const full = items.find(i => i.identifier === d.identifier); if (!full) continue;
      try { await api(`/v1/fair/${full.id}/score`, { method: "POST" }); n++; } catch { /* skip refused */ }
    }
    toast(`${n} dataset(s) scored`, "ok"); route();
  };
}

// ───────────────────────────── catalogue ─────────────────────────────
async function pageCatalogue(params) {
  $("#head-actions").innerHTML = `<button class="btn btn-s" data-samples>Load sample data</button><a class="btn btn-p" href="#/register" style="text-decoration:none">+ Register dataset</a>`;
  $("[data-samples]").onclick = loadSamples;
  $("#page").innerHTML = `
    <div class="filters">
      <input id="q" placeholder="Search by title or identifier…" style="min-width:280px">
      <select id="fs"><option value="">All sensitivity levels</option>${SENS.map(s => `<option>${s}</option>`).join("")}</select>
      <input id="ft" placeholder="Filter by tag (exact)">
      <button class="btn btn-s" id="fgo">Apply</button>
    </div>
    <div class="card" id="cat-card"><div class="loading">Loading…</div></div>`;
  let all = [], scores = {};
  async function load() {
    const q = new URLSearchParams({ per_page: 100 });
    if ($("#fs").value) q.set("sensitivity", $("#fs").value);
    if ($("#ft").value.trim()) q.set("tag", $("#ft").value.trim());
    const [list, sum] = await Promise.allSettled([api("/v1/datasets?" + q), api("/v1/fair/catalogue/summary")]);
    if (list.status === "rejected") { $("#cat-card").innerHTML = `<div class="empty"><b>Cannot load catalogue</b>${esc(list.reason.message)}</div>`; return; }
    all = list.value.items;
    scores = {}; if (sum.status === "fulfilled") sum.value.datasets.forEach(d => scores[d.identifier] = d.fair_score);
    draw();
  }
  function draw() {
    const term = $("#q").value.trim().toLowerCase();
    const rows = all.filter(d => !term || d.title.toLowerCase().includes(term) || d.identifier.toLowerCase().includes(term));
    $("#cat-card").innerHTML = rows.length ? `<table class="t"><thead><tr><th>Dataset</th><th>Sensitivity</th><th>Creator</th><th>Tags</th><th>FAIR</th><th>Created</th></tr></thead><tbody>
      ${rows.map(d => `<tr class="click" data-id="${d.id}"><td><b>${esc(d.title)}</b><div class="small muted mono">${esc(d.identifier)}</div></td>
        <td>${sensBadge(d.sensitivity_class)}</td><td>${esc(d.creator)}</td><td>${(d.subject_tags || []).map(t => `<span class="chip">${esc(t)}</span>`).join("")}</td>
        <td style="white-space:nowrap">${scoreBar(scores[d.identifier])}</td><td class="small">${fmtDay(d.created_date)}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty"><b>No datasets found</b>Try a different filter, or <a href="#/register">register a dataset</a>.</div>`;
    $$("#cat-card tr.click").forEach(tr => tr.onclick = () => openDataset(tr.dataset.id));
  }
  $("#fgo").onclick = load; $("#q").oninput = draw;
  $("#ft").onkeydown = e => { if (e.key === "Enter") load(); };
  await load();
  if (params.open) openDataset(params.open);
}

// ───────────────────────────── dataset drawer ─────────────────────────────
function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawer-overlay").classList.remove("open"); }
$("#drawer-overlay").onclick = closeDrawer;
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

async function openDataset(id, tab = "overview") {
  let ds;
  try { ds = await api("/v1/datasets/" + id); } catch (e) { return fail(e, "Cannot open dataset"); }
  const dr = $("#drawer");
  dr.innerHTML = `<div class="dr-h"><button class="dr-x" id="dr-x">×</button><h2>${esc(ds.title)}</h2>
      <div class="row small"><span class="mono muted">${esc(ds.identifier)}</span>${sensBadge(ds.sensitivity_class)}</div>
      <div class="tabs">${[["overview", "Overview"], ["jsonld", "JSON-LD"], ["fair", "FAIR score"], ["lineage", "Lineage"]].map(([k, t]) => `<button data-t="${k}" class="${k === tab ? "active" : ""}">${t}</button>`).join("")}</div></div>
    <div class="dr-b" id="dr-b"></div>`;
  dr.classList.add("open"); $("#drawer-overlay").classList.add("open");
  $("#dr-x").onclick = closeDrawer;
  $$(".tabs button", dr).forEach(b => b.onclick = () => { $$(".tabs button", dr).forEach(x => x.classList.toggle("active", x === b)); showTab(b.dataset.t); });
  async function showTab(t) {
    const box = $("#dr-b"); box.innerHTML = `<div class="loading">Loading…</div>`;
    try {
      if (t === "overview") {
        const kv = [["Description", esc(ds.description)], ["Creator", esc(ds.creator)], ["Created", fmtDay(ds.created_date)], ["Modified", fmtDay(ds.modified_date)],
          ["Access rights", sensBadge(ds.access_rights)], ["Sensitivity", sensBadge(ds.sensitivity_class)],
          ["Subject tags", (ds.subject_tags || []).map(x => `<span class="chip">${esc(x)}</span>`).join("") || "—"],
          ["Retention", esc(ds.retention_period || "—")], ["Data location", ds.data_location ? `<span class="mono">${esc(ds.data_location)}</span>` : "—"],
          ["License", ds.license_url ? `<a href="${esc(ds.license_url)}" target="_blank" rel="noopener">${esc(ds.license_url)}</a>` : "—"],
          ["Language", esc(ds.language || "—")], ["Temporal coverage", ds.temporal_start ? `${fmtDay(ds.temporal_start)} → ${fmtDay(ds.temporal_end)}` : "—"],
          ["Internal ID", `<span class="mono small">${esc(ds.id)}</span>`], ["Last updated", fmtDate(ds.updated_at)]];
        box.innerHTML = `<dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
          <div style="margin-top:26px"><button class="btn btn-d btn-sm" id="del">Deregister dataset</button></div>`;
        $("#del").onclick = async () => {
          if (!confirm(`Deregister “${ds.title}”? It will be removed from the active catalogue.`)) return;
          try { await api("/v1/datasets/" + id, { method: "DELETE" }); toast("Dataset deregistered", "ok"); closeDrawer(); route(); } catch (e) { fail(e, "Could not deregister"); }
        };
      } else if (t === "jsonld") {
        const j = await api(`/v1/datasets/${id}?jsonld=true`);
        box.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="muted small">DCAT-AP / Dublin Core serialisation</span><button class="btn btn-o btn-sm" id="cp">Copy</button></div><pre class="json">${esc(JSON.stringify(j, null, 2))}</pre>`;
        $("#cp").onclick = () => { navigator.clipboard?.writeText(JSON.stringify(j, null, 2)); toast("Copied to clipboard", "ok"); };
      } else if (t === "fair") { await showFair(false); }
      else if (t === "lineage") {
        const l = await api(`/v1/datasets/${id}/lineage`);
        box.innerHTML = l.lineage_runs.length ? l.lineage_runs.map(r => {
          const i = parseJ(r.input_datasets) || [], o = parseJ(r.output_datasets) || [];
          return `<div class="card" style="margin-bottom:12px"><div class="card-b"><div class="row" style="justify-content:space-between"><b>${esc(r.job_name)}</b>${stateBadge(r.run_state)}</div>
            <div style="margin:10px 0">${i.map(x => `<span class="chip">${esc(x.name)}</span>`).join("")} → ${o.map(x => `<span class="chip">${esc(x.name)}</span>`).join("")}</div>
            <div class="small muted">${fmtDate(r.recorded_at)} · <a href="#/lineage?job=${encodeURIComponent(r.job_name)}">View graph</a></div></div></div>`;
        }).join("") : `<div class="empty"><b>No lineage recorded</b>Record a lineage event whose output is “${esc(ds.identifier)}”.<br><br><a class="btn btn-s" href="#/lineage" style="text-decoration:none">Go to Data Lineage</a></div>`;
      }
    } catch (e) { box.innerHTML = `<div class="empty"><b>Could not load</b>${esc(e.message)}</div>`; if (e.status === 403) fail(e); }
  }
  async function showFair(compute) {
    const box = $("#dr-b");
    let data;
    if (compute) { data = await api(`/v1/fair/${id}/score`, { method: "POST" }); }
    else { data = await api(`/v1/datasets/${id}/fair`); }
    if (data.message) {
      box.innerHTML = `<div class="empty"><b>No FAIR score yet</b>Run the 20-item FAIR checklist against this dataset.<br><br><button class="btn btn-p" id="calc">Compute FAIR score</button></div>`;
      $("#calc").onclick = async () => { try { await showFair(true); await refreshAfterScore(); } catch (e) { fail(e, "Scoring failed"); } };
      return;
    }
    const det = parseJ(data.details) || {};
    const total = Number(data.fair_score);
    const dims = [["Findable", data.f_score], ["Accessible", data.a_score], ["Interoperable", data.i_score], ["Reusable", data.r_score]];
    const label = k => k.replace(/^([FAIR]\d)_/, "$1 · ").replace(/_/g, " ");
    box.innerHTML = `
      <div class="fair-total"><div class="big" style="color:${scoreColor(total)}">${Math.round(total)}</div><div><b style="font-size:17px">${data.grade ? esc(data.grade) : "Grade " + gradeLetter(total)}</b><div class="small muted">Scored ${fmtDate(data.scored_at)}${data.scored_by ? " by " + esc(data.scored_by) : ""}</div></div>
        <div style="margin-left:auto"><button class="btn btn-s btn-sm" id="calc">Recompute</button></div></div>
      <div class="fair-dims">${dims.map(([n, v]) => `<div class="fd"><div class="n">${n}</div><div class="s">${Number(v)}<span class="muted" style="font-size:14px">/25</span></div><div class="bar wide" style="height:7px"><i style="width:${Number(v) / 25 * 100}%;background:${scoreColor(Number(v) / 25 * 100)}"></i></div></div>`).join("")}</div>
      ${data.remediation && data.remediation.length ? `<h3 style="font-size:14.5px;margin:6px 0 8px">How to improve this score</h3><ul class="remed">${[...new Set(data.remediation)].map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : (compute ? `<div class="notice n-info">All improvable checklist items are satisfied.</div>` : `<div class="notice n-info">Click <b>Recompute</b> to see tailored remediation advice.</div>`)}
      <h3 style="font-size:14.5px;margin:20px 0 6px">20-item checklist</h3>
      <ul class="check-list">${Object.entries(det).map(([k, v]) => `<li><span class="ck ${v ? "y" : "n"}">${v ? "✓" : "✕"}</span><span>${esc(label(k))}</span></li>`).join("")}</ul>`;
    $("#calc").onclick = async () => { try { await showFair(true); await refreshAfterScore(); } catch (e) { fail(e, "Scoring failed"); } };
  }
  async function refreshAfterScore() { toast("FAIR score updated", "ok"); }
  showTab(tab);
}

// ───────────────────────────── register ─────────────────────────────
async function pageRegister() {
  let stewards = [];
  try { stewards = await api("/v1/stewards"); } catch { /* optional */ }
  const role = S.user.role;
  const canWrite = can(role, "Public", "write_metadata");
  const today = new Date().toISOString().slice(0, 10);
  $("#page").innerHTML = `
    ${canWrite ? "" : `<div class="notice n-warn"><b>${esc(ROLE_LABEL[role])}</b> has no write permission in the RBAC matrix. You can fill in the form, but submitting will be refused with <b>403 Forbidden</b> and the attempt will appear in the audit log — this is the expected behaviour.</div>`}
    <div class="card"><form id="rf">
      <div class="form-grid">
        <div><label class="f">Identifier *</label><input id="r-id" placeholder="DS-2026-CUST-001" required pattern="[A-Za-z0-9\\-_.]+" title="Letters, digits, hyphen, underscore, dot"></div>
        <div><label class="f">Title *</label><input id="r-title" placeholder="Customer Transactions Q1 2026" required></div>
        <div class="full"><label class="f">Description *</label><textarea id="r-desc" placeholder="What does this dataset contain, and what is it used for?" required></textarea></div>
        <div><label class="f">Creator *</label><input id="r-creator" placeholder="Sales Department" required></div>
        <div><label class="f">Created date *</label><input id="r-created" type="date" value="${today}" required></div>
        <div><label class="f">Sensitivity class *</label><select id="r-sens">${SENS.map(s => `<option ${s === "Internal" ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div><label class="f">Access rights *</label><select id="r-acc">${SENS.map(s => `<option ${s === "Internal" ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div><label class="f">Subject tags (comma-separated)</label><input id="r-tags" placeholder="finance, customers, transactions"></div>
        <div><label class="f">Retention period</label><input id="r-ret" placeholder="7 years"></div>
        <div><label class="f">Data location</label><input id="r-loc" placeholder="postgres://erp/sales/transactions"></div>
        <div><label class="f">License URL</label><input id="r-lic" placeholder="https://internal.sme.ng/data-policy"></div>
        <div><label class="f">Data steward</label><select id="r-stew"><option value="">— none —</option>${stewards.map(s => `<option value="${s.id}">${esc(s.name)} (${esc(s.role)})</option>`).join("")}</select></div>
        <div><label class="f">Language</label><input id="r-lang" value="en"></div>
      </div>
      <div class="form-foot">
        <button class="btn btn-p" id="r-go">Register dataset</button>
        <button type="button" class="btn btn-o" id="r-fill">Fill sample values</button>
        <label class="check"><input type="checkbox" id="r-score" checked> Compute FAIR score after registering</label>
      </div>
    </form></div>`;
  $("#r-fill").onclick = () => {
    const n = Math.floor(Math.random() * 900 + 100);
    Object.entries({ "r-id": `DS-2026-CUST-${n}`, "r-title": "Customer Transactions Q1 2026", "r-desc": "Daily point-of-sale transactions for the Lagos retail branch, used for sales reporting.", "r-creator": "Sales Department", "r-tags": "finance, customers, transactions", "r-ret": "7 years", "r-loc": "postgres://erp/sales/transactions", "r-lic": "https://internal.sme.ng/data-policy" }).forEach(([k, v]) => $("#" + k).value = v);
    $("#r-sens").value = "Confidential"; $("#r-acc").value = "Confidential";
  };
  $("#rf").onsubmit = async ev => {
    ev.preventDefault();
    const val = id => $("#" + id).value.trim();
    const body = {
      identifier: val("r-id"), title: val("r-title"), description: val("r-desc"), creator: val("r-creator"), created_date: val("r-created"),
      access_rights: val("r-acc"), sensitivity_class: val("r-sens"), language: val("r-lang") || "en",
      subject_tags: val("r-tags") ? val("r-tags").split(",").map(s => s.trim()).filter(Boolean) : null,
      retention_period: val("r-ret") || null, data_location: val("r-loc") || null, license_url: val("r-lic") || null, steward_id: val("r-stew") || null,
    };
    $("#r-go").disabled = true;
    try {
      const d = await api("/v1/datasets", { method: "POST", body });
      let extra = "";
      if ($("#r-score").checked) { try { const f = await api(`/v1/fair/${d.id}/score`, { method: "POST" }); extra = `FAIR score ${Math.round(f.fair_score)}% (${f.grade})`; } catch (e) { extra = "Registered, but scoring was refused: " + e.message; } }
      toast(`“${d.title}” registered`, "ok", extra);
      location.hash = "#/catalogue?open=" + d.id;
    } catch (e) { fail(e, "Could not register dataset"); $("#r-go").disabled = false; }
  };
}

// ───────────────────────────── lineage ─────────────────────────────
const YAML_TEMPLATE = `# Data Lineage Manifest — plain-language template
data_source: "Customer Transactions Database"
transformation_description: "Extracted Q1 customer records, removed duplicates, standardised phone numbers"
output_dataset: "Clean Customer Records Q1 v1.0"
responsible_person: "steward@sme.ng"
date_processed: "2026-01-15"
notes: "Removed 412 duplicate records."
`;
function drawGraph(el, g) {
  const nodes = g.nodes, edges = [...new Map(g.edges.map(e => [e.from + "|" + e.to, e])).values()];
  const rank = Object.fromEntries(nodes.map(n => [n, 0]));
  for (let i = 0; i < nodes.length; i++) edges.forEach(e => { rank[e.to] = Math.max(rank[e.to], rank[e.from] + 1); });
  const cols = {}; nodes.forEach(n => (cols[rank[n]] ||= []).push(n));
  const nCols = Math.max(...Object.keys(cols).map(Number)) + 1, maxRows = Math.max(...Object.values(cols).map(c => c.length));
  const NW = 230, NH = 48, GX = 120, GY = 30, PAD = 30;
  const W = PAD * 2 + nCols * NW + (nCols - 1) * GX, H = PAD * 2 + maxRows * NH + (maxRows - 1) * GY;
  const pos = {};
  Object.entries(cols).forEach(([c, list]) => {
    const colH = list.length * NH + (list.length - 1) * GY;
    list.forEach((n, i) => pos[n] = { x: PAD + c * (NW + GX), y: (H - colH) / 2 + i * (NH + GY) });
  });
  const lbl = n => n.replace(/^(DS|JOB):/, ""), cut = t => t.length > 28 ? t.slice(0, 27) + "…" : t;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#8492A6"/></marker></defs>
    ${edges.map(e => { const a = pos[e.from], b = pos[e.to], x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      return `<path class="edge" marker-end="url(#ar)" d="M${x1} ${y1} C${mx} ${y1},${mx} ${y2},${x2 - 2} ${y2}"/>`; }).join("")}
    ${nodes.map(n => { const p = pos[n], job = n.startsWith("JOB:");
      return `<g class="${job ? "node-job" : "node-ds"}" transform="translate(${p.x},${p.y})"><title>${esc(lbl(n))}</title><rect width="${NW}" height="${NH}" rx="10"/>
        <text x="${NW / 2}" y="${NH / 2 + 5}" text-anchor="middle" font-size="14">${esc(cut(lbl(n)))}</text></g>`; }).join("")}
  </svg>`;
}
async function pageLineage(params) {
  const canWrite = can(S.user.role, "Public", "write_metadata");
  $("#page").innerHTML = `<div class="layout-2">
    <div><div class="card"><div class="card-h"><h3>Jobs</h3></div><ul class="joblist" id="jobs"><li class="muted">Loading…</li></ul></div></div>
    <div>
      <div class="card"><div class="card-h"><h3 id="g-title">Lineage graph</h3><span class="muted small" id="g-sub"></span></div><div class="graph-wrap" id="graph"><div class="empty"><b>Select a job</b>Choose a job on the left to see its upstream and downstream datasets.</div></div></div>
      <div class="card hidden" id="runs-card"><div class="card-h"><h3>Runs</h3></div><div id="runs"></div></div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h3>Record a lineage event</h3></div><div class="card-b">
          ${canWrite ? "" : `<div class="notice n-warn">Your role cannot write metadata — submitting will be refused (403).</div>`}
          <form id="lf"><div style="margin-bottom:12px"><label class="f">Job name *</label><input id="l-job" placeholder="ETL-CustomerExtract" required></div>
            <div style="margin-bottom:12px"><label class="f">Run state</label><select id="l-state"><option>COMPLETE</option><option>START</option><option>FAIL</option><option>ABORT</option></select></div>
            <div style="margin-bottom:12px"><label class="f">Input datasets (comma-separated) *</label><input id="l-in" placeholder="CustomerDB, payment_export" required></div>
            <div style="margin-bottom:14px"><label class="f">Output datasets (comma-separated) *</label><input id="l-out" placeholder="Staging-v2 or a dataset identifier" required></div>
            <button class="btn btn-p">Record event</button></form></div></div>
        <div class="card"><div class="card-h"><h3>Upload YAML manifest</h3></div><div class="card-b">
          <p class="muted" style="margin-top:0">For non-technical stewards: fill in the plain-language template and upload it — no code required.</p>
          <div style="margin-bottom:12px"><input type="file" id="l-file" accept=".yml,.yaml"></div>
          <div class="row"><button class="btn btn-p" id="l-up">Upload manifest</button><button class="btn btn-o" id="l-tpl">Download template</button></div></div></div>
      </div>
    </div></div>`;
  let runs = [];
  async function loadJobs(select) {
    const r = await api("/v1/lineage"); runs = r.runs;
    const jobs = {}; runs.forEach(x => (jobs[x.job_name] ||= []).push(x));
    const names = Object.keys(jobs);
    $("#jobs").innerHTML = names.length ? names.map(n => `<li data-j="${esc(n)}"><div class="jn">${esc(n)}</div><div class="small muted">${jobs[n].length} run(s) · ${stateBadge(jobs[n][0].run_state)}</div></li>`).join("")
      : `<li class="muted" style="cursor:default">No lineage recorded yet.</li>`;
    $$("#jobs li[data-j]").forEach(li => li.onclick = () => showJob(li.dataset.j));
    const pick = select || params.job || names[0];
    if (pick && names.includes(pick)) showJob(pick);
  }
  async function showJob(name) {
    $$("#jobs li").forEach(li => li.classList.toggle("active", li.dataset.j === name));
    try {
      const g = await api("/v1/lineage/graph/" + encodeURIComponent(name));
      $("#g-title").textContent = name; $("#g-sub").textContent = `${g.nodes.length} nodes · ${g.edges.length} edges`;
      drawGraph($("#graph"), g);
      $("#runs-card").classList.remove("hidden");
      $("#runs").innerHTML = `<table class="t compact"><thead><tr><th>State</th><th>Inputs → Outputs</th><th>Recorded</th></tr></thead><tbody>${g.runs.map(r => {
        const i = parseJ(r.input_datasets) || [], o = parseJ(r.output_datasets) || [];
        return `<tr><td>${stateBadge(r.run_state)}</td><td>${i.map(x => `<span class="chip">${esc(x.name)}</span>`).join("")} → ${o.map(x => `<span class="chip">${esc(x.name)}</span>`).join("")}</td><td class="small">${fmtDate(r.recorded_at)}</td></tr>`;
      }).join("")}</tbody></table>`;
    } catch (e) { fail(e, "Could not load graph"); }
  }
  $("#lf").onsubmit = async ev => {
    ev.preventDefault();
    const list = v => v.split(",").map(s => s.trim()).filter(Boolean).map(name => ({ name }));
    try {
      await api("/v1/lineage", { method: "POST", body: { job_name: $("#l-job").value.trim(), run_state: $("#l-state").value, input_datasets: list($("#l-in").value), output_datasets: list($("#l-out").value) } });
      toast("Lineage event recorded", "ok"); const j = $("#l-job").value.trim(); $("#lf").reset(); await loadJobs(j);
    } catch (e) { fail(e, "Could not record event"); }
  };
  $("#l-up").onclick = async () => {
    const f = $("#l-file").files[0]; if (!f) return toast("Choose a .yml file first", "error");
    const fd = new FormData(); fd.append("file", f);
    try { const r = await api("/v1/lineage/ingest-yaml", { method: "POST", form: fd }); toast("Manifest ingested", "ok", r.message); await loadJobs(); } catch (e) { fail(e, "Upload failed"); }
  };
  $("#l-tpl").onclick = () => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([YAML_TEMPLATE], { type: "text/yaml" })); a.download = "lineage_manifest_template.yml"; a.click();
  };
  await loadJobs();
}

// ───────────────────────────── access control ─────────────────────────────
async function pageAccess() {
  if (!S.matrix) S.matrix = (await api("/v1/access-matrix")).policies;
  const me = S.user.role;
  const cell = (r, s, o) => can(r, s, o) ? `<span class="yes">✓</span>` : `<span class="no">✕</span>`;
  $("#page").innerHTML = `
    <div class="notice n-info">You are signed in as <b>${esc(ROLE_LABEL[me])}</b>. Every request is checked against this matrix and recorded in the <a href="#/audit">audit log</a>. Cells show whether a role may perform an operation on data of each sensitivity level.</div>
    <div class="grid g3">${ROLES.map(r => `<div class="card role-card ${r === me ? "me" : ""}"><div class="card-h"><h3>${ROLE_LABEL[r]}</h3>${r === me ? `<span class="badge b-Internal">You</span>` : ""}</div>
      <div class="card-b" style="padding:10px 14px"><table class="mx"><thead><tr><th></th>${SENS.map(s => `<th>${{ Public: "Public", Internal: "Internal", Confidential: "Confid.", Restricted: "Restr." }[s]}</th>`).join("")}</tr></thead><tbody>
        ${OPS.map(([o, l]) => `<tr><td>${l}</td>${SENS.map(s => `<td>${cell(r, s, o)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`).join("")}
      <div class="card"><div class="card-h"><h3>Live permission check</h3></div><div class="card-b">
        <div style="margin-bottom:10px"><label class="f">Role</label><select id="pc-r">${ROLES.map(r => `<option value="${r}" ${r === me ? "selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select></div>
        <div style="margin-bottom:10px"><label class="f">Sensitivity</label><select id="pc-s">${SENS.map(s => `<option>${s}</option>`).join("")}</select></div>
        <div style="margin-bottom:14px"><label class="f">Operation</label><select id="pc-o">${OPS.map(([o, l]) => `<option value="${o}">${l}</option>`).join("")}</select></div>
        <div id="pc-out" style="font-size:16px;font-weight:800"></div></div></div></div>`;
  const upd = () => { const ok = can($("#pc-r").value, $("#pc-s").value, $("#pc-o").value); $("#pc-out").innerHTML = ok ? `<span class="yes">✓ ALLOW</span>` : `<span class="no">✕ DENY</span>`; };
  ["pc-r", "pc-s", "pc-o"].forEach(id => $("#" + id).onchange = upd); upd();
}

// ───────────────────────────── audit ─────────────────────────────
async function pageAudit() {
  $("#page").innerHTML = `
    <div class="filters">
      <select id="a-res"><option value="">All results</option><option>ALLOW</option><option>DENY</option></select>
      <select id="a-op"><option value="">All operations</option>${OPS.map(([o, l]) => `<option value="${o}">${l}</option>`).join("")}</select>
      <input id="a-user" placeholder="User email">
      <select id="a-lim"><option>25</option><option selected>50</option><option>100</option><option>200</option></select>
      <button class="btn btn-s" id="a-go">Refresh</button>
      <label class="check"><input type="checkbox" id="a-auto"> Auto-refresh (5 s)</label>
    </div>
    <div class="notice n-info">The audit log is append-only. Each entry stores a SHA-256 hash chained to the previous entry so tampering can be detected.</div>
    <div class="card" id="a-card"><div class="loading">Loading…</div></div>`;
  async function load() {
    const q = new URLSearchParams({ limit: $("#a-lim").value });
    if ($("#a-res").value) q.set("result", $("#a-res").value); if ($("#a-op").value) q.set("operation", $("#a-op").value); if ($("#a-user").value.trim()) q.set("user_email", $("#a-user").value.trim());
    try {
      const r = await api("/v1/audit?" + q);
      $("#a-card").innerHTML = r.entries.length ? `<table class="t compact"><thead><tr><th>Time</th><th>User</th><th>Role</th><th>Operation</th><th>Result</th><th>Dataset</th><th>IP</th></tr></thead><tbody>
        ${r.entries.map(e => `<tr><td class="small" style="white-space:nowrap">${fmtDate(e.event_time)}</td><td>${esc(e.user_email)}</td><td class="small">${esc(ROLE_LABEL[e.user_role] || e.user_role)}</td><td>${esc(e.operation)}</td>
          <td><span class="badge b-${esc(e.result)}">${esc(e.result)}</span></td><td class="mono small">${e.dataset_id ? esc(String(e.dataset_id).slice(0, 8)) + "…" : "—"}</td><td class="small">${esc(e.ip_address || "—")}</td></tr>`).join("")}</tbody></table>`
        : `<div class="empty"><b>No entries match</b>Adjust the filters.</div>`;
    } catch (e) { $("#a-card").innerHTML = `<div class="empty"><b>Cannot load audit log</b>${esc(e.message)}</div>`; }
  }
  $("#a-go").onclick = load; ["a-res", "a-op", "a-lim"].forEach(id => $("#" + id).onchange = load);
  $("#a-user").onkeydown = e => { if (e.key === "Enter") load(); };
  $("#a-auto").onchange = e => { clearInterval(auditTimer); if (e.target.checked) auditTimer = setInterval(load, 5000); };
  await load();
}

// ───────────────────────────── policy templates ─────────────────────────────
function md(src) {
  const inl = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>");
  const L = src.replace(/\r/g, "").split("\n"), out = []; let i = 0;
  const isTable = k => /^\s*\|.*\|\s*$/.test(L[k] || "") && /^\s*\|[\s:\-|]+\|\s*$/.test(L[k + 1] || "");
  const block = k => /^(#{1,5})\s/.test(L[k]) || /^\s*[-*]\s+/.test(L[k]) || /^\s*\d+\.\s+/.test(L[k]) || /^\s*---+\s*$/.test(L[k]) || /^>/.test(L[k]) || isTable(k);
  while (i < L.length) {
    const l = L[i]; let m;
    if (!l.trim()) { i++; continue; }
    if (/^\s*---+\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if ((m = l.match(/^(#{1,5})\s+(.*)/))) { const n = Math.min(m[1].length + 1, 5); out.push(`<h${n}>${inl(m[2])}</h${n}>`); i++; continue; }
    if (isTable(i)) {
      const cells = s => s.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const head = cells(L[i]); i += 2; const rows = [];
      while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) { rows.push(cells(L[i])); i++; }
      out.push(`<table><thead><tr>${head.map(c => `<th>${inl(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inl(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`); continue;
    }
    if (/^\s*[-*]\s+/.test(l)) { const it = []; while (i < L.length && /^\s*[-*]\s+/.test(L[i])) { it.push(L[i].replace(/^\s*[-*]\s+/, "")); i++; } out.push(`<ul>${it.map(x => `<li>${inl(x)}</li>`).join("")}</ul>`); continue; }
    if (/^\s*\d+\.\s+/.test(l)) { const it = []; while (i < L.length && /^\s*\d+\.\s+/.test(L[i])) { it.push(L[i].replace(/^\s*\d+\.\s+/, "")); i++; } out.push(`<ol>${it.map(x => `<li>${inl(x)}</li>`).join("")}</ol>`); continue; }
    if (/^>/.test(l)) { const it = []; while (i < L.length && /^>/.test(L[i])) { it.push(L[i].replace(/^>\s?/, "")); i++; } out.push(`<blockquote>${inl(it.join(" "))}</blockquote>`); continue; }
    const p = []; while (i < L.length && L[i].trim() && !block(i)) { p.push(L[i]); i++; } if (!p.length) { p.push(L[i]); i++; } out.push(`<p>${inl(p.join(" "))}</p>`);
  }
  return out.join("\n");
}
async function pagePolicies() {
  const list = (await api("/v1/policy-templates")).templates;
  $("#page").innerHTML = `<div class="layout-2"><div class="card"><div class="card-h"><h3>Templates</h3></div><ul class="joblist" id="pl">${list.map(t => `<li data-n="${esc(t.name)}"><div class="jn">${esc(t.title)}</div><div class="small muted">${esc(t.name)}</div></li>`).join("")}</ul></div>
    <div class="card"><div class="card-b md" id="pv"><div class="loading">Select a template</div></div></div></div>`;
  async function show(n) {
    $$("#pl li").forEach(li => li.classList.toggle("active", li.dataset.n === n));
    try { const r = await api("/v1/policy-templates/" + encodeURIComponent(n)); $("#pv").innerHTML = md(r.markdown); } catch (e) { fail(e); }
  }
  $$("#pl li").forEach(li => li.onclick = () => show(li.dataset.n));
  if (list.length) show(list[0].name); else $("#pv").innerHTML = `<div class="empty"><b>No templates found</b></div>`;
}

// ───────────────────────────── stewards ─────────────────────────────
async function pageStewards() {
  $("#page").innerHTML = `<div class="grid g2" style="grid-template-columns:1.6fr 1fr;align-items:start">
    <div class="card" id="s-card"><div class="loading">Loading…</div></div>
    <div class="card"><div class="card-h"><h3>Add a data steward</h3></div><div class="card-b"><form id="sf">
      <div style="margin-bottom:12px"><label class="f">Name *</label><input id="s-n" required></div>
      <div style="margin-bottom:12px"><label class="f">Email *</label><input id="s-e" type="email" required></div>
      <div style="margin-bottom:12px"><label class="f">Role / title *</label><input id="s-r" placeholder="Data Steward — Finance" required></div>
      <div style="margin-bottom:14px"><label class="f">Department</label><input id="s-d"></div>
      <button class="btn btn-p">Add steward</button></form></div></div></div>`;
  async function load() {
    const list = await api("/v1/stewards");
    $("#s-card").innerHTML = list.length ? `<table class="t"><thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Email</th></tr></thead><tbody>${list.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.role)}</td><td>${esc(s.department || "—")}</td><td>${esc(s.email)}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty"><b>No stewards yet</b>Add the people accountable for data quality — assigning one to a dataset raises its FAIR score.</div>`;
  }
  $("#sf").onsubmit = async ev => {
    ev.preventDefault();
    try { await api("/v1/stewards", { method: "POST", body: { name: $("#s-n").value.trim(), email: $("#s-e").value.trim(), role: $("#s-r").value.trim(), department: $("#s-d").value.trim() || null } }); toast("Steward added", "ok"); $("#sf").reset(); await load(); } catch (e) { fail(e, "Could not add steward"); }
  };
  await load();
}

// ───────────────────────────── start ─────────────────────────────
(async function init() {
  if (S.token && !S.matrix) { try { S.matrix = (await api("/v1/access-matrix")).policies; } catch { /* session may have expired */ } }
  route();
})();
