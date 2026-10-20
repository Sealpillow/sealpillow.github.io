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

**Statement import (PDF).** On **Investments → Import statement (PDF)**, choose one or more statement PDFs. They are
read in the browser by a small built-in PDF text reader (`statement.js`, no library) — nothing is uploaded. Supported
now: **Tiger Brokers (Singapore) monthly statements** — the account value at the end of the period (converted with the
statement's own exchange rate), deposits/withdrawals and cash dividends. Re-importing a statement does not duplicate
anything. Scanned statements (images) have no text and can't be read. Other banks and brokers can be added as parsers
in `statement.js`.

**DBS/POSB bank statements** (on **Statements → Import statement (PDF)**) are recorded only: each account's
transactions are stored as read and shown on the Statements page; nothing else in the app changes. The parser checks
itself against the totals printed on the statement. Bank PDFs that are encrypted but open without a password (most
e-statements — they only restrict printing/copying) are decrypted in the browser (RC4 / AES-128); PDFs that need a
password to open must be saved as an unprotected copy first.

## Defaults (editable in the app)

- Tax brackets: Singapore resident rates, YA2024 onwards.
- CPF: 2025 and 2026 contribution/allocation schedule by age band, S$8,000 ordinary wage ceiling.
- Reliefs: presets for Parent, NSman, SRS and CPF top-ups. Check current amounts on the IRAS website.

Non-Singapore users can switch off CPF, change the currency and replace the tax table.

## Sources (checked October 2026)

Every Singapore figure built into the app links to its official page in the app itself (next to the figure,
and listed under **Settings & data → Sources**). The figures live in the `SG` and `SOURCES` tables in `app.js`.

| Figure | Source |
|---|---|
| Resident income tax brackets (YA 2024+) | [IRAS: income tax rates](https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates) |
| Personal reliefs, $80,000 relief cap | [IRAS: tax reliefs](https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-reliefs-rebates-and-deductions/tax-reliefs) |
| QCR $4,000, Child Relief (Disability) $7,500 | [IRAS: Qualifying Child Relief](https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-reliefs-rebates-and-deductions/tax-reliefs/qualifying-child-relief-(qcr)-handicapped-child-relief-(hcr)) |
| WMCR amounts | [IRAS: Working Mother's Child Relief](https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-reliefs-rebates-and-deductions/tax-reliefs/working-mother's-child-relief-(wmcr)) |
| Parenthood Tax Rebate | [IRAS: I have a newborn](https://www.iras.gov.sg/taxes/individual-income-tax/employees/your-situation/i-have-a-newborn) |
| Buyer's Stamp Duty bands | [IRAS: Buyer's Stamp Duty](https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer's-stamp-duty-(bsd)) |
| CPF contribution rates | [CPF: contribution rates](https://www.cpf.gov.sg/employer/employer-obligations/how-much-cpf-contributions-to-pay) |
| CPF allocation rates | [CPF: allocation rates 2026 (PDF)](https://www.cpf.gov.sg/content/dam/web/employer/employer-obligations/documents/CPFAllocationRatesfromJanuary2026.pdf) |
| Retirement sums, CPF LIFE estimates | [CPF: how much payout can I get](https://www.cpf.gov.sg/service/article/how-much-cpf-payouts-can-i-get-every-month) |
| HDB loan rate and 75% limit | [CPF: HDB loan vs bank loan](https://www.cpf.gov.sg/member/infohub/educational-resources/3-differences-between-hdb-loan-and-bank-loan) |
| Loan-to-value limits | [MAS: loan tenure and LTV limits](https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits) |
| MSR 30%, TDSR 55% | [MAS: MSR and TDSR rules](https://www.mas.gov.sg/regulation/explainers/new-housing-loans/msr-and-tdsr-rules) |
| CPF refund on selling a home | [CPF: refund when selling a property](https://www.cpf.gov.sg/member/home-ownership/using-your-cpf-to-buy-a-home/cpf-refund-when-selling-or-transferring-property) |
| 9× / 4× cover, emergency fund, premium share | [MoneySense: Basic Financial Planning Guide](https://www.moneysense.gov.sg/planning-your-finances-well/) |
| MediShield Life, Integrated Shield Plans | [CPF: MediShield Life](https://www.cpf.gov.sg/member/healthcare-financing/medishield-life), [CPF: Integrated Shield Plans](https://www.cpf.gov.sg/member/healthcare-financing/getting-supplementary-coverage/integrated-shield-plan) |

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
| `statement.js` | PDF text reader and statement parsers (statement import) |
| `styles.css` | Styles (light/dark) |
| `sw.js` | Offline cache for the app files only |
| `manifest.webmanifest`, `icons/` | Installable app metadata |

## Disclaimer

A tracking tool, not financial or tax advice. CPF interest is a monthly approximation (CPF credits yearly), and tax is an estimate.

## License

MIT
