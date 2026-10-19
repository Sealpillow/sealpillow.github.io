/*
 * Ledger Local — a private, offline finance tracker.
 * All data is stored only in this browser's IndexedDB — encrypted (AES-GCM, key from
 * PBKDF2-SHA256) if the user sets a passphrase, plain otherwise. The page's Content-Security-Policy sets connect-src 'none',
 * so no code on this page can send data over the network.
 */
'use strict';

/* =====================================================================
 * 1. Small DOM helpers (no innerHTML with user data — everything is text nodes)
 * ===================================================================== */
const $ = (s, root = document) => root.querySelector(s);

function el(tag, props, ...children) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') e[k] = v;
      else e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : String(c));
  }
  return e;
}

const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...children) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, String(v));
  for (const c of children.flat(Infinity)) if (c != null) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

// action: optional { label, run } shown as a button (e.g. Undo); such toasts stay up longer.
function toast(msg, action) {
  const t = $('#toast');
  const hide = () => { t.classList.remove('toast--show'); toast.action = null; };
  t.replaceChildren(el('span', { text: msg }), ...(action ? [el('button', { class: 'toast__btn', type: 'button', text: action.label, onclick: () => { hide(); action.run(); } })] : []));
  toast.action = action || null;
  t.classList.add('toast--show');
  clearTimeout(toast._t);
  toast._t = setTimeout(hide, action ? 7000 : 2600);
  toast.hide = hide;
}

/* =====================================================================
 * 2. Formatting & parsing
 * ===================================================================== */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + num(f(x)), 0);

let _fmt = null;
function money(n, opts = {}) {
  if (n == null || !isFinite(n)) return '–';
  const s = S?.settings || {};
  const key = (s.currency || 'SGD') + (s.locale || 'en-SG') + (opts.compact ? 'c' : '');
  if (!_fmt || _fmt.key !== key) {
    try {
      _fmt = {
        key,
        f: new Intl.NumberFormat(s.locale || 'en-SG', {
          style: 'currency',
          currency: s.currency || 'SGD',
          maximumFractionDigits: opts.compact ? 0 : 2,
          minimumFractionDigits: opts.compact ? 0 : 2,
        }),
      };
    } catch {
      _fmt = { key, f: new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }) };
    }
  }
  return _fmt.f.format(n);
}
const pct = (n, d = 1) => (n == null || !isFinite(n) ? '–' : (n * 100).toFixed(d) + '%');

/** Parses "$4,500.00", "30.0%", "(1,200)", "1 200,50" style values from CSV. */
function parseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s || s === '-' || s === '–') return null;
  const isPct = s.endsWith('%');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[^\d.,\-]/g, '');
  if (s.includes(',') && !s.includes('.') && /,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  s = s.replace(/,/g, '');
  let n = parseFloat(s);
  if (!isFinite(n)) return null;
  if (neg) n = -n;
  return isPct ? n / 100 : n;
}

