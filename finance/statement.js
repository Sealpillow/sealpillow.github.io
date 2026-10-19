/*
 * Statement import for Ledger Local: reads a PDF statement in the browser and pulls out the figures the app
 * tracks. No library and no network — the file never leaves the device.
 *
 * The PDF reader handles text-based PDFs (the kind banks and brokers generate), including fonts whose text is
 * stored as glyph codes with a ToUnicode map. It does not do OCR, so a scanned or photographed statement
 * yields no text.
 */
'use strict';

/* =====================================================================
 * PDF → positioned text
 * ===================================================================== */
const PdfText = (() => {
  // Bytes ↔ a 1-char-per-byte string, so regexes can work on the file without mangling binary data.
  const toStr = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return s;
  };
  const toBytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Index every "n 0 obj … endobj" by number: its dictionary text and raw stream (if any). */
  function indexObjects(s) {
    const objs = new Map();
    const re = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g;
    let m;
    while ((m = re.exec(s))) {
      const body = m[2];
      const at = body.search(/\bstream\r?\n/);
      if (at < 0) { objs.set(+m[1], { dict: body, raw: null }); continue; }
      const start = body.indexOf('\n', at) + 1;
      let end = body.lastIndexOf('endstream');
      if (body[end - 1] === '\n') end--;
      if (body[end - 1] === '\r') end--;
      objs.set(+m[1], { dict: body.slice(0, at), raw: body.slice(start, end) });
    }
    return objs;
  }

  /** The balanced <<…>> that follows `key` in `dict`, or the dictionary of the object it points to. */
  function dictAfter(objs, dict, key) {
    const i = dict.indexOf(key);
    if (i < 0) return '';
    const rest = dict.slice(i + key.length);
    const ref = rest.match(/^\s*(\d+)\s+\d+\s+R/);
    if (ref) return objs.get(+ref[1])?.dict || '';
    const open = rest.indexOf('<<');
    if (open < 0) return '';
    let depth = 0;
    for (let j = open; j < rest.length - 1; j++) {
      if (rest[j] === '<' && rest[j + 1] === '<') { depth++; j++; } else if (rest[j] === '>' && rest[j + 1] === '>') { depth--; j++; if (!depth) return rest.slice(open, j + 1); }
    }
    return '';
  }

  async function streamText(objs, num) {
    const o = objs.get(num);
    if (!o || o.raw == null) return '';
    if (/\/Filter\s*\[?\s*\/(?!FlateDecode)/.test(o.dict)) return ''; // images and other filters: not text
    const bytes = toBytes(o.raw);
    return toStr(/\/FlateDecode/.test(o.dict) ? await inflate(bytes) : bytes);
  }

  const utf16 = (hex) => {
    let out = '';
    for (let i = 0; i + 3 < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return out;
  };
  /** ToUnicode CMap → Map(glyph code → text). */
  function parseCMap(s) {
    const map = new Map();
    for (const [, blk] of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const [, a, b] of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) map.set(parseInt(a, 16), utf16(b));
    }
    for (const [, blk] of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const [, a, b, rest] of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g)) {
        const lo = parseInt(a, 16), hi = parseInt(b, 16);
        if (rest[0] === '[') {
          [...rest.matchAll(/<([0-9A-Fa-f]*)>/g)].forEach(([, h], k) => map.set(lo + k, utf16(h)));
        } else {
          const base = rest.slice(1, -1);
          const head = base.slice(0, -4), last = parseInt(base.slice(-4), 16);
          for (let k = 0; k <= hi - lo && k < 65536; k++) map.set(lo + k, utf16(head) + String.fromCharCode(last + k));
        }
      }
    }
    return map;
  }

  async function loadFonts(objs, resources) {
    const fonts = {};
    const fontDict = dictAfter(objs, resources, '/Font');
    for (const [, name, num] of fontDict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
      const d = objs.get(+num)?.dict || '';
      const tu = d.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
      fonts[name] = { twoByte: /\/Subtype\s*\/Type0/.test(d), map: tu ? parseCMap(await streamText(objs, +tu[1])) : null };
    }
    return fonts;
  }

  /** Tokens of a content stream: numbers, names, strings (as byte strings), arrays and operators. */
  function* tokens(s) {
    const n = s.length;
    const delim = /[\s()<>[\]{}/%]/;
    let i = 0;
    while (i < n) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
      if (c === '(') {
        let depth = 1, out = '';
        i++;
        while (i < n && depth) {
          const ch = s[i];
          if (ch === '\\') {
            const nx = s[i + 1];
            const oct = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
            if (oct) { out += String.fromCharCode(parseInt(oct[0], 8) & 255); i += 1 + oct[0].length; continue; }
            out += { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[nx] ?? (nx === '\r' || nx === '\n' ? '' : nx);
            i += 2;
            continue;
          }
          if (ch === '(') depth++;
          else if (ch === ')' && !--depth) { i++; break; }
          out += ch;
          i++;
        }
        yield { t: 'str', v: out };
        continue;
      }
      if (c === '<' && s[i + 1] === '<') { yield { t: 'op', v: '<<' }; i += 2; continue; }
      if (c === '>' && s[i + 1] === '>') { yield { t: 'op', v: '>>' }; i += 2; continue; }
      if (c === '<') {
        const end = s.indexOf('>', i);
        let hex = s.slice(i + 1, end).replace(/\s/g, '');
        if (hex.length % 2) hex += '0';
        let v = '';
        for (let k = 0; k < hex.length; k += 2) v += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
        yield { t: 'str', v };
        i = end + 1;
        continue;
      }
      if (c === '[' || c === ']') { yield { t: c }; i++; continue; }
      let j = i + 1;
      while (j < n && !delim.test(s[j])) j++;
      const word = s.slice(i, j);
      i = j;
      if (c === '/') yield { t: 'name', v: word.slice(1) };
      else if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) yield { t: 'num', v: parseFloat(word) };
      else if (word === 'ID') { const ei = s.indexOf('EI', i); i = ei < 0 ? n : ei + 2; } // skip inline image data
      else yield { t: 'op', v: word };
    }
  }

  /** Run a page's text operators and collect each shown string with its position. */
  function pageItems(content, fonts, page) {
    const items = [];
    let font = { twoByte: false, map: null };
    let tx = 0, ty = 0, leading = 0;
    const decode = (bytes) => {
      let out = '';
      if (font.twoByte) {
        for (let k = 0; k + 1 < bytes.length; k += 2) out += font.map?.get((bytes.charCodeAt(k) << 8) | bytes.charCodeAt(k + 1)) ?? '';
      } else {
        for (let k = 0; k < bytes.length; k++) { const code = bytes.charCodeAt(k); out += font.map?.get(code) ?? String.fromCharCode(code); }
      }
      return out;
    };
    const show = (text) => { if (text.trim()) items.push({ page, x: tx, y: ty, text, seq: items.length }); };
    const stack = [];
    let arr = null;
    for (const tok of tokens(content)) {
      if (tok.t === '[') { arr = []; continue; }
      if (tok.t === ']') { stack.push({ t: 'arr', v: arr || [] }); arr = null; continue; }
      if (arr && tok.t !== 'op') { arr.push(tok); continue; }
      if (tok.t !== 'op') { stack.push(tok); continue; }
      const nums = stack.filter((x) => x.t === 'num').map((x) => x.v);
      switch (tok.v) {
        case 'BT': tx = 0; ty = 0; break;
        case 'Tf': { const name = stack.find((x) => x.t === 'name'); font = fonts[name?.v] || { twoByte: false, map: null }; break; }
        case 'Tm': if (nums.length >= 6) { tx = nums[4]; ty = nums[5]; } break;
        case 'Td': if (nums.length >= 2) { tx += nums[0]; ty += nums[1]; } break;
        case 'TD': if (nums.length >= 2) { tx += nums[0]; ty += nums[1]; leading = -nums[1]; } break;
        case 'TL': if (nums.length) leading = nums[0]; break;
        case 'T*': ty -= leading; break;
        case 'Tj': { const s = stack.find((x) => x.t === 'str'); if (s) show(decode(s.v)); break; }
        case "'": case '"': { ty -= leading; const s = stack.find((x) => x.t === 'str'); if (s) show(decode(s.v)); break; }
        case 'TJ': {
          const a = stack.find((x) => x.t === 'arr');
          if (a) show(a.v.map((x) => (x.t === 'str' ? decode(x.v) : x.t === 'num' && x.v < -200 ? ' ' : '')).join(''));
          break;
        }
        default: break;
      }
      stack.length = 0;
    }
    return items;
  }

  /**
   * Text lines of a PDF, in reading order: [{ page, y, cells: [{ x, text }], text }]. Strings drawn at the same
   * height (to the nearest point) on a page form one line; cells are left to right.
   */
  async function lines(bytes) {
    const s = toStr(bytes);
    if (!s.startsWith('%PDF')) throw new Error('This is not a PDF file.');
    if (/\/Encrypt\b/.test(s)) throw new Error('This PDF is password-protected. Save an unprotected copy and try again.');
    const objs = indexObjects(s);
    // Pages in order, following the page tree from the catalog; resources are inherited down the tree.
    const pages = [];
    const walk = (num, inherited, seen = new Set()) => {
      if (seen.has(num)) return;
      seen.add(num);
      const d = objs.get(num)?.dict || '';
      const res = d.includes('/Resources') ? dictAfter(objs, d, '/Resources') : inherited;
      if (/\/Type\s*\/Pages\b/.test(d)) {
        const kids = d.match(/\/Kids\s*\[([^\]]*)\]/);
        for (const [, k] of (kids ? kids[1] : '').matchAll(/(\d+)\s+\d+\s+R/g)) walk(+k, res, seen);
      } else if (/\/Type\s*\/Page\b/.test(d)) pages.push({ dict: d, res });
    };
    const roots = [...s.matchAll(/\/Root\s+(\d+)\s+\d+\s+R/g)];
    const catalog = roots.length ? objs.get(+roots[roots.length - 1][1])?.dict || '' : '';
    const pagesRef = catalog.match(/\/Pages\s+(\d+)\s+\d+\s+R/);
    if (pagesRef) walk(+pagesRef[1], '');
    if (!pages.length) for (const [, o] of [...objs].sort((a, b) => a[0] - b[0])) if (/\/Type\s*\/Page\b/.test(o.dict)) pages.push({ dict: o.dict, res: dictAfter(objs, o.dict, '/Resources') });

    const items = [];
    for (const [p, pg] of pages.entries()) {
      const fonts = await loadFonts(objs, pg.res);
      const c = pg.dict.match(/\/Contents\s*(?:(\d+)\s+\d+\s+R|\[([^\]]*)\])/);
      const refs = c ? (c[1] ? [c[1]] : [...c[2].matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => m[1])) : [];
      let content = '';
      for (const r of refs) content += (await streamText(objs, +r)) + '\n';
      items.push(...pageItems(content, fonts, p + 1));
    }
    const byLine = new Map();
    for (const it of items) {
      const key = it.page + ':' + Math.round(it.y);
      if (!byLine.has(key)) byLine.set(key, { page: it.page, y: Math.round(it.y), cells: [] });
      byLine.get(key).cells.push({ x: it.x, text: it.text.trim(), seq: it.seq });
    }
    return [...byLine.values()]
      .sort((a, b) => a.page - b.page || b.y - a.y)
      .map((l) => {
        l.cells.sort((a, b) => a.x - b.x || a.seq - b.seq);
        return { page: l.page, y: l.y, cells: l.cells.map(({ x, text }) => ({ x, text })), text: l.cells.map((c) => c.text).join(' ') };
      });
  }

  return { lines };
})();

