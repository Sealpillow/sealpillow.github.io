:root {
  --bg: #f6f7f5;
  --surface: #ffffff;
  --surface-2: #f0f2ef;
  --text: #1b1f1d;
  --muted: #5d6662;
  --border: #dde1dd;
  --accent: #0f6b5c;
  --accent-soft: #e2f1ed;
  --accent-text: #ffffff;
  --pos: #1d7a3e;
  --neg: #b3261e;
  --warn: #9a6200;
  --warn-soft: #fff4dc;
  --series-1: #0f6b5c;
  --series-2: #3b6fd1;
  --series-3: #c2702b;
  --series-4: #8a5cc4;
  --radius: 10px;
  --shadow: 0 1px 2px rgba(0, 0, 0, .05), 0 2px 8px rgba(0, 0, 0, .04);
  --font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #111413;
    --surface: #191d1b;
    --surface-2: #212624;
    --text: #e6eae7;
    --muted: #9aa49f;
    --border: #2e3431;
    --accent: #4fb7a2;
    --accent-soft: #1c302b;
    --accent-text: #0b1512;
    --pos: #5cc27f;
    --neg: #f08a80;
    --warn: #e0b04f;
    --warn-soft: #2e2615;
    --series-1: #4fb7a2;
    --series-2: #7ea4ec;
    --series-3: #e39a5b;
    --series-4: #b293e0;
    --shadow: none;
  }
}

:root[data-theme="dark"] {
  --bg: #111413;
  --surface: #191d1b;
  --surface-2: #212624;
  --text: #e6eae7;
  --muted: #9aa49f;
  --border: #2e3431;
  --accent: #4fb7a2;
  --accent-soft: #1c302b;
  --accent-text: #0b1512;
  --pos: #5cc27f;
  --neg: #f08a80;
  --warn: #e0b04f;
  --warn-soft: #2e2615;
  --series-1: #4fb7a2;
  --series-2: #7ea4ec;
  --series-3: #e39a5b;
  --series-4: #b293e0;
  --shadow: none;
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font: 15px/1.5 var(--font);
  -webkit-font-smoothing: antialiased;
}
button, input, select, textarea { font: inherit; color: inherit; }
h1, h2, h3 { line-height: 1.25; margin: 0 0 .5rem; }
h1 { font-size: 1.35rem; }
h2 { font-size: 1.1rem; }
h3 { font-size: .95rem; }
p { margin: 0 0 .75rem; }
a { color: var(--accent); }

/* ---------- App shell ---------- */
.shell { display: flex; min-height: 100vh; }
.shell__nav {
  width: 210px;
  flex: 0 0 210px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  padding: 16px 10px;
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.shell__brand { font-weight: 700; padding: 4px 10px 14px; display: flex; align-items: center; gap: 8px; }
.shell__brand-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
.shell__main { flex: 1; min-width: 0; padding: 20px 24px 60px; max-width: 1180px; }
.shell__spacer { flex: 1; }

.nav__link {
  display: block;
  padding: 7px 10px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--text);
  white-space: nowrap;
}
.nav__link:hover { background: var(--surface-2); }
.nav__link--active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }

.status { font-size: .8rem; color: var(--muted); padding: 8px 10px; }
.status__dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--pos); margin-right: 6px; }

@media (max-width: 860px) {
  .shell { flex-direction: column; }
  .shell__nav {
    width: auto;
    flex: none;
    height: auto;
    position: sticky;
    top: 0;
    z-index: 5;
    flex-direction: row;
    overflow-x: auto;
    padding: 8px 12px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
    gap: 4px;
  }
  .shell__brand, .shell__spacer, .shell__nav .status { display: none; }
  .shell__main { padding: 16px 16px 60px; }
}

/* ---------- Page ---------- */
.page__head { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; }
.page__sub { color: var(--muted); margin: 0; }
.page__actions { display: flex; gap: 8px; flex-wrap: wrap; }