/* ---- months / dates (all local, as YYYY-MM / YYYY-MM-DD strings) ---- */
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const thisMonth = () => todayISO().slice(0, 7);
function addMonths(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
function monthDiff(a, b) { // b - a in months
  const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(ym) { if (!ym) return '–'; const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y}`; }
function dateLabel(iso) { if (!iso) return '–'; const [y, m, d] = iso.split('-'); return `${+d} ${MONTHS[+m - 1]} ${y}`; }
function normDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (m) return m[3] ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : `${m[1]}-${pad(m[2])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // d/m/yyyy (SG format)
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  const d = new Date(s);
  if (!isNaN(d)) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return '';
}
function daysBetween(isoA, isoB) { return Math.round((new Date(isoB) - new Date(isoA)) / 86400000); }
const uid = () => crypto.getRandomValues(new Uint32Array(2)).join('-');

/* =====================================================================
 * 3. Encryption + IndexedDB vault
 * ===================================================================== */
const VAULT = {
  DB: 'ledger-local',
  STORE: 'vault',
  KEY: 'main',
  ITER: 600000,

  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(this.DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(this.STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async get() {
    const db = await this.open();
    return new Promise((res, rej) => {
      const r = db.transaction(this.STORE).objectStore(this.STORE).get(this.KEY);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  },
  async put(rec) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      tx.objectStore(this.STORE).put(rec, this.KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async wipe() {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      tx.objectStore(this.STORE).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
};

// Chunked: spreading a whole buffer into fromCharCode hits Safari's ~65k argument limit on large vaults.
function b64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
async function sealData(key, meta, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { app: 'ledger-local', v: 1, kdf: 'PBKDF2-SHA256', iter: meta.iter, salt: meta.salt, iv: b64(iv), ct: b64(ct), savedAt: new Date().toISOString() };
}
/** Encrypted record when a passphrase is set, otherwise a plain one. */
async function seal(data) {
  if (!KEY) return { app: 'ledger-local', v: 1, plain: true, data, savedAt: new Date().toISOString() };
  return sealData(KEY, META, data);
}
async function setPassphrase(pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  META = { salt: b64(salt), iter: VAULT.ITER };
  KEY = await deriveKey(pass, salt, VAULT.ITER);
  await persist();
}
const LOCAL_HOST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
async function openSealed(rec, pass) {
  const key = await deriveKey(pass, unb64(rec.salt), rec.iter);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, unb64(rec.ct));
  return { key, data: JSON.parse(new TextDecoder().decode(pt)), meta: { salt: rec.salt, iter: rec.iter } };
}

/* =====================================================================
 * 4. Data model & defaults
 * ===================================================================== */
// Singapore resident rates, YA2024 onwards (IRAS). Editable in the app.
const DEFAULT_TAX = [
  [0, 0], [20000, 0.02], [30000, 0.035], [40000, 0.07], [80000, 0.115], [120000, 0.15],
  [160000, 0.18], [200000, 0.19], [240000, 0.195], [280000, 0.2], [320000, 0.22],
  [500000, 0.23], [1000000, 0.24],
].map(([lower, rate]) => ({ id: uid(), lower, rate }));

// CPF contribution & allocation schedule (private sector, SC / 3rd-yr SPR). Editable in Settings.
// oa / ma are shares of the total contribution; SA (or RA from 55) gets the rest.
function cpfRows(from, rows) {
  return rows.map(([ageAbove, ageUpTo, ee, er, oa, ma]) => ({ id: uid(), from, ageAbove, ageUpTo, ee, er, oa, ma, oaRate: 0.025, samaRate: 0.04 }));
}
const DEFAULT_CPF = [
  ...cpfRows('2025-01-01', [
    [-1, 35, 0.2, 0.17, 0.622, 0.2162], [35, 45, 0.2, 0.17, 0.568, 0.2432], [45, 50, 0.2, 0.17, 0.514, 0.2703], [50, 55, 0.2, 0.17, 0.406, 0.2838],
    [55, 60, 0.17, 0.155, 0.369, 0.3231], [60, 65, 0.115, 0.12, 0.149, 0.4468], [65, 70, 0.075, 0.09, 0.061, 0.6364], [70, 200, 0.05, 0.075, 0.08, 0.84],
  ]),
  ...cpfRows('2026-01-01', [
    [-1, 35, 0.2, 0.17, 0.622, 0.2162], [35, 45, 0.2, 0.17, 0.568, 0.2432], [45, 50, 0.2, 0.17, 0.514, 0.2703], [50, 55, 0.2, 0.17, 0.406, 0.2838],
    [55, 60, 0.18, 0.16, 0.353, 0.3088], [60, 65, 0.125, 0.125, 0.14, 0.42], [65, 70, 0.075, 0.09, 0.061, 0.6364], [70, 200, 0.05, 0.075, 0.08, 0.84],
  ]),
];

const RELIEF_PRESETS = [
  { name: 'Parent Relief (living with parent)', amount: 9000 },
  { name: 'Parent Relief (not living with parent)', amount: 5500 },
  { name: 'NSman Relief (active NS activities)', amount: 3000 },
  { name: 'NSman Relief (key command/staff)', amount: 5000 },
  { name: 'NSman Relief (no NS activities)', amount: 1500 },
  { name: 'SRS contributions (cap 15,300)', amount: 0 },
  { name: 'CPF cash top-up — self (cap 8,000)', amount: 0 },
  { name: 'CPF cash top-up — family (cap 8,000)', amount: 0 },
  { name: 'Other relief', amount: 0 },
];

function defaultData() {
  return {
    version: 1,
    settings: {
      currency: 'SGD',
      locale: 'en-SG',
      cpfEnabled: true,
      startCash: 0,
      goalName: 'Savings goal',
      goalAmount: 0,
      cpfStart: { oa: 0, sa: 0, ma: 0 },
      birthMonth: '', // 'YYYY-MM'; when set, age is worked out per month instead of read from Assumptions
      cpfExtraRate: 0.01,
      owCeiling: 8000,
      bankBalance: null,
      bankBalanceDate: '',
      autoLockMin: 10,
      ledgerCompact: true, // ledger shows key columns; the full spreadsheet view is one click away
      lastBackup: null,
      reliefCap: 80000,
      donationMultiplier: 2.5,
    },
    assumptions: [],
    // Copies, so editing a vault's tables never changes the built-in defaults.
    cpfSchedule: structuredClone(DEFAULT_CPF),
    ledger: [],
    deposits: [],
    portfolio: [],
    liabilities: [],
    policies: [],
    taxBrackets: structuredClone(DEFAULT_TAX),
    reliefs: {}, // { "2026": [{id, name, amount}] }
    donations: {}, // { "2026": amount }
    checks: {}, // { "2026-10": { key: true } } manual ticks
  };
}

function migrate(d) {
  const base = defaultData();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  out.settings.cpfStart = { ...base.settings.cpfStart, ...(d.settings?.cpfStart || {}) };
  for (const k of ['assumptions', 'ledger', 'deposits', 'portfolio', 'liabilities', 'policies']) if (!Array.isArray(out[k])) out[k] = [];
  if (!Array.isArray(out.cpfSchedule) || !out.cpfSchedule.length) out.cpfSchedule = base.cpfSchedule;
  if (!Array.isArray(out.taxBrackets) || !out.taxBrackets.length) out.taxBrackets = base.taxBrackets;
  // Older vaults had one MA allocation for every age (settings.maAlloc). Give each schedule row its band's
  // default; rows that match no default band keep the old single value.
  const oldMa = out.settings.maAlloc ?? 0.2162;
  for (const r of out.cpfSchedule) {
    if (r.ma != null) continue;
    const match = DEFAULT_CPF.find((x) => x.from === r.from && x.ageAbove === r.ageAbove && x.ageUpTo === r.ageUpTo);
    r.ma = match ? match.ma : oldMa;
  }
  delete out.settings.maAlloc;
  return out;
}

/* =====================================================================
 * 5. Calculations (mirrors the spreadsheet's logic)
 * ===================================================================== */
const byKey = (k) => (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0);

/** Assumption in force for a worked month: latest row whose Effective Date is on/before the 1st of that month. */
function assumptionFor(ym) {
  const rows = [...S.assumptions].filter((a) => a.effective).sort(byKey('effective'));
  if (!rows.length) return null;
  const first = ym + '-01';
  let best = null;
  for (const a of rows) if (a.effective <= first) best = a;
  return best || rows[0];
}

/**
 * Age used for a month. With a birth month set it is worked out every month and is fractional on
 * purpose: CPF moves you to the next band from the month *after* your birthday month, so someone born
 * in March is exactly 35 in March 2025 (still "35 and below") and just above 35 from April.
 * Without a birth month, the Age typed on the Assumptions row is used.
 */
function ageAt(ym, a) {
  const b = S.settings.birthMonth;
  return b ? monthDiff(b, ym) / 12 : num(a?.age);
}
/** IRAS age-based reliefs go by the age reached during the income year. */
function ageInYear(yy, a) {
  const b = S.settings.birthMonth;
  return b ? +yy - +b.slice(0, 4) : num(a?.age);
}
/** First month after `ym` (within 40 years) where the CPF age band changes, or null. */
function nextBandChange(ym) {
  const bandOf = (m) => cpfFor(m, ageAt(m)).ageAbove;
  const now = bandOf(ym);
  for (let k = 1; k <= 480; k++) {
    const m = addMonths(ym, k);
    if (bandOf(m) !== now) return { month: m, band: cpfFor(m, ageAt(m)) };
  }
  return null;
}

/** CPF rates for an age at a month: latest schedule whose "from" ≤ month, with ageAbove < age ≤ ageUpTo. */
function cpfFor(ym, age) {
  const first = ym + '-01';
  const sched = S.cpfSchedule.filter((r) => r.from && r.from <= first);
  const pool = sched.length ? sched : S.cpfSchedule;
  const latest = pool.reduce((m, r) => (r.from > m ? r.from : m), '');
  const band = pool.find((r) => r.from === latest && num(age) > num(r.ageAbove) && num(age) <= num(r.ageUpTo));
  return band || { ee: 0, er: 0, oa: 0, ma: 0, oaRate: 0, samaRate: 0 };
}

function taxTable() {
  const rows = [...S.taxBrackets].filter((r) => r.lower != null).sort((a, b) => a.lower - b.lower);
  let base = 0;
  return rows.map((r, i) => {
    if (i > 0) base += (r.lower - rows[i - 1].lower) * num(rows[i - 1].rate);
    return { ...r, base };
  });
}
function taxOn(income, table = taxTable()) {
  if (!(income > 0) || !table.length) return 0;
  let row = table[0];
  for (const r of table) if (r.lower <= income) row = r;
  return Math.max(0, row.base + (income - row.lower) * num(row.rate));
}
function earnedIncomeRelief(age) { return age >= 60 ? 8000 : age >= 55 ? 6000 : 1000; }
function reliefTotal(year) {
  const list = S.reliefs[year] || [];
  const r = Math.min(num(S.settings.reliefCap) || Infinity, sum(list, (x) => x.amount));
  return r + num(S.donations[year]) * num(S.settings.donationMultiplier);
}

function premiumsFor(ym) {
  let total = 0;
  const items = [];
  for (const p of S.policies) {
    if (!p.start) continue;
    const [sy, sm] = p.start.split('-').map(Number);
    const [y, m] = ym.split('-').map(Number);
    const k = y - sy;
    if (m === sm && k >= 0 && k < num(p.years || 1)) {
      const actual = p.actual?.[k];
      const amt = actual != null && actual !== '' ? num(actual) : num(p.premium);
      total += amt;
      items.push({ policy: p.name, year: k + 1, amount: amt });
    }
  }
  return { total, items };
}

/**
 * Compute every ledger month in order. `extraMonth` adds a virtual row (used for "this month" on the dashboard).
 */
function computeLedger(extraMonth) {
  const st = S.settings;
  const entries = [...S.ledger].sort(byKey('month'));
  if (extraMonth && !entries.some((e) => e.month >= extraMonth)) entries.push({ id: '_virtual', month: extraMonth, virtual: true });
  entries.sort(byKey('month'));
  const table = taxTable();
  let oa = num(st.cpfStart.oa), sa = num(st.cpfStart.sa), ma = num(st.cpfStart.ma);
  const cum = { after: 0, salary: 0, savings: 0, ee: 0, er: 0, exp: 0, food: 0, transport: 0, parents: 0, tax: 0, others: 0, invest: 0, insurance: 0, maDed: 0 };
  const ytdAfter = {};
  const rows = [];
  for (const e of entries) {
    const a = assumptionFor(e.month) || {};
    const ov = (k, dflt) => (e[k] != null && e[k] !== '' ? num(e[k]) : dflt);
    const age = ageAt(e.month, a);
    const c = st.cpfEnabled ? cpfFor(e.month, age) : { ee: 0, er: 0, oa: 0, ma: 0, oaRate: 0, samaRate: 0 };
    const salary = ov('salary', num(a.salary));
    const bonus = num(e.bonus);
    const ceiling = num(st.owCeiling);
    const cpfBase = (ceiling > 0 ? Math.min(salary, ceiling) : salary) + bonus;
    const ee = round2(cpfBase * num(c.ee));
    const er = round2(cpfBase * num(c.er));
    const after = salary + bonus - ee;
    const workDays = ov('workDays', num(a.workDays));
    const food = ov('food', num(a.foodDay) * workDays);
    const transport = ov('transport', num(a.transportDay) * workDays);
    const parents = ov('parents', num(a.parents));
    const others = ov('others', num(a.others));
    const invest = ov('invest', after * num(a.investPct));
    const prem = premiumsFor(e.month);
    const extras = sum(e.extras || [], (x) => x.amount);

    // Income tax: projected chargeable income for the calendar year ÷ 12 (same as the sheet's column K).
    const [yy, mm] = e.month.split('-').map(Number);
    ytdAfter[yy] = (ytdAfter[yy] || 0) + after;
    const projected = ytdAfter[yy] + (ceiling > 0 ? Math.min(salary, ceiling) * (1 - num(c.ee)) + Math.max(0, salary - ceiling) : salary * (1 - num(c.ee))) * (12 - mm);
    const chargeable = Math.max(0, projected - earnedIncomeRelief(ageInYear(yy, a)) - reliefTotal(yy));
    const tax = e.tax != null && e.tax !== '' ? num(e.tax) : round2(taxOn(chargeable, table) / 12);

    const expenditure = food + transport + parents + others + tax + prem.total + extras;
    const savings = after - expenditure - invest;

    // CPF balances (monthly approximation of CPF interest incl. 1% extra on first $60k, max $20k from OA)
    const total = ee + er;
    const x = num(st.cpfExtraRate) / 12;
    const maAlloc = num(c.ma);
    const eOA = Math.min(oa, 20000);
    const eSA = Math.min(sa, 60000 - eOA);
    const eMA = Math.min(ma, Math.max(60000 - eOA - sa, 0));
    const maDed = num(e.maDed);
    const nOA = oa * (1 + num(c.oaRate) / 12) + total * num(c.oa);
    const nSA = sa * (1 + num(c.samaRate) / 12) + eOA * x + eSA * x + total * Math.max(0, 1 - num(c.oa) - maAlloc);
    const nMA = ma * (1 + num(c.samaRate) / 12) + eMA * x + total * maAlloc - maDed;
    if (st.cpfEnabled) { oa = nOA; sa = nSA; ma = nMA; }

    if (!e.virtual) {
      cum.after += after; cum.salary += salary + bonus; cum.savings += savings; cum.ee += ee; cum.er += er;
      cum.exp += expenditure; cum.food += food; cum.transport += transport; cum.parents += parents;
      cum.tax += tax; cum.others += others; cum.invest += invest; cum.insurance += prem.total; cum.maDed += maDed;
    }
    rows.push({
      entry: e, month: e.month, virtual: !!e.virtual, assumption: a, age, rates: c,
      salary, bonus, ee, er, after, workDays, food, transport, parents, others, invest, tax, chargeable, projected,
      insurance: prem.total, insuranceItems: prem.items, extras, expenditure, savings,
      savingsRate: after ? savings / after : 0,
      oa, sa, ma, cpfTotal: oa + sa + ma, maDed,
      cum: { ...cum },
      cash: num(st.startCash) + cum.savings,
      overrides: ['salary', 'workDays', 'food', 'transport', 'parents', 'others', 'invest', 'tax'].filter((k) => e[k] != null && e[k] !== ''),
    });
  }
  return rows;
}

function summary() {
  const st = S.settings;
  const rows = computeLedger();
  const last = rows[rows.length - 1] || null;
  const deposits = sum(S.deposits, (d) => d.amount);
  const planned = last ? last.cum.invest : 0;
  const extraInvested = deposits - planned;
  const pv = [...S.portfolio].filter((p) => p.date).sort(byKey('date'));
  const portfolio = pv.length ? num(pv[pv.length - 1].value) : 0;
  const liabilities = sum(S.liabilities, (l) => l.balance);
  const cumSavings = last ? last.cum.savings : 0;
  const cpf = st.cpfEnabled ? (last ? last.cpfTotal : num(st.cpfStart.oa) + num(st.cpfStart.sa) + num(st.cpfStart.ma)) : 0;
  const netWorth = num(st.startCash) + cumSavings + portfolio + cpf - liabilities - extraInvested;
  const liquid = netWorth - cpf;
  const saved = num(st.startCash) + cumSavings + portfolio - extraInvested;
  const recent = rows.slice(-12);
  const pace = recent.length ? sum(recent, (r) => r.savings + r.invest) / recent.length : 0;
  const remaining = Math.max(0, num(st.goalAmount) - saved);
  const monthsToGoal = remaining <= 0 ? 0 : pace > 0 ? Math.ceil(remaining / pace) : null;
  const expectedCash = num(st.startCash) + cumSavings - extraInvested;
  return {
    rows, last, deposits, planned, extraInvested, portfolio, portfolioDate: pv.length ? pv[pv.length - 1].date : null,
    liabilities, cumSavings, cpf, netWorth, liquid, saved, pace, remaining, monthsToGoal,
    goalMonth: monthsToGoal != null ? addMonths(thisMonth(), monthsToGoal) : null,
    progress: num(st.goalAmount) > 0 ? Math.min(1, saved / num(st.goalAmount)) : null,
    expectedCash,
  };
}

/** Months to pay off: NPER(rate/12, -payment, balance). Null if the payment never covers interest. */
function payoff(l) {
  const B = num(l.balance), P = num(l.payment), r = num(l.rate) / 12;
  if (B <= 0) return { months: 0 };
  if (P <= 0) return { months: null };
  let n;
  if (r === 0) n = B / P;
  else {
    if (P <= B * r) return { months: null };
    n = -Math.log(1 - (r * B) / P) / Math.log(1 + r);
  }
  const months = Math.ceil(n);
  return { months, date: addMonths(thisMonth(), months), interest: Math.max(0, n * P - B) };
}

function checklist(sm) {
  const items = [];
  const now = thisMonth();
  const lastWorked = addMonths(now, -1);
  const has = (ym) => S.ledger.some((e) => e.month === ym);
  if (S.assumptions.length === 0) {
    items.push({ ok: false, text: 'Add your first assumptions row', detail: 'Salary, CPF age, daily food/transport, investment % — on the Assumptions page.', go: 'assumptions', cta: 'Add' });
  }
  items.push(has(lastWorked)
    ? { ok: true, text: `Ledger row for ${monthLabel(lastWorked)} added` }
    : { ok: false, text: `Add the ledger row for ${monthLabel(lastWorked)}`, detail: 'Do this when the payslip for that month arrives.', go: 'ledger', cta: 'Add month' });
  const depThisMonth = S.deposits.some((d) => (d.date || '').slice(0, 7) === now);
  items.push(depThisMonth
    ? { ok: true, text: `Investment deposit logged for ${monthLabel(now)}` }
    : { ok: false, text: `Log this month's investment deposit`, detail: 'Skip if you did not invest this month.', go: 'investments', cta: 'Log' });
  if (S.portfolio.length) {
    const age = daysBetween(sm.portfolioDate, todayISO());
    items.push(age <= 35
      ? { ok: true, text: 'Portfolio value is up to date', detail: `Last updated ${dateLabel(sm.portfolioDate)}` }
      : { ok: false, text: 'Update your portfolio value', detail: `Last updated ${dateLabel(sm.portfolioDate)} (${age} days ago)`, go: 'investments', cta: 'Update' });
  }
  for (const p of S.policies) {
    if (!p.start) continue;
    const [sy, sm2] = p.start.split('-').map(Number);
    for (let k = 0; k < num(p.years); k++) {
      const due = `${sy + k}-${pad(sm2)}`;
      const diff = monthDiff(now, due);
      const paid = p.actual?.[k] != null && p.actual[k] !== '';
      if (diff >= -2 && diff <= 1 && !paid) {
        items.push({ ok: false, text: `${p.name || 'Policy'}: premium ${diff >= 0 ? 'due' : 'was due'} ${monthLabel(due)}`, detail: `Expected ${money(num(p.premium))}. Log Actual Paid when you pay.`, go: 'insurance', cta: 'Log' });
      }
    }
  }
  if (S.settings.bankBalance != null && S.settings.bankBalance !== '') {
    const diff = num(S.settings.bankBalance) - sm.expectedCash;
    const ok = Math.abs(diff) < Math.max(100, Math.abs(sm.expectedCash) * 0.02);
    items.push({ ok, text: ok ? 'Bank balance matches expected cash' : 'Bank balance differs from expected cash', detail: `Actual ${money(num(S.settings.bankBalance))} vs expected ${money(sm.expectedCash)} (${diff >= 0 ? '+' : ''}${money(diff)})`, go: ok ? null : 'networth', cta: 'Review' });
  }
  const lb = S.settings.lastBackup;
  const bAge = lb ? daysBetween(lb.slice(0, 10), todayISO()) : null;
  items.push(lb && bAge <= 30
    ? { ok: true, text: 'Backup is recent', detail: `Last exported ${dateLabel(lb.slice(0, 10))}` }
    : { ok: false, text: 'Export a backup', detail: lb ? `Last backup ${bAge} days ago.` : 'Clearing browser data would erase everything without one.', go: 'data', cta: 'Back up now' });
  return items;
}

/* =====================================================================
 * 6. App state, saving, locking
 * ===================================================================== */
let S = null; // decrypted data (memory only)
let KEY = null; // CryptoKey (non-extractable)
let META = null; // { salt, iter }
let saveTimer = null;
let lastActivity = Date.now();

// defer: re-render after the current event finishes, so a Tab/click that triggered a
// change event has already moved focus — render() then puts focus back on that field.
function commit({ rerender = true, defer = false } = {}) {
  clearTimeout(saveTimer);
  setStatus('Saving…');
  saveTimer = setTimeout(persist, 300);
  // An Undo snapshot is only safe while nothing else has changed since.
  if (toast.action) toast.hide();
  if (rerender) defer ? setTimeout(render) : render();
}

// Runs a destructive change and offers Undo, instead of asking "are you sure?" first.
function undoable(msg, mutate) {
  const before = structuredClone(S);
  mutate();
  commit();
  toast(msg, { label: 'Undo', run: () => { if (!S) return; S = before; commit(); toast('Restored'); } });
}
async function persist() {
  if (!S) return;
  try {
    await VAULT.put(await seal(S));
    setStatus(KEY ? 'Saved · encrypted on this device' : 'Saved on this device');
  } catch (err) {
    setStatus('Save failed');
    toast('Could not save: ' + err.message);
  }
}
function setStatus(t) { const s = $('#save-status'); if (s) s.textContent = t; }

function lock() {
  clearTimeout(saveTimer);
  const pending = S ? persist() : Promise.resolve();
  pending.finally(() => {
    S = null; KEY = null; META = null;
    $('#dlg').open && $('#dlg').close();
    if (toast.action) toast.hide();
    renderLock();
  });
}
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
setInterval(() => {
  // Locking only means something with a passphrase; without one the app would just reopen.
  if (S && KEY && num(S.settings.autoLockMin) > 0 && Date.now() - lastActivity > S.settings.autoLockMin * 60000) lock();
}, 15000);

/* =====================================================================
 * 7. Lock / create / restore screens
 * ===================================================================== */
async function renderLock() {
  const app = $('#app');
  app.replaceChildren();
  const rec = await VAULT.get().catch(() => null);
  const err = el('div', { class: 'lock__error' });
  const brand = el('div', { class: 'lock__title' }, el('span', { class: 'shell__brand-dot' }), 'Ledger Local', themeButton());

  if (rec?.plain) { // saved without a passphrase: open straight away
    KEY = null; META = null; S = migrate(rec.data);
    renderShell();
    return;
  }
  if (rec) {
    const pass = el('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Passphrase', 'aria-label': 'Passphrase' });
    const btn = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Unlock' });
    const form = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        btn.disabled = true; btn.textContent = 'Unlocking…'; err.textContent = '';
        try {
          const o = await openSealed(rec, pass.value);
          KEY = o.key; META = o.meta; S = migrate(o.data);
          lastActivity = Date.now();
          renderShell();
        } catch {
          err.textContent = 'Wrong passphrase — or the stored data is damaged.';
          btn.disabled = false; btn.textContent = 'Unlock';
        }
      },
    }, el('div', { class: 'field' }, pass), err, btn);
    app.append(el('div', { class: 'lock' }, el('div', { class: 'card lock__card' },
      brand,
      el('p', { class: 'muted', text: 'Your records are encrypted on this device. Enter your passphrase to open them.' }),
      form,
      el('div', { class: 'lock__links' },
        el('button', { class: 'link-btn', type: 'button', text: 'Restore from a backup file', onclick: () => restoreFlow(true) }),
        el('button', { class: 'link-btn', type: 'button', text: 'Erase data on this device', onclick: eraseFlow }),
      ),
    )));
    pass.focus();
    return;
  }

  const p1 = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'At least 10 characters', 'aria-label': 'New passphrase' });
  const p2 = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Type it again', 'aria-label': 'Confirm passphrase' });
  const passBox = el('div', { class: 'hide' },
    el('div', { class: 'field' }, el('label', { class: 'field__label', text: 'Choose a passphrase' }), p1),
    el('div', { class: 'field' }, el('label', { class: 'field__label', text: 'Confirm passphrase' }), p2),
    el('p', { class: 'field__hint', text: 'There is no reset. Forget the passphrase and the data cannot be recovered.' }),
  );
  const usePass = el('input', { type: 'checkbox', id: 'use-pass', onchange: () => { passBox.classList.toggle('hide', !usePass.checked); if (usePass.checked) p1.focus(); } });
  const sample = el('input', { type: 'checkbox', id: 'sample' });
  const btn = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Start' });
  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (usePass.checked) {
        if (p1.value.length < 10) { err.textContent = 'Use at least 10 characters (a short sentence works well).'; return; }
        if (p1.value !== p2.value) { err.textContent = 'The passphrases do not match.'; return; }
      }
      btn.disabled = true; btn.textContent = 'Starting…';
      S = sample.checked ? sampleData() : defaultData();
      if (usePass.checked) await setPassphrase(p1.value);
      else { KEY = null; META = null; await persist(); }
      lastActivity = Date.now();
      location.hash = '#/dashboard';
      renderShell();
    },
  },
  el('div', { class: 'field' }, el('label', { class: 'field__hint', for: 'sample' }, sample, ' Start with sample data (fictional numbers, to explore)')),
  el('div', { class: 'field' }, el('label', { class: 'field__hint', for: 'use-pass' }, usePass, ' Protect with a passphrase (encrypts your records)')),
  passBox,
  err, btn);

  app.append(el('div', { class: 'lock' }, el('div', { class: 'card lock__card' },
    brand,
    el('p', { class: 'muted', text: 'A private finance tracker that runs entirely in your browser.' }),
    el('ul', { class: 'lock__list' },
      el('li', { text: 'Records are stored only in this browser, on this device.' }),
      el('li', { text: 'This page is blocked from making network requests — nothing is uploaded.' }),
      el('li', { text: 'A passphrase is optional. You can add or remove one later in Settings & data.' }),
      el('li', { text: 'Export a backup regularly; clearing browser data erases your records.' }),
    ),
    LOCAL_HOST ? null : el('div', { class: 'notice', text: 'This copy runs on a shared website address. Without a passphrase, other pages on this domain could read your records. Set one, or run the app locally.' }),
    form,
    el('div', { class: 'lock__links' },
      el('button', { class: 'link-btn', type: 'button', text: 'Restore from a backup file', onclick: () => restoreFlow(true) }),
    ),
  )));
  btn.focus();
}

