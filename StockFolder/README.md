# Dividend Cycle Analysis - Project Runbook

This is the main runbook for the active files inside this project folder.

This project currently uses:
- `main/` for analysis scripts, dashboard UI, and explanation docs
- `flask/` for the lightweight local backend
- `data/` for CSV source data
- `json/` for generated analysis output files

## Main files

- `main/stock_registry.py`
  - stock universe used by the extraction and batch analysis flow
- `main/extract-weekly.py`
  - refreshes weekly Yahoo Finance CSV data
- `main/extract-daily.py`
  - optional daily-history exporter, not part of the normal pipeline
- `main/analyze-stock.py`
  - single-stock manual analysis run
- `main/analyze-batch.py`
  - batch analysis across tracked stocks
- `main/run-analysis-pipeline.py`
  - normal end-to-end refresh flow
- `main/dashboard.html`
  - single-file dashboard frontend
- `main/analysis-calculations.md`
  - combined strategy, calculation, planner, and CSV extraction explanation
- `flask/app.py`
  - local Flask wrapper for the dashboard
- `flask/requirements.txt`
  - Python dependencies for the Flask flow

## Recommended workflow

The current best workflow is the Flask-backed one.

### 1. Start Flask

From the project root in PowerShell:

```powershell
cd flask
python -m pip install -r requirements.txt
python app.py
```

Then open:

- [http://127.0.0.1:5000](http://127.0.0.1:5000)

### 2. Edit the stock list

Use the dashboard button:

- `Edit stock list`

This registry flow lets you:
- choose tracked names from the master stock list
- browse the master stock list through an in-modal picker panel
- search and filter the picker by stock type and sector
- page through large filtered result sets
- use optional multi-select with `Select all filtered`
- mark the benchmark market index row
- control whether a stock is included in analysis

Notes:
- the master list now uses a real `Enabled` column in `data/master_stock_list.csv`
- `Enabled only` in the picker means only rows with `Enabled=TRUE`
- `Select all filtered` skips market-index rows such as `^STI` by default, so the benchmark is not swept into bulk add accidentally
- the stock registry remains the working list; the master list is the broader searchable universe

### 3. Update stock data

Use the dashboard button:

- `Update stock data`

This runs:
1. `main/extract-weekly.py`
2. `main/analyze-batch.py`

### 4. Load existing stock data

Use the dashboard button:

- `Load existing stock data`

This loads only the generated JSON files that match the current stock registry entries with `run_analysis=True`.

It does not blindly load every JSON file present in `json/`.

Those files are read from:

- `json/`

## Manual script workflow

If you want to run scripts directly instead of using the dashboard buttons:

### Full pipeline

```powershell
python main/run-analysis-pipeline.py
```

This:
1. refreshes weekly CSV files into `data/`
2. regenerates JSON analysis files into `json/`

### Weekly extraction only

```powershell
python main/extract-weekly.py
```

### Batch analysis only

```powershell
python main/analyze-batch.py
```

### Single-stock manual analysis

If you want to debug one stock only:

1. edit the user config block in `main/analyze-stock.py`
2. run:

```powershell
python main/analyze-stock.py
```

## Dashboard and backend notes

- The dashboard remains a single HTML file on purpose.
- Flask is the orchestration layer, not the calculation engine.
- The Python analysis scripts remain the source of truth for the actual stock logic.
- The dashboard adds presentation-layer interpretation such as current verdicts, planner views, grouped scans, and comparison views.
- `Update stock data` now runs the pipeline and then reloads only registry-linked stock JSONs.
- `Load existing stock data` also follows the stock registry, so extra JSON files can remain in `json/` without cluttering the live dashboard.

## API routes

The local Flask wrapper exposes:

- `GET /api/health`
- `GET /api/json-files`
- `GET /api/json-files/<filename>`
- `GET /api/stock-registry`
- `POST /api/stock-registry`
- `GET /api/master-stocks`
- `POST /api/run-pipeline`
- `POST /api/run-batch`

## Source-of-truth docs

If you want the explanation of how the model works, use:

- `main/analysis-calculations.md`

That file now covers:
- strategy overview
- calculation logic
- dashboard interpretation
- planner behavior
- CSV extraction workflow