.grid { display: grid; gap: 14px; }
.grid--stats { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
.grid--two { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
@media (max-width: 400px) { .grid--two { grid-template-columns: 1fr; } }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow);
  min-width: 0;
}
.card + .card, .grid + .card, .card + .grid, .grid + .grid { margin-top: 14px; }
.grid > .card, .grid > div > .card:first-child { margin-top: 0; }
.card__title { font-size: .95rem; font-weight: 600; margin-bottom: 10px; display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.card__hint { color: var(--muted); font-size: .85rem; }

.stat__label { color: var(--muted); font-size: .8rem; }
.stat__value { font-size: 1.35rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.stat__note { color: var(--muted); font-size: .8rem; }
.stat--key { background: var(--accent-soft); border-color: transparent; }

.kv { display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; font-variant-numeric: tabular-nums; }
.kv__k { color: var(--muted); }
.kv__v { text-align: right; }
.kv__v--strong, .kv__k--strong { font-weight: 650; color: var(--text); border-top: 1px solid var(--border); padding-top: 4px; }

.pos { color: var(--pos); }
.neg { color: var(--neg); }
.muted { color: var(--muted); }
.mono { font-family: var(--mono); }

/* ---------- Buttons & forms ---------- */
.btn {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover { background: var(--surface-2); }
.btn--primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
.btn--primary:hover { background: var(--accent); filter: brightness(1.08); }
.btn--danger { color: var(--neg); }
.btn--small { padding: 3px 8px; font-size: .85rem; }
.btn--icon { padding: 2px 8px; line-height: 1.2; }
.btn:disabled { opacity: .5; cursor: not-allowed; }

.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.field__label { font-size: .85rem; color: var(--muted); }
.field__hint { font-size: .8rem; color: var(--muted); }
.input, .select {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 7px 10px;
  min-width: 0;
  width: 100%;
}
.input:focus, .select:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0 14px; }

/* ---------- Tables ---------- */
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
.table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; font-size: .9rem; }
.table__th, .table__td { padding: 6px 10px; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap; }
.table__th { background: var(--surface-2); font-weight: 600; font-size: .8rem; color: var(--muted); position: sticky; top: 0; }
.table__th--left, .table__td--left { text-align: left; }
.table__td--edit { padding: 2px 4px; }
.table__td--edit .input { padding: 4px 6px; border-color: transparent; background: transparent; text-align: right; min-width: 90px; }
.table__td--edit .input:hover { border-color: var(--border); }
.table__td--edit .input[type="text"] { text-align: left; min-width: 200px; }
.table__row:last-child .table__td { border-bottom: 0; }
.table__row--total .table__td { font-weight: 650; background: var(--surface-2); }
.table__mark { color: var(--warn); font-weight: 700; margin-left: 2px; }
.table__empty { padding: 20px; text-align: center; color: var(--muted); }

/* ---------- Checklist / notices ---------- */
.check { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--border); }
.check:last-child { border-bottom: 0; }
.check__icon { width: 20px; height: 20px; border-radius: 50%; flex: 0 0 20px; display: grid; place-items: center; font-size: .75rem; font-weight: 700; }
.check__icon--ok { background: var(--accent-soft); color: var(--pos); }
.check__icon--due { background: var(--warn-soft); color: var(--warn); }
.check__text { flex: 1; }
.check__detail { color: var(--muted); font-size: .85rem; }

.notice { background: var(--warn-soft); border-radius: var(--radius); padding: 10px 14px; margin-bottom: 14px; font-size: .9rem; }
.notice--info { background: var(--accent-soft); }

/* ---------- Bars & charts ---------- */
.bar { margin-bottom: 8px; }
.bar__head { display: flex; justify-content: space-between; font-size: .85rem; font-variant-numeric: tabular-nums; }
.bar__track { height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden; margin-top: 3px; }
.bar__fill { height: 100%; background: var(--accent); border-radius: 4px; }
.progress { height: 12px; background: var(--surface-2); border-radius: 6px; overflow: hidden; margin: 8px 0; }
.progress__fill { height: 100%; background: var(--accent); }

.chart { width: 100%; height: auto; display: block; }
.chart__grid { stroke: var(--border); stroke-width: 1; }
.chart__axis { fill: var(--muted); font-size: 11px; font-family: var(--font); }
.chart__line { fill: none; stroke-width: 2; }
.chart__line--1 { stroke: var(--series-1); }
.chart__line--2 { stroke: var(--series-2); }
.chart__line--3 { stroke: var(--series-3); }
.chart__bar { fill: var(--series-1); }
.chart__bar--neg { fill: var(--neg); }
.legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: .8rem; color: var(--muted); margin-top: 6px; }
.legend__swatch { display: inline-block; width: 10px; height: 3px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
.legend__swatch--1 { background: var(--series-1); }
.legend__swatch--2 { background: var(--series-2); }
.legend__swatch--3 { background: var(--series-3); }

/* ---------- Lock screen ---------- */
.lock { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
.lock__card { width: 100%; max-width: 440px; }
.lock__title { display: flex; align-items: center; gap: 10px; font-size: 1.3rem; font-weight: 700; margin-bottom: 4px; }
.lock__error { color: var(--neg); font-size: .9rem; min-height: 1.2em; margin: 4px 0 8px; }
.lock__links { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.lock__list { padding-left: 18px; margin: 8px 0 14px; color: var(--muted); font-size: .88rem; }
.link-btn { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; text-decoration: underline; font-size: .9rem; }

/* ---------- Dialog & toast ---------- */
.dialog, dialog {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  padding: 18px;
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  overflow: auto;
}
dialog::backdrop { background: rgba(0, 0, 0, .45); }
.dialog__foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; flex-wrap: wrap; }

#toast {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%) translateY(20px);
  background: var(--text);
  color: var(--bg);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: .9rem;
  opacity: 0;
  pointer-events: none;
  transition: opacity .2s, transform .2s;
  max-width: calc(100vw - 32px);
}
#toast.toast--show { opacity: 1; transform: translateX(-50%) translateY(0); }

.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
.section-gap { margin-top: 22px; }
.hide { display: none !important; }
