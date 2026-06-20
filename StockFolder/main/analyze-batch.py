#!/usr/bin/env python3
"""
Batch runner for Dividend Cycle Analysis.
Edit COMMON settings or update stock_registry.py, then run:
python analyze-batch.py
"""

import subprocess
import sys
from datetime import datetime, date
from pathlib import Path

from stock_registry import get_analysis_targets, get_index_target, weekly_csv_path

# ============================================================
# === COMMON SETTINGS ========================================
# ============================================================
INDEX_CSV_FILE                = str(weekly_csv_path(get_index_target()["stock_name"]).as_posix())
CURRENCY                      = "SGD"
EXCHANGE                      = "SGX"
# Leave as None to use today's local date automatically, or set a YYYY-MM-DD string to freeze the batch.
TODAY_OVERRIDE                = None
TODAY                         = TODAY_OVERRIDE or date.today().isoformat()
FORCE_WINDOW_DAYS             = None
MIN_VOLUME_THRESHOLD_OVERRIDE = None

CONFIGS = [
    {
        "CSV_FILE": str(weekly_csv_path(stock["stock_name"]).as_posix()),
        "STOCK_NAME": stock["stock_name"],
        "TICKER": stock["ticker"],
    }
    for stock in get_analysis_targets()
]

# Path to your Dividend Cycle Analysis script
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
ANALYSIS_SCRIPT = str((SCRIPT_DIR / "analyze-stock.py").as_posix())
# ============================================================

TEMPLATE = Path(ANALYSIS_SCRIPT).read_text()


def patch_script(cfg: dict) -> str:
    """Inject merged config values into a copy of the script source."""
    merged = {
        "CSV_FILE": cfg["CSV_FILE"],
        "INDEX_CSV_FILE": INDEX_CSV_FILE,
        "STOCK_NAME": cfg["STOCK_NAME"],
        "TICKER": cfg["TICKER"],
        "CURRENCY": cfg.get("CURRENCY", CURRENCY),
        "EXCHANGE": cfg.get("EXCHANGE", EXCHANGE),
        "TODAY_OVERRIDE": cfg.get("TODAY_OVERRIDE", TODAY_OVERRIDE),
        "FORCE_WINDOW_DAYS": cfg.get("FORCE_WINDOW_DAYS", FORCE_WINDOW_DAYS),
        "MIN_VOLUME_THRESHOLD_OVERRIDE": cfg.get(
            "MIN_VOLUME_THRESHOLD_OVERRIDE",
            MIN_VOLUME_THRESHOLD_OVERRIDE,
        ),
    }
    replacements = {
        'CSV_FILE                    = ': f'CSV_FILE                    = "{merged["CSV_FILE"]}"',
        'INDEX_CSV_FILE              = ': f'INDEX_CSV_FILE              = "{merged["INDEX_CSV_FILE"]}"',
        'STOCK_NAME                  = ': f'STOCK_NAME                  = "{merged["STOCK_NAME"]}"',
        'TICKER                      = ': f'TICKER                      = "{merged["TICKER"]}"',
        'CURRENCY                    = ': f'CURRENCY                    = "{merged["CURRENCY"]}"',
        'EXCHANGE                    = ': f'EXCHANGE                    = "{merged["EXCHANGE"]}"',
        'TODAY_OVERRIDE              = ': f'TODAY_OVERRIDE              = {repr(merged["TODAY_OVERRIDE"])}',
        'FORCE_WINDOW_DAYS           = ': f'FORCE_WINDOW_DAYS           = {repr(merged["FORCE_WINDOW_DAYS"])}',
        'MIN_VOLUME_THRESHOLD_OVERRIDE = ': f'MIN_VOLUME_THRESHOLD_OVERRIDE = {repr(merged["MIN_VOLUME_THRESHOLD_OVERRIDE"])}',
    }
    patched = TEMPLATE
    for prefix, new_line in replacements.items():
        for line in patched.splitlines():
            if prefix in line and line.strip().startswith(prefix.strip().split("=")[0].strip()):
                patched = patched.replace(line, new_line, 1)
                break
    return patched


def run_stock(cfg: dict, idx: int, total: int) -> dict:
    ticker = cfg["TICKER"]
    print(f"\n{'=' * 60}")
    print(f"[{idx}/{total}] {cfg['STOCK_NAME']} ({ticker})")
    print(f"{'=' * 60}")

    tmp = Path(f"_tmp_{ticker.replace('.', '_')}.py")
    tmp.write_text(patch_script(cfg))

    try:
        result = subprocess.run([sys.executable, str(tmp)])
        success = result.returncode == 0
    except Exception as e:
        print(f"ERROR: {e}")
        success = False
    finally:
        tmp.unlink(missing_ok=True)

    out_file = PROJECT_ROOT / "json" / f"{ticker}_DividendCycleAnalysis_output.json"
    ok = success and out_file.exists()
    return {
        "ticker": ticker,
        "stock_name": cfg["STOCK_NAME"],
        "success": ok,
        "output_file": str(out_file.as_posix()) if ok else None,
        "error": None if ok else "Script error or output file missing",
    }


def main():
    if not Path(ANALYSIS_SCRIPT).exists():
        sys.exit(f"ERROR: '{ANALYSIS_SCRIPT}' not found. Update ANALYSIS_SCRIPT at the top.")

    total = len(CONFIGS)
    results = []
    start = datetime.now()

    for i, cfg in enumerate(CONFIGS, 1):
        results.append(run_stock(cfg, i, total))

    elapsed = (datetime.now() - start).total_seconds()
    passed = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]

    print(f"\n{'=' * 60}")
    print(f"BATCH COMPLETE - {len(passed)}/{total} succeeded in {elapsed:.1f}s")
    print(f"{'=' * 60}")
    if passed:
        print("\nSucceeded:")
        for r in passed:
            print(f"   {r['ticker']:15s}  ->  {r['output_file']}")
    if failed:
        print("\nFailed:")
        for r in failed:
            print(f"   {r['ticker']:15s}  -  {r['error']}")

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
