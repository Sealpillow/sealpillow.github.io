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

/*
 * Budget lines: the spending and extra-income categories. Each Assumptions row holds an amount per line
 * (a.lines[id]) — per month, or per work day for basis 'workday'. A ledger month can override any line
 * (e.lines[id]). Income lines add to take-home; `taxable` ones also count toward projected income tax.
 */
// The four fixed columns of version 1 keep these ids, so migrated data and spreadsheet imports line up.
const LEGACY_LINES = {
  food: { name: 'Food', kind: 'expense', basis: 'workday' },
  transport: { name: 'Transport', kind: 'expense', basis: 'workday' },
  parents: { name: 'Parents', kind: 'expense', basis: 'month' },
  others: { name: 'Others', kind: 'expense', basis: 'month' },
};
const defaultLines = () => Object.entries(LEGACY_LINES).map(([id, l]) => ({ id, ...l }));
const LINE_PRESETS = [
  { name: 'Rent / housing', kind: 'expense', basis: 'month' },
  { name: 'Utilities & phone', kind: 'expense', basis: 'month' },
  { name: 'Groceries', kind: 'expense', basis: 'month' },
  { name: 'Dining out', kind: 'expense', basis: 'month' },
  { name: 'Shopping', kind: 'expense', basis: 'month' },
  { name: 'Healthcare', kind: 'expense', basis: 'month' },
  { name: 'Childcare & school fees', kind: 'expense', basis: 'month' },
  { name: 'Kids’ enrichment', kind: 'expense', basis: 'month' },
  { name: 'Subscriptions', kind: 'expense', basis: 'month' },
  { name: 'Car (petrol, parking, ERP)', kind: 'expense', basis: 'month' },
  { name: 'Pets', kind: 'expense', basis: 'month' },
  { name: 'Side income', kind: 'income', basis: 'month', taxable: true },
  { name: 'Rental income (net)', kind: 'income', basis: 'month', taxable: true },
  { name: 'Dividends & interest', kind: 'income', basis: 'month', taxable: false },
];
// Costs that come round every few months. 'due' spends the whole amount in the due month;
// 'spread' sets amount ÷ every aside each month into a fund that pays it when due.
const RECURRING_PRESETS = [
  { name: 'Overseas holiday', amount: 3000, every: 12, mode: 'spread' },
  { name: 'Chinese New Year / festive', amount: 800, every: 12, mode: 'due', month: 2 },
  { name: 'Birthdays & gifts', amount: 600, every: 12, mode: 'spread' },
  { name: 'Road tax & car insurance', amount: 2000, every: 12, mode: 'due' },
  { name: 'Property tax', amount: 0, every: 12, mode: 'due', month: 1 },
  { name: 'Yearly subscriptions', amount: 0, every: 12, mode: 'due' },
];

/*
 * Singapore figures used by the housing, kids, retirement and insurance pages (checked Oct 2026 against
 * HDB, IRAS, CPF and MoneySense). Most are also editable on their pages; check the official sites when they change.
 */
const SG = {
  ltv: 0.75, // HDB and bank loan-to-value limit for a first housing loan
  hdbRate: 0.026, // HDB concessionary loan rate (pegged to the CPF OA rate)
  msr: 0.3, // Mortgage Servicing Ratio cap (HDB flats and ECs)
  tdsr: 0.55, // Total Debt Servicing Ratio cap
  bankMinCash: 0.05, // bank loans: at least 5% of the price in cash
  cpfHousingRate: 0.025, // accrued interest owed back to CPF OA on CPF used for housing
  bsd: [[180000, 0.01], [180000, 0.02], [640000, 0.03], [500000, 0.04], [1500000, 0.05], [Infinity, 0.06]], // Buyer's Stamp Duty bands
  qcr: 4000, childDisability: 7500, childCap: 50000, // per child; QCR + WMCR capped at $50k per child
  wmcrFixed: [8000, 10000, 12000], // children born from 2024: 1st, 2nd, 3rd+
  wmcrPct: [0.15, 0.2, 0.25], // children born before 2024: % of the mother's earned income
  ptr: [5000, 10000, 20000], // Parenthood Tax Rebate: 1st, 2nd, 3rd+
  frs2026: 220400, frsGrowth: 0.035, // Full Retirement Sum for those turning 55 in 2026; ~3.5% a year after
  cpfLifeAtFrs: 1780, // CPF's estimate: FRS at 55 → ~$1,780/month from 65 (Standard plan)
  coverDeath: 9, coverCI: 4, maxPremiumShare: 0.15, // MoneySense Basic Financial Planning Guide
};
// Official pages behind those figures, shown next to them and listed in Settings & data so they can be checked.
const SOURCES_CHECKED = 'October 2026';
const SOURCES = {
  taxRates: { label: 'IRAS: income tax rates', covers: 'Resident tax brackets from YA 2024', url: 'https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates' },
  reliefs: { label: 'IRAS: tax reliefs', covers: 'Personal reliefs and the $80,000 relief cap', url: 'https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-reliefs-rebates-and-deductions/tax-reliefs' },
  qcr: { label: 'IRAS: Qualifying Child Relief', covers: 'QCR $4,000, Child Relief (Disability) $7,500, $50,000 per-child cap with WMCR', url: 'https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-reliefs-rebates-and-deductions/tax-reliefs/qualifying-child-relief-(qcr)-handicapped-child-relief-(hcr)' },
  wmcr: { label: 'IRAS: Working Mother’s Child Relief', covers: 'WMCR $8k / $10k / $12k from 2024; 15% / 20% / 25% before', url: 'https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-reliefs-rebates-and-deductions/tax-reliefs/working-mother\'s-child-relief-(wmcr)' },
  newborn: { label: 'IRAS: I have a newborn', covers: 'Parenthood Tax Rebate $5k / $10k / $20k', url: 'https://www.iras.gov.sg/taxes/individual-income-tax/employees/your-situation/i-have-a-newborn' },
  bsd: { label: 'IRAS: Buyer’s Stamp Duty', covers: 'BSD bands 1%–6%', url: 'https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer\'s-stamp-duty-(bsd)' },
  cpfRates: { label: 'CPF: contribution rates', covers: 'Employee and employer rates by age', url: 'https://www.cpf.gov.sg/employer/employer-obligations/how-much-cpf-contributions-to-pay' },
  cpfAlloc: { label: 'CPF: allocation rates 2026 (PDF)', covers: 'OA / SA (RA) / MA shares by age', url: 'https://www.cpf.gov.sg/content/dam/web/employer/employer-obligations/documents/CPFAllocationRatesfromJanuary2026.pdf' },
  cpfPayouts: { label: 'CPF: how much payout can I get', covers: '2026 retirement sums; CPF LIFE ≈ $1,780/month for the FRS', url: 'https://www.cpf.gov.sg/service/article/how-much-cpf-payouts-can-i-get-every-month' },
  hdbLoan: { label: 'CPF: HDB loan vs bank loan', covers: 'HDB loan 2.6%, up to 75% of the price', url: 'https://www.cpf.gov.sg/member/infohub/educational-resources/3-differences-between-hdb-loan-and-bank-loan' },
  masLtv: { label: 'MAS: loan-to-value limits', covers: '75% LTV, 5% minimum cash (bank loans)', url: 'https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits' },
  masTdsr: { label: 'MAS: MSR and TDSR rules', covers: 'MSR 30% (HDB / EC), TDSR 55%', url: 'https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules' },
  cpfRefund: { label: 'CPF: refund when selling a property', covers: 'CPF used plus accrued interest goes back to your OA', url: 'https://www.cpf.gov.sg/member/home-ownership/using-your-cpf-to-buy-a-home/cpf-refund-when-selling-or-transferring-property' },
  moneysense: { label: 'MoneySense: Basic Financial Planning Guide', covers: '9× / 4× income cover, 3–6 months’ emergency fund, premiums ≤ 15% of income', url: 'https://www.moneysense.gov.sg/planning-your-finances-well/' },
  medishield: { label: 'CPF: MediShield Life', covers: 'Basic hospital cover sized for B2 / C wards', url: 'https://www.cpf.gov.sg/member/healthcare-financing/medishield-life' },
  shield: { label: 'CPF: Integrated Shield Plans', covers: 'How much of a plan’s premium MediSave can pay', url: 'https://www.cpf.gov.sg/member/healthcare-financing/getting-supplementary-coverage/integrated-shield-plan' },
};
/** "Sources: …" line of links to the official pages behind a page's figures. Opens in a new tab. */
function sourceLinks(...keys) {
  return el('p', { class: 'sources' }, 'Sources: ', keys.map((k, i) => [i ? ' · ' : '', el('a', { href: SOURCES[k].url, target: '_blank', rel: 'noopener noreferrer', title: SOURCES[k].covers, text: SOURCES[k].label + ' ↗' })]), ` (checked ${SOURCES_CHECKED})`);
}

// Monthly cost by a child's age. Amounts are yours to fill in — after subsidies, see ECDA (pre-school) and MOE fees.
const defaultStages = () => [
  ['Infant care', 0, 1.5], ['Pre-school', 1.5, 7], ['Primary school', 7, 13], ['Secondary school', 13, 17],
  ['JC / Poly / ITE', 17, 19], ['University', 19, 23],
].map(([name, from, to]) => ({ id: uid(), name, from, to, monthly: 0 }));