function pickFile(accept) {
  return new Promise((res) => {
    const i = el('input', { type: 'file', accept, class: 'hide' });
    i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); });
    document.body.append(i);
    i.click();
  });
}

async function restoreFlow(fromLock) {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  let rec;
  try { rec = JSON.parse(await file.text()); } catch { toast('That file is not a valid backup.'); return; }
  if (rec?.app !== 'ledger-local' || !(rec.ct || (rec.plain && rec.data))) { toast('That file is not a Ledger Local backup.'); return; }
  const saved = `Backup saved ${rec.savedAt ? dateLabel(rec.savedAt.slice(0, 10)) : ''}. Restoring replaces the data currently on this device.`;
  if (rec.plain) {
    openDialog('Restore backup', [el('p', { text: saved + ' This backup has no passphrase, so the restored records will not be encrypted.' })], [
      { label: 'Cancel' },
      {
        label: 'Restore', primary: true,
        run: async () => {
          KEY = null; META = null; S = migrate(rec.data);
          await persist();
          toast('Backup restored');
          lastActivity = Date.now();
          renderShell();
        },
      },
    ]);
    return;
  }
  const pass = el('input', { class: 'input', type: 'password', placeholder: 'Passphrase used for that backup' });
  const err = el('div', { class: 'lock__error' });
  openDialog('Restore backup', [
    el('p', { text: saved + ' Afterwards this device uses that backup’s passphrase.' }),
    el('div', { class: 'field' }, pass), err,
  ], [
    { label: 'Cancel' },
    {
      label: 'Restore', primary: true, keepOpen: true,
      run: async () => {
        try {
          const o = await openSealed(rec, pass.value);
          KEY = o.key; META = o.meta; S = migrate(o.data);
          await persist();
          $('#dlg').close();
          toast('Backup restored');
          lastActivity = Date.now();
          renderShell();
        } catch { err.textContent = 'Wrong passphrase for this backup.'; }
      },
    },
  ]);
  setTimeout(() => pass.focus(), 50);
  void fromLock;
}

function eraseFlow() {
  const conf = el('input', { class: 'input', placeholder: 'Type ERASE' });
  openDialog('Erase data on this device', [
    el('p', { text: 'This permanently deletes your records from this browser. Only an exported backup can bring it back.' }),
    el('div', { class: 'field' }, conf),
  ], [
    { label: 'Cancel' },
    {
      label: 'Erase', danger: true, keepOpen: true,
      run: async () => {
        if (conf.value.trim() !== 'ERASE') { toast('Type ERASE to confirm'); return; }
        await VAULT.wipe();
        S = null; KEY = null; META = null;
        $('#dlg').close();
        renderLock();
      },
    },
  ]);
}

/* =====================================================================
 * 8. Dialog
 * ===================================================================== */
function openDialog(title, body, buttons) {
  const d = $('#dlg');
  d.replaceChildren(
    el('h2', { text: title }),
    ...[body].flat(),
    el('div', { class: 'dialog__foot' }, buttons.map((b) => el('button', {
      class: 'btn' + (b.primary ? ' btn--primary' : '') + (b.danger ? ' btn--danger' : ''),
      type: 'button',
      text: b.label,
      onclick: async () => { if (b.run) await b.run(); if (!b.keepOpen) d.close(); },
    }))),
  );
  if (!d.open) d.showModal();
}

function confirmDialog(title, message, okLabel) {
  return new Promise((res) => {
    let ok = false;
    $('#dlg').addEventListener('close', () => res(ok), { once: true });
    openDialog(title, [el('p', { text: message })], [{ label: 'Cancel' }, { label: okLabel, primary: true, run: () => { ok = true; } }]);
  });
}

/* =====================================================================
 * 9. Generic editable table
 * ===================================================================== */
/**
 * cols: [{ key, label, type: 'text'|'money'|'number'|'pct'|'date'|'month', width, get?, readonly?, align? }]
 */
function editTable({ cols, rows, onDelete, emptyText = 'Nothing here yet.', totals }) {
  const head = el('tr', null, cols.map((c) => el('th', { class: 'table__th' + (c.type === 'text' || c.type === 'date' || c.type === 'month' ? ' table__th--left' : ''), text: c.label })), onDelete ? el('th', { class: 'table__th' }) : null);
  const body = rows.map((r) => el('tr', { class: 'table__row' },
    cols.map((c) => {
      if (c.readonly || c.get) {
        const v = c.get ? c.get(r) : r[c.key];
        const cls = 'table__td' + (c.type === 'text' || c.type === 'date' || c.type === 'month' ? ' table__td--left' : '') + (c.cls ? ' ' + c.cls(r) : '');
        const shown = v instanceof Node ? v : c.get && typeof v === 'string' ? v : fmtCell(v, c.type);
        return el('td', { class: cls }, shown);
      }
      return el('td', { class: 'table__td table__td--edit' }, inputFor(r, c));
    }),
    onDelete ? el('td', { class: 'table__td' }, el('button', { class: 'btn btn--icon btn--danger', type: 'button', title: 'Delete row', 'aria-label': 'Delete row', text: '×', onclick: () => onDelete(r) })) : null,
  ));
  const foot = totals ? el('tr', { class: 'table__row table__row--total' }, cols.map((c, i) => el('td', { class: 'table__td' + (i === 0 ? ' table__td--left' : '') }, totals[c.key] != null ? (totals[c.key] instanceof Node ? totals[c.key] : fmtCell(totals[c.key], c.type)) : (i === 0 ? 'Total' : ''))), onDelete ? el('td', { class: 'table__td' }) : null) : null;
  // Long tables scroll inside their own box so the header row stays visible.
  return el('div', { class: 'table-wrap' + (rows.length > 12 ? ' table-wrap--tall' : '') }, el('table', { class: 'table' },
    el('thead', null, head),
    el('tbody', null, rows.length ? body : el('tr', null, el('td', { class: 'table__empty', colspan: cols.length + (onDelete ? 1 : 0), text: emptyText })), foot),
  ));
}
function fmtCell(v, type) {
  if (v == null || v === '') return '–';
  if (type === 'money') return money(v);
  if (type === 'pct') return pct(v);
  if (type === 'month') return monthLabel(v);
  if (type === 'date') return dateLabel(v);
  if (type === 'number') return String(round2(v));
  return String(v);
}
function inputFor(r, c, { onChange } = {}) {
  const t = c.type;
  const attrs = { class: 'input', 'aria-label': c.label };
  let val = r[c.key];
  if (t === 'date') Object.assign(attrs, { type: 'date', value: val || '' });
  else if (t === 'month') Object.assign(attrs, { type: 'month', value: val || '' });
  else if (t === 'text') Object.assign(attrs, { type: 'text', value: val ?? '' });
  else Object.assign(attrs, { type: 'number', step: t === 'pct' ? '0.01' : c.step || '0.01', inputmode: 'decimal', value: val == null || val === '' ? '' : t === 'pct' ? round2(val * 100 * 100) / 100 : val, placeholder: c.placeholder || '' });
  attrs.onchange = (e) => {
    const raw = e.target.value;
    let v;
    if (t === 'text' || t === 'date' || t === 'month') v = raw;
    else v = raw === '' ? (c.nullable ? null : 0) : t === 'pct' ? parseFloat(raw) / 100 : parseFloat(raw);
    r[c.key] = v;
    onChange ? onChange(v) : commit({ defer: true });
  };
  return el('input', attrs);
}
function field(label, input, hint) {
  // Tie the visible label (and hint) to the control so screen readers announce them.
  const ctl = input.matches?.('input, select, textarea') ? input : null;
  if (ctl && !ctl.id) ctl.id = 'f-' + uid();
  const hintEl = hint ? el('div', { class: 'field__hint', id: ctl ? ctl.id + '-hint' : null, text: hint }) : null;
  if (ctl) { ctl.removeAttribute('aria-label'); if (hintEl) ctl.setAttribute('aria-describedby', hintEl.id); }
  return el('div', { class: 'field' }, el('label', { class: 'field__label', for: ctl?.id, text: label }), input, hintEl);
}
function settingInput(obj, key, type, label, hint, extra = {}) {
  return field(label, inputFor(obj, { key, type, label, ...extra }), hint);
}

/* =====================================================================
 * 10. Charts (inline SVG, no libraries)
 * ===================================================================== */
// Charts are drawn at the box's real pixel width (redrawn on resize), so axis text stays
// at its CSS size instead of shrinking with a scaled viewBox on phones.
function chartBox(draw, label) {
  const box = el('div', { class: 'chart-box', role: 'img', 'aria-label': label });
  let w = 0;
  const ro = new ResizeObserver(() => {
    if (!box.isConnected) { ro.disconnect(); return; }
    const nw = Math.round(box.clientWidth);
    if (nw && nw !== w) { w = nw; box.replaceChildren(draw(w)); }
  });
  ro.observe(box);
  return box;
}
// Label indices that fit the width; always ends on the last one without colliding with it.
function tickIndices(n, plotW, minGap = 58) {
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / minGap))));
  const out = [];
  for (let i = 0; i < n - 1; i += every) if (n - 1 - i >= every) out.push(i);
  out.push(n - 1);
  return out;
}
function yScale(values, top, bottom, floor = Math.min(0, ...values), ceil = Math.max(...values)) {
  let min = floor, max = ceil === floor ? floor + 1 : ceil;
  const step = niceStep((max - min) / 4);
  min = Math.floor(min / step) * step; max = Math.ceil(max / step) * step;
  return { min, max, step, y: (v) => top + (bottom - top) * (1 - (v - min) / (max - min)) };
}
function axisY(sc, L, W, R, format) {
  const out = [];
  for (let v = sc.min; v <= sc.max + 1e-9; v += sc.step) {
    out.push(svg('line', { class: 'chart__grid', x1: L, x2: W - R, y1: sc.y(v), y2: sc.y(v) }));
    out.push(svg('text', { class: 'chart__axis', x: L - 8, y: sc.y(v) + 4, 'text-anchor': 'end' }, format(v)));
  }
  return out;
}

