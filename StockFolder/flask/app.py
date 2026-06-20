#!/usr/bin/env python3
"""
Lightweight Flask wrapper for the Dividend Cycle Analysis dashboard.

Purpose:
- serve the existing single-file dashboard over HTTP
- expose a small local API for pipeline orchestration and JSON access

This keeps the core analysis scripts unchanged and uses Flask only as a
local orchestration layer.
"""

from __future__ import annotations

import ast
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory


FLASK_DIR = Path(__file__).resolve().parent
BASE_DIR = FLASK_DIR.parent
MAIN_DIR = BASE_DIR / "main"
JSON_DIR = BASE_DIR / "json"
DATA_DIR = BASE_DIR / "data"

DASHBOARD_FILE = MAIN_DIR / "dashboard.html"
PIPELINE_SCRIPT = MAIN_DIR / "run-analysis-pipeline.py"
BATCH_SCRIPT = MAIN_DIR / "analyze-batch.py"
STOCK_REGISTRY_FILE = MAIN_DIR / "stock_registry.py"
MASTER_STOCK_FILE = DATA_DIR / "master_stock_list.csv"


app = Flask(__name__)


REGISTRY_HEADER = """from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

# Single source of truth for the stock universe used by:
# - extract-weekly.py
# - analyze-batch.py
#
# Add a normal stock like:
# {"stock_name": "Example_Stock", "ticker": "ABCD.SI"}
#
# Keep the market index here too, but mark it as:
# {"stock_name": "STI_Index", "ticker": "^STI", "is_index": True, "run_analysis": False}
#
# Rules:
# - stock_name should match the CSV filename prefix
# - ticker should match the Yahoo Finance symbol
# - run_analysis defaults to True if omitted


STOCK_UNIVERSE = """


REGISTRY_FOOTER = """


def get_index_target():
    for stock in STOCK_UNIVERSE:
        if stock.get("is_index"):
            return stock
    raise ValueError("No index target defined in STOCK_UNIVERSE")


def get_analysis_targets():
    return [
        stock for stock in STOCK_UNIVERSE
        if not stock.get("is_index") and stock.get("run_analysis", True)
    ]


def weekly_csv_path(stock_name):
    return DATA_DIR / f"{stock_name}_weekly_historical_price.csv"


def daily_csv_path(stock_name):
    return DATA_DIR / f"{stock_name}_daily_historical_price.csv"
"""


def safe_json_path(filename: str) -> Path:
    candidate = (JSON_DIR / filename).resolve()
    if JSON_DIR.resolve() not in candidate.parents or candidate.suffix.lower() != ".json":
        abort(400, description="Invalid JSON filename.")
    if not candidate.exists():
        abort(404, description="JSON file not found.")
    return candidate


def run_python_script(script_path: Path) -> tuple[bool, dict]:
    if not script_path.exists():
        return False, {
            "ok": False,
            "error": f"Required script not found: {script_path}",
        }

    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(BASE_DIR),
        capture_output=True,
        text=True,
    )

    payload = {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "script": script_path.name,
    }
    return result.returncode == 0, payload


def load_stock_registry() -> list[dict]:
    if not STOCK_REGISTRY_FILE.exists():
        raise FileNotFoundError(f"Registry file not found: {STOCK_REGISTRY_FILE}")
    source = STOCK_REGISTRY_FILE.read_text(encoding="utf-8")
    marker = "STOCK_UNIVERSE = "
    start = source.find(marker)
    if start == -1:
        raise ValueError("STOCK_UNIVERSE assignment not found in stock_registry.py")
    list_start = source.find("[", start)
    if list_start == -1:
        raise ValueError("STOCK_UNIVERSE list start not found in stock_registry.py")
    depth = 0
    list_end = None
    for index, char in enumerate(source[list_start:], start=list_start):
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                list_end = index + 1
                break
    if list_end is None:
        raise ValueError("STOCK_UNIVERSE list end not found in stock_registry.py")
    parsed = ast.literal_eval(source[list_start:list_end])
    if not isinstance(parsed, list):
        raise ValueError("STOCK_UNIVERSE must evaluate to a list")
    return parsed


def normalize_registry_entry(entry: dict) -> dict:
    if not isinstance(entry, dict):
        raise ValueError("Each registry entry must be an object")
    stock_name = str(entry.get("stock_name", "")).strip()
    ticker = str(entry.get("ticker", "")).strip()
    if not stock_name:
        raise ValueError("stock_name is required")
    if not ticker:
        raise ValueError("ticker is required")
    normalized = {
        "stock_name": stock_name,
        "ticker": ticker,
    }
    if entry.get("is_index"):
        normalized["is_index"] = True
    run_analysis = entry.get("run_analysis", True)
    if normalized.get("is_index"):
        normalized["run_analysis"] = False if run_analysis is False else False
    elif run_analysis is not True:
        normalized["run_analysis"] = bool(run_analysis)
    return normalized


def serialize_stock_registry(entries: list[dict]) -> str:
    body = json.dumps(entries, indent=4)
    body = body.replace("true", "True").replace("false", "False")
    return f"{REGISTRY_HEADER}{body}{REGISTRY_FOOTER}"


def save_stock_registry(entries: list[dict]) -> None:
    normalized = [normalize_registry_entry(entry) for entry in entries]
    index_entries = [entry for entry in normalized if entry.get("is_index")]
    if len(index_entries) != 1:
        raise ValueError("Exactly one index entry is required")
    STOCK_REGISTRY_FILE.write_text(serialize_stock_registry(normalized), encoding="utf-8")


def derived_ticker(symbol: str) -> str:
    symbol = str(symbol or "").strip().upper()
    if not symbol:
        return ""
    if symbol.startswith("^") or "." in symbol:
        return symbol
    return f"{symbol}.SI"