function defaultData() {
  return {
    version: 3,
    setup: { done: false, skipped: {} }, // first-run guided setup; skipped steps show as such in its checklist
    settings: {
      currency: 'SGD',
      locale: 'en-SG',
      cpfEnabled: true,
      startCash: 0,
      wmcr: false, // claim Working Mother's Child Relief
      childReliefShare: 1, // share of QCR / Parenthood Tax Rebate you claim (rest by your spouse)
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
    budgetLines: defaultLines(),
    recurring: [], // [{ id, name, amount, every, start: 'YYYY-MM', end, mode: 'due'|'spread' }]
    goals: [], // [{ id, name, target, by: 'YYYY-MM'|'', kind: 'custom'|'emergency', months }] — filled in this order
    housing: {
      status: 'none', // 'none' | 'rent' | 'own' | 'buying'
      value: 0, loanType: 'hdb', loanBalance: 0, loanAsOf: '', loanRate: SG.hdbRate, cpfMonthly: 0, cashMonthly: 0, cpfUsed: 0,
      plan: { price: 0, month: '', loanType: 'hdb', grants: 0, fees: 0, tenure: 25, rate: SG.hdbRate, cpfUse: null },
    },
    children: [], // [{ id, name, birthMonth: 'YYYY-MM', disability, studying }]
    childStages: defaultStages(),
    retire: { age: 65, spendMonthly: null, returnRate: 0.05, inflation: 0.025, swr: 0.04, lifeExpectancy: 90 },
    assumptions: [],
    // Copies, so editing a vault's tables never changes the built-in defaults.
    cpfSchedule: structuredClone(DEFAULT_CPF),
    ledger: [],
    deposits: [],
    portfolio: [], // [{ date, value, account? }] — each account keeps its own latest value; blank = typed-in total
    dividends: [], // [{ date, amount, account }] from imported statements
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
  for (const k of ['assumptions', 'ledger', 'deposits', 'portfolio', 'dividends', 'liabilities', 'policies', 'recurring', 'goals', 'children']) if (!Array.isArray(out[k])) out[k] = [];
  if (!Array.isArray(out.childStages)) out.childStages = base.childStages;
  out.housing = { ...base.housing, ...(d.housing || {}), plan: { ...base.housing.plan, ...(d.housing?.plan || {}) } };
  out.retire = { ...base.retire, ...(d.retire || {}) };
  // Version 2 had a single goal in settings; it becomes the first entry of the goals list.
  if (!Array.isArray(d.goals) && num(d.settings?.goalAmount) > 0) {
    out.goals = [{ id: uid(), name: d.settings.goalName || 'Savings goal', target: num(d.settings.goalAmount), by: '', kind: 'custom' }];
  }
  delete out.settings.goalName; delete out.settings.goalAmount;
  // Version 1 had four fixed columns (food/day, transport/day, parents, others). Move them into budget
  // lines with the same ids, including any one-month overrides on ledger rows.
  if (!Array.isArray(d.budgetLines)) {
    out.budgetLines = defaultLines();
    const fromRow = { food: 'foodDay', transport: 'transportDay', parents: 'parents', others: 'others' };
    for (const a of out.assumptions) {
      a.lines = a.lines || {};
      for (const [id, k] of Object.entries(fromRow)) { if (a[k] != null) a.lines[id] = num(a[k]); delete a[k]; }
    }
    for (const e of out.ledger) {
      e.lines = e.lines || {};
      for (const id of Object.keys(LEGACY_LINES)) { if (e[id] != null && e[id] !== '') e.lines[id] = e[id]; delete e[id]; }
    }
  }
  // Vaults from before the guided setup are already in use, so it counts as done for them.
  out.setup = { done: !!(d.assumptions?.length || d.ledger?.length), skipped: {}, ...(d.setup || {}) };
  out.version = 3;
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

/** Planned monthly investing from an Assumptions row: a fixed amount, or a % of after-CPF pay (the default). */
const plannedInvest = (a, after) => (a?.investMode === 'amount' ? num(a.investAmt) : after * num(a?.investPct));
const investsMonthly = (a) => (a?.investMode === 'amount' ? num(a.investAmt) : num(a?.investPct)) > 0;
const INVEST_MODES = [['pct', '% of after-CPF pay'], ['amount', 'Fixed amount']];
/** Switch how a row's investing is set, carrying the figure over so the planned amount stays about the same. */
function setInvestMode(a, mode) {
  const ym = a.effective?.slice(0, 7) || thisMonth();
  const ee = S.settings.cpfEnabled ? num(cpfFor(ym, ageAt(ym, a)).ee) : 0;
  const salary = num(a.salary), ceiling = num(S.settings.owCeiling);
  const after = salary - (ceiling > 0 ? Math.min(salary, ceiling) : salary) * ee;
  if (mode === 'amount' && a.investMode !== 'amount') a.investAmt = Math.round(after * num(a.investPct));
  if (mode === 'pct' && a.investMode === 'amount') a.investPct = after > 0 ? Math.round((num(a.investAmt) / after) * 10000) / 10000 : 0;
  a.investMode = mode;
  commit({ defer: true });
}
const investModeSelect = (a) => el('select', { class: 'select', 'aria-label': 'Invest as', onchange: (e) => setInvestMode(a, e.target.value) },
  INVEST_MODES.map(([v, t]) => el('option', { value: v, text: t, selected: (a.investMode || 'pct') === v })));

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
const childrenByBirth = () => S.children.filter((c) => c.birthMonth).sort(byKey('birthMonth'));
const childName = (c, i) => c.name || `Child ${i + 1}`;
/**
 * Automatic child reliefs for an income year: QCR (or Child Relief (Disability)) while the child is under 16 or
 * studying full-time, plus WMCR if claimed — fixed amounts for children born from 2024, % of the mother's earned
 * income before that, capped at $50k per child with QCR and at her earned income overall.
 */
function childReliefs(year, earned = 0) {
  const share = S.settings.childReliefShare ?? 1;
  const out = [];
  let wmcrLeft = Math.max(0, earned);
  childrenByBirth().forEach((c, i) => {
    const age = +year - +c.birthMonth.slice(0, 4);
    if (age < 0 || (age >= 16 && (c.studying === false || age > 25))) return;
    const qcr = (c.disability ? SG.childDisability : SG.qcr) * num(share);
    out.push({ id: 'qcr-' + c.id, name: `${childName(c, i)} — ${c.disability ? 'Child Relief (Disability)' : 'Qualifying Child Relief'}`, amount: qcr, auto: true });
    if (S.settings.wmcr) {
      const k = Math.min(i, 2);
      const w = Math.min(c.birthMonth >= '2024-01' ? SG.wmcrFixed[k] : SG.wmcrPct[k] * earned, SG.childCap - qcr, wmcrLeft);
      wmcrLeft -= Math.max(0, w);
      if (w > 0) out.push({ id: 'wmcr-' + c.id, name: `${childName(c, i)} — Working Mother’s Child Relief`, amount: w, auto: true });
    }
  });
  return out;
}
/** Parenthood Tax Rebate earned in an income year (children born that year); unused rebate carries forward. */
function ptrFor(year) {
  return sum(childrenByBirth().map((c, i) => (c.birthMonth.slice(0, 4) === String(year) ? SG.ptr[Math.min(i, 2)] * num(S.settings.childReliefShare ?? 1) : 0)));
}
function reliefTotal(year, earned = 0) {
  const list = [...childReliefs(year, earned), ...(S.reliefs[year] || [])];
  const r = Math.min(num(S.settings.reliefCap) || Infinity, sum(list, (x) => x.amount));
  return r + num(S.donations[year]) * num(S.settings.donationMultiplier);
}
/** Monthly cost of the children for a month, from the age-stage table. */
function kidsCostFor(ym) {
  let total = 0;
  const items = [];
  for (const c of S.children) {
    if (!c.birthMonth || ym < c.birthMonth) continue;
    const age = monthDiff(c.birthMonth, ym) / 12;
    const st = S.childStages.find((s) => age >= num(s.from) && age < num(s.to));
    if (st && num(st.monthly)) { total += num(st.monthly); items.push({ child: c, stage: st }); }
  }
  return { total, items };
}
function stampDuty(price) {
  let left = num(price), duty = 0;
  for (const [band, rate] of SG.bsd) { const part = Math.min(left, band); duty += part * rate; left -= part; if (left <= 0) break; }
  return duty;
}
/** Level monthly instalment for a loan (annuity). */
function instalment(loan, rate, years) {
  const n = Math.round(num(years) * 12), r = num(rate) / 12;
  if (!(loan > 0) || n <= 0) return 0;
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
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
      items.push({ policy: p.name, year: k + 1, amount: amt, medisave: p.payer === 'medisave' });
    }
  }
  // Premiums paid from MediSave (e.g. Integrated Shield plans) come out of the MA, not take-home pay.
  const medisave = sum(items.filter((i) => i.medisave), (i) => i.amount);
  return { total, cash: total - medisave, medisave, items };
}

const everyOf = (it) => Math.max(1, Math.round(num(it.every)) || 12);
/** Last due month of a recurring item (null when it never ends, '' when it ends before it starts). */
function lastDueOf(it) {
  if (!it.end) return null;
  const k = monthDiff(it.start, it.end);
  return k < 0 ? '' : addMonths(it.start, Math.floor(k / everyOf(it)) * everyOf(it));
}
function recurringDue(it, ym) {
  if (!it.start) return false;
  const k = monthDiff(it.start, ym);
  return k >= 0 && k % everyOf(it) === 0 && (!it.end || ym <= it.end);
}
/** Monthly set-aside for a 'spread' item: starts `every` months before the first due month, so the fund is full when it is paid. */
function setAsideFor(it, ym) {
  if (it.mode !== 'spread' || !it.start) return 0;
  const last = lastDueOf(it);
  if (monthDiff(it.start, ym) < -(everyOf(it) - 1) || (last != null && (last === '' || ym > last))) return 0;
  return num(it.amount) / everyOf(it);
}
function nextDue(it, from = thisMonth()) {
  if (!it.start) return null;
  const k = monthDiff(it.start, from);
  const due = addMonths(it.start, k <= 0 ? 0 : Math.ceil(k / everyOf(it)) * everyOf(it));
  return it.end && due > it.end ? null : due;
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
  const cum = { after: 0, income: 0, otherIncome: 0, salary: 0, savings: 0, ee: 0, er: 0, exp: 0, lines: {}, tax: 0, invest: 0, insurance: 0, recurring: 0, extras: 0, maDed: 0, home: 0, kids: 0 };
  const ytdAfter = {}, ytdGross = {};
  const fund = {}; // set-aside balance per 'spread' recurring item
  // Home loan, followed month by month from the month its balance was entered for.
  const hs = S.housing, owning = hs.status === 'own';
  let loanBal = num(hs.loanBalance), cpfUsed = num(hs.cpfUsed);
  // Parenthood Tax Rebate: a pool per income year, used against that year's tax, the rest carried forward.
  const ptr = { year: null, pool: 0, applied: 0 };
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
    const lines = {}, lineOverrides = [];
    let spendLines = 0, otherIncome = 0, taxableOther = 0;
    for (const l of S.budgetLines) {
      const o = e.lines?.[l.id];
      const v = o != null && o !== '' ? num(o) : num(a.lines?.[l.id]) * (l.basis === 'workday' ? workDays : 1);
      if (o != null && o !== '') lineOverrides.push(l.id);
      lines[l.id] = v;
      if (l.kind === 'income') { otherIncome += v; if (l.taxable) taxableOther += v; } else spendLines += v;
    }
    const takeHome = after + otherIncome;
    const invest = ov('invest', plannedInvest(a, after));
    const prem = premiumsFor(e.month);
    const extras = sum(e.extras || [], (x) => x.amount);

    // Recurring costs: 'due' items are spent in their due month; 'spread' items set money aside every
    // month and pay from that fund, so only the set-aside counts as this month's spending.
    let recurring = 0;
    const recurringItems = [];
    for (const it of S.recurring) {
      const due = recurringDue(it, e.month);
      const o = e.recurring?.[it.id];
      const paid = due ? (o != null && o !== '' ? num(o) : num(it.amount)) : 0;
      const put = setAsideFor(it, e.month);
      if (it.mode === 'spread') fund[it.id] = (fund[it.id] || 0) + put - paid;
      const cost = it.mode === 'spread' ? put : paid;
      recurring += cost;
      if (due || put) recurringItems.push({ item: it, due, paid, setAside: put, cost, adjusted: due && o != null && o !== '' });
    }

    // Income tax: projected chargeable income for the calendar year ÷ 12 (same as the sheet's column K).
    // Taxable extra income (side, rental) is projected the same way as pay.
    const [yy, mm] = e.month.split('-').map(Number);
    ytdAfter[yy] = (ytdAfter[yy] || 0) + after + taxableOther;
    ytdGross[yy] = (ytdGross[yy] || 0) + salary + bonus;
    const payAfterCpf = ceiling > 0 ? Math.min(salary, ceiling) * (1 - num(c.ee)) + Math.max(0, salary - ceiling) : salary * (1 - num(c.ee));
    const projected = ytdAfter[yy] + (payAfterCpf + taxableOther) * (12 - mm);
    const earned = ytdGross[yy] + salary * (12 - mm); // projected gross pay, for % based WMCR
    const chargeable = Math.max(0, projected - earnedIncomeRelief(ageInYear(yy, a)) - reliefTotal(yy, earned));
    if (ptr.year !== yy) { ptr.pool = Math.max(0, ptr.pool - ptr.applied) + ptrFor(yy); ptr.year = yy; ptr.applied = 0; }
    const yearTax = taxOn(chargeable, table);
    ptr.applied = Math.min(ptr.pool, yearTax);
    const tax = e.tax != null && e.tax !== '' ? num(e.tax) : round2((yearTax - ptr.applied) / 12);

    const kids = kidsCostFor(e.month);

    // Home loan: interest accrues monthly; the instalment is paid from CPF OA first (as set), the rest in cash.
    let homeCash = 0, homeCpf = 0, loanInterest = 0;
    if (owning && hs.loanAsOf && e.month >= hs.loanAsOf && loanBal > 0) {
      loanInterest = (loanBal * num(hs.loanRate)) / 12;
      const pay = Math.min(num(hs.cpfMonthly) + num(hs.cashMonthly), loanBal + loanInterest);
      homeCpf = Math.min(num(hs.cpfMonthly), pay);
      homeCash = pay - homeCpf;
      loanBal = Math.max(0, loanBal + loanInterest - pay);
    }

    // CPF balances (monthly approximation of CPF interest incl. 1% extra on first $60k, max $20k from OA)
    const total = ee + er;
    const x = num(st.cpfExtraRate) / 12;
    const maAlloc = num(c.ma);
    const eOA = Math.min(oa, 20000);
    const eSA = Math.min(sa, 60000 - eOA);
    const eMA = Math.min(ma, Math.max(60000 - eOA - sa, 0));
    const maDed = num(e.maDed) + prem.medisave;
    const nOA = oa * (1 + num(c.oaRate) / 12) + total * num(c.oa);
    const nSA = sa * (1 + num(c.samaRate) / 12) + eOA * x + eSA * x + total * Math.max(0, 1 - num(c.oa) - maAlloc);
    const nMA = ma * (1 + num(c.samaRate) / 12) + eMA * x + total * maAlloc - maDed;
    // Whatever the OA cannot cover of the CPF share of the instalment is paid in cash.
    const fromOa = st.cpfEnabled ? Math.min(homeCpf, Math.max(0, nOA)) : 0;
    homeCash += homeCpf - fromOa;
    homeCpf = fromOa;
    if (st.cpfEnabled) { oa = nOA - fromOa; sa = nSA; ma = nMA; }
    if (owning && hs.loanAsOf && e.month >= hs.loanAsOf) cpfUsed = cpfUsed * (1 + SG.cpfHousingRate / 12) + homeCpf;

    const expenditure = spendLines + tax + prem.cash + extras + recurring + kids.total + homeCash;
    const savings = takeHome - expenditure - invest;

    if (!e.virtual) {
      cum.after += after; cum.income += takeHome; cum.otherIncome += otherIncome; cum.salary += salary + bonus; cum.savings += savings;
      cum.ee += ee; cum.er += er; cum.exp += expenditure; cum.tax += tax; cum.invest += invest; cum.insurance += prem.cash;
      cum.recurring += recurring; cum.extras += extras; cum.maDed += maDed; cum.home += homeCash; cum.kids += kids.total;
      for (const [id, v] of Object.entries(lines)) cum.lines[id] = (cum.lines[id] || 0) + v;
    }
    const sinking = sum(Object.values(fund));
    rows.push({
      entry: e, month: e.month, virtual: !!e.virtual, assumption: a, age, rates: c,
      salary, bonus, ee, er, after, otherIncome, takeHome, workDays, lines, invest, tax, chargeable, projected, earned,
      yearTax, ptrApplied: ptr.applied, ptrPool: ptr.pool,
      insurance: prem.cash, insuranceMedisave: prem.medisave, insuranceItems: prem.items, recurring, recurringItems, extras, expenditure, savings,
      kids: kids.total, kidsItems: kids.items, homeCash, homeCpf, loanInterest, loanBal, cpfUsed,
      savingsRate: takeHome ? savings / takeHome : 0,
      oa, sa, ma, cpfTotal: oa + sa + ma, maDed,
      cum: { ...cum, lines: { ...cum.lines } },
      sinking, funds: { ...fund }, // money set aside for 'spread' recurring costs and not yet paid out
      cash: num(st.startCash) + cum.savings + sinking,
      overrides: ['salary', 'workDays', 'invest', 'tax'].filter((k) => e[k] != null && e[k] !== ''),
      lineOverrides,
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
  const portfolio = portfolioTotal(pv);
  const liabilities = sum(S.liabilities, (l) => l.balance);
  const cumSavings = last ? last.cum.savings : 0;
  const cpf = st.cpfEnabled ? (last ? last.cpfTotal : num(st.cpfStart.oa) + num(st.cpfStart.sa) + num(st.cpfStart.ma)) : 0;
  // Set-aside funds are still cash in the bank, but earmarked — so in net worth, not in goal savings.
  const sinking = last ? last.sinking : 0;
  // Home: value and loan count in net worth, but not in liquid net worth. The loan balance follows the ledger
  // from the month it was entered for.
  const hs = S.housing, owning = hs.status === 'own';
  const tracked = owning && last && hs.loanAsOf && last.month >= hs.loanAsOf;
  const homeValue = owning ? num(hs.value) : 0;
  const homeLoan = owning ? (tracked ? last.loanBal : num(hs.loanBalance)) : 0;
  const cpfUsedHome = owning ? (tracked ? last.cpfUsed : num(hs.cpfUsed)) : 0;
  const homeEquity = homeValue - homeLoan;
  const netWorth = num(st.startCash) + cumSavings + sinking + portfolio + cpf + homeEquity - liabilities - extraInvested;
  const liquid = netWorth - cpf - homeEquity;
  const saved = num(st.startCash) + cumSavings + portfolio - extraInvested;
  const recent = rows.slice(-12);
  const pace = recent.length ? sum(recent, (r) => r.savings + r.invest) / recent.length : 0;
  const expectedCash = num(st.startCash) + cumSavings + sinking - extraInvested;
  // Emergency fund: cash in the bank (not counting set-aside money) ÷ average monthly spending excl. tax.
  const recent6 = rows.slice(-6);
  const spendAvg = recent6.length ? sum(recent6, (r) => r.expenditure - r.tax) / recent6.length : 0;
  const emergencyCash = expectedCash - sinking;
  const out = {
    rows, last, deposits, planned, extraInvested, portfolio, portfolioDate: pv.length ? pv[pv.length - 1].date : null,
    liabilities, cumSavings, sinking, cpf, netWorth, liquid, saved, pace, expectedCash,
    homeValue, homeLoan, homeEquity, cpfUsedHome, spendAvg, emergencyCash,
    emergencyMonths: spendAvg > 0 ? emergencyCash / spendAvg : null,
    goals: goalPlan(saved, pace, spendAvg),
  };
  out.milestones = S.goals.filter((g) => g.kind === 'milestone').map((g) => milestoneStatus(g, out));
  return out;
}

/*
 * Milestones: a target for a figure the app already tracks (cash, net worth, debts…). Unlike savings goals they
 * don't set money aside, so they never compete with each other. Dates assume the last 12 months' pace continues
 * and leave out investment growth, so they lean cautious.
 */
const MILESTONES = {
  cash: { short: 'Cash savings', about: 'Cash in your bank accounts, including money set aside for recurring costs. SSBs, T-bills and fixed deposits count as investments.' },
  wealth: { short: 'Savings + investments', about: 'Cash plus your investments. Not CPF or your home.' },
  networth: { short: 'Net worth', about: 'Everything: cash, investments, CPF and your home, less debts.' },
  portfolio: { short: 'Investments', about: 'Your portfolio value (Investments page).' },
  debt: { short: 'Debts left', about: 'Loans and debts on the Liabilities page — not your home loan.' },
  cpf: { short: 'CPF OA + SA', about: 'What forms your Retirement Account at 55.' },
  dividends: { short: 'Dividends, last 12 months', about: 'Cash dividends from imported statements.' },
  savingsRate: { short: 'Savings rate', about: 'Average share of take-home pay left over, last 12 months.' },
  fire: { short: 'Savings + investments vs FIRE number', about: 'Retirement spending ÷ safe withdrawal rate, from the Retirement page.' },
};
const ROUND_MILESTONES = [10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2000000];
/** The Full Retirement Sum for the year you turn 55 (current FRS grown at the assumed rate). */
function cohortFRS() {
  const b = S.settings.birthMonth;
  const year55 = b ? +b.slice(0, 4) + 55 : +thisMonth().slice(0, 4);
  return Math.round(SG.frs2026 * Math.pow(1 + SG.frsGrowth, Math.max(0, year55 - 2026)));
}
function milestoneStatus(g, sm) {
  const rows = sm.rows.slice(-12);
  const avg = (f) => (rows.length ? sum(rows, f) / rows.length : 0);
  const R = S.retire;
  let value = 0, target = num(g.target), pace = 0;
  switch (g.metric) {
    case 'cash': value = sm.expectedCash; pace = avg((r) => r.savings); break;
    case 'wealth': value = sm.expectedCash + sm.portfolio; pace = sm.pace; break;
    case 'networth': value = sm.netWorth; pace = sm.pace + avg((r) => r.ee + r.er); break;
    case 'portfolio': value = sm.portfolio; pace = avg((r) => r.invest); break;
    case 'cpf':
      value = sm.last ? sm.last.oa + sm.last.sa : num(S.settings.cpfStart.oa) + num(S.settings.cpfStart.sa);
      pace = avg((r) => (r.ee + r.er) * (1 - num(r.rates.ma)) - r.homeCpf);
      break;
    case 'dividends': value = sum(S.dividends.filter((d) => d.date.slice(0, 7) > addMonths(thisMonth(), -12)), (d) => d.amount); break;
    case 'savingsRate': value = avg((r) => r.savingsRate); break;
    case 'fire': {
      const spend = R.spendMonthly != null && R.spendMonthly !== '' ? num(R.spendMonthly) : sm.spendAvg;
      target = num(R.swr) > 0 ? (spend * 12) / num(R.swr) : 0;
      value = sm.expectedCash + sm.portfolio; pace = sm.pace;
      break;
    }
    case 'debt': value = sm.liabilities; target = 0; break;
    default: break;
  }
  const down = g.metric === 'debt';
  const start = down ? Math.max(num(g.startValue), value) : 0;
  const reached = down ? value <= 0.005 : target > 0 && value >= target;
  let reach = null;
  if (reached) reach = thisMonth();
  else if (down) {
    const plans = S.liabilities.filter((l) => num(l.balance) > 0).map(payoff);
    reach = plans.every((p) => p.months != null) ? plans.map((p) => p.date).sort().pop() : null;
  } else if (g.metric === 'cpf') {
    // CPF interest is guaranteed, so it counts: OA 2.5% and SA 4%, weighted by today's balances.
    const oa = sm.last ? sm.last.oa : num(S.settings.cpfStart.oa), sa = sm.last ? sm.last.sa : num(S.settings.cpfStart.sa);
    const r = (oa + sa > 0 ? (oa * 0.025 + sa * 0.04) / (oa + sa) : 0.03) / 12;
    let v = value, n = 0;
    while (v < target && n < 1200) { v = v * (1 + r) + Math.max(0, pace); n++; }
    reach = v >= target ? addMonths(thisMonth(), n) : null;
  } else if (pace > 0 && ['cash', 'wealth', 'networth', 'portfolio', 'fire'].includes(g.metric)) {
    reach = addMonths(thisMonth(), Math.ceil((target - value) / pace));
  }
  return {
    goal: g, value, target, reached, reach, pct: g.metric === 'savingsRate',
    progress: down ? (start > 0 ? 1 - value / start : 1) : target > 0 ? Math.min(1, Math.max(0, value / target)) : 0,
    onTrack: !g.by || reached || (reach != null && reach <= g.by),
    projects: down || ['cash', 'wealth', 'networth', 'portfolio', 'cpf', 'fire'].includes(g.metric),
  };
}

/** Portfolio value: the latest value of each account (typed-in values count as one account), added up. */
function portfolioTotal(entries) {
  const latest = {};
  for (const p of [...entries].filter((x) => x.date).sort(byKey('date'))) latest[p.account || ''] = num(p.value);
  return sum(Object.values(latest));
}

/**
 * Goals are filled in list order: savings so far go to the first goal until it is full, then the next; future
 * saving (the 12-month pace) does the same, so a later goal is reached after the ones above it.
 */
function goalPlan(saved, pace, spendAvg) {
  const now = thisMonth();
  let pool = Math.max(0, saved), months = 0;
  return S.goals.filter((g) => g.kind !== 'milestone').map((g) => {
    const target = g.kind === 'emergency' ? num(g.months || 6) * spendAvg : num(g.target);
    const have = Math.min(target, pool);
    pool -= have;
    const left = Math.max(0, target - have);
    if (months != null) months = left <= 0 ? months : pace > 0 ? months + Math.ceil(left / pace) : null;
    const reach = left <= 0 ? now : months != null ? addMonths(now, months) : null;
    const monthsLeft = g.by ? monthDiff(now, g.by) : null;
    const needPerMonth = g.by && left > 0 ? left / Math.max(1, monthsLeft) : 0;
    return { goal: g, target, have, left, progress: target > 0 ? have / target : 1, reach, monthsLeft, needPerMonth, onTrack: !g.by || left <= 0 || (reach != null && reach <= g.by) };
  });
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
  const firstMonth = S.ledger.map((e) => e.month).sort()[0];
  items.push(has(lastWorked) || firstMonth > lastWorked // a ledger that starts this month has no "last month" yet
    ? { ok: true, text: has(lastWorked) ? `Ledger row for ${monthLabel(lastWorked)} added` : `Ledger starts ${monthLabel(firstMonth)}` }
    : { ok: false, text: `Add the ledger row for ${monthLabel(lastWorked)}`, detail: 'Do this when the payslip for that month arrives.', go: 'ledger', cta: 'Add month' });
  const depThisMonth = S.deposits.some((d) => (d.date || '').slice(0, 7) === now);
  // Only remind people who invest: a planned investment % now, or deposits logged before.
  if (investsMonthly(assumptionFor(now)) || S.deposits.length) items.push(depThisMonth
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
  for (const it of S.recurring) {
    const due = nextDue(it, now);
    if (!due || !num(it.amount) || monthDiff(now, due) > 1) continue;
    items.push({ ok: false, text: `${it.name || 'Recurring cost'}: due ${due === now ? 'this month' : monthLabel(due)}`, detail: `Planned ${money(num(it.amount))}${it.mode === 'spread' ? ', paid from the money set aside' : ''}. If it costs something else, change it in that month’s ledger row.`, go: 'recurring', cta: 'View' });
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
  // Two ways in: the guided setup with your own numbers, or fictional sample data to look around first.
  const btn = el('button', { class: 'btn btn--primary btn--block', type: 'submit', 'data-start': 'setup', text: 'Set up step by step' });
  const sampleBtn = el('button', { class: 'btn btn--block', type: 'submit', 'data-start': 'sample', text: 'Explore with sample data first' });
  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const sample = e.submitter?.dataset.start === 'sample';
      err.textContent = '';
      if (usePass.checked) {
        if (p1.value.length < 10) { err.textContent = 'Use at least 10 characters (a short sentence works well).'; return; }
        if (p1.value !== p2.value) { err.textContent = 'The passphrases do not match.'; return; }
      }
      btn.disabled = sampleBtn.disabled = true;
      (sample ? sampleBtn : btn).textContent = 'Starting…';
      S = sample ? sampleData() : defaultData();
      if (usePass.checked) await setPassphrase(p1.value);
      else { KEY = null; META = null; await persist(); }
      lastActivity = Date.now();
      location.hash = sample ? '#/dashboard' : '#/setup';
      renderShell();
    },
  },
  el('div', { class: 'field' }, el('label', { class: 'field__hint', for: 'use-pass' }, usePass, ' Protect with a passphrase (encrypts your records)')),
  passBox,
  err,
  el('div', { class: 'start-choice' },
    btn,
    el('p', { class: 'field__hint', text: 'About 5 minutes: income, spending, savings, housing, family, goals and insurance — skip anything that doesn’t apply. Ends with a checklist of what’s missing.' }),
    sampleBtn,
    el('p', { class: 'field__hint', text: 'Fictional numbers to look around. To start your own afterwards, use Settings & data → Erase this device.' }),
  ));

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

function pickFile(accept, multiple = false) {
  return new Promise((res) => {
    const i = el('input', { type: 'file', accept, class: 'hide', multiple });
    i.addEventListener('change', () => { res(multiple ? [...i.files] : i.files[0] || null); i.remove(); });
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
    ...[body].flat(Infinity).filter((x) => x != null && x !== false),
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
/** Dropdown bound to obj[key]; options are [value, text] pairs (values may be non-strings). */
function selectFor(obj, key, options, label) {
  return el('select', {
    class: 'select', 'aria-label': label,
    onchange: (e) => { obj[key] = options[e.target.selectedIndex][0]; commit({ defer: true }); },
  }, options.map(([v, t]) => el('option', { value: String(v), selected: obj[key] === v, text: t })));
}
const lineLabel = (l) => (l.name || 'Unnamed') + (l.basis === 'workday' ? ' (per day)' : ' (per month)');
const expenseLines = () => S.budgetLines.filter((l) => l.kind !== 'income');
const incomeLines = () => S.budgetLines.filter((l) => l.kind === 'income');

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
function barChart(values, labels, { height = 180, format = (v) => pct(v, 0), label = 'Savings rate by month' } = {}) {
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
  return chartBox(draw, label + ': ' + values.map((v, i) => `${labels[i]} ${format(v)}`).join(', '));
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
  ['recurring', 'Recurring costs'],
  ['goals', 'Goals'],
  ['housing', 'Housing'],
  ['kids', 'Kids & education'],
  ['investments', 'Investments'],
  ['liabilities', 'Liabilities'],
  ['insurance', 'Insurance'],
  ['tax', 'Tax & reliefs'],
  ['retirement', 'Retirement'],
  ['networth', 'Net worth'],
  ['data', 'Settings & data'],
];
const route = () => (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
addEventListener('hashchange', () => S && render());

// Phone layout: these pages get a bottom tab each; the rest live under "More".
const TABS = ['dashboard', 'ledger', 'goals', 'networth'];
const TAB_LABEL = { dashboard: 'Home', ledger: 'Ledger', goals: 'Goals', networth: 'Net worth' };
const ICONS = {
  goals: 'M5 21V4M5 4h11l-2.5 4L16 12H5',
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

// Leaving the setup part-way (a link, the menu) keeps a "Back to setup" bar on other pages until you return,
// finish, or dismiss it — so you don't lose your place.
let setupReturn = null;
let setupFinishing = false;
function setupReturnBar() {
  const step = SETUP_STEPS.find(([id]) => setupReturn.includes('step=' + id)) || SETUP_STEPS[0];
  return el('div', { class: 'notice notice--info setup-return' },
    el('span', { text: `You’re part-way through setup (${step[1]}). ` }),
    el('button', { class: 'btn btn--small btn--primary', type: 'button', text: '← Back to setup', onclick: () => { location.hash = setupReturn; } }),
    el('button', { class: 'btn btn--icon btn--small', type: 'button', text: '×', 'aria-label': 'Hide this', title: 'Hide this', onclick: () => { setupReturn = null; render(); } }));
}

function render() {
  if (!S) return;
  const p = route();
  const page = PAGES.some(([id]) => id === p) || p === 'setup' ? p : 'dashboard';
  const prevView = $('#main')?.dataset.view || '';
  if (page === 'setup') setupReturn = null;
  else if (prevView.startsWith('#/setup') && !setupFinishing) setupReturn = prevView;
  setupFinishing = false;
  document.querySelectorAll('[data-page]').forEach((a) => {
    const on = a.dataset.page === page || (a.dataset.page === 'more' && !TABS.includes(page));
    a.classList.toggle('nav__link--active', on);
    if (a.dataset.page === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const main = $('#main');
  if (!main) return renderShell();
  // Same page re-rendering after an edit: keep window/table scroll and the focused field.
  // Each setup step counts as its own view, so moving between steps starts at the top.
  const viewKey = page === 'setup' ? location.hash : page;
  const same = main.dataset.view === viewKey;
  const wy = scrollY;
  const tableScroll = same ? [...main.querySelectorAll('.table-wrap')].map((w) => [w.scrollLeft, w.scrollTop]) : [];
  const focus = same ? focusKey(main) : null;
  const view = ({ dashboard: pageDashboard, ledger: pageLedger, setup: pageSetup, assumptions: pageAssumptions, recurring: pageRecurring, goals: pageGoals, housing: pageHousing, kids: pageKids, retirement: pageRetirement, investments: pageInvestments, liabilities: pageLiabilities, insurance: pageInsurance, tax: pageTax, networth: pageNetWorth, data: pageData }[page])();
  main.replaceChildren(...(setupReturn && page !== 'setup' ? [setupReturnBar()] : []), view);
  main.dataset.view = viewKey;
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

  // Until setup is finished, or while essentials are missing, point back to it.
  const missing = setupChecklist().filter((x) => x.level === 'essential' && !x.ok);
  if (!S.setup.done || missing.length) {
    frag.append(el('div', { class: 'notice notice--info' },
      !S.setup.done ? 'A few short steps will turn this into your own numbers. '
        : `Still missing: ${missing.map((x) => x.text.toLowerCase()).join(', ')}. `,
      el('a', { href: '#/setup?step=' + (S.setup.done ? 'review' : 'you'), text: S.setup.done ? 'See the checklist' : 'Continue setup' })));
  }

  frag.append(el('div', { class: 'grid grid--stats' },
    stat('Net worth', money(sm.netWorth), 'Incl. CPF', true),
    stat('Liquid net worth', money(sm.liquid), 'Excl. CPF'),
    stat('Left this month', cur ? money(cur.savings) : '–', cur ? `Savings rate ${pct(cur.savingsRate)}` : null),
    stat('Total CPF', money(sm.cpf), S.settings.cpfEnabled ? 'OA + SA + MA' : 'CPF tracking off'),
    stat('Emergency fund', sm.emergencyMonths != null ? `${sm.emergencyMonths.toFixed(1)} months` : '–', sm.emergencyMonths != null ? (sm.emergencyMonths >= 3 ? 'Of spending, in cash' : 'Aim for 3–6 months') : 'Needs a few ledger months'),
  ));

  const goal = el('div', { class: 'card' },
    el('div', { class: 'card__title' }, el('span', { text: 'Goals' }), el('a', { class: 'card__hint', href: '#/goals', text: 'All goals' })),
  );
  const shownGoals = [...sm.goals.map(goalBlock), ...sm.milestones.map(milestoneBlock)].slice(0, 4);
  if (shownGoals.length) goal.append(...shownGoals);
  else goal.append(el('p', { class: 'muted' }, 'No goals yet — add an emergency fund, a home down payment or a holiday on ', el('a', { href: '#/goals', text: 'Goals' }), '.'));

  const month = el('div', { class: 'card' }, el('div', { class: 'card__title', text: `This month (from current assumptions)` }));
  if (cur) {
    month.append(kv([
      ['Salary' + (cur.bonus ? ' + bonus' : ''), money(cur.salary + cur.bonus)],
      ['CPF (employee)', '−' + money(cur.ee)],
      ['After CPF', money(cur.after), true],
      ...(cur.otherIncome ? [...incomeLines().filter((l) => cur.lines[l.id]).map((l) => [l.name, '+' + money(cur.lines[l.id])]), ['Take-home', money(cur.takeHome), true]] : []),
      ...expenseLines().filter((l) => cur.lines[l.id]).map((l) => [l.name, '−' + money(cur.lines[l.id])]),
      ['Income tax (monthly)', '−' + money(cur.tax)],
      ...(cur.insurance ? [['Insurance premium', '−' + money(cur.insurance)]] : []),
      ...cur.recurringItems.filter((x) => x.cost).map((x) => [`${x.item.name || 'Recurring'}${x.item.mode === 'spread' ? ' (set aside)' : ''}`, '−' + money(x.cost)]),
      ...(cur.kids ? [['Kids', '−' + money(cur.kids)]] : []),
      ...(cur.homeCash ? [['Home loan (cash part)', '−' + money(cur.homeCash)]] : []),
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
          ...expenseLines().map((l) => ({ label: l.name || 'Spending', value: sm.last.cum.lines[l.id] || 0 })),
          { label: 'One-offs', value: sm.last.cum.extras }, { label: 'Recurring costs', value: sm.last.cum.recurring },
          { label: 'Income tax', value: sm.last.cum.tax }, { label: 'Insurance', value: sm.last.cum.insurance },
          { label: 'Kids', value: sm.last.cum.kids }, { label: 'Home loan (cash)', value: sm.last.cum.home },
        ].filter((b) => b.value > 0).sort((a, b) => b.value - a.value)),
      ),
    ));
  }
  return frag;
}

/** One goal's progress bar and status line (dashboard and Goals page). */
function goalBlock(p) {
  const g = p.goal;
  const when = p.left <= 0 ? 'Reached.'
    : p.reach ? `Around ${monthLabel(p.reach)} at your 12-month pace${g.by ? (p.onTrack ? ' — on track.' : ` — after your ${monthLabel(g.by)} target; needs ${money(p.needPerMonth)}/month.`) : '.'}`
      : 'Not enough saving pace yet to project a date.';
  return el('div', { class: 'goal' },
    el('div', { class: 'bar__head' }, el('span', { text: g.name || 'Goal' }), el('strong', { text: `${money(p.have, { compact: true })} / ${money(p.target, { compact: true })}` })),
    progressBar(Math.min(1, p.progress)),
    el('div', { class: 'card__hint' + (p.onTrack ? '' : ' neg'), text: when }),
  );
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
  const markEl = () => el('span', { class: 'table__mark', title: 'Adjusted for this month', text: '•' });
  const mark = (r, k) => (r.overrides.includes(k) ? markEl() : null);
  const cell = (r, k) => el('span', null, money(r[k]), mark(r, k));
  const lineCell = (r, id) => el('span', null, money(r.lines[id]), r.lineOverrides.includes(id) ? markEl() : null);
  const hasIncome = incomeLines().length > 0;
  // Mostly-zero columns read better as a dash than a wall of $0.00.
  const orDash = (v) => (num(v) ? money(v) : el('span', { class: 'muted', text: '–' }));
  const full = !S.settings.ledgerCompact;
  const cols = [
    { key: 'month', label: 'Month (worked)', type: 'month', get: (r) => el('button', { class: 'table__link', type: 'button', text: monthLabel(r.month), 'aria-label': `Edit ${monthLabel(r.month)}`, onclick: () => editMonth(r.entry) }) },
    { key: 'salary', label: 'Salary', type: 'money', get: (r) => cell(r, 'salary') },
    { key: 'bonus', label: 'Bonus', type: 'money', get: (r) => orDash(r.bonus) },
    ...(S.settings.cpfEnabled ? [{ key: 'ee', label: 'CPF', type: 'money', get: (r) => money(r.ee) }, { key: 'er', label: 'Employer CPF', type: 'money', get: (r) => money(r.er) }] : []),
    { key: 'after', label: 'After CPF', type: 'money', get: (r) => money(r.after) },
    ...incomeLines().map((l) => ({ key: 'line:' + l.id, label: '+ ' + (l.name || 'Income'), type: 'money', get: (r) => lineCell(r, l.id) })),
    // Total of the income lines: the compact view's single income column; in the full view only worth it for 2+ lines.
    ...(hasIncome && (!full || incomeLines().length > 1) ? [{ key: 'otherinc', label: 'Other income', type: 'money', get: (r) => orDash(r.otherIncome) }] : []),
    ...expenseLines().map((l) => ({ key: 'line:' + l.id, label: l.name || 'Spending', type: 'money', get: (r) => lineCell(r, l.id) })),
    { key: 'extras', label: 'One-offs', type: 'money', get: (r) => orDash(r.extras) },
    { key: 'recurring', label: 'Recurring', type: 'money', get: (r) => orDash(r.recurring) },
    { key: 'insurance', label: 'Insurance', type: 'money', get: (r) => orDash(r.insurance) },
    ...(S.children.length ? [{ key: 'kids', label: 'Kids', type: 'money', get: (r) => orDash(r.kids) }] : []),
    ...(S.housing.status === 'own' ? [
      { key: 'homecash', label: 'Home loan (cash)', type: 'money', get: (r) => orDash(r.homeCash) },
      { key: 'homecpf', label: 'Home loan (CPF)', type: 'money', get: (r) => orDash(r.homeCpf) },
    ] : []),
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
  const KEY_COLS = ['month', 'salary', 'after', 'otherinc', 'spend', 'tax', 'invest', 'savings', 'rate', 'cumsav'];
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
    el('p', { class: 'card__hint section-gap' }, el('span', { class: 'table__mark', text: '•' }), ' = value adjusted for that month only. ', full ? null : 'Spending = your spending lines, one-offs, recurring costs, insurance, kids and the cash part of a home loan. ', 'Income tax is your projected annual tax for that calendar year ÷ 12.'),
  );
}

function editMonth(e) {
  const r = computeLedger().find((x) => x.entry.id === e.id);
  const tmp = JSON.parse(JSON.stringify(e));
  tmp.extras = tmp.extras || [];
  tmp.lines = tmp.lines || {};
  tmp.recurring = tmp.recurring || {};
  const ovField = (k, label, computed, obj = tmp) => field(label, inputFor(obj, { key: k, type: 'money', label, nullable: true, placeholder: `Auto: ${round2(computed)}` }, { onChange: () => {} }), 'Leave blank to use the automatic value.');
  // Automatic value of a line for this month: the Assumptions amount (× work days for per-day lines).
  const lineAuto = (l) => (r ? num(r.assumption.lines?.[l.id]) * (l.basis === 'workday' ? r.workDays : 1) : 0);
  const dueHere = S.recurring.filter((it) => recurringDue(it, e.month));
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
      [...incomeLines(), ...expenseLines()].map((l) => ovField(l.id, (l.kind === 'income' ? '+ ' : '') + (l.name || 'Line'), lineAuto(l), tmp.lines)),
      ovField('invest', 'Investment (planned)', r ? plannedInvest(r.assumption, r.after) : 0),
      ovField('tax', 'Income tax', r ? r.tax : 0),
    ),
    dueHere.length ? [
      el('h3', { class: 'section-gap', text: 'Recurring costs due this month' }),
      el('div', { class: 'form-grid' }, dueHere.map((it) => field(it.name || 'Recurring cost', inputFor(tmp.recurring, { key: it.id, type: 'money', label: it.name, nullable: true, placeholder: `Planned: ${round2(num(it.amount))}` }, { onChange: () => {} }), it.mode === 'spread' ? 'Actual amount paid. It comes out of the money set aside.' : 'Actual amount paid. Leave blank if it matched the plan.'))),
    ] : null,
    extrasBox,
    field('Note', inputFor(tmp, { key: 'note', type: 'text', label: 'Note' }, { onChange: () => {} })),
  ], [
    { label: 'Delete month', danger: true, run: () => undoable(`${monthLabel(e.month)} deleted`, () => { S.ledger = S.ledger.filter((x) => x.id !== e.id); }) },
    { label: 'Cancel' },
    {
      label: 'Save', primary: true, run: () => {
        if (!tmp.month) return;
        if (S.ledger.some((x) => x.id !== e.id && x.month === tmp.month)) { toast('Another row already uses that month'); return; }
        for (const o of [tmp.lines, tmp.recurring]) for (const k of Object.keys(o)) if (o[k] == null || o[k] === '') delete o[k];
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
    S.assumptions.push(last ? { ...JSON.parse(JSON.stringify(last)), id: uid(), effective: todayISO(), notes: '' } : { id: uid(), effective: thisMonth() + '-01', salary: 0, age: 30, workDays: 22, lines: {}, investPct: 0, notes: '' });
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
    // One column per budget line, spending first, then extra income.
    ...[...expenseLines(), ...incomeLines()].map((l) => ({
      key: 'line:' + l.id, label: (l.kind === 'income' ? '+ ' : '') + lineLabel(l), type: 'money', cls: () => 'table__td--edit',
      get: (a) => inputFor((a.lines = a.lines || {}), { key: l.id, type: 'money', label: lineLabel(l) }),
    })),
    { key: 'investMode', label: 'Invest as', type: 'text', cls: () => 'table__td--edit', get: investModeSelect },
    { key: 'invest', label: 'Investment', type: 'money', cls: () => 'table__td--edit', get: (a) => (a.investMode === 'amount'
      ? inputFor(a, { key: 'investAmt', type: 'money', label: 'Investment per month' })
      : inputFor(a, { key: 'investPct', type: 'pct', label: 'Investment %' })) },
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
    budgetLinesCard(),
    editTable({ cols, rows, onDelete: (r) => undoable('Assumptions row deleted', () => { S.assumptions = S.assumptions.filter((x) => x !== r); }), emptyText: 'No assumptions yet.' }),
  );
}

/** Manage the spending and extra-income lines that the Assumptions table and ledger are built from. */
function budgetLinesCard() {
  const add = (p) => {
    if (S.budgetLines.some((l) => l.name.toLowerCase() === p.name.toLowerCase())) return toast(`${p.name} is already a line`);
    S.budgetLines.push({ id: uid(), ...p });
    commit();
    toast(`Added ${p.name} — enter its amount in the Assumptions table`);
  };
  const custom = { expense: { name: 'New spending line', kind: 'expense', basis: 'month' }, income: { name: 'New income line', kind: 'income', basis: 'month', taxable: true } };
  const opts = (kind) => LINE_PRESETS.map((p, i) => [p, i]).filter(([p]) => p.kind === kind).map(([p, i]) => el('option', { value: i, text: p.name }));
  const picker = el('select', {
    class: 'select select--inline', 'aria-label': 'Add a budget line',
    onchange: (e) => { const v = e.target.value; if (v !== '') add(custom[v] || LINE_PRESETS[+v]); },
  },
  el('option', { value: '', text: '+ Add a line…', selected: true }),
  el('optgroup', { label: 'Spending' }, opts('expense')),
  el('optgroup', { label: 'Extra income' }, opts('income')),
  el('optgroup', { label: 'Your own' }, el('option', { value: 'expense', text: 'Custom spending line' }), el('option', { value: 'income', text: 'Custom income line' })));
  const remove = (l) => undoable(`${l.name || 'Line'} removed`, () => {
    S.budgetLines = S.budgetLines.filter((x) => x !== l);
    for (const r of [...S.assumptions, ...S.ledger]) if (r.lines) delete r.lines[l.id];
  });
  const edit = () => 'table__td--edit';
  return el('div', { class: 'card section-gap' },
    el('div', { class: 'card__title' }, el('span', { text: 'Budget lines' }), picker),
    el('p', { class: 'card__hint', text: 'What you spend on — rent, utilities, childcare — and any income besides your salary. Each line becomes a column in the table below and in the ledger. Per-work-day lines are multiplied by work days.' }),
    editTable({
      cols: [
        { key: 'name', label: 'Line', type: 'text' },
        { key: 'kind', label: 'Type', type: 'text', cls: edit, get: (l) => selectFor(l, 'kind', [['expense', 'Spending'], ['income', 'Extra income']], 'Type') },
        { key: 'basis', label: 'Amount is', type: 'text', cls: edit, get: (l) => selectFor(l, 'basis', [['month', 'Per month'], ['workday', 'Per work day']], 'Amount is') },
        { key: 'taxable', label: 'Income tax', type: 'text', cls: (l) => (l.kind === 'income' ? 'table__td--edit' : ''), get: (l) => (l.kind === 'income' ? selectFor(l, 'taxable', [[false, 'Not taxable'], [true, 'Taxable']], 'Income tax') : el('span', { class: 'muted', text: '–' })) },
      ],
      rows: [...expenseLines(), ...incomeLines()],
      onDelete: remove,
      emptyText: 'No lines yet — add one above.',
    }),
    el('p', { class: 'card__hint section-gap', text: 'Taxable income (side income, net rental income) is added to your projected income tax. Enter it after deducting allowable expenses.' }),
  );
}

/** Add a recurring cost from a preset. Presets tied to a calendar month (e.g. Chinese New Year in Feb) start at its next occurrence. */
function addRecurring(p) {
  const now = thisMonth();
  let start = addMonths(now, 1);
  if (p.month) { const ym = `${now.slice(0, 4)}-${pad(p.month)}`; start = ym < now ? addMonths(ym, 12) : ym; }
  S.recurring.push({ id: uid(), name: p.name, amount: p.amount, every: p.every, start, end: '', mode: p.mode });
  commit();
  toast(`Added ${p.name}${p.amount ? '' : ' — enter the amount'}`);
}
const recurringPicker = () => el('select', {
  class: 'select select--inline', 'aria-label': 'Add a recurring cost',
  onchange: (e) => { const v = e.target.value; if (v !== '') addRecurring(v === 'custom' ? { name: 'New recurring cost', amount: 0, every: 12, mode: 'spread' } : RECURRING_PRESETS[+v]); },
},
el('option', { value: '', text: '+ Add a yearly or occasional cost…', selected: true }),
RECURRING_PRESETS.map((p, i) => el('option', { value: i, text: p.name })),
el('option', { value: 'custom', text: 'Something else' }));
const RECURRING_EVERY = [[1, 'Every month'], [2, 'Every 2 months'], [3, 'Every 3 months'], [6, 'Every 6 months'], [12, 'Every year'], [24, 'Every 2 years']];
const RECURRING_MODES = [['spread', 'Set aside monthly'], ['due', 'All in the due month']];

function pageRecurring() {
  const sm = summary();
  const now = thisMonth();
  const picker = recurringPicker();

  const active = S.recurring.filter((it) => nextDue(it, now));
  const perMonth = sum(active, (it) => num(it.amount) / everyOf(it));
  const upcoming = [];
  for (let k = 0; k < 12; k++) {
    const m = addMonths(now, k);
    for (const it of S.recurring) if (recurringDue(it, m)) upcoming.push({ id: it.id + m, month: m, name: it.name, amount: num(it.amount), mode: it.mode });
  }
  const edit = () => 'table__td--edit';
  const cols = [
    { key: 'name', label: 'Cost', type: 'text' },
    { key: 'amount', label: 'Amount each time', type: 'money' },
    { key: 'every', label: 'How often', type: 'text', cls: edit, get: (it) => selectFor(it, 'every', RECURRING_EVERY, 'How often') },
    { key: 'start', label: 'First due', type: 'month' },
    { key: 'end', label: 'Last due (optional)', type: 'month' },
    { key: 'mode', label: 'Pay it', type: 'text', cls: edit, get: (it) => selectFor(it, 'mode', RECURRING_MODES, 'Pay it') },
    { key: 'per', label: 'Per month', type: 'money', get: (it) => money(num(it.amount) / everyOf(it)) },
    { key: 'next', label: 'Next due', type: 'text', get: (it) => { const d = nextDue(it, now); return d ? monthLabel(d) : 'Ended'; } },
    { key: 'fund', label: 'Set aside now', type: 'money', get: (it) => (it.mode === 'spread' ? money(sm.last?.funds?.[it.id] || 0) : el('span', { class: 'muted', text: '–' })) },
  ];
  return el('div', null,
    pageHead('Recurring costs', 'Costs that don’t come every month — holidays, festive spending, gifts, road tax, property tax, yearly subscriptions.', picker),
    el('div', { class: 'grid grid--stats' },
      stat('Per month, all costs', money(perMonth), `${active.length} active`, true),
      stat('Set aside so far', money(sm.sinking), 'Cash kept for “set aside” costs'),
      stat('Due in the next 12 months', money(sum(upcoming, (u) => u.amount))),
    ),
    el('div', { class: 'section-gap' }, editTable({ cols, rows: S.recurring, onDelete: (it) => undoable(`${it.name || 'Recurring cost'} removed`, () => { S.recurring = S.recurring.filter((x) => x !== it); }), emptyText: 'Nothing yet — add a holiday, festive spending or a yearly bill above.' })),
    el('p', { class: 'card__hint section-gap', text: '“Set aside monthly” counts amount ÷ months as spending every month, starting early enough that the money is there when it is due; the unspent part stays in your cash and net worth. “All in the due month” counts the whole amount that month. If a payment costs more or less, change it in that month’s ledger row. Insurance premiums are on the Insurance page.' }),
    el('div', { class: 'card section-gap' },
      el('div', { class: 'card__title', text: 'Coming up' }),
      editTable({
        cols: [
          { key: 'month', label: 'Month', type: 'month', readonly: true },
          { key: 'name', label: 'Cost', type: 'text', readonly: true },
          { key: 'amount', label: 'Planned', type: 'money', readonly: true },
          { key: 'mode', label: 'Paid from', type: 'text', get: (u) => (u.mode === 'spread' ? 'Money set aside' : 'That month’s pay') },
        ],
        rows: upcoming,
        emptyText: 'Nothing due in the next 12 months.',
      }),
    ),
  );
}

/* ---------- Guided setup: one short step per topic, every step skippable, ending in a checklist ---------- */
const SETUP_STEPS = [
  ['you', 'About you'], ['income', 'Income'], ['spending', 'Spending'], ['saving', 'Saving & CPF'],
  ['housing', 'Housing'], ['family', 'Family'], ['goals', 'Goals'], ['insurance', 'Insurance'], ['review', 'Review'],
];
/** The Assumptions row the setup fills in: the latest one, or a new one from this month. */
function setupRow() {
  if (!S.assumptions.length) S.assumptions.push({ id: uid(), effective: thisMonth() + '-01', salary: 0, age: 30, workDays: 22, lines: {}, investPct: 0, notes: 'From setup' });
  const a = [...S.assumptions].sort(byKey('effective')).pop();
  a.lines = a.lines || {};
  return a;
}
/** Amount field for a budget line; the line itself is only created once an amount is entered. */
function lineField(a, def, hint) {
  const line = S.budgetLines.find((l) => l.id === def.id || l.name.toLowerCase() === def.name.toLowerCase());
  const label = lineLabel(line || def);
  const holder = { v: line ? a.lines[line.id] ?? '' : '' };
  return field(label, inputFor(holder, { key: 'v', type: 'money', label, nullable: true, placeholder: '0' }, {
    onChange: (v) => {
      let l = line;
      if (!l) { l = { id: uid(), name: def.name, kind: def.kind, basis: def.basis, ...(def.kind === 'income' ? { taxable: !!def.taxable } : {}) }; S.budgetLines.push(l); }
      a.lines[l.id] = v ?? 0;
      commit({ defer: true });
    },
  }), hint);
}
/** Existing lines of a kind plus the presets not added yet. */
const linesAndPresets = (kind) => [
  ...S.budgetLines.filter((l) => (l.kind === 'income') === (kind === 'income')),
  ...LINE_PRESETS.filter((p) => p.kind === kind && !S.budgetLines.some((l) => l.name.toLowerCase() === p.name.toLowerCase())),
];

/** What the setup has and hasn't covered, by how much it matters. */
function setupChecklist() {
  const a = S.assumptions.length ? [...S.assumptions].sort(byKey('effective')).pop() : null;
  const st = S.settings;
  const skipped = (step) => !!S.setup?.skipped?.[step];
  const item = (level, ok, text, detail, step, page) => ({ level, ok, text, detail, step, page, skipped: !ok && !!step && skipped(step) });
  return [
    item('essential', num(a?.salary) > 0, 'Monthly salary', 'CPF, tax and savings are all worked out from it.', 'income'),
    item('essential', !!st.birthMonth || num(a?.age) > 0, 'Birth month', 'Sets your CPF rates and age-based tax reliefs.', 'you'),
    item('essential', a ? sum(expenseLines(), (l) => num(a.lines?.[l.id])) > 0 : false, 'Monthly spending', 'Food, transport, rent and other regular costs.', 'spending'),
    item('essential', num(st.startCash) !== 0, 'Cash in the bank', 'The starting point for cash, net worth and your emergency fund.', 'saving'),
    item('essential', S.goals.some((g) => g.kind === 'emergency'), 'Emergency fund goal', '3–6 months of spending is the usual guide.', 'goals'),
    ...(st.cpfEnabled ? [item('recommended', num(st.cpfStart.oa) + num(st.cpfStart.sa) + num(st.cpfStart.ma) > 0, 'CPF balances', 'For net worth, housing and retirement.', 'saving')] : []),
    item('recommended', investsMonthly(a) || S.portfolio.length > 0, 'Investing', 'How much you invest each month, or your portfolio value.', 'saving'),
    item('recommended', S.housing.status !== 'none' || !!S.setup?.housingNone, 'Housing', 'Rent, a home loan or a home you plan to buy.', 'housing'),
    item('recommended', S.policies.length > 0, 'Insurance policies', 'To check your cover against the 9× / 4× income guide.', 'insurance'),
    item('recommended', S.goals.some((g) => g.kind !== 'emergency'), 'A savings goal', 'A home, wedding, car or holiday.', 'goals'),
    { ...item('recommended', !!st.lastBackup, 'A backup', 'Browser data can be cleared — keep a copy somewhere safe.', null, 'data'), run: exportBackup, cta: 'Download' },
    item('optional', a ? incomeLines().some((l) => num(a.lines?.[l.id]) > 0) : false, 'Other income', 'Side, rental or dividend income.', 'income'),
    item('optional', S.recurring.length > 0, 'Yearly costs', 'Holidays, festive spending, road tax…', 'spending'),
    item('optional', S.children.length > 0, 'Children', 'Costs by age and child tax reliefs.', 'family'),
    item('optional', (S.reliefs[thisMonth().slice(0, 4)] || []).length > 0, 'Tax reliefs', 'Parent, NSman, SRS and others lower your tax.', null, 'tax'),
    { ...item('optional', !!KEY, 'Passphrase', 'Encrypts your records on this device.', null, 'data'), run: changePass, cta: 'Set one' },
  ];
}

function pageSetup() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const i = Math.max(0, SETUP_STEPS.findIndex(([id]) => id === q.get('step')));
  const [step, title] = SETUP_STEPS[i];
  const goStep = (k) => { location.hash = '#/setup?step=' + SETUP_STEPS[k][0]; };
  const a = setupRow();
  const body = {
    you: setupYou, income: () => setupIncome(a), spending: () => setupSpending(a), saving: () => setupSaving(a),
    housing: () => setupHousing(a), family: setupFamily, goals: setupGoals, insurance: setupInsurance, review: setupReview,
  }[step]();
  const nav = el('div', { class: 'page__actions setup-nav' },
    i > 0 ? el('button', { class: 'btn', type: 'button', text: '← Back', onclick: () => goStep(i - 1) }) : null,
    step !== 'review' ? el('button', { class: 'btn', type: 'button', text: 'Skip this step', onclick: () => { S.setup.skipped[step] = true; commit({ rerender: false }); goStep(i + 1); } }) : null,
    step !== 'review'
      ? el('button', { class: 'btn btn--primary', type: 'button', text: 'Next →', onclick: () => { delete S.setup.skipped[step]; commit({ rerender: false }); goStep(i + 1); } })
      : el('button', { class: 'btn btn--primary', type: 'button', text: 'Finish — go to my dashboard', onclick: () => {
        S.setup.done = true;
        if (!S.ledger.length) S.ledger.push({ id: uid(), month: thisMonth(), bonus: 0, maDed: 0 }); // the ledger starts this month
        setupFinishing = true; // finishing is not "leaving part-way": no Back to setup bar
        commit({ rerender: false }); go('dashboard');
      } }),
  );
  return el('div', { class: 'setup' },
    pageHead('Set up Ledger Local', `Step ${i + 1} of ${SETUP_STEPS.length} · ${title}. Skip anything that doesn’t apply — you can change it all later.`),
    el('nav', { class: 'setup-steps', 'aria-label': 'Setup steps' }, SETUP_STEPS.map(([id, t], k) => el('a', {
      class: 'setup-step' + (k === i ? ' setup-step--on' : '') + (S.setup.skipped[id] ? ' setup-step--skipped' : ''),
      href: '#/setup?step=' + id, text: `${k + 1}. ${t}`, 'aria-current': k === i ? 'step' : null,
    }))),
    progressBar(i / (SETUP_STEPS.length - 1)),
    el('div', { class: 'card section-gap' }, body),
    nav,
  );
}

function setupYou() {
  return [
    el('p', { class: 'card__hint', text: 'A few questions about you and your money, one topic at a time. Rough numbers are fine. Everything stays on this device.' }),
    el('div', { class: 'form-grid' },
      field('Birth month', inputFor(S.settings, { key: 'birthMonth', type: 'month', label: 'Birth month' }), 'Sets your CPF rates and age-based tax reliefs, and updates as you get older.'),
      field('Do you contribute to CPF?', selectFor(S.settings, 'cpfEnabled', [[true, 'Yes — Singapore CPF'], [false, 'No']], 'CPF')),
    ),
    el('p', { class: 'card__hint' }, 'Moving over from the Google Sheet? You can ', el('a', { href: '#/data', text: 'import its CSV files' }), ' instead.'),
  ];
}
function setupIncome(a) {
  return [
    el('div', { class: 'form-grid' },
      settingInput(a, 'salary', 'money', 'Monthly salary (before CPF)', 'Gross pay on your payslip, without bonus. Bonuses go on the month they are paid.'),
      settingInput(a, 'workDays', 'number', 'Work days a month', 'Used for daily costs like lunch and the commute.', { step: '1' }),
    ),
    el('h3', { class: 'section-gap', text: 'Other income (optional)' }),
    el('div', { class: 'form-grid' }, linesAndPresets('income').map((l) => lineField(a, l, l.taxable ? 'Taxable — after allowable expenses.' : l.kind === 'income' && l.taxable === false ? 'Not taxed.' : null))),
  ];
}
function setupSpending(a) {
  return [
    el('h3', { text: 'Every month' }),
    el('p', { class: 'card__hint', text: 'Regular costs. Leave blank anything that doesn’t apply.' }),
    el('div', { class: 'form-grid' }, linesAndPresets('expense').map((l) => lineField(a, l))),
    el('h3', { class: 'section-gap', text: 'Yearly or occasional (optional)' }),
    el('p', { class: 'card__hint', text: 'Costs that don’t come every month — holidays, festive spending, road tax, property tax. “Set aside monthly” spreads the cost over the months before it is due.' }),
    S.recurring.map((it) => el('div', { class: 'form-grid setup-row' },
      settingInput(it, 'name', 'text', 'Cost'),
      settingInput(it, 'amount', 'money', 'Amount each time'),
      field('How often', selectFor(it, 'every', RECURRING_EVERY, 'How often')),
      settingInput(it, 'start', 'month', 'Next due'),
      field('Pay it', selectFor(it, 'mode', RECURRING_MODES, 'Pay it')),
      field('', el('button', { class: 'btn btn--danger btn--small', type: 'button', text: 'Remove', onclick: () => undoable(`${it.name || 'Cost'} removed`, () => { S.recurring = S.recurring.filter((x) => x !== it); }) })),
    )),
    recurringPicker(),
  ];
}
function setupSaving(a) {
  const latest = [...S.portfolio].filter((p) => p.date).sort(byKey('date')).pop();
  const pv = { v: latest ? latest.value : '' };
  return [
    el('div', { class: 'form-grid' },
      settingInput(S.settings, 'startCash', 'money', 'Cash in the bank today', 'All savings and current accounts together. Your ledger counts on from here.'),
      field('How do you invest each month?', investModeSelect(a), 'A fixed amount suits a regular savings plan (RSP) or a set transfer to your broker.'),
      a.investMode === 'amount'
        ? settingInput(a, 'investAmt', 'money', 'Amount invested each month', '0 if you don’t invest regularly.')
        : settingInput(a, 'investPct', 'pct', 'Share of after-CPF pay invested', 'Bonus months invest the same share of the bonus. 0 if none.'),
      field('Investments today', inputFor(pv, { key: 'v', type: 'money', label: 'Investments today', nullable: true, placeholder: '0' }, {
        onChange: (v) => {
          const today = todayISO(), ex = S.portfolio.find((p) => p.date === today);
          if (ex) ex.value = v ?? 0; else S.portfolio.push({ id: uid(), date: today, value: v ?? 0, notes: 'From setup' });
          commit({ defer: true });
        },
      }), 'Value of stocks, ETFs, funds, SSBs, T-bills…'),
    ),
    el('p', { class: 'card__hint' }, 'Invest with Tiger Brokers? ',
      el('button', { class: 'link-btn', type: 'button', text: 'Import your monthly statement PDFs', onclick: importStatements }),
      ' to fill in the account value, deposits and dividends. (Then leave “Investments today” for your other investments only.)'),
    S.settings.cpfEnabled ? [
      el('h3', { class: 'section-gap', text: 'CPF balances today' }),
      el('p', { class: 'card__hint', text: 'From the CPF app or website (My CPF → balances).' }),
      el('div', { class: 'form-grid' },
        settingInput(S.settings.cpfStart, 'oa', 'money', 'Ordinary Account (OA)'),
        settingInput(S.settings.cpfStart, 'sa', 'money', 'Special Account (SA)'),
        settingInput(S.settings.cpfStart, 'ma', 'money', 'MediSave Account (MA)'),
      ),
    ] : null,
  ];
}
function setupHousing(a) {
  const hs = S.housing;
  const pick = (v) => {
    hs.status = v;
    S.setup.housingNone = v === 'none';
    if (v === 'own' && !hs.loanAsOf) hs.loanAsOf = thisMonth();
    commit();
  };
  const current = hs.status === 'none' && !S.setup.housingNone ? '' : hs.status;
  const choose = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Your housing' },
    [['none', 'With family / n.a.'], ['rent', 'Renting'], ['own', 'I own a home'], ['buying', 'Planning to buy']].map(([v, t]) => el('button', {
      class: 'segmented__btn', type: 'button', text: t, 'aria-pressed': String(current === v), onclick: () => pick(v),
    })));
  const p = hs.plan;
  const detail = {
    rent: () => el('div', { class: 'form-grid' }, lineField(a, LINE_PRESETS[0], 'Your share of the rent.')),
    own: () => el('div', { class: 'form-grid' },
      settingInput(hs, 'value', 'money', 'Estimated value'),
      field('Loan type', selectFor(hs, 'loanType', LOAN_TYPES, 'Loan type')),
      settingInput(hs, 'loanBalance', 'money', 'Outstanding loan', 'From your latest loan statement. 0 if fully paid.'),
      settingInput(hs, 'cpfMonthly', 'money', 'Monthly instalment from CPF OA'),
      settingInput(hs, 'cashMonthly', 'money', 'Monthly instalment in cash'),
      settingInput(hs, 'loanRate', 'pct', 'Interest rate / year', `HDB loans: ${pct(SG.hdbRate)}.`)),
    buying: () => el('div', { class: 'form-grid' },
      settingInput(p, 'price', 'money', 'Expected price'),
      settingInput(p, 'month', 'month', 'Key collection / completion'),
      field('Loan type', selectFor(p, 'loanType', LOAN_TYPES, 'Loan type'))),
  }[current];
  return [
    el('p', { class: 'card__hint', text: 'Where you live and what it costs.' }),
    choose,
    detail ? el('div', { class: 'section-gap' }, detail()) : null,
    current && current !== 'none' ? el('p', { class: 'card__hint section-gap', text: 'After setup, the Housing page has more detail — the loan over time, what you could get if you sold, stamp duty and CPF use.' }) : null,
  ];
}
function setupFamily() {
  return [
    el('p', { class: 'card__hint', text: 'Children, including one on the way. They bring costs by age and tax reliefs. Skip if this doesn’t apply.' }),
    S.children.map((c) => el('div', { class: 'form-grid setup-row' },
      settingInput(c, 'name', 'text', 'Name'),
      settingInput(c, 'birthMonth', 'month', 'Born (or due)'),
      field('', el('button', { class: 'btn btn--danger btn--small', type: 'button', text: 'Remove', onclick: () => undoable(`${c.name || 'Child'} removed`, () => { S.children = S.children.filter((x) => x !== c); }) })),
    )),
    el('button', { class: 'btn', type: 'button', text: '+ Add a child', onclick: () => { S.children.push({ id: uid(), name: '', birthMonth: '', disability: false, studying: true }); commit(); } }),
    S.children.length ? el('div', { class: 'form-grid section-gap' },
      field('Working Mother’s Child Relief', selectFor(S.settings, 'wmcr', [[false, 'Not claiming'], [true, 'I claim it']], 'Working Mother’s Child Relief')),
    ) : null,
    S.children.length ? el('p', { class: 'card__hint', text: 'After setup, set monthly costs by age (pre-school, school, university) on the Kids & education page.' }) : null,
  ];
}
function setupGoals() {
  const hasEm = S.goals.some((g) => g.kind === 'emergency');
  const picker = el('select', {
    class: 'select select--inline', 'aria-label': 'Add a goal',
    onchange: (e) => {
      const v = e.target.value;
      if (v === '') return;
      if (v[0] === 'm') S.goals.push(newMilestone(MILESTONE_PRESETS[+v.slice(1)]));
      else { const g = GOAL_PRESETS[+v]; S.goals.push({ id: uid(), name: g.name, target: 0, by: '', kind: g.kind || 'custom', ...(g.months ? { months: g.months } : {}) }); }
      commit();
    },
  }, el('option', { value: '', text: '+ Add a goal…', selected: true }),
  el('optgroup', { label: 'Save for something' }, GOAL_PRESETS.map((g, k) => (g.kind === 'emergency' && hasEm ? null : el('option', { value: k, text: g.name })))),
  el('optgroup', { label: 'Reach a milestone' }, MILESTONE_PRESETS.map((p, k) => el('option', { value: 'm' + k, text: p.name }))));
  const target = (g) => (g.kind === 'emergency' ? settingInput(g, 'months', 'number', 'Months of spending', null, { step: '1' })
    : g.metric === 'debt' ? field('Target', el('span', { class: 'muted', text: 'All debts paid off' }))
      : g.metric === 'fire' ? field('Target', el('span', { class: 'muted', text: 'Your FIRE number (Retirement page)' }))
        : settingInput(g, 'target', g.metric === 'savingsRate' ? 'pct' : 'money', g.kind === 'milestone' ? `Target (${MILESTONES[g.metric]?.short})` : 'Target amount'));
  return [
    el('p', { class: 'card__hint', text: 'What you are saving for, and milestones you want to reach. Savings fill “saving for” goals from the top, so add the most important first.' }),
    suggestionsCard(summary(), 5),
    S.goals.map((g) => el('div', { class: 'form-grid setup-row' },
      settingInput(g, 'name', 'text', g.kind === 'milestone' ? 'Milestone' : 'Goal'),
      target(g),
      settingInput(g, 'by', 'month', 'By (optional)'),
      field('', el('button', { class: 'btn btn--danger btn--small', type: 'button', text: 'Remove', onclick: () => undoable(`${g.name || 'Goal'} removed`, () => { S.goals = S.goals.filter((x) => x !== g); }) })),
    )),
    picker,
  ];
}
function setupInsurance() {
  return [
    el('p', { class: 'card__hint', text: 'Everyone is covered by MediShield Life for basic hospital bills. Add the policies you pay for — life, critical illness, an Integrated Shield plan — so the app can check your cover.' }),
    S.policies.map((p) => el('div', { class: 'form-grid setup-row' },
      settingInput(p, 'name', 'text', 'Policy'),
      field('Type', selectFor(p, 'type', POLICY_TYPES, 'Type')),
      settingInput(p, 'premium', 'money', 'Premium a year'),
      field('Paid from', selectFor(p, 'payer', [['cash', 'Cash'], ['medisave', 'MediSave']], 'Paid from')),
      settingInput(p, 'coverDeath', 'money', 'Death cover'),
      settingInput(p, 'coverCI', 'money', 'Critical illness cover'),
      field('', el('button', { class: 'btn btn--danger btn--small', type: 'button', text: 'Remove', onclick: () => undoable(`${p.name || 'Policy'} removed`, () => { S.policies = S.policies.filter((x) => x !== p); }) })),
    )),
    el('button', { class: 'btn', type: 'button', text: '+ Add a policy', onclick: () => { S.policies.push({ id: uid(), name: '', type: 'life', payer: 'cash', start: todayISO(), years: 20, premium: 0, coverDeath: 0, coverTPD: 0, coverCI: 0, actual: {} }); commit(); } }),
    S.policies.length ? el('p', { class: 'card__hint section-gap', text: 'After setup, the Insurance page has premium dates, the yearly payment log and disability cover.' }) : null,
  ];
}
function setupReview() {
  const items = setupChecklist();
  const groups = [
    ['essential', 'Essential', 'Needed for your numbers to make sense.'],
    ['recommended', 'Recommended', 'Fills in the bigger picture.'],
    ['optional', 'Optional', 'Only if it applies to you.'],
  ];
  const ess = items.filter((x) => x.level === 'essential');
  // Fix things in place where possible: a setup step, or a dialog (backup, passphrase). Only tax reliefs leave the setup.
  const open = (x) => (x.run ? x.run() : x.step ? (location.hash = '#/setup?step=' + x.step) : go(x.page));
  return [
    el('p', { class: 'card__hint', text: `${ess.filter((x) => x.ok).length} of ${ess.length} essentials done. You can finish now and fill in the rest any time — the dashboard reminds you of missing essentials.` }),
    groups.map(([level, name, sub]) => el('div', { class: 'section-gap' },
      el('h3', { text: name }), el('p', { class: 'card__hint', text: sub }),
      items.filter((x) => x.level === level).map((x) => el('div', { class: 'check' },
        el('div', { class: 'check__icon ' + (x.ok ? 'check__icon--ok' : level === 'essential' ? 'check__icon--due' : 'check__icon--skip'), text: x.ok ? '✓' : level === 'essential' ? '!' : '–' }),
        el('div', { class: 'check__text' }, el('div', { text: x.text + (x.skipped ? ' — skipped' : '') }), el('div', { class: 'check__detail', text: x.detail })),
        x.ok ? null : el('button', { class: 'btn btn--small', type: 'button', text: x.cta || 'Add', onclick: () => open(x) }),
      )),
    )),
  ];
}

const GOAL_PRESETS = [
  { name: 'Emergency fund', kind: 'emergency', months: 6 },
  { name: 'Home down payment' }, { name: 'Wedding' }, { name: 'Car' }, { name: 'Holiday' },
  { name: 'Children’s education' }, { name: 'Further studies' },
];

// Milestones to pick from. Targets left at 0 are yours to fill in; a few are worked out for you.
const MILESTONE_PRESETS = [
  { name: 'First $100k saved & invested', metric: 'wealth', target: 100000 },
  { name: 'Cash savings target', metric: 'cash' },
  { name: 'Net worth target', metric: 'networth' },
  { name: 'Investments target', metric: 'portfolio' },
  { name: 'Debt-free', metric: 'debt' },
  { name: 'CPF Full Retirement Sum by 55', metric: 'cpf' },
  { name: 'Dividend income', metric: 'dividends' },
  { name: 'Save 20% of take-home pay', metric: 'savingsRate', target: 0.2 },
  { name: 'Financial independence', metric: 'fire' },
];
function newMilestone(p) {
  const g = { id: uid(), kind: 'milestone', name: p.name, metric: p.metric, target: p.target ?? 0, by: p.by || '' };
  if (p.metric === 'cpf' && !p.target) {
    g.target = cohortFRS();
    if (S.settings.birthMonth) g.by = addMonths(S.settings.birthMonth, 55 * 12);
  }
  if (p.metric === 'debt') g.startValue = sum(S.liabilities, (l) => l.balance); // progress counts down from here
  return g;
}

/** Goals that fit this person's data and aren't set yet, most useful first. */
function goalSuggestions(sm) {
  const has = (f) => S.goals.some(f);
  const out = [];
  const addGoal = (g, msg) => () => { S.goals.push(g); commit(); toast(msg || `Added ${g.name}`); };
  const age = S.settings.birthMonth ? ageAt(thisMonth()) : num(assumptionFor(thisMonth())?.age);
  if (!has((g) => g.kind === 'emergency')) {
    out.push({ title: 'Emergency fund (6 months)', why: 'The first thing most guides recommend: 3–6 months of spending in cash.', add: () => { S.goals.unshift({ id: uid(), name: 'Emergency fund', kind: 'emergency', months: 6, target: 0, by: '' }); commit(); toast('Emergency fund added'); } });
  }
  if (sm.liabilities > 0 && !has((g) => g.metric === 'debt')) {
    out.push({ title: 'Debt-free', why: `${money(sm.liabilities, { compact: true })} of loans and debts to clear.`, add: addGoal(newMilestone({ name: 'Debt-free', metric: 'debt' })) });
  }
  if (S.housing.status === 'buying' && !has((g) => /home|house|flat|bto|down ?payment/i.test(g.name))) {
    out.push({ title: 'Cash for your home', why: 'Work it out from your plan on the Housing page, then save it as a goal.', label: 'Open Housing', add: () => go('housing') });
  } else if (S.housing.status === 'rent' && !has((g) => /home|house|flat|bto|down ?payment/i.test(g.name))) {
    out.push({ title: 'Home down payment', why: 'You rent today. Saving for a down payment keeps buying an option.', add: addGoal({ id: uid(), name: 'Home down payment', kind: 'custom', target: 0, by: '' }, 'Added — enter the target amount') });
  }
  childrenByBirth().forEach((c, i) => {
    const name = `${childName(c, i)} — education fund`;
    if (!has((g) => g.name === name)) out.push({ title: name, why: 'University starts around 19. Saving early spreads it out.', add: addGoal({ id: uid(), name, kind: 'custom', target: 0, by: addMonths(c.birthMonth, 19 * 12) }, 'Added — enter the target amount') });
  });
  if (S.settings.cpfEnabled && age > 0 && age < 55 && !has((g) => g.metric === 'cpf')) {
    out.push({ title: 'CPF Full Retirement Sum by 55', why: `About ${money(cohortFRS(), { compact: true })} for your cohort — the amount behind CPF LIFE’s standard payout.`, add: addGoal(newMilestone(MILESTONE_PRESETS[5])) });
  }
  const wealth = sm.expectedCash + sm.portfolio;
  const next = ROUND_MILESTONES.find((v) => v > wealth);
  if (next && sm.rows.length && !has((g) => g.metric === 'wealth')) {
    const name = `First ${money(next, { compact: true })} saved & invested`;
    out.push({ title: name, why: `You have ${money(wealth, { compact: true })} in cash and investments now.`, add: addGoal(newMilestone({ name, metric: 'wealth', target: next })) });
  }
  const rate = sm.rows.length ? sum(sm.rows.slice(-12), (r) => r.savingsRate) / sm.rows.slice(-12).length : null;
  if (rate != null && rate < 0.2 && !has((g) => g.metric === 'savingsRate')) {
    out.push({ title: 'Save 20% of take-home pay', why: `You keep about ${pct(rate, 0)} now.`, add: addGoal(newMilestone(MILESTONE_PRESETS[7])) });
  }
  if (S.dividends.length && !has((g) => g.metric === 'dividends')) {
    const yearly = sum(S.dividends.filter((d) => d.date.slice(0, 7) > addMonths(thisMonth(), -12)), (d) => d.amount);
    const target = Math.max(1000, Math.ceil((yearly * 2) / 500) * 500);
    out.push({ title: `Dividend income of ${money(target, { compact: true })} a year`, why: `${money(yearly, { compact: true })} in the last 12 months.`, add: addGoal(newMilestone({ name: 'Dividend income', metric: 'dividends', target })) });
  }
  if (sm.rows.length && !has((g) => g.metric === 'fire')) {
    out.push({ title: 'Financial independence', why: 'Enough invested that your spending could come from it (the Retirement page’s FIRE number).', add: addGoal(newMilestone(MILESTONE_PRESETS[8])) });
  }
  return out;
}
function suggestionsCard(sm, limit = 4) {
  const list = goalSuggestions(sm).slice(0, limit);
  if (!list.length) return null;
  return el('div', { class: 'card section-gap' },
    el('div', { class: 'card__title', text: 'Suggested for you' }),
    list.map((s) => el('div', { class: 'check' },
      el('div', { class: 'check__icon check__icon--skip', text: '+' }),
      el('div', { class: 'check__text' }, el('div', { text: s.title }), el('div', { class: 'check__detail', text: s.why })),
      el('button', { class: 'btn btn--small', type: 'button', text: s.label || 'Add', onclick: s.add }),
    )));
}

/** One milestone's progress bar and status line. */
function milestoneBlock(st) {
  const g = st.goal;
  const fmt = (v) => (st.pct ? pct(v, 0) : money(v, { compact: true }));
  const head = g.metric === 'debt' ? `${money(st.value, { compact: true })} left` : `${fmt(st.value)} / ${fmt(st.target)}`;
  const when = st.reached ? 'Reached.'
    : !st.projects ? (g.by ? `Target ${monthLabel(g.by)}.` : MILESTONES[g.metric]?.about || '')
      : st.reach ? `Around ${monthLabel(st.reach)} ${g.metric === 'debt' ? 'at your current repayments' : 'at your current pace'}${g.by ? (st.onTrack ? ' — on track.' : ` — after your ${monthLabel(g.by)} target.`) : '.'}`
        : g.metric === 'debt' ? 'Some debts are never paid off at their current payments.' : 'Not at your current pace.';
  return el('div', { class: 'goal' },
    el('div', { class: 'bar__head' }, el('span', { text: g.name || MILESTONES[g.metric]?.short }), el('strong', { text: head })),
    progressBar(st.progress),
    el('div', { class: 'card__hint' + (st.onTrack ? '' : ' neg'), text: when }),
  );
}

function pageGoals() {
  const sm = summary();
  const plan = Object.fromEntries(sm.goals.map((p) => [p.goal.id, p]));
  const mstat = Object.fromEntries(sm.milestones.map((m) => [m.goal.id, m]));
  const buckets = S.goals.filter((g) => g.kind !== 'milestone');
  const milestones = S.goals.filter((g) => g.kind === 'milestone');
  const add = (p) => {
    if (p.metric) S.goals.push(newMilestone(p));
    else S.goals.push({ id: uid(), name: p.name, target: 0, by: '', kind: p.kind || 'custom', ...(p.months ? { months: p.months } : {}) });
    commit();
    const needsTarget = p.metric ? !['debt', 'fire', 'cpf'].includes(p.metric) && !p.target : p.kind !== 'emergency';
    toast(`Added ${p.name}${needsTarget ? ' — enter the target' : ''}`);
  };
  const picker = el('select', {
    class: 'select select--inline', 'aria-label': 'Add a goal',
    onchange: (e) => {
      const v = e.target.value;
      if (v === '') return;
      add(v === 'custom' ? { name: 'New goal' } : v[0] === 'm' ? MILESTONE_PRESETS[+v.slice(1)] : GOAL_PRESETS[+v]);
    },
  },
  el('option', { value: '', text: '+ Add a goal…', selected: true }),
  el('optgroup', { label: 'Save for something' }, GOAL_PRESETS.map((p, i) => el('option', { value: i, text: p.name })), el('option', { value: 'custom', text: 'Something else' })),
  el('optgroup', { label: 'Reach a milestone' }, MILESTONE_PRESETS.map((p, i) => el('option', { value: 'm' + i, text: p.name }))));
  // Order only matters among savings goals (they share the money); milestones are independent.
  const move = (g, d) => {
    const j = buckets.indexOf(g) + d;
    if (j < 0 || j >= buckets.length) return;
    const a = S.goals.indexOf(g), b = S.goals.indexOf(buckets[j]);
    [S.goals[a], S.goals[b]] = [S.goals[b], S.goals[a]];
    commit();
  };
  const edit = () => 'table__td--edit';
  const mCols = [
    { key: 'name', label: 'Milestone', type: 'text' },
    { key: 'metric', label: 'Measured by', type: 'text', get: (g) => el('span', { title: MILESTONES[g.metric]?.about, text: MILESTONES[g.metric]?.short || g.metric }) },
    { key: 'target', label: 'Target', type: 'money', cls: (g) => (['debt', 'fire'].includes(g.metric) ? '' : 'table__td--edit'), get: (g) => (g.metric === 'debt' ? money(0)
      : g.metric === 'fire' ? el('span', { title: 'From the Retirement page', text: `${money(mstat[g.id]?.target, { compact: true })} (auto)` })
        : inputFor(g, { key: 'target', type: g.metric === 'savingsRate' ? 'pct' : 'money', label: 'Target' })) },
    { key: 'by', label: 'Target date (optional)', type: 'month' },
    { key: 'now', label: 'Now', type: 'money', get: (g) => { const s = mstat[g.id]; return !s ? '–' : s.pct ? pct(s.value) : money(s.value); } },
    { key: 'reach', label: 'Reached around', type: 'text', get: (g) => { const s = mstat[g.id]; return !s ? '–' : s.reached ? 'Reached' : !s.projects ? '–' : s.reach ? monthLabel(s.reach) : 'Not at current pace'; }, cls: (g) => (mstat[g.id] && !mstat[g.id].onTrack ? 'neg' : '') },
  ];
  const remove = (g) => undoable(`${g.name || 'Goal'} removed`, () => { S.goals = S.goals.filter((x) => x !== g); });
  const cols = [
    { key: 'order', label: 'Order', type: 'text', get: (g) => el('span', { class: 'page__actions' },
      el('button', { class: 'btn btn--icon', type: 'button', text: '↑', 'aria-label': `Move ${g.name} up`, disabled: buckets[0] === g, onclick: () => move(g, -1) }),
      el('button', { class: 'btn btn--icon', type: 'button', text: '↓', 'aria-label': `Move ${g.name} down`, disabled: buckets[buckets.length - 1] === g, onclick: () => move(g, 1) })) },
    { key: 'name', label: 'Goal', type: 'text' },
    { key: 'target', label: 'Target', type: 'money', cls: edit, get: (g) => (g.kind === 'emergency'
      ? el('span', { class: 'goal__months' }, inputFor(g, { key: 'months', type: 'number', label: 'Months of spending', step: '1' }), ` months = ${money(plan[g.id]?.target)}`)
      : inputFor(g, { key: 'target', type: 'money', label: 'Target' })) },
    { key: 'by', label: 'Target date (optional)', type: 'month' },
    { key: 'have', label: 'Saved', type: 'money', get: (g) => money(plan[g.id]?.have) },
    { key: 'left', label: 'Still to save', type: 'money', get: (g) => money(plan[g.id]?.left) },
    { key: 'need', label: 'Needed / month', type: 'money', get: (g) => (plan[g.id]?.needPerMonth ? money(plan[g.id].needPerMonth) : '–') },
    { key: 'reach', label: 'Reached around', type: 'text', get: (g) => { const p = plan[g.id]; return !p ? '–' : p.left <= 0 ? 'Reached' : p.reach ? monthLabel(p.reach) : 'Not at current pace'; }, cls: (g) => (plan[g.id] && !plan[g.id].onTrack ? 'neg' : '') },
  ];
  return el('div', null,
    pageHead('Goals', 'Money you’re saving for something, and milestones you want to reach.', picker),
    el('div', { class: 'grid grid--stats' },
      stat('Saved so far', money(sm.saved), 'Cash + investments, excl. money set aside', true),
      stat('12-month pace', money(sm.pace) + '/mo', 'Savings + planned investing'),
      stat('Emergency fund', sm.emergencyMonths != null ? `${sm.emergencyMonths.toFixed(1)} months` : '–', sm.spendAvg ? `Cash ÷ ${money(sm.spendAvg, { compact: true })} average monthly spending` : null),
    ),
    suggestionsCard(sm),
    el('h2', { class: 'section-gap', text: 'Saving for something' }),
    el('p', { class: 'card__hint', text: 'Your savings fill these from the top, so put the most important first.' }),
    sm.goals.length ? el('div', { class: 'card' }, sm.goals.map(goalBlock)) : null,
    el('div', { class: 'section-gap' }, editTable({ cols, rows: buckets, onDelete: remove, emptyText: 'Nothing yet — add a goal above.' })),
    el('p', { class: 'card__hint section-gap', text: 'The emergency fund target follows your average spending over the last 6 months (excluding income tax); the usual guide is 3–6 months. Dates assume your last 12 months’ saving pace continues and goes to each goal in turn.' }),
    el('h2', { class: 'section-gap', text: 'Milestones' }),
    el('p', { class: 'card__hint', text: 'Targets for figures the app already tracks. They don’t set money aside, so they don’t compete with the goals above. Dates use your last 12 months’ pace and leave out investment growth, so they lean cautious; CPF includes its guaranteed interest.' }),
    sm.milestones.length ? el('div', { class: 'card' }, sm.milestones.map(milestoneBlock)) : null,
    el('div', { class: 'section-gap' }, editTable({ cols: mCols, rows: milestones, onDelete: remove, emptyText: 'No milestones yet — pick one from “Add a goal”, or a suggestion above.' })),
    sourceLinks('moneysense', 'cpfPayouts'),
  );
}

function pageKids() {
  const now = thisMonth(), year = now.slice(0, 4);
  const cur = computeLedger(now).find((r) => r.month === now);
  const earned = cur ? cur.earned : num((assumptionFor(now) || {}).salary) * 12;
  const ordered = childrenByBirth();
  const stageOf = (c, ym = now) => {
    if (!c.birthMonth || ym < c.birthMonth) return null;
    const age = monthDiff(c.birthMonth, ym) / 12;
    return S.childStages.find((s) => age >= num(s.from) && age < num(s.to)) || null;
  };
  const eduGoal = (c) => {
    const i = ordered.indexOf(c);
    S.goals.push({ id: uid(), name: `${childName(c, i < 0 ? S.children.indexOf(c) : i)} — education fund`, target: 0, by: c.birthMonth ? addMonths(c.birthMonth, 19 * 12) : '', kind: 'custom' });
    commit(); go('goals'); toast('Goal added — enter the target amount');
  };
  const yesNo = [[true, 'Yes'], [false, 'No']];
  const edit = () => 'table__td--edit';
  const childCols = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'birthMonth', label: 'Born (or due)', type: 'month' },
    { key: 'age', label: 'Age', type: 'text', get: (c) => (c.birthMonth ? (now < c.birthMonth ? 'Not born yet' : String(Math.floor(monthDiff(c.birthMonth, now) / 12))) : '–') },
    { key: 'stage', label: 'Now', type: 'text', get: (c) => stageOf(c)?.name || '–' },
    { key: 'cost', label: 'Cost now / month', type: 'money', get: (c) => money(num(stageOf(c)?.monthly)) },
    { key: 'studying', label: 'Studying full-time after 16', type: 'text', cls: edit, get: (c) => selectFor(c, 'studying', yesNo, 'Studying full-time after 16') },
    { key: 'disability', label: 'Disability', type: 'text', cls: edit, get: (c) => selectFor(c, 'disability', [[false, 'No'], [true, 'Yes']], 'Disability') },
    { key: 'goal', label: '', type: 'text', get: (c) => el('button', { class: 'btn btn--small', type: 'button', text: '+ Education goal', onclick: () => eduGoal(c) }) },
  ];
  // Kids' costs for the next 25 years, by calendar year (today's prices).
  const firstYear = +year, years = Array.from({ length: 25 }, (_, k) => firstYear + k);
  const yearly = years.map((y) => sum(Array.from({ length: 12 }, (_, m) => kidsCostFor(`${y}-${pad(m + 1)}`).total)));
  const reliefs = childReliefs(year, earned);
  const ptrNow = cur ? { pool: cur.ptrPool, applied: cur.ptrApplied } : { pool: ptrFor(year), applied: 0 };
  return el('div', null,
    pageHead('Kids & education', 'Each child’s costs by age, education savings, and the tax reliefs and rebates they bring.',
      el('button', { class: 'btn btn--primary', type: 'button', text: '+ Child', onclick: () => { S.children.push({ id: uid(), name: '', birthMonth: '', disability: false, studying: true }); commit(); } })),
    el('div', { class: 'grid grid--stats' },
      stat('Kids’ costs this month', money(kidsCostFor(now).total), `${S.children.length} child${S.children.length === 1 ? '' : 'ren'}`, true),
      stat(`Child reliefs ${year}`, money(sum(reliefs, (r) => r.amount)), 'Inside the $80k relief cap'),
      stat('Parenthood Tax Rebate', money(Math.max(0, ptrNow.pool - ptrNow.applied)), `Left after ${year}; ${money(ptrNow.applied, { compact: true })} used this year`),
    ),
    el('div', { class: 'section-gap' }, editTable({ cols: childCols, rows: S.children, onDelete: (c) => undoable(`${c.name || 'Child'} removed`, () => { S.children = S.children.filter((x) => x !== c); }), emptyText: 'No children added. Add one — including a baby on the way — to plan costs and reliefs.' })),
    el('div', { class: 'grid grid--two section-gap grid--top' },
      el('div', { class: 'card' },
        el('div', { class: 'card__title' }, el('span', { text: 'Monthly cost by age' }), el('button', { class: 'btn btn--small', type: 'button', text: '+ Stage', onclick: () => { const last = S.childStages[S.childStages.length - 1]; S.childStages.push({ id: uid(), name: 'New stage', from: num(last?.to), to: num(last?.to) + 1, monthly: 0 }); commit(); } })),
        el('p', { class: 'card__hint', text: 'Your own estimates after subsidies — fees, enrichment, allowance, food. Pre-school fees and subsidies: ECDA; school fees: MOE. Applies to every child; counts as spending in the ledger.' }),
        editTable({
          cols: [{ key: 'name', label: 'Stage', type: 'text' }, { key: 'from', label: 'From age', type: 'number', step: '0.5' }, { key: 'to', label: 'Until age', type: 'number', step: '0.5' }, { key: 'monthly', label: 'Per month', type: 'money' }],
          rows: S.childStages,
          onDelete: (s) => undoable('Stage removed', () => { S.childStages = S.childStages.filter((x) => x !== s); }),
        }),
      ),
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'Tax' }),
        el('div', { class: 'form-grid' },
          field('Working Mother’s Child Relief', selectFor(S.settings, 'wmcr', [[false, 'Not claiming'], [true, 'I claim it']], 'Working Mother’s Child Relief')),
          settingInput(S.settings, 'childReliefShare', 'pct', 'Share of QCR & rebate you claim', 'Parents can split them; 100% if you claim all.'),
        ),
        reliefs.length ? kv(reliefs.map((r) => [r.name, money(r.amount)])) : el('p', { class: 'muted', text: `No child reliefs for ${year}.` }),
        el('p', { class: 'card__hint section-gap', text: `Qualifying Child Relief ${money(SG.qcr, { compact: true })} per child (${money(SG.childDisability, { compact: true })} with a disability) while under 16 or studying full-time. WMCR for children born from 2024: ${SG.wmcrFixed.map((v) => money(v, { compact: true })).join(' / ')} for the 1st / 2nd / 3rd+; earlier births: ${SG.wmcrPct.map((v) => pct(v, 0)).join(' / ')} of earned income. Parenthood Tax Rebate ${SG.ptr.map((v) => money(v, { compact: true })).join(' / ')}, used against tax from the year of birth and carried forward. These feed the Tax page and the ledger’s income tax. Check IRAS for your case.` }),
        sourceLinks('qcr', 'wmcr', 'newborn', 'reliefs'),
      ),
    ),
    S.children.length ? el('div', { class: 'card section-gap' }, el('div', { class: 'card__title', text: 'Kids’ costs per year (today’s prices)' }),
      barChart(yearly, years.map(String), { format: (v) => money(v, { compact: true }), label: 'Kids’ costs per year' })) : null,
  );
}

/**
 * Year-by-year retirement projection in future dollars. Until `retireAge`: savings and investments grow at the
 * expected return plus the last 12 months' saving pace, and CPF gets the same contributions. At 55 the RA is
 * formed up to the Full Retirement Sum (SA first, then OA); anything above it becomes withdrawable and joins
 * savings. From 65, CPF LIFE pays an estimate scaled from CPF's figure for the FRS. After retiring, spending
 * (growing with inflation) comes out of savings.
 */
function retireSim(ctx, retireAge) {
  const R = S.retire, r = num(R.returnRate), infl = num(R.inflation);
  let W = ctx.wealth, oa = ctx.oa, sa = ctx.sa, ra = ctx.ra, payout = ctx.payout;
  const out = [];
  let lastsTo = null, atRetire = null;
  for (let t = 0; ctx.age + t <= Math.max(num(R.lifeExpectancy), 95); t++) {
    const age = ctx.age + t, year = ctx.year + t;
    const working = age < retireAge;
    if (!working && atRetire == null) atRetire = W;
    if (ctx.cpf) {
      if (Math.floor(age) === 55 && ra == null) {
        const frs = SG.frs2026 * Math.pow(1 + SG.frsGrowth, year - 2026);
        const fromSa = Math.min(sa, frs), fromOa = Math.min(oa, frs - fromSa);
        ra = fromSa + fromOa; sa -= fromSa; oa -= fromOa;
        W += sa + oa; sa = 0; oa = 0; // above the FRS: withdrawable at 55
        payout = (SG.cpfLifeAtFrs * ra) / SG.frs2026;
      }
      const contrib = working ? ctx.contrib : 0;
      const house = t < ctx.housingYears ? ctx.housingCpf : 0;
      oa = Math.max(0, oa * 1.025 + contrib * ctx.oaShare - house);
      sa = sa * 1.04 + contrib * ctx.saShare;
      if (ra != null && age < 65) ra *= 1.04;
    }
    const spend = ctx.spend * Math.pow(1 + infl, t);
    const income = ctx.cpf && age >= 65 && payout ? payout * 12 : 0;
    W = W * (1 + r) + (working ? ctx.save : income - spend);
    out.push({ age, year, wealth: W, cpf: ctx.cpf ? oa + sa + (ra || 0) : 0, spend, income });
    if (!working && W < 0 && lastsTo == null) lastsTo = age;
  }
  return { years: out, lastsTo, atRetire, payout };
}

function pageRetirement() {
  const R = S.retire, st = S.settings, sm = summary(), now = thisMonth();
  const a = assumptionFor(now) || {};
  const age = st.birthMonth ? ageAt(now) : num(a.age);
  if (!(age > 0)) {
    return el('div', null, pageHead('Retirement', 'When you could stop working, and how long your money lasts.'),
      el('div', { class: 'notice' }, 'Set your birth month (or an age) on ', el('a', { href: '#/assumptions', text: 'Assumptions' }), ' to see a projection.'));
  }
  const recent = sm.rows.slice(-12);
  const last = sm.last;
  const po = S.housing.status === 'own' ? payoff({ balance: sm.homeLoan, payment: num(S.housing.cpfMonthly) + num(S.housing.cashMonthly), rate: S.housing.loanRate }) : { months: 0 };
  const spendMonthly = R.spendMonthly != null && R.spendMonthly !== '' ? num(R.spendMonthly) : sm.spendAvg;
  const ctx = {
    age: Math.floor(age), year: +now.slice(0, 4), cpf: st.cpfEnabled,
    wealth: sm.liquid, save: sm.pace * 12, spend: spendMonthly * 12,
    oa: last ? last.oa : num(st.cpfStart.oa), sa: last ? last.sa : num(st.cpfStart.sa),
    ra: age >= 55 ? (last ? last.sa : num(st.cpfStart.sa)) : null, payout: null,
    contrib: recent.length ? (sum(recent, (r) => r.ee + r.er) / recent.length) * 12 : 0,
    oaShare: last ? num(last.rates.oa) : 0.6, saShare: last ? Math.max(0, 1 - num(last.rates.oa) - num(last.rates.ma)) : 0.16,
    housingCpf: num(S.housing.cpfMonthly) * 12, housingYears: po.months == null ? 99 : Math.ceil(num(po.months) / 12),
  };
  if (ctx.ra != null) { ctx.payout = (SG.cpfLifeAtFrs * ctx.ra) / SG.frs2026; ctx.sa = 0; }
  const plan = retireSim(ctx, num(R.age));
  const life = num(R.lifeExpectancy);
  let earliest = null;
  for (let ra = ctx.age; ra <= 75; ra++) { const s = retireSim(ctx, ra); if (s.lastsTo == null || s.lastsTo > life) { earliest = ra; break; } }
  const toToday = (v, years) => v / Math.pow(1 + num(R.inflation), years);
  const yrsToRet = Math.max(0, num(R.age) - ctx.age);
  const spendAtRet = ctx.spend * Math.pow(1 + num(R.inflation), yrsToRet);
  const fireNumber = num(R.swr) > 0 ? spendAtRet / num(R.swr) : null;
  const shown = plan.years.filter((y) => y.age <= Math.max(life, num(R.age) + 5));
  return el('div', null,
    pageHead('Retirement', 'When you could stop working, and how long your money lasts — with CPF LIFE.'),
    el('div', { class: 'grid grid--stats' },
      stat('Earliest you could retire', earliest != null ? `Age ${earliest}` : 'Not by 75', earliest != null ? `${ctx.year + earliest - ctx.age} · money lasts past ${life}` : 'Save more or spend less in retirement', true),
      stat(`Savings at ${num(R.age)}`, money(plan.atRetire ?? 0, { compact: true }), `≈ ${money(toToday(plan.atRetire ?? 0, yrsToRet), { compact: true })} in today’s money`),
      stat('CPF LIFE from 65', plan.payout ? money(plan.payout) + '/mo' : '–', plan.payout ? `≈ ${money(toToday(plan.payout, Math.max(0, 65 - ctx.age)))} in today’s money` : (st.cpfEnabled ? 'Forms at 55' : 'CPF tracking off')),
      stat(`Retiring at ${num(R.age)}, money lasts`, plan.lastsTo == null ? `Past ${Math.max(life, 95)}` : `Until ${plan.lastsTo}`, plan.lastsTo != null && plan.lastsTo <= life ? 'Runs out before your life expectancy' : null),
    ),
    el('div', { class: 'grid grid--two section-gap grid--top' },
      el('div', { class: 'card' }, el('div', { class: 'card__title', text: 'Your assumptions' }),
        el('div', { class: 'form-grid' },
          settingInput(R, 'age', 'number', 'Retire at age', null, { step: '1' }),
          settingInput(R, 'lifeExpectancy', 'number', 'Plan until age', 'Plan for longer than average.', { step: '1' }),
          settingInput(R, 'spendMonthly', 'money', 'Spending in retirement / month', `Today’s prices. Blank = your recent average (${money(sm.spendAvg, { compact: true })}).`, { nullable: true }),
          settingInput(R, 'returnRate', 'pct', 'Investment return / year', 'Before inflation. Lower is safer.'),
          settingInput(R, 'inflation', 'pct', 'Inflation / year'),
          settingInput(R, 'swr', 'pct', 'Safe withdrawal rate', 'Used for the FIRE number; 4% is the common rule of thumb.'),
        )),
      el('div', { class: 'card' }, el('div', { class: 'card__title', text: 'Key numbers' }),
        kv([
          ['Saving now (12-month pace)', money(sm.pace) + '/mo'],
          ['Savings & investments now (liquid net worth)', money(sm.liquid)],
          [`Spending at ${num(R.age)} (future prices)`, money(spendAtRet / 12) + '/mo'],
          [`FIRE number at ${num(R.age)} (spending ÷ ${pct(R.swr, 1)})`, fireNumber != null ? money(fireNumber, { compact: true }) : '–', true],
          ...(st.cpfEnabled ? [
            ['Full Retirement Sum for your cohort', money(SG.frs2026 * Math.pow(1 + SG.frsGrowth, ctx.year + Math.max(0, 55 - ctx.age) - 2026), { compact: true })],
            ['CPF LIFE estimate from 65', plan.payout ? money(plan.payout) + '/mo' : '–'],
          ] : []),
        ]),
        el('p', { class: 'card__hint section-gap', text: `A rough projection, not advice. CPF LIFE is scaled from CPF’s estimate of ~${money(SG.cpfLifeAtFrs, { compact: true })}/month (Standard plan, from 65) for the 2026 Full Retirement Sum of ${money(SG.frs2026, { compact: true })}; the FRS is assumed to rise ${pct(SG.frsGrowth, 1)} a year. Savings growth assumes your last 12 months’ pace continues. Use CPF’s Retirement Payout Planner for your own figures.` }),
        sourceLinks('cpfPayouts'),
      ),
    ),
    el('div', { class: 'card section-gap' }, el('div', { class: 'card__title', text: `Projection, retiring at ${num(R.age)}` }),
      lineChart([
        { name: 'Savings & investments', values: shown.map((y) => y.wealth) },
        ...(st.cpfEnabled ? [{ name: 'CPF (OA + SA, then RA)', values: shown.map((y) => y.cpf) }] : []),
      ], shown.map((y) => `${y.age}`))),
  );
}

/** CPF going into the OA each month at current pay and age band. */
function oaInflow() {
  if (!S.settings.cpfEnabled) return 0;
  const now = thisMonth(), a = assumptionFor(now) || {};
  const c = cpfFor(now, ageAt(now, a));
  const ceiling = num(S.settings.owCeiling);
  return (ceiling > 0 ? Math.min(num(a.salary), ceiling) : num(a.salary)) * (num(c.ee) + num(c.er)) * num(c.oa);
}
const LOAN_TYPES = [['hdb', 'HDB loan'], ['bank', 'Bank loan']];

function pageHousing() {
  const hs = S.housing, sm = summary(), now = thisMonth();
  const a = assumptionFor(now) || {};
  const gross = num(a.salary);
  const choose = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Your housing' },
    [['rent', 'Renting'], ['own', 'I own a home'], ['buying', 'Planning to buy']].map(([v, t]) => el('button', {
      class: 'segmented__btn', type: 'button', text: t, 'aria-pressed': String(hs.status === v), onclick: () => { hs.status = v; commit(); },
    })));
  const body = hs.status === 'rent' ? housingRent(a, computeLedger(now).find((r) => r.month === now))
    : hs.status === 'own' ? housingOwn(sm, gross)
      : hs.status === 'buying' ? housingPlan(sm, gross)
        : el('div', { class: 'card muted', text: 'Choose your situation above.' });
  return el('div', null,
    pageHead('Housing', 'Your rent, the home you own and its loan, or the home you plan to buy.'),
    el('div', { class: 'table-toolbar' }, choose),
    el('div', { class: 'section-gap' }, body),
  );
}

function housingRent(a, cur) {
  const line = expenseLines().find((l) => /rent|housing/i.test(l.name));
  if (!line) {
    return el('div', { class: 'card' },
      el('p', { text: 'Rent is a spending line, so it flows into every month of the ledger.' }),
      el('button', { class: 'btn btn--primary', type: 'button', text: 'Add a rent line', onclick: () => { S.budgetLines.push({ id: uid(), ...LINE_PRESETS[0] }); commit(); go('assumptions'); toast('Rent line added — enter the amount in the Assumptions table'); } }));
  }
  const rent = cur ? cur.lines[line.id] : num(a.lines?.[line.id]);
  return el('div', { class: 'grid grid--two' },
    el('div', { class: 'card' }, el('div', { class: 'card__title', text: 'Rent' }),
      kv([['Rent per month', money(rent)], ['Share of take-home pay', cur?.takeHome ? pct(rent / cur.takeHome) : '–', true]]),
      el('p', { class: 'card__hint section-gap' }, 'Set the amount on ', el('a', { href: '#/assumptions', text: 'Assumptions' }), ` (line “${line.name}”), and add a new Assumptions row when it changes.`)),
    el('div', { class: 'card' }, el('div', { class: 'card__title', text: 'Thinking of buying?' }),
      el('p', { class: 'card__hint', text: 'Switch to “Planning to buy” to see the down payment, stamp duty, how much CPF you can use, the cash you need and the monthly instalment.' })),
  );
}

function housingOwn(sm, gross) {
  const hs = S.housing;
  const payment = num(hs.cpfMonthly) + num(hs.cashMonthly);
  const po = payoff({ balance: sm.homeLoan, payment, rate: hs.loanRate });
  // A loan that starts later (e.g. keys in a few years) is paid off counting from its start, not from today.
  if (po.months != null && hs.loanAsOf > thisMonth()) po.date = addMonths(hs.loanAsOf, po.months);
  const tracked = sm.rows.filter((r) => hs.loanAsOf && r.month >= hs.loanAsOf);
  const otherDebt = sum(S.liabilities, (l) => l.payment);
  const proceeds = sm.homeValue - sm.homeLoan - sm.cpfUsedHome;
  const cap = hs.loanType === 'hdb' ? SG.msr : SG.tdsr;
  const ratio = gross > 0 ? (payment + (hs.loanType === 'hdb' ? 0 : otherDebt)) / gross : null;
  return el('div', null,
    el('div', { class: 'grid grid--stats' },
      stat('Home equity', money(sm.homeEquity), 'Value − loan', true),
      stat('Loan balance', money(sm.homeLoan), tracked.length ? `After ${monthLabel(tracked[tracked.length - 1].month)}` : hs.loanAsOf ? `At ${monthLabel(hs.loanAsOf)}` : 'Enter it below'),
      stat('Loan paid off', po.months == null ? (payment > 0 ? 'Never at this payment' : '–') : po.months === 0 ? 'Done' : monthLabel(po.date), po.months ? `${po.months} months · ${money(po.interest, { compact: true })} interest to go` : null),
      stat(hs.loanType === 'hdb' ? 'Instalment ÷ gross pay' : 'All debts ÷ gross pay', ratio != null ? pct(ratio) : '–',
        `${hs.loanType === 'hdb' ? 'MSR' : 'TDSR'} limit ${pct(cap, 0)}${ratio > cap ? ' — over the limit' : ''}`),
    ),
    el('div', { class: 'grid grid--two section-gap' },
      el('div', { class: 'card' }, el('div', { class: 'card__title', text: 'Your home and loan' }),
        el('div', { class: 'form-grid' },
          settingInput(hs, 'value', 'money', 'Estimated value', 'Recent prices for similar units are a fair guide.'),
          field('Loan type', selectFor(hs, 'loanType', LOAN_TYPES, 'Loan type')),
          settingInput(hs, 'loanBalance', 'money', 'Outstanding loan', 'From your latest loan statement.'),
          settingInput(hs, 'loanAsOf', 'month', 'Balance is at the start of', 'Instalments from this month on are followed in the ledger.'),
          settingInput(hs, 'loanRate', 'pct', 'Interest rate / year', `HDB loans: ${pct(SG.hdbRate)}.`),
          settingInput(hs, 'cpfMonthly', 'money', 'Paid monthly from CPF OA', 'Taken off your OA balance each month.'),
          settingInput(hs, 'cashMonthly', 'money', 'Paid monthly in cash', 'Counts as spending in the ledger.'),
          settingInput(hs, 'cpfUsed', 'money', 'CPF used so far, incl. accrued interest', 'CPF statement → Home ownership, at the same month as the balance.'),
        )),
      el('div', { class: 'card' }, el('div', { class: 'card__title', text: 'If you sold today' }),
        kv([
          ['Estimated value', money(sm.homeValue)],
          ['Repay the loan', '−' + money(sm.homeLoan)],
          ['Back to your CPF OA (CPF used + accrued interest)', '−' + money(sm.cpfUsedHome)],
          ['Cash left', money(proceeds), true, sign(proceeds)],
        ]),
        el('p', { class: 'card__hint section-gap', text: `CPF used for a home goes back into your OA with the interest it would have earned there (${pct(SG.cpfHousingRate)}, the OA rate) when you sell. Before agent fees and other selling costs.` }),
        sourceLinks('cpfRefund', 'hdbLoan', 'masTdsr'),
      ),
    ),
    tracked.length > 1 ? el('div', { class: 'card section-gap' }, el('div', { class: 'card__title', text: 'Loan balance' }), lineChart([{ name: 'Loan balance', values: tracked.map((r) => r.loanBal) }], tracked.map((r) => monthLabel(r.month).replace(' 20', " '")))) : null,
  );
}

function housingPlan(sm, gross) {
  const p = S.housing.plan;
  const price = num(p.price), grants = num(p.grants);
  const loan = Math.max(0, Math.min(price * SG.ltv, price - grants));
  const down = Math.max(0, price - grants - loan);
  const bsd = stampDuty(price), fees = num(p.fees);
  const upfront = down + bsd + fees;
  const minCash = p.loanType === 'bank' ? price * SG.bankMinCash : 0;
  const monthsAway = p.month ? Math.max(0, monthDiff(thisMonth(), p.month)) : 0;
  const oaNow = S.settings.cpfEnabled ? (sm.last ? sm.last.oa : num(S.settings.cpfStart.oa)) : 0;
  const oaThen = oaNow + oaInflow() * monthsAway;
  const cpfMax = Math.max(0, Math.min(oaThen, upfront - minCash));
  const cpfUse = p.cpfUse == null || p.cpfUse === '' ? cpfMax : Math.max(0, Math.min(num(p.cpfUse), cpfMax));
  const cash = upfront - cpfUse;
  const inst = instalment(loan, p.rate, p.tenure);
  const otherDebt = sum(S.liabilities, (l) => l.payment);
  const ratio = (v, cap) => (gross > 0 ? `${pct(v / gross)} of gross pay (limit ${pct(cap, 0)}${v / gross > cap ? ' — over' : ''})` : 'Add your salary on Assumptions');
  const makeGoal = () => {
    S.goals.push({ id: uid(), name: 'Home: cash for down payment & fees', target: Math.round(cash), by: p.month || '', kind: 'custom' });
    commit(); go('goals'); toast('Goal added');
  };
  const bought = () => undoable('Moved to “I own a home”', () => {
    const fromOa = Math.min(inst, oaInflow());
    Object.assign(S.housing, { status: 'own', value: price, loanType: p.loanType, loanBalance: loan, loanAsOf: p.month || thisMonth(), loanRate: p.rate, cpfMonthly: Math.round(fromOa), cashMonthly: Math.round(inst - fromOa), cpfUsed: Math.round(cpfUse) });
  });
  return el('div', null,
    el('div', { class: 'grid grid--stats' },
      stat('Cash needed', money(cash), p.month ? `By ${monthLabel(p.month)}` : null, true),
      stat('From CPF OA', money(cpfUse), `${money(oaThen, { compact: true })} expected in OA by then`),
      stat('Monthly instalment', money(inst), `${money(loan, { compact: true })} over ${num(p.tenure)} years`),
      stat('Cash in the bank now', money(sm.emergencyCash), cash > 0 ? `${pct(Math.min(1, Math.max(0, sm.emergencyCash) / cash), 0)} of the cash needed` : null),
    ),
    el('div', { class: 'grid grid--two section-gap' },
      el('div', { class: 'card' }, el('div', { class: 'card__title', text: 'The home' }),
        el('div', { class: 'form-grid' },
          settingInput(p, 'price', 'money', 'Price'),
          settingInput(p, 'month', 'month', 'Key collection / completion'),
          field('Loan type', selectFor(p, 'loanType', LOAN_TYPES, 'Loan type')),
          settingInput(p, 'rate', 'pct', 'Interest rate / year', `HDB loans: ${pct(SG.hdbRate)}. Bank rates float.`),
          settingInput(p, 'tenure', 'number', 'Loan tenure (years)', 'Check the current maximum with HDB or your bank.', { step: '1' }),
          settingInput(p, 'grants', 'money', 'Housing grants', 'e.g. Enhanced CPF Housing Grant — check eligibility on the HDB site.'),
          settingInput(p, 'fees', 'money', 'Legal & other fees', 'Conveyancing, valuation, renovation deposit…'),
          settingInput(p, 'cpfUse', 'money', 'CPF OA to use', 'Blank = as much as allowed and available.', { nullable: true }),
        )),
      el('div', { class: 'card' }, el('div', { class: 'card__title', text: 'Where the money comes from' }),
        kv([
          ['Price', money(price)],
          ['Housing grants', '−' + money(grants)],
          [`Loan (up to ${pct(SG.ltv, 0)} of the price)`, '−' + money(loan)],
          ['Down payment', money(down), true],
          ['Buyer’s Stamp Duty', money(bsd)],
          ['Legal & other fees', money(fees)],
          ['Needed upfront', money(upfront), true],
          ['From CPF OA', '−' + money(cpfUse)],
          ['Cash needed', money(cash), true],
        ]),
        el('div', { class: 'card__title section-gap', text: 'Can you borrow this much?' }),
        kv([
          ['Monthly instalment', money(inst)],
          ...(p.loanType === 'hdb' ? [['Mortgage Servicing Ratio (HDB/EC)', ratio(inst, SG.msr)]] : []),
          ['Total Debt Servicing Ratio (all debts)', ratio(inst + otherDebt, SG.tdsr)],
        ]),
        el('p', { class: 'card__hint section-gap', text: `${p.loanType === 'bank' ? `Bank loans need at least ${pct(SG.bankMinCash, 0)} of the price in cash. ` : ''}Stamp duty uses the current Buyer’s Stamp Duty bands; Additional Buyer’s Stamp Duty (a second property, PRs, foreigners) is not included. Loan limits shrink for longer tenures and older buyers — confirm with HDB (HDB Flat Eligibility letter) or your bank.` }),
        sourceLinks('hdbLoan', 'masLtv', 'masTdsr', 'bsd'),
        el('div', { class: 'page__actions section-gap' },
          el('button', { class: 'btn btn--primary', type: 'button', text: 'Save the cash as a goal', onclick: makeGoal, disabled: !(cash > 0) }),
          el('button', { class: 'btn', type: 'button', text: 'I’ve bought it', onclick: bought, disabled: !(price > 0) }),
        ),
      ),
    ),
  );
}

/* ---------- Statement import (PDF read in the browser by statement.js) ---------- */
/** What importing one parsed statement would change, converted to the app's currency. */
function statementPlan(r, target) {
  const conv = (amount, cur) => { const v = stmtConvert(r, amount, cur, target); return v == null ? null : round2(v); };
  const value = conv(r.value, r.base);
  const moves = r.moves.map((m, i) => ({ ...m, converted: conv(m.amount, m.currency), key: `${r.source}|${m.date}|${m.amount}|${m.currency}|${i}` }));
  const fresh = moves.filter((m) => !S.deposits.some((d) => d.importKey === m.key));
  const divs = Object.entries(r.dividends).map(([cur, amount]) => ({ cur, amount, converted: conv(amount, cur) }));
  const missingFx = value == null || moves.some((m) => m.converted == null) || divs.some((d) => d.converted == null);
  return {
    r, target, value, moves, fresh, divs, divTotal: sum(divs, (d) => d.converted), missingFx,
    replacesValue: S.portfolio.some((p) => p.account === r.account && p.date === r.periodEnd),
  };
}
function applyStatementPlan(pl) {
  const { r, target } = pl;
  const ex = S.portfolio.find((p) => p.account === r.account && p.date === r.periodEnd);
  if (ex) ex.value = pl.value; else S.portfolio.push({ id: uid(), date: r.periodEnd, value: pl.value, account: r.account, notes: `${r.source} statement` });
  for (const m of pl.fresh) {
    S.deposits.push({ id: uid(), date: m.date, amount: m.converted, notes: `${r.source}: ${m.desc}${m.currency !== target ? ` (${m.currency} ${m.amount})` : ''}`, importKey: m.key });
  }
  const key = `${r.source}|${r.periodEnd}`;
  S.dividends = S.dividends.filter((d) => d.importKey !== key);
  if (pl.divTotal) S.dividends.push({ id: uid(), date: r.periodEnd, amount: round2(pl.divTotal), account: r.account, notes: `${r.source} statement`, importKey: key });
}
async function importStatements() {
  const files = await pickFile('.pdf,application/pdf', true);
  if (!files?.length) return;
  const target = S.settings.currency || 'SGD';
  const done = [], failed = [];
  for (const f of files) {
    try { done.push({ name: f.name, plan: statementPlan(await readStatement(new Uint8Array(await f.arrayBuffer())), target) }); } catch (e) { failed.push({ name: f.name, error: e.message }); }
  }
  const usable = done.filter((d) => !d.plan.missingFx).sort((a, b) => (a.plan.r.periodEnd < b.plan.r.periodEnd ? -1 : 1));
  const fmtAmt = (cur, v) => `${cur} ${v.toLocaleString(S.settings.locale || 'en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const body = [
    ...done.map(({ name, plan: pl }) => el('div', { class: 'card import-card' },
      el('div', { class: 'card__title', text: `${pl.r.source} · ${dateLabel(pl.r.periodStart)} – ${dateLabel(pl.r.periodEnd)}` }),
      pl.missingFx ? el('p', { class: 'neg', text: `Can’t convert to ${target}: the statement has no ${target} exchange rate. Not imported.` }) : kv([
        ['Account value at period end', money(pl.value) + (pl.r.base !== target ? ` (${fmtAmt(pl.r.base, pl.r.value)})` : ''), true],
        ['Deposits / withdrawals', pl.moves.length ? `${pl.fresh.length} new · ${money(sum(pl.fresh, (m) => m.converted))}${pl.moves.length > pl.fresh.length ? ` · ${pl.moves.length - pl.fresh.length} already imported` : ''}` : 'None'],
        ['Cash dividends received', pl.divTotal ? money(pl.divTotal) : 'None'],
      ]),
      pl.replacesValue && !pl.missingFx ? el('p', { class: 'card__hint', text: 'Updates the value already imported for this date.' }) : null,
      pl.r.other.length ? el('p', { class: 'card__hint', text: `${pl.r.other.length} other cash movement(s) not imported.` }) : null,
      el('p', { class: 'card__hint muted', text: name }),
    )),
    ...failed.map((f) => el('div', { class: 'notice' }, el('strong', { text: f.name }), el('div', { text: f.error }))),
    usable.length ? el('p', { class: 'card__hint', text: `The account value goes into the portfolio log as its own account (“${usable[0].plan.r.account}”), added to any values you type in — if a typed-in value already includes this account, lower it. Deposits count as money you invested; dividends are listed on the Investments page. Converted with each statement’s own exchange rate.` }) : null,
    el('p', { class: 'card__hint', text: `Read on this device — the file is not uploaded anywhere. Supported: ${STATEMENT_SUPPORTED}.` }),
  ];
  openDialog(usable.length ? `Import ${usable.length} statement${usable.length === 1 ? '' : 's'}?` : 'Nothing to import', body, [
    { label: usable.length ? 'Cancel' : 'Close' },
    ...(usable.length ? [{ label: 'Import', primary: true, run: () => {
      for (const d of usable) applyStatementPlan(statementPlan(d.plan.r, target)); // re-plan in order, so duplicates within the batch are skipped too
      commit();
      toast(`Imported ${usable.length} statement${usable.length === 1 ? '' : 's'}`);
    } }] : []),
  ]);
}

function pageInvestments() {
  const sm = summary();
  const dep = [...S.deposits].sort(byKey('date'));
  const pv = [...S.portfolio].sort(byKey('date'));
  const gain = sm.portfolio - sm.deposits;
  const yearAgo = addMonths(thisMonth(), -12);
  const divYear = sum(S.dividends.filter((d) => d.date.slice(0, 7) > yearAgo), (d) => d.amount);
  // Total over time: at each logged date, every account's latest value so far, added up.
  const dates = [...new Set(pv.filter((p) => p.date).map((p) => p.date))];
  const running = {};
  const totals = dates.map((d) => { for (const p of pv.filter((x) => x.date === d)) running[p.account || ''] = num(p.value); return sum(Object.values(running)); });
  const typedIn = [...pv].reverse().find((p) => !p.account);
  return el('div', null,
    pageHead('Investments', 'Log what you actually deposit, and update the portfolio value whenever you check it — or import a statement.',
      el('button', { class: 'btn btn--primary', type: 'button', text: 'Import statement (PDF)', onclick: importStatements })),
    el('div', { class: 'grid grid--stats' },
      stat('Portfolio value', money(sm.portfolio), sm.portfolioDate ? `As of ${dateLabel(sm.portfolioDate)}` : 'No value logged', true),
      stat('Total deposited', money(sm.deposits)),
      stat('Gain / loss', money(gain), sm.deposits ? pct(gain / sm.deposits) : null),
      stat('Actual vs planned', money(sm.extraInvested), `Planned so far ${money(sm.planned)}`),
      ...(S.dividends.length ? [stat('Dividends, last 12 months', money(divYear), 'Cash dividends from imported statements')] : []),
    ),
    el('p', { class: 'card__hint section-gap', text: 'The ledger subtracts your planned investment. Any difference between actual and planned deposits is corrected in net worth and expected cash, so nothing is counted twice.' }),
    el('div', { class: 'grid grid--two section-gap' },
      el('div', null,
        el('div', { class: 'card__title' }, el('span', { text: 'Deposits' }), el('button', { class: 'btn btn--small btn--primary', type: 'button', text: '+ Deposit', onclick: () => { S.deposits.push({ id: uid(), date: todayISO().slice(0, 8) + '01', amount: 0, notes: '' }); commit(); } })),
        editTable({ cols: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'notes', label: 'Notes', type: 'text' }], rows: dep, onDelete: (r) => undoable('Deposit deleted', () => { S.deposits = S.deposits.filter((x) => x !== r); }), totals: dep.length ? { amount: sm.deposits } : null }),
      ),
      el('div', null,
        el('div', { class: 'card__title' }, el('span', { text: 'Portfolio value log' }), el('button', { class: 'btn btn--small btn--primary', type: 'button', text: '+ Value', onclick: () => { S.portfolio.push({ id: uid(), date: todayISO(), value: num(typedIn?.value), notes: '' }); commit(); } })),
        editTable({ cols: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'value', label: 'Value', type: 'money' }, { key: 'account', label: 'Account', type: 'text' }, { key: 'notes', label: 'Notes', type: 'text' }], rows: pv, onDelete: (r) => undoable('Portfolio value deleted', () => { S.portfolio = S.portfolio.filter((x) => x !== r); }) }),
        el('p', { class: 'card__hint', text: 'Each account’s latest value is added up. Leave Account blank for values you type in yourself.' }),
      ),
    ),
    dates.length > 1 ? el('div', { class: 'card section-gap' }, el('div', { class: 'card__title', text: 'Portfolio value' }), lineChart([{ name: 'Portfolio value', values: totals }], dates.map((d) => dateLabel(d).replace(/^\d+ /, '')))) : null,
    S.dividends.length ? el('div', { class: 'section-gap' },
      el('div', { class: 'card__title', text: 'Dividends received' }),
      editTable({
        cols: [{ key: 'date', label: 'Statement date', type: 'date', readonly: true }, { key: 'amount', label: 'Amount', type: 'money', readonly: true }, { key: 'account', label: 'Account', type: 'text', readonly: true }],
        rows: [...S.dividends].sort(byKey('date')).reverse(),
        onDelete: (r) => undoable('Dividend entry deleted', () => { S.dividends = S.dividends.filter((x) => x !== r); }),
        totals: { amount: sum(S.dividends, (d) => d.amount) },
      }),
      el('p', { class: 'card__hint', text: 'Already part of the account value, so not added to your savings again.' }),
    ) : null,
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

const POLICY_TYPES = [['life', 'Whole life'], ['term', 'Term life'], ['ci', 'Critical illness'], ['hospital', 'Hospital (Integrated Shield)'], ['accident', 'Personal accident'], ['other', 'Other']];

/** Cover across all policies against the MoneySense Basic Financial Planning Guide multiples of annual income. */
function coverCard() {
  const now = thisMonth(), a = assumptionFor(now) || {};
  const bonuses = sum(computeLedger().slice(-12), (r) => r.bonus);
  const income = num(a.salary) * 12 + bonuses;
  const have = { death: sum(S.policies, (p) => p.coverDeath), tpd: sum(S.policies, (p) => p.coverTPD), ci: sum(S.policies, (p) => p.coverCI) };
  const need = { death: income * SG.coverDeath, tpd: income * SG.coverDeath, ci: income * SG.coverCI };
  const year = +now.slice(0, 4);
  const premiums = sum(S.policies.filter((p) => p.start && year >= +p.start.slice(0, 4) && year < +p.start.slice(0, 4) + num(p.years)), (p) => p.premium);
  const shield = S.policies.some((p) => p.type === 'hospital');
  const row = (label, h, n) => el('div', { class: 'goal' },
    el('div', { class: 'bar__head' }, el('span', { text: label }), el('strong', { text: `${money(h, { compact: true })} / ${money(n, { compact: true })}` })),
    progressBar(n > 0 ? Math.min(1, h / n) : 0),
    el('div', { class: 'card__hint' + (h < n ? ' neg' : ''), text: n <= 0 ? 'Add your salary on Assumptions.' : h >= n ? 'Meets the guide.' : `Gap ${money(n - h, { compact: true })}` }));
  return el('div', { class: 'card' },
    el('div', { class: 'card__title', text: 'Your cover' }),
    row(`Death (guide: ${SG.coverDeath}× annual income)`, have.death, need.death),
    row(`Total & permanent disability (${SG.coverDeath}×)`, have.tpd, need.tpd),
    row(`Critical illness (${SG.coverCI}×)`, have.ci, need.ci),
    kv([
      ['Hospital', shield ? 'Integrated Shield plan' : 'MediShield Life only (basic, B2/C wards)'],
      ['Premiums this year', `${money(premiums)} · ${income > 0 ? pct(premiums / income) : '–'} of income (guide: up to ${pct(SG.maxPremiumShare, 0)})`],
    ]),
    el('p', { class: 'card__hint section-gap', text: `Guide multiples are from the MoneySense Basic Financial Planning Guide (based on LIA’s protection gap study). They are rules of thumb — what you need depends on dependants, debts and other savings. Annual income here = salary × 12 + bonuses in the last 12 months (${money(income, { compact: true })}).` }),
    sourceLinks('moneysense', 'medishield', 'shield'),
  );
}

function pageInsurance() {
  const add = () => { S.policies.push({ id: uid(), name: 'Whole life policy', type: 'life', payer: 'cash', start: todayISO(), years: 20, premium: 0, coverDeath: 0, coverTPD: 0, coverCI: 0, actual: {} }); commit(); };
  const cards = S.policies.map((p) => {
    const years = Math.max(0, Math.min(100, num(p.years)));
    p.actual = p.actual || {};
    p.type = p.type || 'life';
    p.payer = p.payer || 'cash';
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
        field('Type', selectFor(p, 'type', POLICY_TYPES, 'Type')),
        settingInput(p, 'start', 'date', 'Policy start date'),
        settingInput(p, 'years', 'number', 'Premium term (years)', null, { step: '1' }),
        settingInput(p, 'premium', 'money', 'Annual premium (expected)'),
        field('Paid from', selectFor(p, 'payer', [['cash', 'Cash'], ['medisave', 'MediSave']], 'Paid from'), 'MediSave: e.g. the MediShield Life / Integrated Shield part of a hospital plan.'),
        settingInput(p, 'coverDeath', 'money', 'Death cover (sum assured)'),
        settingInput(p, 'coverTPD', 'money', 'Total & permanent disability cover'),
        settingInput(p, 'coverCI', 'money', 'Critical illness cover'),
      ),
      el('p', { class: 'card__hint', text: `Paid so far ${money(paid)}. ${p.payer === 'medisave' ? 'Paid from MediSave, so it comes out of your MA balance, not your take-home pay.' : 'Premiums reduce that month’s “Left” and count as spending.'} Not added to net worth (paid premiums ≠ cash value).` }),
      editTable({ cols, rows: sched }),
    );
  });
  return el('div', null,
    pageHead('Insurance', 'Your cover against common guidelines, and each policy’s premium schedule.',
      el('button', { class: 'btn btn--primary', type: 'button', text: '+ Policy', onclick: add })),
    coverCard(),
    cards.length ? el('div', { class: 'section-gap' }, cards) : el('div', { class: 'card muted section-gap', text: 'No policies yet.' }),
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
  // Child reliefs come from the Kids page and go first; your own reliefs follow, all inside the cap.
  const all = [...childReliefs(year, lastRow ? lastRow.earned : 0), ...list];
  let cur = base, capLeft = num(S.settings.reliefCap) || Infinity;
  const shares = all.map((r) => {
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
  const taxGross = taxOn(cur, table);
  const rebate = lastRow ? Math.min(lastRow.ptrPool, taxGross) : 0; // Parenthood Tax Rebate
  const taxWith = taxGross - rebate;

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

  const own = (r) => (r.auto ? '' : 'table__td--edit');
  const reliefCols = [
    { key: 'name', label: 'Relief', type: 'text', cls: own, get: (r) => (r.auto ? el('span', null, r.name, el('a', { class: 'muted', href: '#/kids', text: ' · from Kids' })) : inputFor(r, { key: 'name', type: 'text', label: 'Relief' })) },
    { key: 'amount', label: 'Amount', type: 'money', cls: own, get: (r) => (r.auto ? money(r.amount) : inputFor(r, { key: 'amount', type: 'money', label: 'Amount' })) },
    { key: 'applied', label: 'Applied (after cap)', type: 'money', get: (r) => money(shares.find((s) => s.r === r)?.applied) },
    { key: 'saved', label: 'Tax saved', type: 'money', get: (r) => money(shares.find((s) => s.r === r)?.saved), cls: () => 'pos' },
  ];

  return el('div', null,
    pageHead('Tax & reliefs', 'Projected chargeable income from your ledger, taxed with the bracket table below.', yearSel),
    el('div', { class: 'grid grid--stats' },
      stat('Projected tax', money(taxWith), `≈ ${money(taxWith / 12)} / month`, true),
      stat('Tax without reliefs', money(taxNo)),
      stat('Tax saved by reliefs', money(taxNo - taxWith), rebate ? `Incl. ${money(rebate, { compact: true })} Parenthood Tax Rebate` : null),
      stat('Chargeable income', money(cur), `After ${money(eir, { compact: true })} earned income relief`),
    ),
    el('div', { class: 'grid grid--two section-gap' },
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'How it is worked out' }),
        kv([
          [`After-CPF pay${incomeLines().some((l) => l.taxable) ? ' and taxable extra income' : ''} so far in ${year}, plus the current month’s × remaining months`, money(projected)],
          ['Earned income relief', '−' + money(eir)],
          ['Income before other reliefs', money(base), true],
          ['Other reliefs (capped at ' + money(num(S.settings.reliefCap), { compact: true }) + ')', '−' + money(sum(shares, (s) => s.applied))],
          [`Donations × ${num(S.settings.donationMultiplier) * 100}%`, '−' + money(don)],
          ['Chargeable income', money(cur), true],
          ...(rebate ? [['Tax on it', money(taxGross)], ['Parenthood Tax Rebate', '−' + money(rebate)], ['Tax payable', money(taxWith), true]] : []),
        ]),
        el('p', { class: 'card__hint section-gap', text: 'Reliefs are applied one after another from the top, so each one’s share adds up to the total saved. Later reliefs save less once earlier ones push income into a lower band. CPF relief is already included by using after-CPF pay.' }),
      ),
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'Donations' }),
        field('Donations to approved IPCs (amount given)', inputFor(S.donations, { key: year, type: 'money', label: 'Donations' }), `Deducted at ${num(S.settings.donationMultiplier) * 100}%. Not part of the relief cap.`),
        kv([['Donation tax saving', money(donSaved), true, 'pos']]),
        el('p', { class: 'card__hint section-gap', text: 'Relief amounts and caps change — check the current rules on the IRAS website. This is an estimate, not tax advice.' }),
        sourceLinks('reliefs', 'qcr', 'newborn'),
      ),
    ),
    el('div', { class: 'card section-gap' },
      el('div', { class: 'card__title' }, el('span', { text: `Reliefs for ${year}` }), reliefPicker),
      editTable({ cols: reliefCols, rows: all, onDelete: (r) => (r.auto ? toast('Child reliefs follow your children — change them on Kids & education') : undoable('Relief removed', () => { S.reliefs[year] = list.filter((x) => x !== r); })), emptyText: 'No reliefs yet — use “Add a relief” to pick one.' }),
    ),
    el('h2', { class: 'section-gap', text: 'Tax brackets' }),
    el('p', { class: 'card__hint', text: 'Default: Singapore resident rates, YA2024 onwards. Edit lower bound or rate if they change — base tax recalculates itself. Non-Singapore users can replace the whole table.' }),
    sourceLinks('taxRates'),
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
    pageHead('Net worth', 'Cash savings, CPF, investments, your home and liabilities in one picture.'),
    el('div', { class: 'grid grid--stats' },
      stat('Net worth', money(sm.netWorth), 'Incl. CPF and home', true),
      stat('Liquid net worth', money(sm.liquid), 'Excl. CPF and home'),
      stat('Saved so far', money(sm.saved), 'Toward your goals'),
      stat('12-month pace', money(sm.pace) + '/mo', 'Savings + planned investing'),
    ),
    el('div', { class: 'grid grid--two section-gap' },
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'Net worth breakdown' }),
        kv([
          ['Start amount', money(num(st.startCash))],
          ['Cumulative savings (ledger)', money(sm.cumSavings)],
          ...(sm.sinking ? [['Set aside for recurring costs', money(sm.sinking)]] : []),
          ['Portfolio value', money(sm.portfolio)],
          ['Actual − planned investing', (sm.extraInvested >= 0 ? '−' : '+') + money(Math.abs(sm.extraInvested))],
          ...(st.cpfEnabled ? [['Total CPF', money(sm.cpf)]] : []),
          ...(S.housing.status === 'own' ? [['Home value', money(sm.homeValue)], ['Home loan', '−' + money(sm.homeLoan)]] : []),
          ['Liabilities', '−' + money(sm.liabilities)],
          ['Net worth', money(sm.netWorth), true],
        ]),
        el('div', { class: 'card__title section-gap', text: 'Cash check' }),
        kv([
          [sm.sinking ? 'Expected cash (start + savings + set aside − extra invested)' : 'Expected cash (start + savings − extra invested)', money(sm.expectedCash)],
          ['Actual bank balance', st.bankBalance != null && st.bankBalance !== '' ? money(num(st.bankBalance)) : '–'],
          ['Difference', bankDiff != null ? money(bankDiff) : '–', true, bankDiff != null ? sign(bankDiff) : ''],
        ]),
      ),
      el('div', { class: 'card' },
        el('div', { class: 'card__title', text: 'Your inputs' }),
        el('div', { class: 'form-grid' },
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
        el('p', { class: 'card__hint section-gap' }, 'Goals are on ', el('a', { href: '#/goals', text: 'Goals' }), '; your home and its loan on ', el('a', { href: '#/housing', text: 'Housing' }), '.'),
      ),
    ),
  );
}

function pageData() {
  const st = S.settings;
  return el('div', null,
    pageHead('Settings & data', KEY ? 'Everything stays on this device. Backups are encrypted with your passphrase.' : 'Everything stays on this device.',
      el('button', { class: 'btn', type: 'button', text: 'Run setup again', onclick: () => go('setup?step=you') })),
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
        el('div', { class: 'card__title section-gap', text: 'Import statements (PDF)' }),
        el('p', { class: 'card__hint', text: `Account value, deposits and dividends from your statement PDFs, read on this device. Supported: ${STATEMENT_SUPPORTED}.` }),
        el('button', { class: 'btn', type: 'button', text: 'Choose statement PDFs…', onclick: importStatements }),
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
        sourceLinks('cpfRates', 'cpfAlloc'),
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
    el('div', { class: 'card section-gap', id: 'sources' },
      el('div', { class: 'card__title', text: 'Sources' }),
      el('p', { class: 'card__hint', text: `The Singapore rates, limits and guidelines built into Ledger Local, and the official pages they come from. Checked ${SOURCES_CHECKED}. They change — usually with the Budget in February and at the start of each year — so check the page when a number matters.` }),
      el('ul', { class: 'source-list' }, Object.values(SOURCES).map((s) => el('li', null,
        el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.label + ' ↗' }), el('span', { class: 'muted', text: ' — ' + s.covers })))),
    ),
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
  const inc = incomeLines(), exp = expenseLines();
  const head = ['Month', 'Salary', 'Bonus', 'CPF', 'Employer CPF', 'After CPF', ...inc.map((l) => l.name), 'Take-home', ...exp.map((l) => l.name), 'One-offs', 'Recurring', 'Insurance', 'Kids', 'Home Loan (Cash)', 'Home Loan (CPF)', 'Income Tax', 'Investment', 'Savings', 'Cumulative Savings', 'CPF OA', 'CPF SA', 'CPF MA', 'MA Deductions', 'Savings Rate'];
  const lines = [head.map(csvCell).join(',')].concat(rows.map((r) => [r.month, r.salary, r.bonus, r.ee, r.er, r.after, ...inc.map((l) => r.lines[l.id]), r.takeHome, ...exp.map((l) => r.lines[l.id]), r.extras, r.recurring, r.insurance, r.kids, r.homeCash, r.homeCpf, r.tax, r.invest, r.savings, r.cum.savings, r.oa, r.sa, r.ma, r.maDed, r.savingsRate].map((v) => csvCell(typeof v === 'number' ? round2(v) : v)).join(',')));
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
/** Budget line for one of the spreadsheet's fixed columns: the migrated one, a line with that name, or a new one. */
function legacyLine(key) {
  const def = LEGACY_LINES[key];
  let l = S.budgetLines.find((x) => x.id === key) || S.budgetLines.find((x) => x.name.toLowerCase() === def.name.toLowerCase());
  if (!l) { l = { id: key, ...def }; S.budgetLines.push(l); }
  return l.id;
}
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
      const lines = {};
      for (const [col, key] of [['foodDay', 'food'], ['transportDay', 'transport'], ['parents', 'parents'], ['others', 'others']]) {
        if (map[col] != null) lines[legacyLine(key)] = parseNum(cellAt(r, map, col)) ?? 0;
      }
      S.assumptions.push({
        id: uid(), effective: eff, salary: sal,
        age: parseNum(cellAt(r, map, 'age')) ?? 30,
        workDays: parseNum(cellAt(r, map, 'workDays')) ?? 22,
        lines,
        investPct: parseNum(cellAt(r, map, 'investPct')) ?? 0,
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
    const lineIds = Object.fromEntries(Object.keys(LEGACY_LINES).filter((k) => map[k] != null).map((k) => [k, legacyLine(k)]));
    const comp = Object.fromEntries(computeLedger().map((x) => [x.entry.id, x]));
    for (const [e, r] of imported) {
      if (!comp[e.id]) continue;
      const v = parseNum(cellAt(r, map, 'salary'));
      if (v != null && Math.abs(v - comp[e.id].salary) > 0.01) { e.salary = v; adjusted++; }
      for (const [k, id] of Object.entries(lineIds)) {
        const lv = parseNum(cellAt(r, map, k));
        if (lv != null && Math.abs(lv - (comp[e.id].lines[id] || 0)) > 0.01) { (e.lines = e.lines || {})[id] = lv; adjusted++; }
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
  d.setup = { done: true, skipped: {} };
  d.settings = { ...d.settings, startCash: 8000, birthMonth: addMonths(thisMonth(), -28 * 12 - 4), cpfStart: { oa: 12000, sa: 4000, ma: 6000 }, bankBalance: null };
  d.goals = [
    { id: uid(), name: 'Emergency fund', kind: 'emergency', months: 6, target: 0, by: '' },
    { id: uid(), name: 'Home: cash for down payment & fees', kind: 'custom', target: 25000, by: addMonths(thisMonth(), 36) },
  ];
  d.housing.status = 'buying';
  Object.assign(d.housing.plan, { price: 380000, month: addMonths(thisMonth(), 36), grants: 0, fees: 3000 });
  d.budgetLines.push(
    { id: 'rent', name: 'Rent / housing', kind: 'expense', basis: 'month' },
    { id: 'utilities', name: 'Utilities & phone', kind: 'expense', basis: 'month' },
    { id: 'side', name: 'Side income', kind: 'income', basis: 'month', taxable: true },
  );
  d.assumptions = [
    { id: uid(), effective: addMonths(start, -1) + '-28', salary: 4200, age: 28, workDays: 22, lines: { food: 12, transport: 4.5, parents: 400, others: 150, rent: 0, utilities: 90, side: 0 }, investPct: 0.2, notes: 'Example starting point' },
    { id: uid(), effective: addMonths(start, 5) + '-01', salary: 4500, age: 28, workDays: 22, lines: { food: 13, transport: 4.5, parents: 400, others: 150, rent: 0, utilities: 95, side: 300 }, investPct: 0.25, notes: 'Example raise and weekend tutoring' },
  ];
  d.recurring = [
    { id: uid(), name: 'Overseas holiday', amount: 2400, every: 12, start: addMonths(thisMonth(), 2), end: '', mode: 'spread' },
    { id: uid(), name: 'Chinese New Year / festive', amount: 800, every: 12, start: addMonths(start, 1), end: '', mode: 'due' },
  ];
  for (let i = 0; i < 10; i++) d.ledger.push({ id: uid(), month: addMonths(start, i), bonus: i === 6 ? 2000 : 0, maDed: 0, ...(i === 3 ? { extras: [{ label: 'Laptop repair', amount: 280 }] } : {}) });
  for (let i = 0; i < 10; i++) d.deposits.push({ id: uid(), date: addMonths(start, i + 1) + '-01', amount: i < 5 ? 750 : 1000, notes: 'Index fund' });
  d.portfolio = [
    { id: uid(), date: addMonths(start, 4) + '-15', value: 3900, notes: '' },
    { id: uid(), date: addMonths(start, 9) + '-15', value: 8900, notes: '' },
  ];
  d.liabilities = [{ id: uid(), name: 'Example study loan', balance: 6000, rate: 0.045, payment: 300, notes: '' }];
  d.policies = [
    { id: uid(), name: 'Example life policy', type: 'life', payer: 'cash', start: addMonths(start, 2) + '-15', years: 20, premium: 1800, coverDeath: 200000, coverTPD: 200000, coverCI: 50000, actual: { 0: 1800 } },
    { id: uid(), name: 'Example Integrated Shield plan', type: 'hospital', payer: 'medisave', start: addMonths(start, 6) + '-01', years: 50, premium: 400, coverDeath: 0, coverTPD: 0, coverCI: 0, actual: {} },
  ];
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
