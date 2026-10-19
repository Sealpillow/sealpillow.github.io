# Ledger Local

A private, offline personal finance tracker that runs entirely in your browser.
Monthly ledger built from your own budget lines (rent, utilities, childcare… and extra income such as
side or rental income), recurring costs (holidays, festive spending, yearly bills — paid when due or set
aside monthly), Singapore CPF (OA/SA/MA), income tax with reliefs, investments, liabilities and net worth.
Also: several savings goals and an emergency-fund check; housing (rent, a home loan paid from CPF OA and
cash, or a purchase plan with down payment, stamp duty and MSR/TDSR); kids' costs by age with child tax
reliefs and the Parenthood Tax Rebate; a retirement projection with CPF LIFE; and insurance cover against
the MoneySense guide (9× income for death/TPD, 4× for critical illness).

**Your data never leaves your device.**

- Records are stored in your browser's IndexedDB. A passphrase is optional: without one they are saved unencrypted
  and the app opens straight away; with one they are encrypted (AES-256-GCM; key derived with PBKDF2-SHA256, 600,000 rounds).
  Add or remove it any time in **Settings & data → Security**.
- Browser storage is shared by every page on the same address (e.g. all of `username.github.io`). If other pages there
  load third-party scripts, set a passphrase — or run the app locally (`python -m http.server --bind 127.0.0.1`).
- The page's Content-Security-Policy sets `connect-src 'none'` and only allows the site's own files, so the app cannot send data anywhere. There is no server, no analytics, no third-party code.
- There is no account and no password reset. If you forget your passphrase, the data cannot be recovered.
- Clearing browser/site data deletes your records. Use **Settings & data → Export backup** regularly.

## Use it

Open the site (optionally choose a passphrase), and start on **Assumptions** (salary, age, daily food/transport, investment %),
then add months in the **Monthly ledger**. To install: Chrome/Edge → *Install app*; iPhone Safari → *Share → Add to Home Screen*.
After the first visit it works offline.

Coming from the Google Sheets version: in each tab use *File → Download → Comma-separated values (.csv)*,
then **Settings & data → Import CSV** — import *Assumptions History* first, then *Monthly Ledger*.

## Defaults (editable in the app)

- Tax brackets: Singapore resident rates, YA2024 onwards.
- CPF: 2025 and 2026 contribution/allocation schedule by age band, S$8,000 ordinary wage ceiling.
- Reliefs: presets for Parent, NSman, SRS and CPF top-ups. Check current amounts on the IRAS website.

Non-Singapore users can switch off CPF, change the currency and replace the tax table.

## Deploy your own copy (GitHub Pages, free)

1. Create a **public** repository and upload these files to the root of the `main` branch.
2. Repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
3. After a minute the app is live at `https://<username>.github.io/<repo>/`.

When you change files, bump `VERSION` in `sw.js` so installed copies pick up the update.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell and Content-Security-Policy |
| `app.js` | All logic: encryption, storage, calculations, UI |
| `styles.css` | Styles (light/dark) |
| `sw.js` | Offline cache for the app files only |
| `manifest.webmanifest`, `icons/` | Installable app metadata |

## Disclaimer

A tracking tool, not financial or tax advice. CPF interest is a monthly approximation (CPF credits yearly), and tax is an estimate.

## License

MIT
