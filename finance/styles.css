# Ledger Local

A private, offline personal finance tracker that runs entirely in your browser.
Monthly ledger, Singapore CPF (OA/SA/MA), income tax with reliefs, investments, liabilities,
insurance premiums, savings goal and net worth.

**Your data never leaves your device.**

- Records are encrypted with your passphrase (AES-256-GCM; key derived with PBKDF2-SHA256, 600,000 rounds) and stored in your browser's IndexedDB.
- The page's Content-Security-Policy sets `connect-src 'none'` and only allows the site's own files, so the app cannot send data anywhere. There is no server, no analytics, no third-party code.
- There is no account and no password reset. If you forget your passphrase, the data cannot be recovered.
- Clearing browser/site data deletes the vault. Use **Settings & data → Export encrypted backup** regularly.

## Use it

Open the site, choose a passphrase, and start on **Assumptions** (salary, age, daily food/transport, investment %),
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