/* =====================================================================
 * Statement formats
 * ===================================================================== */
const stmtNum = (t) => {
  const s = String(t ?? '').replace(/,/g, '').trim();
  return /^[+-]?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
};
const isDate = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t);
const isCur = (t) => /^[A-Z]{3}$/.test(t);

/**
 * Tiger Brokers (Singapore) monthly statement. Reads the statement period, the account's total value at the
 * end of the period (Account Overview, in the base currency), deposits and withdrawals, cash dividends from
 * the Cash Report, and the "Base Currency Exchange Rate" table (USD per unit of each currency) for converting.
 */
function parseTigerStatement(lines) {
  if (!lines.some((l) => /Tiger Brokers \(Singapore\)/i.test(l.text))) return null;
  const all = lines.map((l) => l.text).join('\n');
  const period = all.match(/Statement Period:\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
  if (!period) throw new Error('Could not find the statement period.');
  const at = (re) => lines.findIndex((l) => re.test(l.text));
  const HEADINGS = /^(Account Information|Account Overview|Cash Report|Trades|Deposits & Withdrawals|Holdings|Dividends|Allowance|Financial Instrument Information|GST Summary|Base Currency Exchange Rate)$/;
  const section = (name) => {
    const start = lines.findIndex((l) => l.text === name);
    if (start < 0) return [];
    const end = lines.findIndex((l, i) => i > start && HEADINGS.test(l.text));
    return lines.slice(start + 1, end < 0 ? undefined : end);
  };

  // Base currency: the cell under the "Base Currency" header.
  let base = 'USD';
  const hi = at(/\bBase Currency$/);
  if (hi >= 0) {
    const hx = lines[hi].cells.find((c) => c.text === 'Base Currency')?.x;
    const row = lines[hi + 1];
    if (hx != null && row) {
      const cell = [...row.cells].sort((a, b) => Math.abs(a.x - hx) - Math.abs(b.x - hx))[0];
      if (isCur(cell?.text)) base = cell.text;
    }
  }

  // Total account value at the end of the period (last number on the "End Of The Period" row).
  const endRow = lines.find((l) => /^End Of The Period/.test(l.text));
  const endNums = endRow ? endRow.cells.map((c) => stmtNum(c.text)).filter((v) => v != null) : [];
  if (!endNums.length) throw new Error('Could not find the account value at the end of the period.');
  const value = endNums[endNums.length - 1];

  // Exchange rates: USD per 1 unit of each currency.
  const fx = { USD: 1 };
  const fxAt = at(/^Base Currency Exchange Rate$/);
  if (fxAt >= 0) {
    for (const l of lines.slice(fxAt + 1)) {
      if (l.cells.length === 2 && isCur(l.cells[0].text) && stmtNum(l.cells[1].text) > 0) fx[l.cells[0].text] = stmtNum(l.cells[1].text);
    }
  }

  // Deposits & withdrawals: date · description · amount · currency.
  const moves = [];
  const other = [];
  for (const l of section('Deposits & Withdrawals')) {
    const c = l.cells.map((x) => x.text);
    if (!isDate(c[0]) || !isCur(c[c.length - 1])) continue;
    const amount = stmtNum(c[c.length - 2]);
    const desc = c.slice(1, -2).join(' ');
    if (amount == null) continue;
    const kind = /withdraw/i.test(desc) ? 'withdrawal' : /deposit/i.test(desc) ? 'deposit' : null;
    (kind ? moves : other).push({ date: c[0], desc, amount: kind === 'withdrawal' ? -Math.abs(amount) : Math.abs(amount), currency: c[c.length - 1], kind });
  }

  // Cash dividends received (net of withholding tax), per currency, from the Cash Report.
  const dividends = {};
  let cur = null;
  const crStart = at(/^Cash Report$/), crEnd = at(/^Trades$/);
  for (const l of lines.slice(crStart + 1, crEnd > crStart ? crEnd : undefined)) {
    const m = l.text.match(/^Currency:\s*([A-Z]{3})/);
    if (m) { cur = m[1]; continue; }
    const label = l.cells[0]?.text || '';
    if (cur && /^(Dividends|Withholding Tax)$/.test(label)) {
      const v = l.cells.slice(1).map((x) => stmtNum(x.text)).find((x) => x != null);
      if (v != null) dividends[cur] = (dividends[cur] || 0) + v;
    }
  }

  return { source: 'Tiger Brokers', account: 'Tiger Brokers', periodStart: period[1], periodEnd: period[2], base, value, fx, moves, other, dividends };
}

const STATEMENT_PARSERS = [parseTigerStatement];
const STATEMENT_SUPPORTED = 'Tiger Brokers (Singapore) monthly statements';

/** Read one PDF statement → parsed figures, or throw with a message for the user. */
async function readStatement(bytes) {
  const lines = await PdfText.lines(bytes);
  if (!lines.length) throw new Error('No text found — this looks like a scanned statement. Download the PDF from your bank or broker instead.');
  for (const parse of STATEMENT_PARSERS) {
    const r = parse(lines);
    if (r) return r;
  }
  throw new Error(`This statement format is not supported yet. Supported: ${STATEMENT_SUPPORTED}.`);
}

/** Convert an amount between currencies using a statement's USD-per-unit rates (null if a rate is missing). */
function stmtConvert(r, amount, from, to) {
  if (from === to) return amount;
  if (!r.fx[from] || !r.fx[to]) return null;
  return (amount * r.fx[from]) / r.fx[to];
}