function lineChart(series, labels, { height = 220, format = (v) => money(v, { compact: true }) } = {}) {
  const all = series.flatMap((s) => s.values).filter((v) => isFinite(v));
  if (!all.length || labels.length < 2) return el('p', { class: 'muted', text: 'Add at least two months to see a trend.' });
  // Values for the hovered/tapped month (defaults to the latest).
  const readout = el('div', { class: 'chart-readout' });
  const showAt = (i) => readout.replaceChildren(el('strong', { text: labels[i] }), ...
    series.map((s, si) => el('span', { title: s.name }, el('span', { class: `legend__swatch legend__swatch--${si + 1}` }), money(s.values[i]))));
  const draw = (W) => {
    const H = height, L = 58, R = 12, T = 12, B = 28;
    const sc = yScale(all, T, H - B);
    const x = (i) => L + (i * (W - L - R)) / (labels.length - 1);
    const xl = tickIndices(labels.length, W - L - R).map((i) => svg('text', { class: 'chart__axis', x: x(i), y: H - 8, 'text-anchor': i === labels.length - 1 ? 'end' : i === 0 ? 'start' : 'middle' }, labels[i]));
    const lines = series.map((s, si) => svg('polyline', { class: `chart__line chart__line--${si + 1}`, points: s.values.map((v, i) => `${x(i)},${sc.y(v)}`).join(' ') }));
    const guide = svg('line', { class: 'chart__guide', y1: T, y2: H - B, visibility: 'hidden' });
    const dots = series.map((s, si) => svg('circle', { class: `chart__dot chart__dot--${si + 1}`, r: 4, visibility: 'hidden' }));
    const hit = svg('rect', { class: 'chart__hit', x: 0, y: 0, width: W, height: H });
    const pick = (e) => {
      const left = hit.getBoundingClientRect().left;
      const i = Math.max(0, Math.min(labels.length - 1, Math.round((e.clientX - left - L) / ((W - L - R) / (labels.length - 1)))));
      for (const [k, v] of [['x1', x(i)], ['x2', x(i)], ['visibility', 'visible']]) guide.setAttribute(k, v);
      dots.forEach((d, si) => { d.setAttribute('cx', x(i)); d.setAttribute('cy', sc.y(series[si].values[i])); d.setAttribute('visibility', 'visible'); });
      showAt(i);
    };
    hit.addEventListener('pointermove', pick);
    hit.addEventListener('pointerdown', pick);
    return svg('svg', { class: 'chart', width: W, height: H, viewBox: `0 0 ${W} ${H}` }, axisY(sc, L, W, R, format), xl, lines, guide, dots, hit);
  };
  showAt(labels.length - 1);
  return el('div', null,
    chartBox(draw, series.map((s) => s.name).join(', ') + ' over time'),
    readout,
    el('div', { class: 'legend' }, series.map((s, si) => el('span', null, el('span', { class: `legend__swatch legend__swatch--${si + 1}` }), s.name))),
  );
}
function barChart(values, labels, { height = 180, format = (v) => pct(v, 0) } = {}) {
  if (!values.length) return el('p', { class: 'muted', text: 'No months yet.' });
  const draw = (W) => {
    const H = height, L = 44, R = 8, T = 18, B = 26;
    const sc = yScale(values, T, H - B, Math.min(0, ...values), Math.max(0.01, ...values));
    const bw = (W - L - R) / values.length;
    const ticks = new Set(tickIndices(values.length, W - L - R, 52));
    const parts = axisY(sc, L, W, R, format);
    values.forEach((v, i) => {
      const y0 = sc.y(0), y1 = sc.y(v), cx = L + i * bw + bw / 2;
      parts.push(svg('rect', { class: 'chart__bar' + (v < 0 ? ' chart__bar--neg' : ''), x: L + i * bw + bw * 0.15, width: bw * 0.7, y: Math.min(y0, y1), height: Math.max(1, Math.abs(y1 - y0)), rx: 2 }, svg('title', null, `${labels[i]}: ${format(v)}`)));
      // Value labels when the bars are wide enough to hold them.
      if (bw >= 34) parts.push(svg('text', { class: 'chart__value', x: cx, y: v < 0 ? y1 + 12 : y1 - 4, 'text-anchor': 'middle' }, format(v)));
      if (ticks.has(i)) parts.push(svg('text', { class: 'chart__axis', x: cx, y: H - 8, 'text-anchor': 'middle' }, labels[i]));
    });
    return svg('svg', { class: 'chart', width: W, height: H, viewBox: `0 0 ${W} ${H}` }, parts);
  };
  return chartBox(draw, 'Savings rate by month: ' + values.map((v, i) => `${labels[i]} ${format(v)}`).join(', '));
}
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function bars(items) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return items.map((i) => {
    const fill = el('div', { class: 'bar__fill' });
    fill.style.width = Math.max(0, (i.value / max) * 100) + '%';
    return el('div', { class: 'bar' }, el('div', { class: 'bar__head' }, el('span', { text: i.label }), el('span', { text: money(i.value) })), el('div', { class: 'bar__track' }, fill));
  });
}
function progressBar(p) {
  const f = el('div', { class: 'progress__fill' });
  f.style.width = Math.round((p || 0) * 100) + '%';
  return el('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': Math.round((p || 0) * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, f);
}
function stat(label, value, note, key) {
  return el('div', { class: 'card stat' + (key ? ' stat--key' : '') }, el('div', { class: 'stat__label', text: label }), el('div', { class: 'stat__value', text: value }), note ? el('div', { class: 'stat__note', text: note }) : null);
}
function kv(pairs) {
  return el('div', { class: 'kv' }, pairs.flatMap(([k, v, strong, cls]) => [
    el('div', { class: 'kv__k' + (strong ? ' kv__k--strong' : ''), text: k }),
    el('div', { class: 'kv__v' + (strong ? ' kv__v--strong' : '') + (cls ? ' ' + cls : ''), text: v }),
  ]));
}
const sign = (n) => (n < 0 ? 'neg' : n > 0 ? 'pos' : '');

/* =====================================================================
 * 11. Shell & router
 * ===================================================================== */
const PAGES = [
  ['dashboard', 'Dashboard'],
  ['ledger', 'Monthly ledger'],
  ['assumptions', 'Assumptions'],
  ['investments', 'Investments'],
  ['liabilities', 'Liabilities'],
  ['insurance', 'Insurance'],
  ['tax', 'Tax & reliefs'],
  ['networth', 'Goal & net worth'],
  ['data', 'Settings & data'],
];
const route = () => (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
addEventListener('hashchange', () => S && render());

// Phone layout: these pages get a bottom tab each; the rest live under "More".
const TABS = ['dashboard', 'ledger', 'investments', 'networth'];
const TAB_LABEL = { dashboard: 'Home', ledger: 'Ledger', investments: 'Invest', networth: 'Net worth' };
const ICONS = {
  dashboard: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  ledger: 'M4 5h16M4 10h16M4 15h16M4 20h10',
  investments: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  networth: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1',
  more: 'M4 6h16M4 12h16M4 18h16',
  moon: 'M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z',
  sun: 'M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8',
};
const icon = (k) => svg('svg', { class: 'icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: ICONS[k] }));

function openMenu() {
  const links = PAGES.map(([id, label]) => el('a', { class: 'nav__link' + (route() === id ? ' nav__link--active' : ''), href: '#/' + id, text: label, onclick: () => $('#dlg').close() }));
  openDialog('Menu', [el('nav', { class: 'menu', 'aria-label': 'All sections' }, links)], [{ label: 'Close' }]);
}

function renderShell() {
  const app = $('#app');
  app.replaceChildren(el('div', { class: 'shell' },
    el('nav', { class: 'shell__nav', 'aria-label': 'Sections' },
      el('div', { class: 'shell__brand' }, el('span', { class: 'shell__brand-dot' }), 'Ledger Local'),
      el('div', { class: 'shell__links' }, PAGES.map(([id, label]) => el('a', { class: 'nav__link', href: '#/' + id, 'data-page': id, text: label }))),
      el('div', { class: 'shell__spacer' }),
      el('div', { class: 'status' }, el('span', { class: 'status__dot' }), el('span', { id: 'save-status', text: KEY ? 'Encrypted on this device' : 'Saved on this device' })),
      el('div', { class: 'shell__actions' }, themeButton(), KEY ? el('button', { class: 'btn shell__lock', type: 'button', text: 'Lock', onclick: lock }) : null),
    ),
    el('main', { class: 'shell__main', id: 'main' }),
    el('nav', { class: 'tabbar', 'aria-label': 'Main sections' },
      TABS.map((id) => el('a', { class: 'tabbar__item', href: '#/' + id, 'data-page': id }, icon(id), el('span', { text: TAB_LABEL[id] }))),
      el('button', { class: 'tabbar__item', type: 'button', 'data-page': 'more', onclick: openMenu }, icon('more'), el('span', { text: 'More' })),
    ),
  ));
  render();
}

function render() {
  if (!S) return;
  const p = route();
  const page = PAGES.some(([id]) => id === p) ? p : 'dashboard';
  document.querySelectorAll('[data-page]').forEach((a) => {
    const on = a.dataset.page === page || (a.dataset.page === 'more' && !TABS.includes(page));
    a.classList.toggle('nav__link--active', on);
    if (a.dataset.page === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const main = $('#main');
  if (!main) return renderShell();
  // Same page re-rendering after an edit: keep window/table scroll and the focused field.
  const same = main.dataset.view === page;
  const wy = scrollY;
  const tableScroll = same ? [...main.querySelectorAll('.table-wrap')].map((w) => [w.scrollLeft, w.scrollTop]) : [];
  const focus = same ? focusKey(main) : null;
  const view = ({ dashboard: pageDashboard, ledger: pageLedger, assumptions: pageAssumptions, investments: pageInvestments, liabilities: pageLiabilities, insurance: pageInsurance, tax: pageTax, networth: pageNetWorth, data: pageData }[page])();
  main.replaceChildren(view);
  main.dataset.view = page;
  main.querySelectorAll('.table-wrap').forEach((w, i) => { if (tableScroll[i]) [w.scrollLeft, w.scrollTop] = tableScroll[i]; });
  if (focus) restoreFocus(main, focus);
  scrollTo(0, same ? wy : 0);
}

// Identify the focused control by tag + label + position among controls with that label,
// which survives a full re-render (element identity does not).
const FOCUSABLE = 'input, select, textarea, button, a[href]';
const ctlLabel = (c) => c.tagName + '|' + (c.getAttribute('aria-label') || c.labels?.[0]?.textContent || c.textContent || c.name || '');
function focusKey(root) {
  const a = document.activeElement;
  if (!a || !root.contains(a)) return null;
  const key = ctlLabel(a);
  const n = [...root.querySelectorAll(FOCUSABLE)].filter((c) => ctlLabel(c) === key).indexOf(a);
  let sel = null;
  try { sel = a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null; } catch { /* number inputs have no selection */ }
  return { key, n, sel };
}
function restoreFocus(root, { key, n, sel }) {
  const c = [...root.querySelectorAll(FOCUSABLE)].filter((x) => ctlLabel(x) === key)[n];
  if (!c) return;
  c.focus({ preventScroll: true });
  try { if (sel) c.setSelectionRange(...sel); } catch { /* not a text field */ }
}

function pageHead(title, sub, ...actions) {
  return el('div', { class: 'page__head' },
    el('div', null, el('h1', { text: title }), sub ? el('p', { class: 'page__sub', text: sub }) : null),
    actions.length ? el('div', { class: 'page__actions' }, actions) : null,
  );
}
const go = (p) => { location.hash = '#/' + p; };

/* =====================================================================
 * 12. Pages
 * ===================================================================== */
function pageDashboard() {
  const sm = summary();
  const now = thisMonth();
  const cur = computeLedger(now).find((r) => r.month === now);
  const rows = sm.rows;
  const checks = checklist(sm);
  const due = checks.filter((c) => !c.ok).length;
  const frag = el('div', null, pageHead('Dashboard', `Right now · ${monthLabel(now)}`));

  if (!S.assumptions.length) {
    frag.append(el('div', { class: 'notice notice--info' }, 'Start on ', el('a', { href: '#/assumptions', text: 'Assumptions' }), ' (salary, costs, investment %), then add months in the ', el('a', { href: '#/ledger', text: 'Monthly ledger' }), '. Coming from the spreadsheet? Use ', el('a', { href: '#/data', text: 'Settings & data → Import CSV' }), '.'));
  }

  frag.append(el('div', { class: 'grid grid--stats' },
    stat('Net worth', money(sm.netWorth), 'Incl. CPF', true),
    stat('Liquid net worth', money(sm.liquid), 'Excl. CPF'),
    stat('Left this month', cur ? money(cur.savings) : '–', cur ? `Savings rate ${pct(cur.savingsRate)}` : null),
    stat('Total CPF', money(sm.cpf), S.settings.cpfEnabled ? 'OA + SA + MA' : 'CPF tracking off'),
  ));

  const goal = el('div', { class: 'card' },
    el('div', { class: 'card__title' }, el('span', { text: S.settings.goalName || 'Savings goal' }), el('a', { class: 'card__hint', href: '#/networth', text: 'Details' })),
  );
  if (num(S.settings.goalAmount) > 0) {
    goal.append(
      el('div', { class: 'bar__head' }, el('span', { text: `${money(sm.saved)} of ${money(S.settings.goalAmount)}` }), el('strong', { text: pct(sm.progress, 0) })),
      progressBar(sm.progress),
      el('div', { class: 'card__hint', text: sm.remaining <= 0 ? 'Goal reached.' : sm.monthsToGoal != null ? `About ${sm.monthsToGoal} months to go at your 12-month pace (${money(sm.pace)}/month) — around ${monthLabel(sm.goalMonth)}.` : 'Not enough saving pace yet to project a date.' }),
    );
  } else goal.append(el('p', { class: 'muted' }, 'Set a goal amount on ', el('a', { href: '#/networth', text: 'Goal & net worth' }), '.'));

  const month = el('div', { class: 'card' }, el('div', { class: 'card__title', text: `This month (from current assumptions)` }));
  if (cur) {
    month.append(kv([
      ['Salary' + (cur.bonus ? ' + bonus' : ''), money(cur.salary + cur.bonus)],
      ['CPF (employee)', '−' + money(cur.ee)],
      ['After CPF', money(cur.after), true],
      ['Food', '−' + money(cur.food)],
      ['Transport', '−' + money(cur.transport)],
      ['Parents', '−' + money(cur.parents)],
      ['Others', '−' + money(cur.others)],
      ['Income tax (monthly)', '−' + money(cur.tax)],
      ...(cur.insurance ? [['Insurance premium', '−' + money(cur.insurance)]] : []),
      ['Investment (planned)', '−' + money(cur.invest)],
      ['Left', money(cur.savings), true, sign(cur.savings)],
      ['Employer CPF (not in take-home)', money(cur.er)],
    ]));
  } else month.append(el('p', { class: 'muted', text: 'Add an assumptions row to see this.' }));

  const chk = el('div', { class: 'card' }, el('div', { class: 'card__title' }, el('span', { text: 'Checklist' }), el('span', { class: 'card__hint', text: due ? `${due} to do` : 'All done' })),
    checks.map((c) => el('div', { class: 'check' },
      el('div', { class: 'check__icon ' + (c.ok ? 'check__icon--ok' : 'check__icon--due'), text: c.ok ? '✓' : '!' }),
      el('div', { class: 'check__text' }, el('div', { text: c.text }), c.detail ? el('div', { class: 'check__detail', text: c.detail }) : null),
      c.go ? el('button', { class: 'btn btn--small', type: 'button', text: c.cta || 'Go', onclick: () => (c.go === 'data' ? exportBackup() : go(c.go)) }) : null,
    )));

  frag.append(el('div', { class: 'grid grid--two' }, el('div', null, goal, chk), month));

  if (rows.length) {
    const labels = rows.map((r) => monthLabel(r.month).replace(' 20', " '"));
    const series = [{ name: 'Cash (start + cumulative savings)', values: rows.map((r) => r.cash) }];
    if (S.settings.cpfEnabled) series.push({ name: 'Total CPF', values: rows.map((r) => r.cpfTotal) });
    series.push({ name: 'Cumulative invested (planned)', values: rows.map((r) => r.cum.invest) });
    frag.append(el('div', { class: 'grid grid--two grid--top' },
      el('div', { class: 'card' }, el('div', { class: 'card__title', text: 'Balances over time' }), lineChart(series, labels)),
      el('div', { class: 'card' }, el('div', { class: 'card__title', text: 'Savings rate by month' }), barChart(rows.map((r) => r.savingsRate), labels),
        el('div', { class: 'card__title section-gap', text: 'Where the money went (all months)' }),
        bars([
          { label: 'Food', value: sm.last.cum.food }, { label: 'Transport', value: sm.last.cum.transport }, { label: 'Parents', value: sm.last.cum.parents },
          { label: 'Others', value: sm.last.cum.others }, { label: 'Income tax', value: sm.last.cum.tax }, { label: 'Insurance', value: sm.last.cum.insurance },
        ].filter((b) => b.value > 0).sort((a, b) => b.value - a.value)),
      ),
    ));
  }
  return frag;
}

function pageLedger() {
  const rows = computeLedger();
  const addNext = () => {
    const last = [...S.ledger].sort(byKey('month')).pop();
    const m = last ? addMonths(last.month, 1) : addMonths(thisMonth(), -1);
    if (S.ledger.some((e) => e.month === m)) return toast('That month already exists');
    S.ledger.push({ id: uid(), month: m, bonus: 0, maDed: 0 });
    commit();
    toast(`Added ${monthLabel(m)}`);
  };
  const mark = (r, k) => (r.overrides.includes(k) ? el('span', { class: 'table__mark', title: 'Adjusted for this month', text: '•' }) : null);
  const cell = (r, k) => el('span', null, money(r[k]), mark(r, k));
  // Mostly-zero columns read better as a dash than a wall of $0.00.
  const orDash = (v) => (num(v) ? money(v) : el('span', { class: 'muted', text: '–' }));
  const full = !S.settings.ledgerCompact;
  const cols = [
    { key: 'month', label: 'Month (worked)', type: 'month', get: (r) => el('button', { class: 'table__link', type: 'button', text: monthLabel(r.month), 'aria-label': `Edit ${monthLabel(r.month)}`, onclick: () => editMonth(r.entry) }) },
    { key: 'salary', label: 'Salary', type: 'money', get: (r) => cell(r, 'salary') },
    { key: 'bonus', label: 'Bonus', type: 'money', get: (r) => orDash(r.bonus) },
    ...(S.settings.cpfEnabled ? [{ key: 'ee', label: 'CPF', type: 'money', get: (r) => money(r.ee) }, { key: 'er', label: 'Employer CPF', type: 'money', get: (r) => money(r.er) }] : []),
    { key: 'after', label: 'After CPF', type: 'money', get: (r) => money(r.after) },
    { key: 'food', label: 'Food', type: 'money', get: (r) => cell(r, 'food') },
    { key: 'transport', label: 'Transport', type: 'money', get: (r) => cell(r, 'transport') },
    { key: 'parents', label: 'Parents', type: 'money', get: (r) => cell(r, 'parents') },
    { key: 'others', label: 'Others', type: 'money', get: (r) => cell(r, 'others') },
    { key: 'extras', label: 'One-offs', type: 'money', get: (r) => orDash(r.extras) },
    { key: 'insurance', label: 'Insurance', type: 'money', get: (r) => orDash(r.insurance) },
    { key: 'tax', label: 'Income tax', type: 'money', get: (r) => cell(r, 'tax') },
    { key: 'invest', label: 'Investment', type: 'money', get: (r) => cell(r, 'invest') },
    { key: 'savings', label: 'Savings', type: 'money', get: (r) => money(r.savings), cls: (r) => sign(r.savings) },
    { key: 'cumsav', label: 'Cum. savings', type: 'money', get: (r) => money(r.cum.savings) },
    { key: 'rate', label: 'Savings rate', type: 'pct', get: (r) => pct(r.savingsRate) },
    ...(S.settings.cpfEnabled ? [
      { key: 'oa', label: 'CPF OA', type: 'money', get: (r) => money(r.oa) },
      { key: 'sa', label: 'CPF SA', type: 'money', get: (r) => money(r.sa) },
      { key: 'ma', label: 'CPF MA', type: 'money', get: (r) => money(r.ma) },
    ] : []),
  ];
  const KEY_COLS = ['month', 'salary', 'after', 'spend', 'tax', 'invest', 'savings', 'rate', 'cumsav'];
  const shown = full ? cols : [...cols, { key: 'spend', label: 'Spending', type: 'money', get: (r) => money(r.expenditure - r.tax) }]
    .filter((c) => KEY_COLS.includes(c.key)).sort((a, b) => KEY_COLS.indexOf(a.key) - KEY_COLS.indexOf(b.key));
  const viewToggle = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Columns' },
    [['Key columns', true], ['All columns', false]].map(([label, compact]) => el('button', {
      class: 'segmented__btn', type: 'button', text: label, 'aria-pressed': String(!!S.settings.ledgerCompact === compact),
      onclick: () => { S.settings.ledgerCompact = compact; commit(); },
    })));
  const last = rows[rows.length - 1];
  return el('div', null,
    pageHead('Monthly ledger', 'One row per worked month. Everything fills in from your assumptions — edit a month only if it was unusual.',
      el('button', { class: 'btn btn--primary', type: 'button', text: '+ Add next month', onclick: addNext })),
    last ? el('div', { class: 'grid grid--stats' },
      stat('Cumulative savings', money(last.cum.savings)),
      stat('Cumulative after-CPF', money(last.cum.after)),
      stat('Cumulative expenditure', money(last.cum.exp)),
      stat('Cumulative CPF (you + employer)', money(last.cum.ee + last.cum.er)),
    ) : null,
    el('div', { class: 'table-toolbar section-gap' }, el('span', { class: 'card__hint', text: 'Select a month to edit it.' }), viewToggle),
    editTable({ cols: shown, rows: [...rows].reverse(), emptyText: 'No months yet — select “Add next month”.' }),
    el('p', { class: 'card__hint section-gap' }, el('span', { class: 'table__mark', text: '•' }), ' = value adjusted for that month only. ', full ? null : 'Spending = food, transport, parents, others, one-offs and insurance. ', 'Income tax is your projected annual tax for that calendar year ÷ 12.'),
  );
}

function editMonth(e) {
  const r = computeLedger().find((x) => x.entry.id === e.id);
  const tmp = JSON.parse(JSON.stringify(e));
  tmp.extras = tmp.extras || [];
  const ovField = (k, label, computed) => field(label, inputFor(tmp, { key: k, type: 'money', label, nullable: true, placeholder: `Auto: ${round2(computed)}` }, { onChange: () => {} }), 'Leave blank to use the automatic value.');
  const extrasBox = el('div');
  const drawExtras = () => extrasBox.replaceChildren(
    ...tmp.extras.map((x, i) => el('div', { class: 'form-grid' },
      field('One-off item', inputFor(x, { key: 'label', type: 'text', label: 'Item' }, { onChange: () => {} })),
      field('Amount', el('div', { class: 'page__actions' }, inputFor(x, { key: 'amount', type: 'money', label: 'Amount' }, { onChange: () => {} }), el('button', { class: 'btn btn--small btn--danger', type: 'button', text: 'Remove', onclick: () => { tmp.extras.splice(i, 1); drawExtras(); } }))),
    )),
    el('button', { class: 'btn btn--small', type: 'button', text: '+ One-off expense', onclick: () => { tmp.extras.push({ label: '', amount: 0 }); drawExtras(); } }),
  );
  drawExtras();
  openDialog(`Edit ${monthLabel(e.month)}`, [
    el('div', { class: 'form-grid' },
      field('Month worked', inputFor(tmp, { key: 'month', type: 'month', label: 'Month' }, { onChange: () => {} })),
      field('Bonus', inputFor(tmp, { key: 'bonus', type: 'money', label: 'Bonus' }, { onChange: () => {} })),
      S.settings.cpfEnabled ? field('MediSave (MA) deductions', inputFor(tmp, { key: 'maDed', type: 'money', label: 'MA deductions' }, { onChange: () => {} }), 'If MediSave paid for something this month.') : null,
    ),
    el('h3', { class: 'section-gap', text: 'Adjust this month only' }),
    el('div', { class: 'form-grid' },
      ovField('salary', 'Salary', r?.assumption?.salary || 0),
      ovField('workDays', 'Work days', r?.assumption?.workDays || 0),
      ovField('food', 'Food', r ? (r.overrides.includes('food') ? num(r.assumption.foodDay) * r.workDays : r.food) : 0),
      ovField('transport', 'Transport', r ? (r.overrides.includes('transport') ? num(r.assumption.transportDay) * r.workDays : r.transport) : 0),
      ovField('parents', 'Parents', r?.assumption?.parents || 0),
      ovField('others', 'Others', r?.assumption?.others || 0),
      ovField('invest', 'Investment (planned)', r ? r.after * num(r.assumption.investPct) : 0),
      ovField('tax', 'Income tax', r ? r.tax : 0),
    ),
    extrasBox,
    field('Note', inputFor(tmp, { key: 'note', type: 'text', label: 'Note' }, { onChange: () => {} })),
  ], [
    { label: 'Delete month', danger: true, run: () => undoable(`${monthLabel(e.month)} deleted`, () => { S.ledger = S.ledger.filter((x) => x.id !== e.id); }) },
    { label: 'Cancel' },
    {
      label: 'Save', primary: true, run: () => {
        if (!tmp.month) return;
        if (S.ledger.some((x) => x.id !== e.id && x.month === tmp.month)) { toast('Another row already uses that month'); return; }
        Object.keys(e).forEach((k) => delete e[k]);
        Object.assign(e, tmp);
        commit();
      },
    },
  ]);
}

function pageAssumptions() {
  const rows = [...S.assumptions].sort(byKey('effective'));
  const add = () => {
    const last = rows[rows.length - 1];
    S.assumptions.push(last ? { ...JSON.parse(JSON.stringify(last)), id: uid(), effective: todayISO(), notes: '' } : { id: uid(), effective: thisMonth() + '-01', salary: 0, age: 30, workDays: 22, foodDay: 0, transportDay: 0, parents: 0, investPct: 0, others: 0, notes: '' });
    commit();
  };
  const birth = S.settings.birthMonth;
  const effMonth = (a) => a.effective?.slice(0, 7) || thisMonth();
  const next = S.settings.cpfEnabled && birth ? nextBandChange(thisMonth()) : null;
  const birthHint = birth
    ? `You are ${Math.floor(ageAt(thisMonth()))}. Age updates every month, so the Age column is filled in for you.`
      + (next ? ` Next CPF rate change: ${monthLabel(next.month)} (above ${next.band.ageAbove}).` : '')
      + ' Clear the field to type ages yourself.'
    : 'Optional. Set it and your age — and CPF age band — update on their own each month. The new band starts the month after your birthday month.';
  const cols = [
    { key: 'effective', label: 'Effective date', type: 'date' },
    { key: 'salary', label: 'Salary', type: 'money' },
    ...(S.settings.cpfEnabled ? [birth
      ? { key: 'age', label: 'Age', type: 'number', get: (a) => String(Math.floor(ageAt(effMonth(a)))) }
      : { key: 'age', label: 'Age', type: 'number', step: '1' }] : []),
    { key: 'workDays', label: 'Work days/mo', type: 'number', step: '1' },
    { key: 'foodDay', label: 'Food/day', type: 'money' },
    { key: 'transportDay', label: 'Transport/day', type: 'money' },
    { key: 'parents', label: 'Parents support', type: 'money' },
    { key: 'others', label: 'Others/month', type: 'money' },
    { key: 'investPct', label: 'Investment %', type: 'pct' },
    ...(S.settings.cpfEnabled ? [
      { key: 'cpfEE', label: 'CPF rate', type: 'pct', get: (a) => pct(cpfFor(effMonth(a), ageAt(effMonth(a), a)).ee) },
      { key: 'cpfER', label: 'Employer CPF', type: 'pct', get: (a) => pct(cpfFor(effMonth(a), ageAt(effMonth(a), a)).er) },
      { key: 'cpfOA', label: 'OA alloc.', type: 'pct', get: (a) => pct(cpfFor(effMonth(a), ageAt(effMonth(a), a)).oa) },
      { key: 'cpfMA', label: 'MA alloc.', type: 'pct', get: (a) => pct(cpfFor(effMonth(a), ageAt(effMonth(a), a)).ma) },
    ] : []),
    { key: 'notes', label: 'Notes', type: 'text' },
  ];
  return el('div', null,
    pageHead('Assumptions history', 'Every input that can change over time. When something changes (a raise, costs going up), add a new row — past months stay untouched.',
      el('button', { class: 'btn btn--primary', type: 'button', text: rows.length ? '+ Copy last row' : '+ Add first row', onclick: add })),
    el('div', { class: 'notice notice--info', text: 'A row applies from the first month that starts on or after its effective date. Example: effective 30 May → used from June. CPF rates come from the age band in Settings → CPF schedule.' }),
    el('div', { class: 'card birth-card' }, field('Birth month', inputFor(S.settings, { key: 'birthMonth', type: 'month', label: 'Birth month' }), birthHint)),
    editTable({ cols, rows, onDelete: (r) => undoable('Assumptions row deleted', () => { S.assumptions = S.assumptions.filter((x) => x !== r); }), emptyText: 'No assumptions yet.' }),
  );
}

function pageInvestments() {
  const sm = summary();
  const dep = [...S.deposits].sort(byKey('date'));
  const pv = [...S.portfolio].sort(byKey('date'));
  const gain = sm.portfolio - sm.deposits;
  return el('div', null,
    pageHead('Investments', 'Log what you actually deposit, and update the portfolio value whenever you check it.'),
    el('div', { class: 'grid grid--stats' },
      stat('Portfolio value', money(sm.portfolio), sm.portfolioDate ? `As of ${dateLabel(sm.portfolioDate)}` : 'No value logged', true),
      stat('Total deposited', money(sm.deposits)),
      stat('Gain / loss', money(gain), sm.deposits ? pct(gain / sm.deposits) : null),
      stat('Actual vs planned', money(sm.extraInvested), `Planned so far ${money(sm.planned)}`),
    ),
    el('p', { class: 'card__hint section-gap', text: 'The ledger subtracts your planned investment. Any difference between actual and planned deposits is corrected in net worth and expected cash, so nothing is counted twice.' }),
    el('div', { class: 'grid grid--two section-gap' },
      el('div', null,
        el('div', { class: 'card__title' }, el('span', { text: 'Deposits' }), el('button', { class: 'btn btn--small btn--primary', type: 'button', text: '+ Deposit', onclick: () => { S.deposits.push({ id: uid(), date: todayISO().slice(0, 8) + '01', amount: 0, notes: '' }); commit(); } })),
        editTable({ cols: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'notes', label: 'Notes', type: 'text' }], rows: dep, onDelete: (r) => undoable('Deposit deleted', () => { S.deposits = S.deposits.filter((x) => x !== r); }), totals: dep.length ? { amount: sm.deposits } : null }),
      ),
      el('div', null,
        el('div', { class: 'card__title' }, el('span', { text: 'Portfolio value log' }), el('button', { class: 'btn btn--small btn--primary', type: 'button', text: '+ Value', onclick: () => { S.portfolio.push({ id: uid(), date: todayISO(), value: sm.portfolio, notes: '' }); commit(); } })),
        editTable({ cols: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'value', label: 'Value', type: 'money' }, { key: 'notes', label: 'Notes', type: 'text' }], rows: pv, onDelete: (r) => undoable('Portfolio value deleted', () => { S.portfolio = S.portfolio.filter((x) => x !== r); }) }),
      ),
    ),
    pv.length > 1 ? el('div', { class: 'card section-gap' }, el('div', { class: 'card__title', text: 'Portfolio value' }), lineChart([{ name: 'Portfolio value', values: pv.map((p) => num(p.value)) }], pv.map((p) => dateLabel(p.date).replace(/^\d+ /, '')))) : null,
  );
}

function pageLiabilities() {
  const total = sum(S.liabilities, (l) => l.balance);
  const cols = [
    { key: 'name', label: 'Item', type: 'text' },
    { key: 'balance', label: 'Balance', type: 'money' },
    { key: 'rate', label: 'Interest % / yr', type: 'pct' },
    { key: 'payment', label: 'Monthly payment', type: 'money' },
    { key: 'months', label: 'Months to pay off', type: 'text', get: (l) => { const p = payoff(l); return p.months == null ? 'Never at this payment' : String(p.months); } },
    { key: 'date', label: 'Payoff', type: 'text', get: (l) => { const p = payoff(l); return p.date ? monthLabel(p.date) : '–'; } },
    { key: 'interest', label: 'Interest left', type: 'money', get: (l) => { const p = payoff(l); return p.interest != null ? money(p.interest) : '–'; } },
    { key: 'notes', label: 'Notes', type: 'text' },
  ];
  return el('div', null,
    pageHead('Liabilities', 'Loans or debts. They are subtracted from net worth.',
      el('button', { class: 'btn btn--primary', type: 'button', text: '+ Liability', onclick: () => { S.liabilities.push({ id: uid(), name: '', balance: 0, rate: 0, payment: 0, notes: '' }); commit(); } })),
    el('div', { class: 'grid grid--stats' }, stat('Total liabilities', money(total), null, true)),
    el('div', { class: 'section-gap' }, editTable({ cols, rows: S.liabilities, onDelete: (r) => undoable('Liability deleted', () => { S.liabilities = S.liabilities.filter((x) => x !== r); }), emptyText: 'No liabilities — nice.', totals: S.liabilities.length ? { balance: total } : null })),
    el('p', { class: 'card__hint section-gap', text: 'Payoff assumes the same monthly payment and interest rate until the loan is cleared. Update the balance, rate or payment when they change.' }),
  );
}

function pageInsurance() {
  const add = () => { S.policies.push({ id: uid(), name: 'Whole life policy', start: todayISO(), years: 20, premium: 0, actual: {} }); commit(); };
  const cards = S.policies.map((p) => {
    const years = Math.max(0, Math.min(100, num(p.years)));
    p.actual = p.actual || {};
    const [sy, smn, sd] = (p.start || todayISO()).split('-');
    const sched = Array.from({ length: years }, (_, k) => ({ k, date: `${+sy + k}-${smn}-${sd}`, expected: num(p.premium), actual: p.actual[k] }));
    const paid = sum(sched, (r) => (r.actual != null && r.actual !== '' ? r.actual : 0));
    const cols = [
      { key: 'k', label: 'Year', type: 'text', get: (r) => String(r.k + 1) },
      { key: 'date', label: 'Due date', type: 'date', get: (r) => dateLabel(r.date) },
      { key: 'expected', label: 'Expected', type: 'money', readonly: true },
      { key: 'actual', label: 'Actual paid', type: 'money', get: (r) => inputFor(p.actual, { key: r.k, type: 'money', label: 'Actual paid', nullable: true, placeholder: '—' }) },
      { key: 'var', label: 'Variance', type: 'money', get: (r) => (r.actual != null && r.actual !== '' ? money(num(r.actual) - r.expected) : '–'), cls: (r) => (r.actual != null && r.actual !== '' ? sign(num(r.actual) - r.expected) : '') },
    ];
    return el('div', { class: 'card' },
      el('div', { class: 'card__title' }, el('span', { text: p.name || 'Policy' }), el('button', { class: 'btn btn--small btn--danger', type: 'button', text: 'Delete policy', onclick: () => undoable(`${p.name || 'Policy'} deleted`, () => { S.policies = S.policies.filter((x) => x !== p); }) })),
      el('div', { class: 'form-grid' },
        settingInput(p, 'name', 'text', 'Policy name'),
        settingInput(p, 'start', 'date', 'Policy start date'),
        settingInput(p, 'years', 'number', 'Premium term (years)', null, { step: '1' }),
        settingInput(p, 'premium', 'money', 'Annual premium (expected)'),
      ),
      el('p', { class: 'card__hint', text: `Paid so far ${money(paid)}. Premiums reduce that month's “Left” and count as spending, but are not added to net worth (paid premiums ≠ cash value).` }),
      editTable({ cols, rows: sched }),
    );
  });
  return el('div', null,
    pageHead('Insurance', 'Premium schedule for each policy. Log the actual amount each year when you pay.',
      el('button', { class: 'btn btn--primary', type: 'button', text: '+ Policy', onclick: add })),
    cards.length ? cards : el('div', { class: 'card muted', text: 'No policies yet.' }),
  );
}

function pageTax() {
  const rows = computeLedger(thisMonth());
  const years = [...new Set([...rows.map((r) => r.month.slice(0, 4)), thisMonth().slice(0, 4)])].sort();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const year = q.get('y') && years.includes(q.get('y')) ? q.get('y') : thisMonth().slice(0, 4);
  const inYear = rows.filter((r) => r.month.startsWith(year));
  const lastRow = inYear[inYear.length - 1];
  const table = taxTable();

  const list = (S.reliefs[year] = S.reliefs[year] || []);
  const age = ageInYear(year, lastRow ? lastRow.assumption : assumptionFor(thisMonth()));
  const eir = earnedIncomeRelief(age);
  const projected = lastRow ? lastRow.projected : 0;
  const base = Math.max(0, projected - eir);
  const taxNo = taxOn(base, table);
  let cur = base, capLeft = num(S.settings.reliefCap) || Infinity;
  const shares = list.map((r) => {
    const amt = Math.min(num(r.amount), capLeft);
    capLeft -= amt;
    const next = Math.max(0, cur - amt);
    const saved = taxOn(cur, table) - taxOn(next, table);
    cur = next;
    return { r, applied: amt, saved };
  });
  const don = num(S.donations[year]) * num(S.settings.donationMultiplier);
  const nextD = Math.max(0, cur - don);
  const donSaved = taxOn(cur, table) - taxOn(nextD, table);
  cur = nextD;
  const taxWith = taxOn(cur, table);

  const yearSel = el('select', { class: 'select', 'aria-label': 'Income year', onchange: (e) => { location.hash = '#/tax?y=' + e.target.value; } }, years.map((y) => el('option', { value: y, selected: y === year, text: `Income year ${y} (YA ${+y + 1})` })));

  const reliefPicker = el('select', {
    class: 'select select--inline', 'aria-label': 'Add a relief',
    onchange: (e) => {
      const p = RELIEF_PRESETS[+e.target.value];
      if (!p) return;
      list.push({ id: uid(), name: p.name, amount: p.amount });
      commit();
      toast(`Added ${p.name}${p.amount ? '' : ' — enter the amount'}`);
    },
  }, el('option', { value: '', text: '+ Add a relief…', selected: true }), RELIEF_PRESETS.map((p, i) => el('option', { value: i, text: p.amount ? `${p.name} · ${money(p.amount, { compact: true })}` : p.name })));

  const reliefCols = [
    { key: 'name', label: 'Relief', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'money' },
    { key: 'applied', label: 'Applied (after cap)', type: 'money', get: (r) => money(shares.find((s) => s.r === r)?.applied) },
    { key: 'saved', label: 'Tax saved', type: 'money', get: (r) => money(shares.find((s) => s.r === r)?.saved), cls: () => 'pos' },
  ];

  return el('div', null,
    pageHead('Tax & reliefs', 'Projected chargeable income from your ledger, taxed with the bracket table below.', yearSel),
    el('div', { class: 'grid grid--stats' },
      stat('Projected tax', money(taxWith), `≈ ${money(taxWith / 12)} / month`, true),
      stat('Tax without reliefs', money(taxNo)),
      stat('Tax saved by reliefs', money(taxNo - taxWith), null),
      stat('Chargeable income', money(cur), `After ${money(eir, { compact: true })} earned income relief`),
    ),
    el('div', { class: 'grid grid--two section-gap' },
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'How it is worked out' }),
        kv([
          [`After-CPF pay so far in ${year} + current pay × remaining months`, money(projected)],
          ['Earned income relief', '−' + money(eir)],
          ['Income before other reliefs', money(base), true],
          ['Other reliefs (capped at ' + money(num(S.settings.reliefCap), { compact: true }) + ')', '−' + money(sum(shares, (s) => s.applied))],
          [`Donations × ${num(S.settings.donationMultiplier) * 100}%`, '−' + money(don)],
          ['Chargeable income', money(cur), true],
        ]),
        el('p', { class: 'card__hint section-gap', text: 'Reliefs are applied one after another from the top, so each one’s share adds up to the total saved. Later reliefs save less once earlier ones push income into a lower band. CPF relief is already included by using after-CPF pay.' }),
      ),
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'Donations' }),
        field('Donations to approved IPCs (amount given)', inputFor(S.donations, { key: year, type: 'money', label: 'Donations' }), `Deducted at ${num(S.settings.donationMultiplier) * 100}%. Not part of the relief cap.`),
        kv([['Donation tax saving', money(donSaved), true, 'pos']]),
        el('p', { class: 'card__hint section-gap', text: 'Relief amounts and caps change — check the current rules on the IRAS website. This is an estimate, not tax advice.' }),
      ),
    ),
    el('div', { class: 'card section-gap' },
      el('div', { class: 'card__title' }, el('span', { text: `Reliefs for ${year}` }), reliefPicker),
      editTable({ cols: reliefCols, rows: list, onDelete: (r) => undoable('Relief removed', () => { S.reliefs[year] = list.filter((x) => x !== r); }), emptyText: 'No reliefs yet — use “Add a relief” to pick one.' }),
    ),
    el('h2', { class: 'section-gap', text: 'Tax brackets' }),
    el('p', { class: 'card__hint', text: 'Default: Singapore resident rates, YA2024 onwards. Edit lower bound or rate if they change — base tax recalculates itself. Non-Singapore users can replace the whole table.' }),
    el('div', { class: 'page__actions' },
      el('button', { class: 'btn btn--small', type: 'button', text: '+ Bracket', onclick: () => { S.taxBrackets.push({ id: uid(), lower: 0, rate: 0 }); commit(); } }),
      el('button', { class: 'btn btn--small', type: 'button', text: 'Reset to SG defaults', onclick: () => undoable('Tax brackets reset to Singapore defaults', () => { S.taxBrackets = DEFAULT_TAX.map((r) => ({ ...r, id: uid() })); }) }),
    ),
    el('div', { class: 'section-gap' }, editTable({
      cols: [{ key: 'lower', label: 'Lower bound', type: 'money' }, { key: 'rate', label: 'Rate', type: 'pct' }, { key: 'base', label: 'Base tax (auto)', type: 'money', get: (r) => money(table.find((t) => t.id === r.id)?.base) }],
      rows: [...S.taxBrackets].sort((a, b) => a.lower - b.lower),
      onDelete: (r) => undoable('Tax bracket deleted', () => { S.taxBrackets = S.taxBrackets.filter((x) => x !== r); }),
    })),
  );
}