def derived_stock_name(company_name: str) -> str:
    name = str(company_name or "").strip()
    if not name:
        return ""
    name = name.replace("&", " And ")
    name = re.sub(r"\b(Pte\.?\s+Ltd\.?|Ltd\.?|Limited|PLC)\b", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[^\w\s]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    words = [word.capitalize() if not word.isupper() else word for word in name.split()]
    normalized = "_".join(words)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized


def enabled_from_role(role: str) -> bool:
    return str(role or "").strip() != "Ignore"


def parse_optional_bool(value: str | None) -> bool | None:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return None
    if normalized in {"true", "1", "yes", "y"}:
        return True
    if normalized in {"false", "0", "no", "n"}:
        return False
    return None


def index_from_type_or_role(symbol: str, asset_type: str) -> bool:
    symbol = str(symbol or "").strip().upper()
    asset_type = str(asset_type or "").strip()
    return symbol == "^STI" or asset_type == "Index"


def default_run_analysis_for_entry(asset_type: str, role: str, is_index: bool) -> bool:
    if is_index:
        return False
    role = str(role or "").strip()
    return role in {"Dividend_Core", "Dividend_Secondary"}


def resolve_master_stock_file() -> Path:
    if MASTER_STOCK_FILE.exists():
        return MASTER_STOCK_FILE
    raise FileNotFoundError(f"Master stock file not found: {MASTER_STOCK_FILE}")


def load_master_stock_list() -> list[dict]:
    source_file = resolve_master_stock_file()
    entries: list[dict] = []
    with source_file.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            symbol = str(row.get("Symbol", "")).strip().upper()
            company_name = str(row.get("Company Name", "")).strip()
            asset_type = str(row.get("Type", "Stock") or "Stock").strip()
            sector = str(row.get("Sector") or "").strip()
            role = str(row.get("Role", "")).strip()
            enabled = parse_optional_bool(row.get("Enabled"))
            if not symbol or not company_name:
                continue
            is_index = index_from_type_or_role(symbol, asset_type)
            entries.append(
                {
                    "symbol": symbol,
                    "company_name": company_name,
                    "ticker": "^STI" if symbol == "^STI" else derived_ticker(symbol),
                    "stock_name": "STI_Index" if symbol == "^STI" or is_index else derived_stock_name(company_name),
                    "exchange": "SGX",
                    "type": "Index" if is_index and asset_type != "Index" else asset_type,
                    "sector": sector,
                    "role": role or ("Macro_Benchmark" if is_index else ""),
                    "is_index": is_index,
                    "default_run_analysis": default_run_analysis_for_entry(asset_type, role, is_index),
                    "enabled": enabled if enabled is not None else enabled_from_role(role),
                }
            )
    if not any(entry.get("is_index") for entry in entries):
        entries.append(
            {
                "symbol": "^STI",
                "company_name": "Straits Times Index",
                "ticker": "^STI",
                "stock_name": "STI_Index",
                "exchange": "SGX",
                "type": "Index",
                "sector": "Broad Market Index",
                "role": "Macro_Benchmark",
                "is_index": True,
                "default_run_analysis": False,
                "enabled": True,
            }
        )
    deduped: dict[str, dict] = {}
    for entry in entries:
        deduped.setdefault(entry["ticker"], entry)
    return sorted(deduped.values(), key=lambda item: (item["is_index"], item["company_name"].lower()))


@app.get("/")
def dashboard() -> object:
    return send_from_directory(MAIN_DIR, DASHBOARD_FILE.name)


@app.get("/dashboard")
def dashboard_alias() -> object:
    return send_from_directory(MAIN_DIR, DASHBOARD_FILE.name)


@app.get("/api/health")
def health() -> object:
    return jsonify(
        {
            "ok": True,
            "dashboard": DASHBOARD_FILE.exists(),
            "json_dir": JSON_DIR.exists(),
            "pipeline_script": PIPELINE_SCRIPT.exists(),
            "batch_script": BATCH_SCRIPT.exists(),
            "stock_registry": STOCK_REGISTRY_FILE.exists(),
            "master_stock_file": MASTER_STOCK_FILE.exists(),
        }
    )


@app.get("/api/json-files")
def list_json_files() -> object:
    files = sorted(p.name for p in JSON_DIR.glob("*_DividendCycleAnalysis_output.json"))
    return jsonify(
        {
            "ok": True,
            "count": len(files),
            "files": files,
        }
    )


@app.get("/api/json-files/<path:filename>")
def read_json_file(filename: str) -> object:
    path = safe_json_path(filename)
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return jsonify(payload)


@app.get("/api/stock-registry")
def read_stock_registry() -> object:
    try:
        entries = load_stock_registry()
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify({"ok": True, "entries": entries, "count": len(entries)})


@app.post("/api/stock-registry")
def update_stock_registry() -> object:
    payload = request.get_json(silent=True) or {}
    entries = payload.get("entries")
    if not isinstance(entries, list):
        return jsonify({"ok": False, "error": "Request must include an entries list"}), 400
    try:
        save_stock_registry(entries)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify({"ok": True, "count": len(entries)})


@app.get("/api/master-stocks")
def read_master_stocks() -> object:
    try:
        entries = load_master_stock_list()
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify({"ok": True, "entries": entries, "count": len(entries)})


@app.post("/api/run-pipeline")
def run_pipeline() -> object:
    ok, payload = run_python_script(PIPELINE_SCRIPT)
    status = 200 if ok else 500
    return jsonify(payload), status


@app.post("/api/run-batch")
def run_batch() -> object:
    ok, payload = run_python_script(BATCH_SCRIPT)
    status = 200 if ok else 500
    return jsonify(payload), status


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
