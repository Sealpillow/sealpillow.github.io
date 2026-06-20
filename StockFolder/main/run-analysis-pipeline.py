#!/usr/bin/env python3
"""
Run the full Dividend Cycle Analysis pipeline:
1. Refresh weekly CSV data
2. Run batch analysis across the stock universe

Usage:
python run-analysis-pipeline.py
"""

import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
EXTRACT_SCRIPT = SCRIPT_DIR / "extract-weekly.py"
BATCH_SCRIPT = SCRIPT_DIR / "analyze-batch.py"


def run_step(label, script_path):
    print("\n" + "=" * 60)
    print(label)
    print("=" * 60)

    result = subprocess.run([sys.executable, str(script_path)])
    if result.returncode != 0:
        print(f"\nFAILED: {script_path.name} exited with code {result.returncode}")
        sys.exit(result.returncode)


def main():
    for script_path in (EXTRACT_SCRIPT, BATCH_SCRIPT):
        if not script_path.exists():
            sys.exit(f"ERROR: Required script not found: {script_path}")

    run_step("STEP 1/2 - Refresh weekly CSV data", EXTRACT_SCRIPT)
    run_step("STEP 2/2 - Run batch Dividend Cycle Analysis", BATCH_SCRIPT)

    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print("Weekly extraction and batch analysis finished successfully.")


if __name__ == "__main__":
    main()