function pageNetWorth() {
  const sm = summary();
  const st = S.settings;
  const bankDiff = st.bankBalance != null && st.bankBalance !== '' ? num(st.bankBalance) - sm.expectedCash : null;
  return el('div', null,
    pageHead('Goal & net worth', 'Cash savings, CPF, investments and liabilities in one picture.'),
    el('div', { class: 'grid grid--stats' },
      stat('Net worth', money(sm.netWorth), 'Incl. CPF', true),
      stat('Liquid net worth', money(sm.liquid), 'Excl. CPF (not withdrawable pre-retirement)'),
      stat('Saved toward goal', money(sm.saved), sm.progress != null ? pct(sm.progress, 0) + ' of goal' : null),
      stat('12-month pace', money(sm.pace) + '/mo', sm.monthsToGoal != null && sm.remaining > 0 ? `Goal around ${monthLabel(sm.goalMonth)}` : null),
    ),
    el('div', { class: 'grid grid--two section-gap' },
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'Net worth breakdown' }),
        kv([
          ['Start amount', money(num(st.startCash))],
          ['Cumulative savings (ledger)', money(sm.cumSavings)],
          ['Portfolio value', money(sm.portfolio)],
          ['Actual − planned investing', (sm.extraInvested >= 0 ? '−' : '+') + money(Math.abs(sm.extraInvested))],
          ...(st.cpfEnabled ? [['Total CPF', money(sm.cpf)]] : []),
          ['Liabilities', '−' + money(sm.liabilities)],
          ['Net worth', money(sm.netWorth), true],
        ]),
        el('div', { class: 'card__title section-gap', text: 'Cash check' }),
        kv([
          ['Expected cash (start + savings − extra invested)', money(sm.expectedCash)],
          ['Actual bank balance', st.bankBalance != null && st.bankBalance !== '' ? money(num(st.bankBalance)) : '–'],
          ['Difference', bankDiff != null ? money(bankDiff) : '–', true, bankDiff != null ? sign(bankDiff) : ''],
        ]),
      ),
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'Your inputs' }),
        el('div', { class: 'form-grid' },
          settingInput(st, 'goalName', 'text', 'Goal name'),
          settingInput(st, 'goalAmount', 'money', 'Savings goal'),
          settingInput(st, 'startCash', 'money', 'Start amount', 'Cash you had before the first ledger month.'),
          settingInput(st, 'bankBalance', 'money', 'Actual bank balance', 'Compare with expected cash.', { nullable: true }),
        ),
        st.cpfEnabled ? el('div', null,
          el('div', { class: 'card__title section-gap', text: 'CPF' }),
          el('div', { class: 'form-grid' },
            settingInput(st.cpfStart, 'oa', 'money', 'Starting OA balance', 'Balance before your first ledger month.'),
            settingInput(st.cpfStart, 'sa', 'money', 'Starting SA balance'),
            settingInput(st.cpfStart, 'ma', 'money', 'Starting MA balance'),
            settingInput(st, 'cpfExtraRate', 'pct', 'Extra interest rate', '1% on the first $60k combined (max $20k from OA).'),
          ),
          sm.last ? kv([['OA', money(sm.last.oa)], ['SA', money(sm.last.sa)], ['MA', money(sm.last.ma)], ['Total CPF', money(sm.cpf), true]]) : null,
          el('p', { class: 'card__hint section-gap', text: 'Planning approximation: CPF credits interest yearly in January, while this accrues monthly. Re-calibrate the starting balances if they drift from your statement.' }),
        ) : null,
      ),
    ),
  );
}

function pageData() {
  const st = S.settings;
  return el('div', null,
    pageHead('Settings & data', KEY ? 'Everything stays on this device. Backups are encrypted with your passphrase.' : 'Everything stays on this device.'),
    el('div', { class: 'grid grid--two' },
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'Backup & restore' }),
        el('p', { class: 'card__hint', text: st.lastBackup ? `Last backup: ${dateLabel(st.lastBackup.slice(0, 10))}` : 'No backup yet. Browser data can be cleared by you, the browser, or the OS — keep a backup somewhere safe.' }),
        el('div', { class: 'page__actions' },
          el('button', { class: 'btn btn--primary', type: 'button', text: KEY ? 'Export encrypted backup' : 'Export backup', onclick: exportBackup }),
          el('button', { class: 'btn', type: 'button', text: 'Restore backup…', onclick: () => restoreFlow(false) }),
        ),
        el('div', { class: 'card__title section-gap', text: 'Unencrypted exports' }),
        el('p', { class: 'card__hint', text: 'Readable files for use elsewhere. Anyone with the file can read it.' }),
        el('div', { class: 'page__actions' },
          el('button', { class: 'btn', type: 'button', text: 'Ledger as CSV', onclick: exportLedgerCSV }),
          el('button', { class: 'btn', type: 'button', text: 'All data as JSON', onclick: exportPlainJSON }),
        ),
      ),
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'Import from your spreadsheet (CSV)' }),
        el('p', { class: 'card__hint', text: 'In Google Sheets: open a tab → File → Download → Comma-separated values. Import Assumptions first, then the Monthly Ledger (so one-off edits can be detected).' }),
        el('div', { class: 'chips' },
          ['assumptions', 'ledger', 'deposits', 'portfolio', 'liabilities'].map((t) => el('button', { class: 'btn btn--small', type: 'button', text: { assumptions: 'Assumptions History', ledger: 'Monthly Ledger', deposits: 'Investment deposits', portfolio: 'Portfolio values', liabilities: 'Liabilities' }[t], onclick: () => importCSV(t) })),
        ),
        el('p', { class: 'card__hint', text: 'Deposits / portfolio CSV: a header row with Date and Amount (or Value) columns, plus optional Notes.' }),
      ),
    ),
    el('div', { class: 'grid grid--two section-gap' },
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'General' }),
        el('div', { class: 'form-grid' },
          settingInput(st, 'currency', 'text', 'Currency code', 'e.g. SGD, MYR, TWD, HKD, USD'),
          settingInput(st, 'locale', 'text', 'Number format locale', 'e.g. en-SG, zh-TW, en-US'),
          KEY ? settingInput(st, 'autoLockMin', 'number', 'Auto-lock after (minutes idle)', '0 = never', { step: '1' }) : null,
          field('Appearance', el('select', { class: 'select', id: 'theme-select', onchange: (e) => setTheme(e.target.value) },
            [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, t]) => el('option', { value: v, selected: getTheme() === v, text: t }))), 'Saved on this device only.'),
          field('Track CPF', el('select', { class: 'select', onchange: (e) => { st.cpfEnabled = e.target.value === 'yes'; commit(); } },
            el('option', { value: 'yes', selected: st.cpfEnabled, text: 'Yes — Singapore CPF' }), el('option', { value: 'no', selected: !st.cpfEnabled, text: 'No' }))),
          settingInput(st, 'owCeiling', 'money', 'CPF ordinary wage ceiling / month', '0 = no ceiling. S$8,000 from 2026.'),
          settingInput(st, 'reliefCap', 'money', 'Personal relief cap / year'),
        ),
        el('div', { class: 'card__title section-gap', text: 'Security' }),
        el('div', { class: 'page__actions' },
          el('button', { class: 'btn', type: 'button', text: KEY ? 'Change passphrase' : 'Set a passphrase', onclick: changePass }),
          KEY ? el('button', { class: 'btn', type: 'button', text: 'Remove passphrase', onclick: removePass }) : null,
          el('button', { class: 'btn btn--danger', type: 'button', text: 'Erase this device…', onclick: eraseFlow }),
        ),
        el('p', { class: 'card__hint section-gap', text: KEY
          ? 'Encryption: AES-256-GCM with a key derived from your passphrase (PBKDF2-SHA256, 600,000 rounds). The passphrase is never stored.'
          : 'No passphrase: records are saved unencrypted in this browser, so anyone using this browser profile can open them. Set a passphrase to encrypt them (AES-256-GCM).' }),
      ),
      el('div', { class: 'card' },
        el('div', { class: 'card__title' }, el('span', { text: 'CPF contribution schedule' }), el('button', { class: 'btn btn--small', type: 'button', text: '+ Row', onclick: () => { const last = S.cpfSchedule[S.cpfSchedule.length - 1]; S.cpfSchedule.push({ ...last, id: uid() }); commit(); } })),
        el('p', { class: 'card__hint', text: 'Rows with the latest “From” date on or before a month are used. To add a new year, add one row per age band with the new From date. Contribution rates are % of wages; OA and MA allocations are shares of the total contribution, and SA/RA gets the rest.' }),
      ),
    ),
    el('div', { class: 'section-gap' }, editTable({
      cols: [
        { key: 'from', label: 'From', type: 'date' }, { key: 'ageAbove', label: 'Age above', type: 'number', step: '1' }, { key: 'ageUpTo', label: 'Age up to', type: 'number', step: '1' },
        { key: 'ee', label: 'Employee', type: 'pct' }, { key: 'er', label: 'Employer', type: 'pct' }, { key: 'oa', label: 'OA allocation', type: 'pct' }, { key: 'ma', label: 'MA allocation', type: 'pct' },
        { key: 'oaRate', label: 'OA interest', type: 'pct' }, { key: 'samaRate', label: 'SA/MA interest', type: 'pct' },
      ],
      rows: [...S.cpfSchedule].sort((a, b) => String(a.from).localeCompare(String(b.from)) || num(a.ageAbove) - num(b.ageAbove)),
      onDelete: (r) => undoable('CPF schedule row deleted', () => { S.cpfSchedule = S.cpfSchedule.filter((x) => x !== r); }),
    })),
    el('p', { class: 'card__hint section-gap', text: 'Ledger Local is a tracking tool, not financial or tax advice. Figures are estimates.' }),
  );
}

/* =====================================================================
 * 13. Import / export
 * ===================================================================== */
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = el('a', { href: url, download: name, class: 'hide' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
async function exportBackup() {
  S.settings.lastBackup = new Date().toISOString();
  const rec = await seal(S);
  download(`ledger-local-backup-${todayISO()}.json`, JSON.stringify(rec), 'application/json');
  commit();
  toast(KEY ? 'Encrypted backup downloaded' : 'Backup downloaded (not encrypted)');
}
async function exportPlainJSON() {
  if (!await confirmDialog('Export unencrypted data?', 'This file will NOT be encrypted. Anyone who gets it can read your finances.', 'Export JSON')) return;
  download(`ledger-local-plain-${todayISO()}.json`, JSON.stringify(S, null, 2), 'application/json');
}
function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
async function exportLedgerCSV() {
  if (!await confirmDialog('Export unencrypted CSV?', 'This CSV will NOT be encrypted. Anyone who gets it can read your ledger.', 'Export CSV')) return;
  const rows = computeLedger();
  const head = ['Month', 'Salary', 'Bonus', 'CPF', 'Employer CPF', 'After CPF', 'Food', 'Transport', 'Parents', 'Others', 'One-offs', 'Insurance', 'Income Tax', 'Investment', 'Savings', 'Cumulative Savings', 'CPF OA', 'CPF SA', 'CPF MA', 'MA Deductions', 'Savings Rate'];
  const lines = [head.join(',')].concat(rows.map((r) => [r.month, r.salary, r.bonus, r.ee, r.er, r.after, r.food, r.transport, r.parents, r.others, r.extras, r.insurance, r.tax, r.invest, r.savings, r.cum.savings, r.oa, r.sa, r.ma, r.maDed, r.savingsRate].map((v) => csvCell(typeof v === 'number' ? round2(v) : v)).join(',')));
  download(`ledger-${todayISO()}.csv`, lines.join('\n'), 'text/csv');
}

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
/** Finds the header row (within the first 6 rows) that matches the most of `want`. Returns {idx, map} with column indexes. */
function headerMap(rows, want) {
  let best = { idx: -1, map: {}, score: 0 };
  rows.slice(0, 6).forEach((r, i) => {
    const map = {}; let score = 0;
    for (const [key, patterns] of Object.entries(want)) {
      const j = r.findIndex((c) => patterns.some((p) => p.test(c.trim())));
      if (j >= 0) { map[key] = j; score++; }
    }
    if (score > best.score) best = { idx: i, map, score };
  });
  return best;
}
const H = {
  effective: [/^effective date$/i, /^effective/i, /^date$/i],
  salary: [/^salary$/i, /^salary/i],
  workDays: [/work days/i],
  foodDay: [/^food\s*\/\s*day/i, /^food per day/i],
  transportDay: [/^transport\s*\/\s*day/i, /^transport per day/i],
  parents: [/^parents/i],
  investPct: [/^investment %/i, /^invest.*%/i],
  others: [/^others/i],
  notes: [/^notes?$/i],
  age: [/^age \(years\)/i, /^age$/i],
  month: [/^month/i],
  bonus: [/^bonus$/i],
  maDed: [/^ma deductions?$/i],
  food: [/^food$/i],
  transport: [/^transport$/i],
  date: [/date/i, /^month/i],
  amount: [/^amount$/i, /deposit/i, /^amount/i, /invested/i],
  value: [/^value$/i, /portfolio value/i, /value/i],
  item: [/^item$/i, /^name$/i, /liabilit/i],
  balance: [/balance/i, /^amount$/i],
  rate: [/interest/i, /rate/i],
  payment: [/payment/i],
};
async function importCSV(type) {
  const file = await pickFile('.csv,text/csv');
  if (!file) return;
  const rows = parseCSV(await file.text());
  const pick = (keys) => Object.fromEntries(keys.map((k) => [k, H[k]]));
  let added = 0, adjusted = 0;
  const cellAt = (r, map, k) => (map[k] != null ? r[map[k]] : undefined);

  if (type === 'assumptions') {
    const { idx, map } = headerMap(rows, pick(['effective', 'salary', 'workDays', 'foodDay', 'transportDay', 'parents', 'investPct', 'others', 'notes', 'age']));
    if (idx < 0 || map.effective == null || map.salary == null) return toast('Could not find “Effective Date” and “Salary” columns.');
    for (const r of rows.slice(idx + 1)) {
      const eff = normDate(cellAt(r, map, 'effective'));
      const sal = parseNum(cellAt(r, map, 'salary'));
      if (!eff || sal == null || eff.length < 10) continue;
      S.assumptions = S.assumptions.filter((a) => a.effective !== eff);
      S.assumptions.push({
        id: uid(), effective: eff, salary: sal,
        age: parseNum(cellAt(r, map, 'age')) ?? 30,
        workDays: parseNum(cellAt(r, map, 'workDays')) ?? 22,
        foodDay: parseNum(cellAt(r, map, 'foodDay')) ?? 0,
        transportDay: parseNum(cellAt(r, map, 'transportDay')) ?? 0,
        parents: parseNum(cellAt(r, map, 'parents')) ?? 0,
        investPct: parseNum(cellAt(r, map, 'investPct')) ?? 0,
        others: parseNum(cellAt(r, map, 'others')) ?? 0,
        notes: (cellAt(r, map, 'notes') || '').trim(),
      });
      added++;
    }
  } else if (type === 'ledger') {
    const { idx, map } = headerMap(rows, pick(['month', 'salary', 'bonus', 'maDed', 'food', 'transport', 'parents', 'others']));
    if (idx < 0 || map.month == null) return toast('Could not find a “Month” column.');
    const imported = [];
    for (const r of rows.slice(idx + 1)) {
      const m = normDate(cellAt(r, map, 'month'));
      if (!m || !/^\d{4}-\d{2}/.test(m)) continue;
      const ym = m.slice(0, 7);
      let e = S.ledger.find((x) => x.month === ym);
      if (!e) { e = { id: uid(), month: ym }; S.ledger.push(e); }
      e.bonus = parseNum(cellAt(r, map, 'bonus')) ?? 0;
      e.maDed = parseNum(cellAt(r, map, 'maDed')) ?? 0;
      imported.push([e, r]);
      added++;
    }
    // Detect months that were edited by hand in the sheet: if the sheet value differs from ours, keep it as an override.
    const comp = Object.fromEntries(computeLedger().map((x) => [x.entry.id, x]));
    for (const [e, r] of imported) {
      for (const k of ['salary', 'food', 'transport', 'parents', 'others']) {
        const v = parseNum(cellAt(r, map, k));
        if (v == null || !comp[e.id]) continue;
        if (Math.abs(v - comp[e.id][k]) > 0.01) { e[k] = v; adjusted++; }
      }
    }
  } else if (type === 'deposits' || type === 'portfolio') {
    const vk = type === 'deposits' ? 'amount' : 'value';
    const { idx, map } = headerMap(rows, pick(['date', vk, 'notes']));
    if (idx < 0 || map.date == null || map[vk] == null) return toast(`Could not find Date and ${vk === 'amount' ? 'Amount' : 'Value'} columns.`);
    // Sheets with side-by-side blocks: use the date column closest to the left of the value column.
    const hdr = rows[idx];
    for (let j = map[vk] - 1; j >= 0; j--) if (H.date.some((p) => p.test(hdr[j].trim()))) { map.date = j; break; }
    const nj = hdr.findIndex((c, j) => j > map[vk] && /^notes?$/i.test(c.trim()));
    map.notes = nj >= 0 && nj <= map[vk] + 2 ? nj : undefined;
    for (const r of rows.slice(idx + 1)) {
      let d = normDate(cellAt(r, map, 'date'));
      const v = parseNum(cellAt(r, map, vk));
      if (!d || v == null || /total/i.test(r.join(' '))) continue;
      if (d.length === 7) d += '-01';
      (type === 'deposits' ? S.deposits : S.portfolio).push({ id: uid(), date: d, [vk]: v, notes: (cellAt(r, map, 'notes') || '').trim() });
      added++;
    }
  } else if (type === 'liabilities') {
    const { idx, map } = headerMap(rows, pick(['item', 'balance', 'rate', 'payment', 'notes']));
    if (idx < 0 || map.item == null || map.balance == null) return toast('Could not find Item and Balance columns.');
    for (const r of rows.slice(idx + 1)) {
      const name = (cellAt(r, map, 'item') || '').trim();
      const bal = parseNum(cellAt(r, map, 'balance'));
      if (!name || bal == null || /total|\(none/i.test(name)) continue;
      S.liabilities.push({ id: uid(), name, balance: bal, rate: parseNum(cellAt(r, map, 'rate')) ?? 0, payment: parseNum(cellAt(r, map, 'payment')) ?? 0, notes: (cellAt(r, map, 'notes') || '').trim() });
      added++;
    }
  }
  commit();
  toast(added ? `Imported ${added} row${added === 1 ? '' : 's'}${adjusted ? `, ${adjusted} hand-edited value${adjusted === 1 ? '' : 's'} kept` : ''}` : 'No rows found in that file.');
}

/** Sets a passphrase, or changes it when one is already set. */
function changePass() {
  const had = !!KEY;
  const p0 = el('input', { class: 'input', type: 'password', placeholder: 'Current passphrase', autocomplete: 'current-password' });
  const p1 = el('input', { class: 'input', type: 'password', placeholder: 'New passphrase (10+ characters)', autocomplete: 'new-password' });
  const p2 = el('input', { class: 'input', type: 'password', placeholder: 'Confirm new passphrase', autocomplete: 'new-password' });
  const err = el('div', { class: 'lock__error' });
  const hint = had ? 'Old backups keep their old passphrase. Export a new backup afterwards.' : 'Your records will be encrypted with it. There is no reset — forget it and the data cannot be recovered.';
  openDialog(had ? 'Change passphrase' : 'Set a passphrase', [had ? field('Current', p0) : null, field('New', p1), field('Confirm', p2), err, el('p', { class: 'card__hint', text: hint })].filter(Boolean), [
    { label: 'Cancel' },
    {
      label: had ? 'Change' : 'Set passphrase', primary: true, keepOpen: true,
      run: async () => {
        err.textContent = '';
        if (had) {
          const rec = await VAULT.get();
          try { await openSealed(rec, p0.value); } catch { err.textContent = 'Current passphrase is wrong.'; return; }
        }
        if (p1.value.length < 10) { err.textContent = 'Use at least 10 characters.'; return; }
        if (p1.value !== p2.value) { err.textContent = 'New passphrases do not match.'; return; }
        await setPassphrase(p1.value);
        $('#dlg').close();
        toast(had ? 'Passphrase changed' : 'Passphrase set — records are now encrypted');
        lastActivity = Date.now();
        renderShell();
      },
    },
  ]);
  setTimeout(() => (had ? p0 : p1).focus(), 50);
}

function removePass() {
  const p0 = el('input', { class: 'input', type: 'password', placeholder: 'Current passphrase', autocomplete: 'current-password' });
  const err = el('div', { class: 'lock__error' });
  openDialog('Remove passphrase', [
    el('p', { text: 'Your records will be saved in this browser without encryption, and the app will open without asking for a passphrase. Anyone using this browser profile could read them.' }),
    field('Current passphrase', p0), err,
  ], [
    { label: 'Cancel' },
    {
      label: 'Remove passphrase', danger: true, keepOpen: true,
      run: async () => {
        err.textContent = '';
        const rec = await VAULT.get();
        try { await openSealed(rec, p0.value); } catch { err.textContent = 'Current passphrase is wrong.'; return; }
        KEY = null; META = null;
        await persist();
        $('#dlg').close();
        toast('Passphrase removed');
        renderShell();
      },
    },
  ]);
  setTimeout(() => p0.focus(), 50);
}

/* =====================================================================
 * 14. Sample data (fictional)
 * ===================================================================== */
function sampleData() {
  const d = defaultData();
  const start = addMonths(thisMonth(), -10);
  d.settings = { ...d.settings, startCash: 8000, goalName: 'Emergency fund + house', goalAmount: 60000, cpfStart: { oa: 12000, sa: 4000, ma: 6000 }, bankBalance: null };
  d.assumptions = [
    { id: uid(), effective: addMonths(start, -1) + '-28', salary: 4200, age: 28, workDays: 22, foodDay: 12, transportDay: 4.5, parents: 400, investPct: 0.2, others: 150, notes: 'Example starting point' },
    { id: uid(), effective: addMonths(start, 5) + '-01', salary: 4500, age: 28, workDays: 22, foodDay: 13, transportDay: 4.5, parents: 400, investPct: 0.25, others: 150, notes: 'Example raise' },
  ];
  for (let i = 0; i < 10; i++) d.ledger.push({ id: uid(), month: addMonths(start, i), bonus: i === 6 ? 2000 : 0, maDed: 0, ...(i === 3 ? { extras: [{ label: 'Laptop repair', amount: 280 }] } : {}) });
  for (let i = 0; i < 10; i++) d.deposits.push({ id: uid(), date: addMonths(start, i + 1) + '-01', amount: i < 5 ? 750 : 1000, notes: 'Index fund' });
  d.portfolio = [
    { id: uid(), date: addMonths(start, 4) + '-15', value: 3900, notes: '' },
    { id: uid(), date: addMonths(start, 9) + '-15', value: 8900, notes: '' },
  ];
  d.liabilities = [{ id: uid(), name: 'Example study loan', balance: 6000, rate: 0.045, payment: 300, notes: '' }];
  d.policies = [{ id: uid(), name: 'Example life policy', start: addMonths(start, 2) + '-15', years: 20, premium: 1800, actual: { 0: 1800 } }];
  const y = thisMonth().slice(0, 4);
  d.reliefs[y] = [{ id: uid(), name: 'Parent Relief (living with parent)', amount: 9000 }];
  return d;
}

/* =====================================================================
 * 15. Boot
 * ===================================================================== */
// Theme is a device preference kept outside the vault, so the lock screen can use it too.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function getTheme() { try { return localStorage.getItem('ledger-theme') || 'system'; } catch { return 'system'; } }
const effectiveTheme = () => { const t = getTheme(); return t === 'system' ? (darkQuery.matches ? 'dark' : 'light') : t; };
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  // Browser/OS chrome (address bar, installed-app title bar) follows the page.
  $('meta[name="theme-color"]')?.setAttribute('content', effectiveTheme() === 'dark' ? '#121212' : '#7d5f26');
  document.querySelectorAll('.theme-toggle').forEach((b) => b.replaceWith(themeButton()));
  const sel = $('#theme-select');
  if (sel) sel.value = t;
}
function setTheme(t) {
  try { localStorage.setItem('ledger-theme', t); } catch { /* private mode: applies for this visit only */ }
  applyTheme(t);
}
// One-tap switch between light and dark; "Match device" stays available in Settings.
function themeButton() {
  const dark = effectiveTheme() === 'dark';
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  return el('button', { class: 'btn btn--icon theme-toggle', type: 'button', 'aria-label': label, title: label, onclick: () => setTheme(dark ? 'light' : 'dark') }, icon(dark ? 'sun' : 'moon'));
}
darkQuery.addEventListener('change', () => applyTheme(getTheme()));
applyTheme(getTheme());
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (!window.crypto?.subtle || !window.indexedDB) {
  $('#app').append(el('div', { class: 'lock' }, el('div', { class: 'card lock__card' }, el('h1', { text: 'Browser not supported' }), el('p', { text: 'This app needs Web Crypto and IndexedDB. Open it over https:// in a current browser (not a private window on some browsers).' }))));
} else {
  renderLock();
}
