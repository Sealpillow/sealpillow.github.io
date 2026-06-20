#!/usr/bin/env python3
"""
Dividend Cycle Analysis computation script
Outputs: [TICKER]_DividendCycleAnalysis_output.json
Feed this JSON into the dashboard or any downstream interpretation step.
"""

import json, math, sys
from datetime import datetime, timedelta, date

# ============================================================
# === USER CONFIG — edit these before running ================
# ============================================================
CSV_FILE                    = "./data/AIMS_APAC_REIT_weekly_historical_price.csv"
INDEX_CSV_FILE              = "./data/STI_Index_weekly_historical_price.csv"
STOCK_NAME                  = "AIMS_APAC_REIT"
TICKER                      = "O5RU.SI"
CURRENCY                    = "SGD"        # SGD / USD / HKD
EXCHANGE                    = "SGX"        # SGX / NYSE / HKEX
TODAY_OVERRIDE              = None         # e.g. "2026-04-12"
TODAY                       = TODAY_OVERRIDE or date.today().isoformat()  # YYYY-MM-DD
FORCE_WINDOW_DAYS           = None         # None or integer
MIN_VOLUME_THRESHOLD_OVERRIDE = None       # None or integer
ANCHOR_MEDIAN_LOOKBACK      = 3            # keep median recent anchor as reference only
RECENT_ZONE_LOOKBACK        = 5            # zone percentiles use last N clean same-series cycles when available
RECENT_DIV_BASELINE_LOOKBACK = 6           # recent payout baseline lookback for anomaly screening
# ============================================================

TODAY_DT = datetime.strptime(TODAY, "%Y-%m-%d")


def human_label(value):
    """Convert internal enum-style values into friendlier display labels."""
    label_map = {
        "MONTHLY": "Monthly",
        "QUARTERLY": "Quarterly",
        "SEMI-ANNUAL": "Semi-Annual",
        "ANNUAL": "Annual",
        "IRREGULAR": "Irregular",
        "RELIABLE": "Reliable",
        "BIMODAL": "Bimodal",
        "UNRELIABLE": "Unreliable",
        "STABLE": "Stable",
        "DEGRADING": "Degrading",
        "INSUFFICIENT_DATA": "Insufficient data",
        "PRE_EXDIV_PREFERRED": "Pre-Exdiv Peak Exit preferred",
        "POST_EXDIV_PREFERRED": "Ex-Div Date Exit preferred",
        "INDETERMINATE": "Indeterminate",
        "LOW": "Low",
        "MODERATE": "Moderate",
        "CAUTION": "Caution",
        "HIGH": "High",
        "SEVERE": "Severe",
        "EARLY": "Early",
        "LATE": "Late",
        "CALENDAR_CONSISTENT": "Consistent",
        "CALENDAR_MODERATE": "Moderate spread",
        "CALENDAR_WIDE": "Wide spread",
    }
    if value is None:
        return None
    return label_map.get(value, str(value).replace("_", " ").title())

# ── DEPENDENCIES ────────────────────────────────────────────
try:
    import pandas as pd
    import numpy as np
except ImportError:
    sys.exit("ERROR: pip install pandas numpy")

# ── PARSE GUARD ─────────────────────────────────────────────
print("=" * 60)
print("PARSE GUARD")
print("=" * 60)

try:
    raw = pd.read_csv(CSV_FILE, dayfirst=True)
except Exception as e:
    sys.exit(f"HALT: Cannot read CSV — {e}")

print(f"Columns detected: {list(raw.columns)}")

# Normalise column names
col_map = {}
for c in raw.columns:
    cl = c.strip().lower()
    if cl == "date":           col_map[c] = "Date"
    elif cl == "close":        col_map[c] = "Close"
    elif "adj" in cl:          col_map[c] = "AdjClose"
    elif cl == "volume":       col_map[c] = "Volume"
    elif cl in ("notes","note","dividends","dividend"): col_map[c] = "Notes"
    elif cl == "open":         col_map[c] = "Open"
    elif cl == "high":         col_map[c] = "High"
    elif cl == "low":          col_map[c] = "Low"
raw = raw.rename(columns=col_map)

required = {"Date", "Close", "Volume"}
missing = required - set(raw.columns)
if missing:
    sys.exit(f"HALT: Missing required columns: {missing}")
if "Notes" not in raw.columns:
    raw["Notes"] = ""

# Parse dates
for fmt in ("%d %b %Y", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
    try:
        raw["Date"] = pd.to_datetime(raw["Date"], format=fmt)
        date_fmt = fmt
        break
    except:
        pass
else:
    try:
        raw["Date"] = pd.to_datetime(raw["Date"], dayfirst=True)
        date_fmt = "mixed (dayfirst)"
    except:
        sys.exit("HALT: Cannot parse date column")

raw = raw.sort_values("Date").reset_index(drop=True)
raw["Close"] = pd.to_numeric(raw["Close"], errors="coerce")
raw["Volume"] = pd.to_numeric(raw["Volume"], errors="coerce").fillna(0)
raw["Notes"] = raw["Notes"].fillna("")

# Separate rows
div_mask   = raw["Notes"].str.contains("Dividend", case=False, na=False)
price_rows = raw[~div_mask].copy()
div_rows   = raw[div_mask].copy()

# Ignore forward placeholder price rows that belong to a future week and do
# not yet have a settled close. These show up in the feed before the week
# finishes and should not be treated as corrupt history.
future_incomplete_price_mask = (price_rows["Close"].isna()) & (price_rows["Date"] > TODAY_DT)
future_incomplete_price_count = int(future_incomplete_price_mask.sum())
if future_incomplete_price_count:
    price_rows = price_rows.loc[~future_incomplete_price_mask].copy()

total_rows = len(raw)
price_count = len(price_rows)
div_count   = len(div_rows)

print(f"Date format: {date_fmt}")
print(f"Total rows: {total_rows} | Price rows: {price_count} | Dividend rows: {div_count}")
print(f"First 3 rows:\n{raw.head(3).to_string()}")
print(f"Last 3 rows:\n{raw.tail(3).to_string()}")
if future_incomplete_price_count:
    print(f"INFO: Dropped {future_incomplete_price_count} future price row(s) with no settled Close yet")

# Duplicate date check
dup_dates = raw[raw.duplicated("Date", keep=False)]
if len(dup_dates) > 0:
    for d, grp in dup_dates.groupby("Date"):
        has_div = grp["Notes"].str.contains("Dividend", case=False).any()
        has_price = (~grp["Notes"].str.contains("Dividend", case=False)).any()
        if not (has_div and has_price and len(grp) == 2):
            sys.exit(f"HALT: Unresolvable duplicate date: {d}")
    print(f"INFO: {len(dup_dates)//2} date(s) appear as price+dividend pair — verified safe")

zero_vol = (price_rows["Volume"] == 0).sum()
zero_vol_pct = round((zero_vol / price_count * 100), 1) if price_count else 0.0
zero_vol_warning = None
preflight_edge_flags = []
if zero_vol / price_count > 0.05:
    zero_vol_warning = (
        f"Zero-volume rows exceed 5% ({zero_vol}/{price_count}, {zero_vol_pct}%) "
        f"— analysis continues, but thin trading may reduce reliability"
    )
    print(f"WARNING: {zero_vol_warning}")
    preflight_edge_flags.append("THIN_TRADING_HISTORY")

# ── NEW VALIDATION 1: NaN close prices ──────────────────────
# pd.to_numeric with errors="coerce" silently converts unreadable
# price values to NaN. If any price rows have NaN close, the low/
# peak calculations will silently produce wrong results downstream.
nan_close = price_rows["Close"].isna().sum()
if nan_close > 0:
    sys.exit(f"HALT: {nan_close} price row(s) have unparseable Close values (NaN after coerce). "
             f"Check CSV for non-numeric entries in the Close column.")

# ── NEW VALIDATION 2: zero or negative close prices ─────────
# A zero or negative close price is never valid for a listed stock.
# This catches data corruption, accidental row merges, or yfinance
# returning 0 for a date with no real data.
bad_close = (price_rows["Close"] <= 0).sum()
if bad_close > 0:
    bad_dates = price_rows.loc[price_rows["Close"] <= 0, "Date"].dt.strftime("%Y-%m-%d").tolist()
    sys.exit(f"HALT: {bad_close} price row(s) have zero or negative Close values: {bad_dates}. "
             f"Remove or correct these rows before re-running.")

# ── NEW VALIDATION 3: price continuity gaps ─────────────────
# Weekly data from yfinance should have no gap longer than ~10 days
# between consecutive rows (accounting for public holidays and the
# occasional missing Friday). A gap exceeding 21 days almost certainly
# means data is missing for that period — cycles spanning the gap will
# have their low/peak measured over an incomplete window.
# This is a WARNING not a halt: the gap is surfaced in issues_found
# and the user can decide whether to fill the missing rows.
EXPECTED_WEEKLY_GAP = 7   # days between consecutive weekly rows
MAX_ALLOWED_GAP     = 21  # 3x expected — anything beyond this is flagged
price_dates = price_rows["Date"].sort_values().reset_index(drop=True)
price_gaps  = price_dates.diff().dt.days.dropna()
large_gaps  = price_gaps[price_gaps > MAX_ALLOWED_GAP]
continuity_warnings = []
if len(large_gaps) > 0:
    for idx in large_gaps.index:
        gap_start = price_dates.iloc[idx - 1].strftime("%Y-%m-%d")
        gap_end   = price_dates.iloc[idx].strftime("%Y-%m-%d")
        gap_days  = int(large_gaps[idx])
        msg = f"Price gap of {gap_days}d between {gap_start} and {gap_end} — data may be missing"
        continuity_warnings.append(msg)
        print(f"WARNING: {msg}")

parse_preflight = {
    "columns_detected": list(raw.columns),
    "date_format_detected": date_fmt,
    "total_rows": total_rows,
    "price_rows": price_count,
    "dividend_rows": div_count,
    "zero_volume_rows": int(zero_vol),
    "zero_volume_pct": zero_vol_pct,
    "issues_found": [],
    "halted": False
}
if len(dup_dates) > 0:
    parse_preflight["issues_found"].append(
        f"{len(dup_dates)//2} rows share same date as dividend rows — verified safe: each pair is one price row + one dividend row on same ex-div date"
    )
for w in continuity_warnings:
    parse_preflight["issues_found"].append(w)
if zero_vol_warning:
    parse_preflight["issues_found"].append(zero_vol_warning)

print("PARSE GUARD PASSED")
print("=" * 60)

# ── INDEX CSV ───────────────────────────────────────────────
try:
    idx_raw = pd.read_csv(INDEX_CSV_FILE, dayfirst=True)
    for c in idx_raw.columns:
        if c.strip().lower() == "date":   idx_raw = idx_raw.rename(columns={c: "Date"})
        if c.strip().lower() == "close":  idx_raw = idx_raw.rename(columns={c: "Close"})
    idx_raw["Date"]  = pd.to_datetime(idx_raw["Date"], dayfirst=True)
    idx_raw["Close"] = pd.to_numeric(idx_raw["Close"], errors="coerce")
    idx_raw = idx_raw.sort_values("Date").reset_index(drop=True)
    idx_available = True
except:
    idx_available = False
    print("WARNING: Index CSV not found or unreadable — macro flag will be suppressed")

def index_return_over_window(start_dt, end_dt):
    if not idx_available:
        return None
    def nearest(dt):
        diffs = (idx_raw["Date"] - dt).abs()
        m = diffs.min()
        if m > timedelta(days=7):
            return None
        return idx_raw.loc[diffs.idxmin(), "Close"]
    s = nearest(start_dt)
    e = nearest(end_dt)
    if s is None or e is None or s == 0:
        return None
    return (e - s) / s * 100

# ── STEP 1: FREQUENCY & SERIES DETECTION ────────────────────
div_rows = div_rows.copy()
div_rows["div_amt"] = pd.to_numeric(
    div_rows["Notes"].str.extract(r"(\d+\.?\d*)")[0], errors="coerce"
)
if div_rows["div_amt"].isna().all() and "AdjClose" in div_rows.columns:
    div_rows["div_amt"] = pd.to_numeric(div_rows["AdjClose"], errors="coerce")

div_rows = div_rows.dropna(subset=["div_amt"])
div_rows = div_rows.sort_values("Date").reset_index(drop=True)

# ── NEW VALIDATION 4: zero or negative dividend amounts ──────
# The regex extracts any number including 0. A dividend of 0 or
# below is never a valid regular payment — it would break the
# anomaly filter's median calculation and produce nonsense zones.
bad_div = (div_rows["div_amt"] <= 0).sum()
if bad_div > 0:
    bad_div_dates = div_rows.loc[div_rows["div_amt"] <= 0, "Date"].dt.strftime("%Y-%m-%d").tolist()
    sys.exit(f"HALT: {bad_div} dividend row(s) have zero or negative amounts: {bad_div_dates}. "
             f"Remove or correct these rows before re-running.")

# Anomaly flagging
div_rows["gap_days"] = div_rows["Date"].diff().dt.days
median_amt = div_rows["div_amt"].median()

anomalies_excluded = []
clean_divs = []
for i, row in div_rows.iterrows():
    reasons = []
    recent_prior_amts = div_rows.iloc[max(0, i - RECENT_DIV_BASELINE_LOOKBACK):i]["div_amt"].dropna()
    recent_median_amt = recent_prior_amts.median() if len(recent_prior_amts) >= 4 else median_amt
    low_baseline_amt = recent_median_amt
    high_baseline_amt = max(median_amt, recent_median_amt)
    if i > 0 and row["gap_days"] < 45:
        reasons.append(f"gap too small ({int(row['gap_days'])}d < 45d)")
    if row["div_amt"] < 0.4 * low_baseline_amt:
        reasons.append(
            f"stub amount ({row['div_amt']:.4f} < 40% of baseline {low_baseline_amt:.4f})"
        )
    if row["div_amt"] > 2.5 * high_baseline_amt:
        reasons.append(
            f"special/bumper amount ({row['div_amt']:.4f} > 2.5x baseline {high_baseline_amt:.4f})"
        )
    if reasons:
        anomalies_excluded.append({
            "date": row["Date"].strftime("%Y-%m-%d"),
            "amount": float(row["div_amt"]),
            "reason": "; ".join(reasons)
        })
    else:
        clean_divs.append(row)

clean_divs = pd.DataFrame(clean_divs).reset_index(drop=True) if clean_divs else pd.DataFrame()

if len(clean_divs) < 2:
    sys.exit("HALT: Fewer than 2 valid dividend payments found after anomaly filtering")

# Frequency detection
intervals = clean_divs["Date"].diff().dt.days.dropna()
mean_interval = intervals.mean()

EDGE_CASE_FLAGS = list(preflight_edge_flags)
if 25 <= mean_interval <= 35:
    frequency = "MONTHLY"
    default_window = 45
elif 80 <= mean_interval <= 105:
    frequency = "QUARTERLY"
    default_window = 91
elif 160 <= mean_interval <= 210:
    frequency = "SEMI-ANNUAL"
    default_window = 152
elif 330 <= mean_interval <= 400:
    frequency = "ANNUAL"
    default_window = 182
else:
    EDGE_CASE_FLAGS.append("IRREGULAR_SCHEDULE")
    frequency = "IRREGULAR"
    default_window = 152
    print(f"WARNING: IRREGULAR_SCHEDULE — mean interval {mean_interval:.1f}d fits no standard frequency")

adaptive_window = FORCE_WINDOW_DAYS if FORCE_WINDOW_DAYS else default_window

# Cluster into series by calendar month
if frequency == "SEMI-ANNUAL" and len(clean_divs) >= 2:
    unique_months = sorted(clean_divs["Date"].dt.month.unique())
    month_gaps = [(unique_months[i+1] - unique_months[i], unique_months[i])
                  for i in range(len(unique_months)-1)]
    if month_gaps:
        split_month = max(month_gaps, key=lambda x: x[0])[1]
    else:
        split_month = 6
else:
    split_month = 6

def assign_series(month):
    if frequency == "MONTHLY":
        return f"M{month:02d}"
    elif frequency == "QUARTERLY":
        if month in (1,2,3):   return "Q1"
        elif month in (4,5,6): return "Q2"
        elif month in (7,8,9): return "Q3"
        else:                   return "Q4"
    elif frequency == "SEMI-ANNUAL":
        return "S1" if month <= split_month else "S2"
    else:
        return "S1"

clean_divs["series"] = clean_divs["Date"].dt.month.apply(assign_series)

# Series colour palette
SERIES_COLORS = {
    "S1": ("#3b82f6", "rgba(59,130,246,0.1)"),
    "S2": ("#10b981", "rgba(16,185,129,0.1)"),
    "Q1": ("#a78bfa", "rgba(167,139,250,0.1)"),
    "Q2": ("#22d3c8", "rgba(34,211,200,0.1)"),
    "Q3": ("#4f8ef7", "rgba(79,142,247,0.1)"),
    "Q4": ("#e8a838", "rgba(232,168,56,0.1)"),
    "M01": ("#a78bfa", "rgba(167,139,250,0.1)"),
}

def series_label(sid):
    fixed = {
        "Q1": "Quarter 1 (Jan\u2013Mar)", "Q2": "Quarter 2 (Apr\u2013Jun)",
        "Q3": "Quarter 3 (Jul\u2013Sep)", "Q4": "Quarter 4 (Oct\u2013Dec)",
    }
    if sid in fixed:
        return fixed[sid]
    import calendar as _cal
    from collections import Counter as _Counter
    sid_months = clean_divs[clean_divs["series"] == sid]["Date"].dt.month
    if sid_months.empty:
        return f"Series {sid}"
    ranked = sorted(_Counter(sid_months).items(), key=lambda x: -x[1])
    total = sum(c for _, c in ranked)
    top1_pct = ranked[0][1] / total if total > 0 else 0
    if top1_pct >= 0.70 or len(ranked) == 1:
        month_str = _cal.month_abbr[ranked[0][0]] + " ex-div"
    else:
        month_str = "/".join(_cal.month_abbr[m] for m, _ in ranked[:2]) + " ex-div"
    num = sid[-1] if sid[:-1] in ("S", "M") else sid
    return f"Series {num} \u2014 {month_str}"

series_ids = sorted(clean_divs["series"].unique())
if len(series_ids) == 1:
    EDGE_CASE_FLAGS.append("SINGLE_SERIES")

SERIES_META = []
for sid in series_ids:
    col, bg = SERIES_COLORS.get(sid, ("#7a829a", "rgba(122,130,154,0.1)"))
    SERIES_META.append({
        "id": sid,
        "label": series_label(sid),
        "sub": frequency.title() if frequency != "SEMI-ANNUAL" else "Semi-Annual",
        "color": col,
        "bg": bg,
        "window_days": adaptive_window
    })

# ── STEP 2: CYCLE METRICS ───────────────────────────────────
def prev_dp_at(exdiv_dt):
    candidates = price_rows[price_rows["Date"] <= exdiv_dt]
    if len(candidates) == 0:
        return None, None
    row = candidates.iloc[-1]
    return row["Close"], row["Date"]

def exdiv_or_after_close_at(exdiv_dt):
    candidates = price_rows[price_rows["Date"] >= exdiv_dt]
    if len(candidates) == 0:
        return None, None
    row = candidates.iloc[0]
    return row["Close"], row["Date"]

def price_at(dt, tolerance_days=7):
    diffs = (price_rows["Date"] - dt).abs()
    m = diffs.min()
    if m > timedelta(days=tolerance_days):
        return None, None
    idx = diffs.idxmin()
    return price_rows.loc[idx, "Close"], price_rows.loc[idx, "Date"]

def window_data(start_dt, end_dt):
    mask = (price_rows["Date"] >= start_dt) & (price_rows["Date"] <= end_dt)
    return price_rows[mask].copy()

vol_thresholds = {"SGX": 100000, "NYSE": 500000, "HKEX": 200000}
min_vol = MIN_VOLUME_THRESHOLD_OVERRIDE or vol_thresholds.get(EXCHANGE, 100000)
vol_threshold_source = "user_override" if MIN_VOLUME_THRESHOLD_OVERRIDE else f"default_{EXCHANGE}"

CYCLES = []
for i, div_row in clean_divs.iterrows():
    exdiv_dt = div_row["Date"]
    div_amt   = div_row["div_amt"]
    series    = div_row["series"]
    cycle_id  = f"{series}_{exdiv_dt.year}"

    before_start = exdiv_dt - timedelta(days=adaptive_window)
    before_end   = exdiv_dt - timedelta(days=1)
    after_end    = exdiv_dt + timedelta(days=adaptive_window)

    before_data = window_data(before_start, before_end)
    after_data  = window_data(exdiv_dt + timedelta(days=1), after_end)

    if len(before_data) < 3:
        continue

    if len(after_data) >= 3 and after_end <= TODAY_DT:
        status = "COMPLETE"
    elif len(before_data) >= 3:
        status = "PARTIAL"
    else:
        continue

    incomplete = (status != "COMPLETE")

    prev_dp, prev_dp_date = prev_dp_at(exdiv_dt)
    if prev_dp is None:
        continue

    low_idx  = before_data["Close"].idxmin()
    low_px   = before_data.loc[low_idx, "Close"]
    low_date = before_data.loc[low_idx, "Date"]

    peak_idx  = before_data["Close"].idxmax()
    peak_px   = before_data.loc[peak_idx, "Close"]
    peak_date = before_data.loc[peak_idx, "Date"]

    low_vs_prevdp  = (low_px  - prev_dp) / prev_dp * 100
    peak_vs_prevdp = (peak_px - prev_dp) / prev_dp * 100
    rebound        = (prev_dp - low_px)  / low_px  * 100
    wks_before     = (exdiv_dt - low_date).days / 7
    wks_to_peak    = (peak_date - low_date).days / 7 if not incomplete else None
    div_yield      = div_amt / prev_dp * 100

    s1_denom  = max(prev_dp - low_px, prev_dp * 0.005)
    s1_floored = (prev_dp - low_px) < (prev_dp * 0.005)
    s1 = div_amt / s1_denom * 100

    s2 = peak_vs_prevdp

    prior_price_rows = price_rows[price_rows["Date"] < exdiv_dt]
    if len(prior_price_rows) > 0:
        prior_day_close = prior_price_rows.iloc[-1]["Close"]
        exdiv_vs_prevdp = (prev_dp - prior_day_close) / prior_day_close * 100
    else:
        exdiv_vs_prevdp = 0.0

    vol_before = window_data(exdiv_dt - timedelta(days=30*2), before_end)
    volume_avg_30d = vol_before["Volume"].mean() if len(vol_before) > 0 else 0
    before_vol_avg = before_data["Volume"].mean() if len(before_data) > 0 else 0
    volume_entry_ratio = before_vol_avg / volume_avg_30d if volume_avg_30d > 0 else 1.0

    vol_slope = np.polyfit(range(len(before_data)), before_data["Volume"].fillna(0), 1)[0] if len(before_data) > 1 else 0
    vol_pct_change = vol_slope / (before_data["Volume"].mean() or 1) * len(before_data)
    if   vol_pct_change >  0.1: volume_trend = "INCREASING"
    elif vol_pct_change < -0.1: volume_trend = "DECLINING"
    else:                        volume_trend = "STABLE"

    if len(before_data) > 1:
        cum_max = before_data["Close"].cummax()
        drawdowns = (before_data["Close"] - cum_max) / cum_max * 100
        max_drawdown_pre_exdiv = drawdowns.min()
    else:
        max_drawdown_pre_exdiv = 0.0

    recovery_time_days = (exdiv_dt - low_date).days if not incomplete else None
    success = (prev_dp - low_px) / low_px * 100 > 3.0
    degen = wks_before <= 1

    # ── EXIT ANALYSIS (isolated additive block) ─────────────────────────────
    # Purely additive: no existing cycle metrics or dashboard fields are changed.
    # Incomplete cycles get nulls so downstream consumers can safely ignore it.
    if not incomplete:
        full_window_data = pd.concat([before_data, after_data]).sort_values("Date").reset_index(drop=True)
        post_low_data    = full_window_data[full_window_data["Date"] > low_date]

        if len(post_low_data) > 0:
            opt_idx           = post_low_data["Close"].idxmax()
            opt_exit_px       = float(post_low_data.loc[opt_idx, "Close"])
            opt_exit_date     = post_low_data.loc[opt_idx, "Date"]
            opt_gain_pct      = (opt_exit_px - low_px) / low_px * 100
            opt_wks_from_low  = (opt_exit_date - low_date).days / 7
            opt_days_vs_exdiv = (opt_exit_date - exdiv_dt).days
            opt_exit_before_exdiv = bool(opt_exit_date < exdiv_dt)
        else:
            opt_exit_px = opt_gain_pct = opt_wks_from_low = opt_days_vs_exdiv = None
            opt_exit_before_exdiv = None
            opt_exit_date = None

        pre_exdiv_candidates = before_data[before_data["Date"] >= low_date]
        if len(pre_exdiv_candidates) > 0:
            pre_exdiv_idx = pre_exdiv_candidates["Close"].idxmax()
            pre_exdiv_exit_date = pre_exdiv_candidates.loc[pre_exdiv_idx, "Date"]
            pre_exdiv_exit_px  = float(pre_exdiv_candidates.loc[pre_exdiv_idx, "Close"])
            pre_exdiv_gain_pct = (pre_exdiv_exit_px - low_px) / low_px * 100
            pre_exdiv_peak_days_before_exdiv = (exdiv_dt - pre_exdiv_exit_date).days
        else:
            pre_exdiv_exit_date = None
            pre_exdiv_exit_px  = None
            pre_exdiv_gain_pct = None
            pre_exdiv_peak_days_before_exdiv = None

        # Ex-div date exit uses the first available close on or after the ex-dividend
        # date, not the pre-exdiv close and not a later hindsight peak.
        exdiv_exit_px, exdiv_exit_date = exdiv_or_after_close_at(exdiv_dt)
        if exdiv_exit_px is not None:
            post_exdiv_exit_gain_pct = (exdiv_exit_px - low_px) / low_px * 100
        else:
            exdiv_exit_px = None
            exdiv_exit_date = None
            post_exdiv_exit_gain_pct = None

        exit_analysis = {
            "opt_exit_px":           round(opt_exit_px, 4) if opt_exit_px is not None else None,
            "opt_exit_date":         opt_exit_date.strftime("%Y-%m-%d") if opt_exit_date is not None else None,
            "opt_gain_pct":          round(opt_gain_pct, 4) if opt_gain_pct is not None else None,
            "opt_wks_from_low":      round(opt_wks_from_low, 4) if opt_wks_from_low is not None else None,
            "opt_days_vs_exdiv":     opt_days_vs_exdiv,
            "opt_exit_before_exdiv": opt_exit_before_exdiv,
            "pre_exdiv_exit_date":   pre_exdiv_exit_date.strftime("%Y-%m-%d") if pre_exdiv_exit_date is not None else None,
            "pre_exdiv_exit_px":     round(pre_exdiv_exit_px, 4) if pre_exdiv_exit_px is not None else None,
            "pre_exdiv_gain_pct":    round(pre_exdiv_gain_pct, 4) if pre_exdiv_gain_pct is not None else None,
            "pre_exdiv_peak_days_before_exdiv": pre_exdiv_peak_days_before_exdiv,
            "exdiv_date_exit_px":    round(exdiv_exit_px, 4) if exdiv_exit_px is not None else None,
            "exdiv_date_exit_date":  exdiv_exit_date.strftime("%Y-%m-%d") if exdiv_exit_date is not None else None,
            "post_exdiv_exit_gain_pct": round(post_exdiv_exit_gain_pct, 4) if post_exdiv_exit_gain_pct is not None else None,
        }
    else:
        exit_analysis = {
            "opt_exit_px": None, "opt_exit_date": None, "opt_gain_pct": None,
            "opt_wks_from_low": None, "opt_days_vs_exdiv": None,
            "opt_exit_before_exdiv": None,
            "pre_exdiv_exit_date": None, "pre_exdiv_exit_px": None, "pre_exdiv_gain_pct": None,
            "pre_exdiv_peak_days_before_exdiv": None,
            "exdiv_date_exit_px": None, "exdiv_date_exit_date": None,
            "post_exdiv_exit_gain_pct": None,
        }

    mir = index_return_over_window(before_start, exdiv_dt)

    first_before = before_data.iloc[0]["Close"] if len(before_data) > 0 else prev_dp
    stock_before_return = (prev_dp - first_before) / first_before * 100 if first_before else 0
    stock_excess_return = stock_before_return - (mir or 0)

    CYCLES.append({
        "id": cycle_id,
        "series": series,
        "exdiv_date": exdiv_dt.strftime("%Y-%m-%d"),
        "div_amt": div_amt,
        "prev_dp": round(prev_dp, 4),
        "low_px": round(low_px, 4),
        "low_date": low_date.strftime("%Y-%m-%d"),
        "peak_px": round(peak_px, 4),
        "peak_date": peak_date.strftime("%Y-%m-%d"),
        "low_vs_prevdp": round(low_vs_prevdp, 4),
        "exdiv_vs_prevdp": round(exdiv_vs_prevdp, 4),
        "peak_vs_prevdp": round(peak_vs_prevdp, 4),
        "rebound": round(rebound, 4),
        "wks_before": round(wks_before, 4),
        "wks_to_peak": round(wks_to_peak, 4) if wks_to_peak is not None else None,
        "div_yield": round(div_yield, 4),
        "s1": round(s1, 4),
        "s1_floored": s1_floored,
        "s2": round(s2, 4),
        "degen": degen,
        "incomplete": incomplete,
        "outlier": False,
        "macro": False,
        "macro_detail": {
            "market_index_return": round(mir, 4) if mir is not None else None,
            "stock_excess_return": round(stock_excess_return, 4)
        },
        "volume_avg_30d": round(volume_avg_30d, 0),
        "volume_entry_ratio": round(volume_entry_ratio, 4),
        "volume_trend": volume_trend,
        "max_drawdown_pre_exdiv": round(max_drawdown_pre_exdiv, 4),
        "recovery_time_days": recovery_time_days,
        "success": success,
        "pattern_stability_score": None,
        "zone_hit": None,
        "exit_analysis": exit_analysis,
    })

# Post-process: adaptive outlier and macro flags
for sid in series_ids:
    series_cycles = [c for c in CYCLES if c["series"] == sid and not c["degen"] and c["low_vs_prevdp"] is not None]
    lvp_vals = [c["low_vs_prevdp"] for c in series_cycles]
    if not lvp_vals:
        continue

    lvp_mean = float(np.mean(lvp_vals))
    lvp_std = float(np.std(lvp_vals))
    median_lvp_full = float(np.median(lvp_vals))
    sigma_mult = 2.5 if len(lvp_vals) < 15 else 3.0

    for c in series_cycles:
        if lvp_std > 0:
            c["outlier"] = abs(c["low_vs_prevdp"] - lvp_mean) > sigma_mult * lvp_std
        else:
            c["outlier"] = False

        mir = c["macro_detail"]["market_index_return"]
        ser = c["macro_detail"]["stock_excess_return"]
        threshold = median_lvp_full - 2 * lvp_std
        cond1 = c["low_vs_prevdp"] < threshold
        cond2 = ser is not None and ser < -3.0
        cond3 = mir is not None and mir <= -5.0
        c["macro"] = bool(cond1 and cond2 and cond3)

# ── STEP 3: PATTERN STABILITY SCORES ────────────────────────
for sid in series_ids:
    clean_s = [c for c in CYCLES if c["series"]==sid and not c["macro"] and not c["outlier"] and not c["degen"]]
    if len(clean_s) < 1:
        continue
    med_wks  = np.median([c["wks_before"]    for c in clean_s])
    med_lvp  = np.median([c["low_vs_prevdp"] for c in clean_s])
    med_reb  = np.median([c["rebound"]        for c in clean_s])

    for i, c in enumerate([x for x in CYCLES if x["series"]==sid]):
        if i < 3:
            c["pattern_stability_score"] = None
            continue
        def comp(val, med):
            if med == 0: return 0
            return max(0, min(1, 1 - abs(val - med) / abs(med)))
        a = comp(c["wks_before"],    med_wks)
        b = comp(c["low_vs_prevdp"], med_lvp)
        cc_= comp(c["rebound"],       med_reb)
        c["pattern_stability_score"] = round((a*0.4 + b*0.4 + cc_*0.2) * 100, 2)

# ── STEP 3: SERIES STATISTICS ────────────────────────────────
def safe_median(arr): return float(np.median(arr)) if arr else 0.0
def safe_mean(arr):   return float(np.mean(arr))   if arr else 0.0
def safe_std(arr):    return float(np.std(arr))     if arr else 0.0
def safe_cv(arr):
    m = safe_mean(arr)
    return round(safe_std(arr) / abs(m) * 100, 2) if m != 0 else 0.0

def winsorize_values(arr, lower_pct=5, upper_pct=95):
    vals = [float(x) for x in arr if x is not None]
    if not vals:
        return []
    if len(vals) == 1:
        return vals[:]
    lo = float(np.percentile(vals, lower_pct))
    hi = float(np.percentile(vals, upper_pct))
    return [min(max(v, lo), hi) for v in vals]

def autocorr_rho(arr):
    if len(arr) < 4:
        return 0.0
    a = np.array(arr)
    n = len(a)
    mean = a.mean()
    num = sum((a[i]-mean)*(a[i-1]-mean) for i in range(1,n))
    den = sum((x-mean)**2 for x in a)
    return float(num/den) if den != 0 else 0.0

def n_effective(n_clean, rho):
    if n_clean < 4:
        return n_clean
    ne = n_clean * (1 - rho) / (1 + rho)
    return round(max(1, min(n_clean, ne)), 2)

def peak_mode(wks_to_peak):
    if wks_to_peak is None:     return None
    if wks_to_peak <= 2:        return "FAST"
    elif wks_to_peak > 10:      return "LATE"
    else:                        return "NORMAL"

SS_SERIES = {}

for sid in series_ids:
    all_s   = [c for c in CYCLES if c["series"]==sid and not c["degen"]]
    clean_s = [c for c in all_s  if not c["macro"] and not c["outlier"]]

    def stats(cycs, key):
        vals = [c[key] for c in cycs if c[key] is not None]
        if not vals: return {"avg":0,"med":0,"std":0,"min":0,"max":0}
        return {
            "avg": round(safe_mean(vals),4),
            "med": round(safe_median(vals),4),
            "std": round(safe_std(vals),4),
            "min": round(min(vals),4),
            "max": round(max(vals),4),
        }
    def stats_with_vals(cycs, key):
        r = stats(cycs, key)
        r["vals"] = [round(c[key],4) for c in cycs if c[key] is not None]
        r["cv"]   = safe_cv(r["vals"])
        return r

    full_wks  = stats_with_vals(all_s, "wks_before")
    clean_wks = stats_with_vals(clean_s, "wks_before")

    wks_vals = clean_wks["vals"]
    wks_cv   = clean_wks["cv"]
    wks_avg  = clean_wks["avg"]
    wks_spread = round(max(wks_vals) - min(wks_vals), 4) if wks_vals else 0

    sorted_wks = sorted(wks_vals)
    max_gap = max((sorted_wks[i]-sorted_wks[i-1] for i in range(1,len(sorted_wks))), default=0)

    reliable_threshold = max(3, 0.3 * wks_avg) if wks_avg > 0 else 3
    if wks_cv <= 15 and wks_spread <= reliable_threshold:
        timing_rating = "RELIABLE"
    elif max_gap > 5:
        timing_rating = "BIMODAL"
    else:
        timing_rating = "UNRELIABLE"

    entry_timing_reliable = timing_rating == "RELIABLE"

    # BIMODAL cluster analysis
    # Smaller wks_before = dip happened later (closer to ex-div).
    # Larger wks_before = dip happened earlier (farther from ex-div).
    # We split at the largest gap in sorted clean timings, then classify the
    # recent clean cycles against that split point as "late" or "early".
    bimodal_clust1_med_wks = None
    bimodal_clust2_med_wks = None
    bimodal_clust1_sd_wks  = None
    bimodal_clust2_sd_wks  = None
    bimodal_primary_cluster = None
    bimodal_cluster_recent_counts = {"early": 0, "late": 0}
    if timing_rating == "BIMODAL" and len(sorted_wks) >= 2:
        gaps = [(sorted_wks[i]-sorted_wks[i-1], i) for i in range(1, len(sorted_wks))]
        split_idx = max(gaps, key=lambda x: x[0])[1]
        late_cluster_wks = sorted_wks[:split_idx+1]
        early_cluster_wks = sorted_wks[split_idx+1:]

        def safe_clust_median(lst):
            if not lst:
                return None
            v = float(np.median(lst))
            return round(v, 4) if math.isfinite(v) else None

        def safe_clust_sd(lst):
            if not lst:
                return None
            # ddof=0 (population SD) avoids blowup on n=2; result is always <= half the range
            v = float(np.std(lst, ddof=0))
            return round(v, 4) if math.isfinite(v) else None

        # Keep the existing output field names for compatibility:
        # clust1 = lower-wks cluster (later dip), clust2 = higher-wks cluster (earlier dip).
        bimodal_clust1_med_wks = safe_clust_median(late_cluster_wks)
        bimodal_clust2_med_wks = safe_clust_median(early_cluster_wks)
        bimodal_clust1_sd_wks  = safe_clust_sd(late_cluster_wks)
        bimodal_clust2_sd_wks  = safe_clust_sd(early_cluster_wks)

        if split_idx + 1 < len(sorted_wks):
            split_point = (sorted_wks[split_idx] + sorted_wks[split_idx + 1]) / 2.0
            recent3_clean = sorted(clean_s, key=lambda c: c["exdiv_date"])[-3:]
            for cyc in recent3_clean:
                wks = cyc.get("wks_before")
                if wks is None:
                    continue
                if wks <= split_point:
                    bimodal_cluster_recent_counts["late"] += 1
                else:
                    bimodal_cluster_recent_counts["early"] += 1
            if bimodal_cluster_recent_counts["early"] >= 2:
                bimodal_primary_cluster = "EARLY"
            elif bimodal_cluster_recent_counts["late"] >= 2:
                bimodal_primary_cluster = "LATE"

    lvp_vals = [c["low_vs_prevdp"] for c in clean_s]
    win_rate_pct = (sum(1 for c in clean_s if c["success"]) / len(clean_s) * 100) if clean_s else 0
    # All-cycles win rate: numerator is still clean successes, denominator includes degen/macro/outlier.
    # This is the realistic expected rate across every cycle attempt, not just the clean subset.
    all_complete_s = [c for c in CYCLES if c["series"] == sid and not c["incomplete"]]
    win_rate_all_pct = (sum(1 for c in clean_s if c["success"]) / len(all_complete_s) * 100) if all_complete_s else 0
    dip_depth_cv = safe_cv(lvp_vals)
    lvp_med = safe_median(lvp_vals)
    price_zone_consistent = (lvp_med < -3.0 and win_rate_pct >= 60 and dip_depth_cv < 60)

    recent3 = clean_s[-3:] if len(clean_s) >= 3 else clean_s
    rec_wks = [c["wks_before"] for c in recent3 if c["wks_before"] is not None]
    rec_cv   = safe_cv(rec_wks)
    rec_spread = round(max(rec_wks)-min(rec_wks), 4) if len(rec_wks)>1 else 0
    if rec_cv <= 20 and rec_spread <= 6:
        epoch_verdict = "approaching RELIABLE"
    else:
        epoch_verdict = "not approaching RELIABLE"

    epoch_recent = {
        "ids": [c["exdiv_date"] for c in recent3],
        "cv": round(rec_cv,2),
        "spread": round(rec_spread,4),
        "verdict": epoch_verdict
    }

    peak_seq = [peak_mode(c["wks_to_peak"]) for c in clean_s if c["wks_to_peak"] is not None]
    next_peak = peak_seq[-1] if peak_seq else "NORMAL"

    # ── Calendar Window analysis ──────────────────────────────────
    # Measures what calendar months the cycle low tends to fall in.
    # Independent of ex-div date drift — more stable than wks_before
    # for stocks where ex-div date shifts year to year.
    import calendar as _cal
    from collections import Counter as _Counter

    cal_clean = [c for c in clean_s if c.get("low_date")]
    cal_low_dts = [datetime.strptime(c["low_date"], "%Y-%m-%d") for c in cal_clean]

    if cal_low_dts:
        cal_months = [dt.month for dt in cal_low_dts]
        # Day-of-year using fixed leap year (2000) to avoid Feb 29 issues
        cal_doys = [datetime(2000, dt.month, min(dt.day, 28)).timetuple().tm_yday
                    for dt in cal_low_dts]
        cal_spread_days = int(max(cal_doys) - min(cal_doys))
        cal_doy_cv      = round(float(np.std(cal_doys) / abs(np.mean(cal_doys)) * 100), 2)

        # Modal months: top months covering >= 60% of occurrences
        mc = _Counter(cal_months)
        total = len(cal_months)
        ranked = mc.most_common()
        modal = []
        cumulative = 0
        for m, cnt in ranked:
            modal.append(m)
            cumulative += cnt
            if cumulative / total >= 0.60:
                break
        modal_sorted = sorted(modal)

        # Label: "Sep/Oct window" or "Mar-May window"
        if len(modal_sorted) == 1:
            cal_window_label = _cal.month_abbr[modal_sorted[0]] + " window"
        elif len(modal_sorted) == 2 and modal_sorted[1] - modal_sorted[0] <= 2:
            cal_window_label = _cal.month_abbr[modal_sorted[0]] + "/" + _cal.month_abbr[modal_sorted[1]] + " window"
        else:
            cal_window_label = _cal.month_abbr[modal_sorted[0]] + "-" + _cal.month_abbr[modal_sorted[-1]] + " window"

        # Rating thresholds
        # CALENDAR_CONSISTENT: spread <= 60 days (roughly 2 months)
        # CALENDAR_MODERATE:   spread 61-120 days (roughly 4 months)
        # CALENDAR_WIDE:       spread > 120 days (more than 4 months — not actionable)
        if   cal_spread_days <= 60:  cal_window_rating = "CALENDAR_CONSISTENT"
        elif cal_spread_days <= 120: cal_window_rating = "CALENDAR_MODERATE"
        else:                         cal_window_rating = "CALENDAR_WIDE"

        cal_window = {
            "low_months":      cal_months,           # raw month integers per clean cycle
            "modal_months":    modal_sorted,          # months covering >=60% of occurrences
            "cal_window_label": cal_window_label,     # e.g. "Sep/Oct window"
            "cal_spread_days": cal_spread_days,       # max-min day-of-year
            "cal_doy_cv":      cal_doy_cv,            # CV of day-of-year values
            "cal_window_rating": cal_window_rating,   # CALENDAR_CONSISTENT / MODERATE / WIDE
            "cal_window_rating_display": human_label(cal_window_rating),
            "n":               len(cal_low_dts),
        }
    else:
        cal_window = {
            "low_months": [], "modal_months": [], "cal_window_label": None,
            "cal_spread_days": None, "cal_doy_cv": None,
            "cal_window_rating": "CALENDAR_WIDE", "cal_window_rating_display": human_label("CALENDAR_WIDE"), "n": 0,
        }

    rho = autocorr_rho(lvp_vals)
    n_clean = len(clean_s)
    n_eff = n_effective(n_clean, rho)

    if   n_eff >= 8: sample_size = "ADEQUATE"
    elif n_eff >= 5: sample_size = "MODERATE"
    elif n_eff >= 3: sample_size = "THIN"
    else:            sample_size = "INSUFFICIENT"

    scored = [(i, c["pattern_stability_score"]) for i,c in enumerate(clean_s) if c["pattern_stability_score"] is not None]
    if len(scored) >= 4:
        xs = [s[0] for s in scored]
        ys = [s[1] for s in scored]
        slope = float(np.polyfit(xs, ys, 1)[0])
        recent_avg = float(np.mean([s[1] for s in scored[-3:]]))
        if slope < -5 and recent_avg < 60:
            stab_verdict = "DEGRADING"
        elif slope > 5 and recent_avg > 70:
            stab_verdict = "IMPROVING"
        else:
            stab_verdict = "STABLE"
    else:
        slope = 0.0
        recent_avg = float(np.mean([s[1] for s in scored])) if scored else 0.0
        stab_verdict = "INSUFFICIENT_DATA"

    vol_vals = [c["volume_avg_30d"] for c in all_s if c["volume_avg_30d"] > 0]
    avg_vol   = safe_mean(vol_vals)
    adequate_pct = sum(1 for v in vol_vals if v > min_vol) / len(vol_vals) * 100 if vol_vals else 0
    vol_ratios = [c["volume_entry_ratio"] for c in clean_s]

    SS_SERIES[sid] = {
        "window_days": adaptive_window,
        "full": {
            "wks_before":     full_wks,
            "low_vs_prevdp":  stats(all_s, "low_vs_prevdp"),
            "peak_vs_prevdp": stats(all_s, "peak_vs_prevdp"),
            "s2":             stats(all_s, "s2"),
        },
        "clean": {
            "n_clean":        n_clean,
            "n_effective":    n_eff,
            "autocorr_rho":   round(rho, 4),
            "wks_before":     clean_wks,
            "low_vs_prevdp":  stats(clean_s, "low_vs_prevdp"),
            "peak_vs_prevdp": stats(clean_s, "peak_vs_prevdp"),
            "s2":             stats(clean_s, "s2"),
        },
        "timing": {
            "vals":   wks_vals,
            "ids":    [c["exdiv_date"] for c in clean_s],
            "spread": wks_spread,
            "cv":     wks_cv,
            "dip_depth_cv": round(dip_depth_cv, 2),
            "avg":    clean_wks["avg"],
            "med":    clean_wks["med"],
            "std":    clean_wks["std"],
            "min":    clean_wks["min"],
            "max":    clean_wks["max"],
            "rating": timing_rating,
            "rating_display": human_label(timing_rating),
            "verdict": f"cv={wks_cv}% spread={wks_spread}wk",
            "trade_implication": "timing_based" if entry_timing_reliable else "price_zone_only",
            "color": "green" if timing_rating=="RELIABLE" else ("yellow" if timing_rating=="BIMODAL" else "red"),
            "price_zone_consistent": price_zone_consistent,
            "entry_timing_reliable": entry_timing_reliable,
            "bimodal_clust1_med_wks": bimodal_clust1_med_wks,
            "bimodal_clust2_med_wks": bimodal_clust2_med_wks,
            "bimodal_clust1_sd_wks": bimodal_clust1_sd_wks,
            "bimodal_clust2_sd_wks": bimodal_clust2_sd_wks,
            "bimodal_primary_cluster": bimodal_primary_cluster,
            "bimodal_cluster_recent_counts": bimodal_cluster_recent_counts,
            "epoch_recent": epoch_recent,
            "peak_sequence": peak_seq,
            "next_peak_mode": next_peak,
            "cal_window": cal_window,
        },
        "stability": {
            "scores": [s[1] for s in scored],
            "stability_trend_slope": round(slope, 3),
            "stability_trend_verdict": stab_verdict,
            "stability_trend_verdict_display": human_label(stab_verdict),
            "stability_recent_avg": round(recent_avg, 2),
        },
        "liquidity": {
            "avg_volume_30d": round(avg_vol, 0),
            "volume_ratio_median": round(safe_median(vol_ratios), 4),
            "adequacy_pct": round(adequate_pct, 1),
        },
        "risk": {
            "max_drawdown_median": round(safe_median([c["max_drawdown_pre_exdiv"] for c in clean_s]),4),
            "recovery_time_median": round(safe_median([c["recovery_time_days"] for c in clean_s if c["recovery_time_days"]]),1),
            "success_rate": round(win_rate_pct, 1),
            "success_rate_all": round(win_rate_all_pct, 1),
        }
    }

    # ── EXIT PROFILE (fully additive / safe for existing consumers) ─────────
    complete_s = [
        c for c in clean_s
        if not c["incomplete"] and c.get("exit_analysis", {}).get("opt_exit_px") is not None
    ]

    if len(complete_s) >= 3:
        ex = [c["exit_analysis"] for c in complete_s]

        n_before         = sum(1 for e in ex if e["opt_exit_before_exdiv"])
        pct_before_exdiv = round(n_before / len(ex) * 100, 1)

        opt_gains       = [e["opt_gain_pct"] for e in ex if e["opt_gain_pct"] is not None]
        pre_exdiv_gains = [e["pre_exdiv_gain_pct"] for e in ex if e["pre_exdiv_gain_pct"] is not None]
        post_exit_gains = [e["post_exdiv_exit_gain_pct"] for e in ex if e["post_exdiv_exit_gain_pct"] is not None]
        pre_exit_days   = [e["pre_exdiv_peak_days_before_exdiv"] for e in ex if e["pre_exdiv_peak_days_before_exdiv"] is not None]
        days_vs_exdiv   = [e["opt_days_vs_exdiv"] for e in ex if e["opt_days_vs_exdiv"] is not None]

        avg_opt  = safe_mean(opt_gains)
        avg_pre  = safe_mean(pre_exdiv_gains)
        avg_post_exit = safe_mean(post_exit_gains)
        pre_exit_days_p25 = round(float(np.percentile(pre_exit_days, 25)), 1) if pre_exit_days else None
        pre_exit_days_p75 = round(float(np.percentile(pre_exit_days, 75)), 1) if pre_exit_days else None
        med_days = round(safe_median(days_vs_exdiv), 1)

        pre_win_rate  = round(sum(1 for g in pre_exdiv_gains if g > 3.0) / len(pre_exdiv_gains) * 100, 1) if pre_exdiv_gains else 0
        post_exit_win_rate = round(sum(1 for g in post_exit_gains if g > 3.0) / len(post_exit_gains) * 100, 1) if post_exit_gains else 0

        # Exit verdict compares two practical execution paths:
        # 1) pre-exdiv exit
        # 2) exit at / just after the ex-div anchor reference
        if avg_post_exit > 0 and avg_pre >= avg_post_exit * 0.95:
            exit_verdict = "PRE_EXDIV_PREFERRED"
        elif avg_post_exit > 0 and avg_opt > avg_post_exit * 1.05 and pct_before_exdiv < 40:
            exit_verdict = "POST_EXDIV_PREFERRED"
        else:
            exit_verdict = "INDETERMINATE"

        exit_profile = {
            "n_complete_cycles": len(complete_s),
            "pct_opt_before_exdiv": pct_before_exdiv,
            "pre_exdiv_peak_window_days_p25": pre_exit_days_p25,
            "pre_exdiv_peak_window_days_p75": pre_exit_days_p75,
            "med_days_vs_exdiv": med_days,
            "avg_gain_optimal": round(avg_opt, 4),
            "avg_gain_pre_exdiv": round(avg_pre, 4),
            "avg_gain_post_exdiv_exit": round(avg_post_exit, 4),
            "pre_exdiv_win_rate": pre_win_rate,
            "post_exdiv_exit_win_rate": post_exit_win_rate,
            "exit_mode_verdict": exit_verdict,
            "exit_mode_verdict_display": human_label(exit_verdict),
        }
    else:
        exit_profile = {
            "n_complete_cycles": len(complete_s),
            "exit_mode_verdict": "INSUFFICIENT_DATA",
            "exit_mode_verdict_display": human_label("INSUFFICIENT_DATA"),
            "pct_opt_before_exdiv": None,
            "pre_exdiv_peak_window_days_p25": None,
            "pre_exdiv_peak_window_days_p75": None,
            "med_days_vs_exdiv": None,
            "avg_gain_optimal": None,
            "avg_gain_pre_exdiv": None,
            "avg_gain_post_exdiv_exit": None,
            "pre_exdiv_win_rate": None,
            "post_exdiv_exit_win_rate": None,
        }

    SS_SERIES[sid]["exit_profile"] = exit_profile

# ── STEP 3B: CGC RANKING ─────────────────────────────────────
CGC_RANKING = None
if "SINGLE_SERIES" not in EDGE_CASE_FLAGS:
    ranking = []
    for sid in series_ids:
        clean_s = [c for c in CYCLES if c["series"]==sid and not c["macro"] and not c["outlier"] and not c["degen"]]
        if not clean_s: continue
        med_s2  = safe_median([c["s2"]           for c in clean_s])
        med_reb = safe_median([c["rebound"]       for c in clean_s])
        win     = sum(1 for c in clean_s if c["success"]) / len(clean_s) * 100
        med_lvp = safe_median([c["low_vs_prevdp"] for c in clean_s])
        score = min(100, win * 0.5) + min(100, med_s2 * 2 * 0.5)
        ranking.append({
            "series_id": sid,
            "score": round(score, 2),
            "median_s2": round(med_s2, 4),
            "median_rebound": round(med_reb, 4),
            "win_rate": round(win, 1),
            "median_low_vs_prevdp": round(med_lvp, 4),
            "n_clean": len(clean_s),
            "rank": 0,
            "verdict": ""
        })
    ranking.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(ranking):
        r["rank"] = i + 1
    CGC_RANKING = ranking

# ── STEP 4: FORWARD PROJECTIONS ──────────────────────────────
last_div = clean_divs.iloc[-1]
anchor_date = last_div["Date"]
anchor_price, _ = price_at(anchor_date)
if anchor_price is None:
    anchor_price = price_rows.iloc[-1]["Close"]

current_price = price_rows.iloc[-1]["Close"]

def percentile_pcts(n_eff):
    if   n_eff >= 8: return 10, 90
    elif n_eff >= 5: return 20, 80
    elif n_eff >= 3: return 30, 70
    else:            return 0,  100

PROJ_SERIES = {}

for sid in series_ids:
    clean_s = [c for c in CYCLES if c["series"]==sid and not c["macro"] and not c["outlier"] and not c["degen"]]
    win_rate_pct = (sum(1 for c in clean_s if c["success"]) / len(clean_s) * 100) if clean_s else 0
    all_complete_s = [c for c in CYCLES if c["series"] == sid and not c["incomplete"]]
    win_rate_all_pct = (sum(1 for c in clean_s if c["success"]) / len(all_complete_s) * 100) if all_complete_s else 0
    ss = SS_SERIES[sid]
    n_eff = ss["clean"]["n_effective"]
    stab_verdict = ss["stability"]["stability_trend_verdict"]
    timing_rating = ss["timing"]["rating"]
    entry_timing_reliable = ss["timing"]["entry_timing_reliable"]
    sid_divs = clean_divs[clean_divs["series"]==sid].sort_values("Date")
    if len(sid_divs) >= 2:
        sid_intervals = sid_divs["Date"].diff().dt.days.dropna().tolist()
        expected_interval = mean_interval * len(series_ids)
        # Filter out intervals that are too short (special/interim dividends) OR too long.
        # Lower bound: 40% of expected excludes stub/interim payments within the same cycle year.
        # Upper bound: 150% of expected excludes genuine missed-year gaps.
        normal_intervals  = [x for x in sid_intervals
                             if expected_interval * 0.4 <= x <= expected_interval * 1.5]
        avg_sid_interval  = float(np.mean(normal_intervals)) if normal_intervals else float(np.mean(sid_intervals))
    else:
        sid_intervals    = []
        avg_sid_interval = mean_interval * len(series_ids)

    last_sid_date = sid_divs.iloc[-1]["Date"]

    dom_vals  = [d.day for d in sid_divs["Date"]]
    dom_steps = [dom_vals[i] - dom_vals[i-1] for i in range(1, len(dom_vals))]

    use_interval = round(avg_sid_interval)

    if len(dom_steps) >= 3 and len(sid_intervals) >= 1:
        last3_steps = dom_steps[-3:]
        if all(s > 0 for s in last3_steps) or all(s < 0 for s in last3_steps):
            last_interval = sid_intervals[-1]
            drift_step    = round(float(np.mean(last3_steps)))
            use_interval  = last_interval + drift_step

    proj_date = last_sid_date + timedelta(days=use_interval)

    # ── ADVANCE IF ALREADY ELAPSED ──────────────────────────────
    # Step forward by use_interval until we have a future date.
    while proj_date <= TODAY_DT:
        proj_date += timedelta(days=use_interval)

    # ── OVERSHOOT GUARD ─────────────────────────────────────────
    # If the projected date is more than one full interval into the future,
    # the while-loop has overshot (common when use_interval ≈ 365d and the
    # initial proj_date was just barely in the past).  Fall back to snapping
    # to the series' modal calendar month in the nearest future year so that
    # a stock with a rock-steady May ex-div doesn't suddenly jump to December.
    if (proj_date - TODAY_DT).days > use_interval:
        modal_month = int(sid_divs["Date"].dt.month.mode().iloc[0])
        modal_day   = int(round(sid_divs["Date"].dt.day.mean()))
        modal_day   = min(modal_day, 28)  # safe for all months
        snapped = None
        for yr in range(TODAY_DT.year, TODAY_DT.year + 3):
            try:
                candidate = datetime(yr, modal_month, modal_day)
            except ValueError:
                candidate = datetime(yr, modal_month, 28)
            if candidate > TODAY_DT:
                snapped = candidate
                break
        if snapped is not None:
            proj_date = snapped
            print(f"  INFO [{sid}]: overshoot guard snapped proj_date to modal month "
                  f"{modal_month:02d}-{modal_day:02d} → {proj_date.date()}")

    proj_exdiv_date = proj_date.strftime("%Y-%m-%d")

    # Hybrid forward anchor:
    # 1. Anchor price level from the most recent completed ex-div event in chronology.
    # 2. Dip/zone shape from the target series' own recent clean history.
    previous_exdiv_candidates = [
        c for c in CYCLES
        if not c["degen"]
        and c.get("prev_dp") is not None
        and c.get("exdiv_date")
        and c["exdiv_date"] <= TODAY
        and c["exdiv_date"] < proj_exdiv_date
    ]
    previous_exdiv_cycle = max(
        previous_exdiv_candidates,
        key=lambda c: c["exdiv_date"]
    ) if previous_exdiv_candidates else None
    if previous_exdiv_cycle is not None:
        series_anchor_price = float(previous_exdiv_cycle["prev_dp"])
        anchor_div_amount   = float(previous_exdiv_cycle["div_amt"])
        anchor_source = "previous_exdiv_prev_dp"
    else:
        # No clean regular cycle found — fall back to current price as anchor
        series_anchor_price = float(current_price)
        anchor_div_amount   = 0.0
        anchor_source = "current_price_fallback"

    # If a special/excluded dividend occurred more recently than the last regular cycle,
    # use its prev_dp as anchor — the price has already adjusted for that ex-div event.
    last_regular_date = previous_exdiv_cycle["exdiv_date"] if previous_exdiv_cycle else ""
    special_anchor_candidates = [
        a for a in anomalies_excluded
        if a.get("date")
        and a["date"] > last_regular_date
        and a["date"] <= TODAY
        and a["date"] < proj_exdiv_date
    ]
    if special_anchor_candidates:
        most_recent_special = max(special_anchor_candidates, key=lambda a: a["date"])
        special_dt = datetime.strptime(most_recent_special["date"], "%Y-%m-%d")
        special_prev_dp, _ = prev_dp_at(special_dt)
        if special_prev_dp is not None:
            series_anchor_price = float(special_prev_dp)
            anchor_div_amount   = float(most_recent_special.get("amount", 0.0))
            anchor_source = "special_exdiv_prev_dp"
            print(f"  INFO [{sid}]: anchor updated by special div on {most_recent_special['date']} "
                  f"-> prev_dp={series_anchor_price}")

    # Zone calculation uses ex-div adjusted price (anchor minus the dividend already paid out).
    # The anchor itself is kept at prev_dp for display; zone_anchor reflects where the stock
    # actually resets to after the payout — the correct base for projecting the next dip.
    zone_anchor_price = series_anchor_price - anchor_div_amount

    zone_cycles = clean_s[-RECENT_ZONE_LOOKBACK:] if len(clean_s) >= RECENT_ZONE_LOOKBACK else clean_s
    lvp_vals = [c["low_vs_prevdp"] for c in zone_cycles]
    lvp_vals_zone = winsorize_values(lvp_vals, 5, 95)
    p_lo, p_hi = percentile_pcts(n_eff)
    if p_lo == 0:
        bot_pct = min(lvp_vals_zone) if lvp_vals_zone else -5.0
        top_pct = max(lvp_vals_zone) if lvp_vals_zone else 0.0
    else:
        bot_pct = float(np.percentile(lvp_vals_zone, p_lo))
        top_pct = float(np.percentile(lvp_vals_zone, p_hi))

    zone_bot = round(zone_anchor_price * (1 + bot_pct/100), 4)
    zone_top = round(zone_anchor_price * (1 + top_pct/100), 4)

    zone_degradation_adjusted = False
    zone_degradation_widen_pct = 0.0

    if stab_verdict == "DEGRADING":
        width = zone_top - zone_bot
        zone_degradation_widen_pct = 0.10
        zone_bot = round(zone_bot - width * zone_degradation_widen_pct, 4)
        zone_top = round(zone_top + width * zone_degradation_widen_pct, 4)
        zone_degradation_adjusted = True

    med_lvp  = ss["clean"]["low_vs_prevdp"]["med"]
    med_peak = ss["clean"]["peak_vs_prevdp"]["med"]
    est_low_px   = round(zone_anchor_price * (1 + med_lvp/100), 4)
    est_exdiv_px = round(zone_anchor_price, 4)
    est_peak_px  = round(zone_anchor_price * (1 + med_peak/100), 4) if med_peak > 0 else est_exdiv_px

    if   current_price < zone_bot: entry_status = "BELOW"
    elif current_price > zone_top: entry_status = "ABOVE"
    else:                           entry_status = "INSIDE"
    current_price_vs_zone = round((current_price / zone_bot - 1) * 100, 4)

    med_wks = ss["timing"]["med"]
    if entry_timing_reliable:
        est_low_dt   = proj_date - timedelta(days=round(med_wks * 7))
        est_low_date = est_low_dt.strftime("%Y-%m-%d")
        est_low_date_note = f"Estimated from median {med_wks:.1f}wk before projected ex-div"
        est_low_date_cluster1 = None
        est_low_date_cluster2 = None
        est_low_date_cluster1_from = None
        est_low_date_cluster1_to   = None
        est_low_date_cluster2_from = None
        est_low_date_cluster2_to   = None
        est_watch_window_note = None
        est_watch_window_primary_note = None
    elif timing_rating == "BIMODAL":
        est_low_date = None
        c1_wks    = ss["timing"].get("bimodal_clust1_med_wks")
        c2_wks    = ss["timing"].get("bimodal_clust2_med_wks")
        c1_sd_wks = ss["timing"].get("bimodal_clust1_sd_wks") or 0.0
        c2_sd_wks = ss["timing"].get("bimodal_clust2_sd_wks") or 0.0
        primary_cluster = ss["timing"].get("bimodal_primary_cluster")
        recent_counts = ss["timing"].get("bimodal_cluster_recent_counts") or {"early": 0, "late": 0}
        # FIX: guard against None or non-finite cluster medians
        if (c1_wks is not None and c2_wks is not None
                and math.isfinite(c1_wks) and math.isfinite(c2_wks)):
            dt_early = (proj_date - timedelta(days=round(c2_wks * 7))).strftime("%Y-%m-%d")
            dt_late  = (proj_date - timedelta(days=round(c1_wks * 7))).strftime("%Y-%m-%d")
            est_low_date_cluster1 = dt_early
            est_low_date_cluster2 = dt_late
            # Range = median \u00b1 1 SD (population SD, ddof=0), shown only when SD \u2264 2 weeks.
            # from = median + SD (more weeks before ex-div = earlier calendar date)
            # to   = median - SD (fewer weeks before ex-div = later calendar date), floor at 0
            _SD_RANGE_THRESHOLD = 2.0
            if c2_sd_wks <= _SD_RANGE_THRESHOLD:
                est_low_date_cluster1_from = (proj_date - timedelta(days=round((c2_wks + c2_sd_wks) * 7))).strftime("%Y-%m-%d")
                est_low_date_cluster1_to   = (proj_date - timedelta(days=round(max(0, c2_wks - c2_sd_wks) * 7))).strftime("%Y-%m-%d")
            else:
                est_low_date_cluster1_from = None
                est_low_date_cluster1_to   = None
            if c1_sd_wks <= _SD_RANGE_THRESHOLD:
                est_low_date_cluster2_from = (proj_date - timedelta(days=round((c1_wks + c1_sd_wks) * 7))).strftime("%Y-%m-%d")
                est_low_date_cluster2_to   = (proj_date - timedelta(days=round(max(0, c1_wks - c1_sd_wks) * 7))).strftime("%Y-%m-%d")
            else:
                est_low_date_cluster2_from = None
                est_low_date_cluster2_to   = None
            from datetime import datetime as _dt
            def _short(ds):
                d = _dt.strptime(ds, "%Y-%m-%d")
                return f"{d.strftime('%b')} {d.day}"
            def _short_range(from_ds, center_ds, to_ds):
                if from_ds is None or to_ds is None:
                    return f"~{_short(center_ds)}"
                if from_ds == to_ds:
                    return f"~{_short(center_ds)}"
                return f"{_short(from_ds)} \u2013 {_short(to_ds)} (best: {_short(center_ds)})"
            est_low_date_note = (
                f"Bimodal - two timing clusters: "
                f"early dip {_short_range(est_low_date_cluster1_from, dt_early, est_low_date_cluster1_to)} ({c2_wks:.1f}wk before) "
                f"or late dip {_short_range(est_low_date_cluster2_from, dt_late, est_low_date_cluster2_to)} ({c1_wks:.1f}wk before). "
                f"Set limit order in zone and monitor across the full window."
            )
            est_watch_window_note = (
                f"Cluster 1: {_short_range(est_low_date_cluster1_from, dt_early, est_low_date_cluster1_to)} "
                f"\u00b7 Cluster 2: {_short_range(est_low_date_cluster2_from, dt_late, est_low_date_cluster2_to)}"
            )
            if primary_cluster == "EARLY":
                est_watch_window_primary_note = f"Primary cluster: Early ({recent_counts.get('early',0)} of last 3 clean cycles)"
            elif primary_cluster == "LATE":
                est_watch_window_primary_note = f"Primary cluster: Late ({recent_counts.get('late',0)} of last 3 clean cycles)"
            else:
                est_watch_window_primary_note = None
        else:
            est_low_date_cluster1      = None
            est_low_date_cluster2      = None
            est_low_date_cluster1_from = None
            est_low_date_cluster1_to   = None
            est_low_date_cluster2_from = None
            est_low_date_cluster2_to   = None
            est_low_date_note          = "Timing bimodal - monitor the zone continuously"
            est_watch_window_note      = "Bimodal - monitor zone"
            est_watch_window_primary_note = None
    else:
        est_low_date               = None
        est_low_date_cluster1      = None
        est_low_date_cluster2      = None
        est_low_date_cluster1_from = None
        est_low_date_cluster1_to   = None
        est_low_date_cluster2_from = None
        est_low_date_cluster2_to   = None
        est_low_date_note          = "Timing unreliable - monitor the zone continuously, with no specific date target"
        est_watch_window_note      = None
        est_watch_window_primary_note = None

    est_peak_date = None

    last4 = list(sid_divs.tail(4)["div_amt"])
    med_div_amt = round(float(np.median(last4)), 4) if last4 else 0
    last3 = list(sid_divs.tail(3)["div_amt"])
    if len(last3) >= 3:
        if last3[0] < last3[1] < last3[2]:   div_trend = "RISING"
        elif last3[0] > last3[1] > last3[2]: div_trend = "DECLINING"
        else:                                  div_trend = "STABLE"
    else:
        div_trend = "STABLE"

    if div_trend == "RISING":
        div_amt_lo = round(med_div_amt * 0.95, 4)
        div_amt_hi = round(med_div_amt * 1.10, 4)
    elif div_trend == "DECLINING":
        div_amt_lo = round(med_div_amt * 0.90, 4)
        div_amt_hi = round(med_div_amt * 1.05, 4)
    else:
        div_amt_lo = round(med_div_amt * 0.95, 4)
        div_amt_hi = round(med_div_amt * 1.05, 4)

    div_yield_lo = round(div_amt_lo / zone_top  * 100, 4) if zone_top  > 0 else 0
    div_yield_hi = round(div_amt_hi / zone_bot  * 100, 4) if zone_bot  > 0 else 0

    all_prevdps = [c["prev_dp"] for c in CYCLES if c["series"]==sid]
    med_prevdp  = float(np.median(all_prevdps)) if all_prevdps else series_anchor_price
    if   series_anchor_price > 1.75 * med_prevdp: anchor_extreme_flag = "HIGH"
    elif series_anchor_price < 0.60 * med_prevdp: anchor_extreme_flag = "LOW"
    else:                                   anchor_extreme_flag = "NORMAL"

    zone_hits = []
    all_clean_sorted = sorted(clean_s, key=lambda c: c["exdiv_date"])
    for ci, cyc in enumerate(all_clean_sorted):
        preceding = all_clean_sorted[:ci]
        if len(preceding) < 3:
            cyc["zone_hit"] = None
            continue
        preceding_zone_cycles = preceding[-RECENT_ZONE_LOOKBACK:] if len(preceding) >= RECENT_ZONE_LOOKBACK else preceding
        prec_lvp = [p["low_vs_prevdp"] for p in preceding_zone_cycles]
        prec_lvp_zone = winsorize_values(prec_lvp, 5, 95)
        prec_n   = SS_SERIES[sid]["clean"]["n_effective"]
        pp_lo, pp_hi = percentile_pcts(min(len(prec_lvp), prec_n))
        if pp_lo == 0:
            h_bot_pct = min(prec_lvp_zone) if prec_lvp_zone else -5.0
            h_top_pct = max(prec_lvp_zone) if prec_lvp_zone else 0.0
        else:
            h_bot_pct = float(np.percentile(prec_lvp_zone, pp_lo))
            h_top_pct = float(np.percentile(prec_lvp_zone, pp_hi))
        prior_exdiv_for_cycle = [
            c for c in CYCLES
            if not c["degen"]
            and c.get("prev_dp") is not None
            and c.get("exdiv_date")
            and c["exdiv_date"] < cyc["exdiv_date"]
        ]
        if prior_exdiv_for_cycle:
            prec_cyc    = max(prior_exdiv_for_cycle, key=lambda c: c["exdiv_date"])
            prec_anchor = float(prec_cyc["prev_dp"]) - float(prec_cyc.get("div_amt", 0.0))
        else:
            prec_anchor = float(preceding[-1]["prev_dp"]) - float(preceding[-1].get("div_amt", 0.0))
        h_bot = prec_anchor * (1 + h_bot_pct/100)
        h_top = prec_anchor * (1 + h_top_pct/100)
        hit = h_bot <= cyc["low_px"] <= h_top
        cyc["zone_hit"] = hit
        zone_hits.append(hit)

    entry_zone_hit_rate = round(sum(zone_hits)/len(zone_hits)*100, 1) if zone_hits else 0.0

    full_s = [c for c in CYCLES if c["series"]==sid and not c["degen"]]
    full_lvp = sorted([c["low_vs_prevdp"] for c in full_s])
    worst_drawdown = min(full_lvp) if full_lvp else 0
    if len(full_lvp) >= 5:
        worst_tail_avg = float(np.mean(full_lvp[:5]))
    elif len(full_lvp) >= 3:
        worst_tail_avg = float(np.mean(full_lvp[:3]))
    else:
        worst_tail_avg = worst_drawdown
    tail_vs_zone   = round(worst_drawdown - bot_pct, 4)
    tail_warning   = tail_vs_zone < -3.0
    worst_drawdown_abs = abs(worst_drawdown)
    worst_tail_avg_abs = abs(worst_tail_avg)

    # Keep the worst cycle visible, but do not let one crisis-like outlier
    # dominate the qualitative severity label by itself. The level should
    # reflect both the zone gap and the broader downside profile.
    if tail_vs_zone <= -8.0 and worst_tail_avg <= -12.0:
        tail_level = "SEVERE"
    elif tail_vs_zone <= -5.0 and worst_tail_avg <= -9.0:
        tail_level = "HIGH"
    elif tail_warning:
        tail_level = "CAUTION"
    elif worst_tail_avg_abs >= 10.0:
        tail_level = "CAUTION"
    elif worst_tail_avg_abs >= 6.0 or worst_drawdown_abs >= 12.0:
        tail_level = "MODERATE"
    else:
        tail_level = "LOW"

    pct_outside_clean = round(100 - entry_zone_hit_rate, 1)
    full_hits = sum(1 for c in full_s if c["low_px"] < zone_bot or c["low_px"] > zone_top)
    pct_outside_full  = round(full_hits / len(full_s) * 100, 1) if full_s else 0
    fragility_warning = pct_outside_clean > 30

    hold_days = [c["recovery_time_days"] for c in clean_s if c["recovery_time_days"] is not None]
    wins  = [c for c in clean_s if c["success"]]
    losses= [c for c in clean_s if not c["success"]]

    exit_hits = sum(1 for c in clean_s
                    if c["peak_px"] is not None and c["low_px"] > 0
                    and (c["peak_px"] - c["low_px"]*1.02) / (c["low_px"]*1.02) * 100 > 3)

    PROJ_SERIES[sid] = {
        "proj_exdiv_date": proj_exdiv_date,
        "anchor": round(series_anchor_price, 4),
        "anchor_source": anchor_source,
        "zone_bot": zone_bot,
        "zone_top": zone_top,
        "zone_degradation_adjusted": zone_degradation_adjusted,
        "zone_degradation_widen_pct": round(zone_degradation_widen_pct * 100, 2),
        "est_low_px": est_low_px,
        "est_exdiv_px": est_exdiv_px,
        "est_peak_px": est_peak_px,
        "est_low_date": est_low_date,
        "est_low_date_cluster1": est_low_date_cluster1,
        "est_low_date_cluster1_from": est_low_date_cluster1_from,
        "est_low_date_cluster1_to": est_low_date_cluster1_to,
        "est_low_date_cluster2": est_low_date_cluster2,
        "est_low_date_cluster2_from": est_low_date_cluster2_from,
        "est_low_date_cluster2_to": est_low_date_cluster2_to,
        "est_low_date_note": est_low_date_note,
        "est_watch_window_note": est_watch_window_note if timing_rating=="BIMODAL" else None,
        "est_watch_window_primary_note": est_watch_window_primary_note if timing_rating=="BIMODAL" else None,
        "est_peak_date": est_peak_date,
        "current_price_vs_zone": current_price_vs_zone,
        "entry_status": entry_status,
        "entry_status_display": human_label(entry_status),
        "timing_rating": timing_rating,
        "timing_rating_display": human_label(timing_rating),
        "sample_size": sample_size,
        "sample_size_display": human_label(sample_size),
        "price_zone_consistent": price_zone_consistent,
        "entry_timing_reliable": entry_timing_reliable,
        "stability_verdict": stab_verdict,
        "stability_verdict_display": human_label(stab_verdict),
        "med_div_amt": med_div_amt,
        "div_amt_announced": False,
        "div_amt_note": "Projected from the last 4 clean same-series payments",
        "div_trend": div_trend,
        "div_trend_display": human_label(div_trend),
        "div_amt_lo": div_amt_lo,
        "div_amt_hi": div_amt_hi,
        "div_yield_lo": div_yield_lo,
        "div_yield_hi": div_yield_hi,
        "anchor_extreme_flag": anchor_extreme_flag,
        "historical_frequencies": {
            "entry_zone_hit_rate": entry_zone_hit_rate,
            "exit_target_hit_rate": round(exit_hits/len(clean_s)*100,1) if clean_s else 0,
            "avg_hold_days": round(safe_mean(hold_days),1),
            "win_rate": round(win_rate_pct,1),
            "win_rate_all": round(win_rate_all_pct,1),
            "avg_win_pct":  round(safe_mean([c["rebound"] for c in wins]),4),
            "avg_loss_pct": round(safe_mean([abs(c["low_vs_prevdp"]) for c in losses]),4),
        },
        "scenarios": {
            "base": {
                "description": "Filled around the middle of the projected entry zone",
                "entry_px": round((zone_bot + zone_top) / 2.0, 4),
                "exit_px": est_exdiv_px,
                "expected_hold_days": round(safe_median(hold_days)),
                "historical_frequency": "mid-zone fill",
            },
            "downside": {
                "description": "Filled near the top of the projected entry zone",
                "entry_px": zone_top,
                "exit_px": est_exdiv_px,
                "expected_hold_days": round(float(np.percentile(hold_days, 75))) if hold_days else 0,
                "historical_frequency": "higher fill",
            },
            "upside": {
                "description": "Filled near the bottom of the projected entry zone",
                "entry_px": zone_bot,
                "exit_px": est_exdiv_px,
                "expected_hold_days": round(float(np.percentile(hold_days, 25))) if hold_days else 0,
                "historical_frequency": "lower fill",
            },
        },
        "risk_metrics": {
            "max_expected_drawdown": round(worst_drawdown,4),
            "expected_recovery_days": round(safe_mean(hold_days),1),
            "liquidity_adequate": SS_SERIES[sid]["liquidity"]["adequacy_pct"] >= 80,
            "gap_risk": worst_drawdown < -15 and SS_SERIES[sid]["liquidity"]["avg_volume_30d"] < min_vol,
            "success_rate_historical": round(win_rate_pct,1),
            "success_rate_all_historical": round(win_rate_all_pct,1),
        },
        "tail_risk": {
            "worst_drawdown_pct": round(worst_drawdown,4),
            "worst_tail_avg": round(worst_tail_avg,4),
            "tail_vs_zone_gap": tail_vs_zone,
            "tail_warning": tail_warning,
            "tail_level": tail_level,
            "tail_level_display": human_label(tail_level),
        },
        "zone_fragility": {
            "pct_cycles_outside_zone_clean": pct_outside_clean,
            "pct_cycles_outside_zone_full":  pct_outside_full,
            "fragility_warning": fragility_warning,
        },
        "macro_context": {
            "current_regime": None,
            "sector_etf": None,
            "sector_performance": "IN_LINE",
            "interest_rate_trend": "STABLE",
            "last_update": TODAY
        },
    }

# ── STEP 5: DATA QUALITY METADATA ────────────────────────────
data_window_start = price_rows.iloc[0]["Date"].strftime("%Y-%m-%d")
data_window_end   = price_rows.iloc[-1]["Date"].strftime("%Y-%m-%d")
years_covered = round((price_rows.iloc[-1]["Date"] - price_rows.iloc[0]["Date"]).days / 365.25, 2)

if len(clean_divs) < 3:
    EDGE_CASE_FLAGS.append("SPARSE_HISTORY")
last_div_dt = clean_divs.iloc[-1]["Date"]
if (TODAY_DT - last_div_dt).days > 730:
    EDGE_CASE_FLAGS.append("LAPSED_DIVIDEND")
if years_covered < 2:
    EDGE_CASE_FLAGS.append("SHORT_HISTORY")

series_adequacy = {}
for sid in series_ids:
    ss = SS_SERIES[sid]
    series_adequacy[sid] = {
        "n_clean": ss["clean"]["n_clean"],
        "n_effective": ss["clean"]["n_effective"],
        "sample_size": PROJ_SERIES[sid]["sample_size"],
        "can_project": ss["clean"]["n_clean"] >= 3,
    }

anomaly_dates = {a["date"] for a in anomalies_excluded}
annual_payouts = []
for yr, grp in clean_divs.groupby(clean_divs["Date"].dt.year):
    if len(grp) == 0:
        continue
    expected_series = set(series_ids)
    paid_series = set(grp["series"].unique())
    is_partial = (
        int(yr) == TODAY_DT.year or
        (expected_series - paid_series) != set()
    )
    annual_payouts.append({
        "yr": int(yr),
        "count": len(grp),
        "total": round(grp["div_amt"].sum(), 4),
        "series": sorted(paid_series),
        "partial": is_partial,
        "note": ""
    })

DIVS = []
for _, row in clean_divs.iterrows():
    DIVS.append({
        "id": f"{row['series']}_{row['Date'].year}",
        "series": row["series"],
        "date": row["Date"].strftime("%Y-%m-%d"),
        "amount": round(row["div_amt"], 4),
        "note": "Dividend"
    })

PRICE_DATA = [
    {"d": r["Date"].strftime("%Y-%m-%d"), "c": round(r["Close"], 4)}
    for _, r in price_rows.iterrows()
]

# ── ASSEMBLE OUTPUT ──────────────────────────────────────────
output = {
    "meta": {
        "stock_name": STOCK_NAME,
        "ticker": TICKER,
        "currency": CURRENCY,
        "exchange": EXCHANGE,
        "today": TODAY,
        "frequency": frequency,
        "frequency_display": human_label(frequency),
        "adaptive_window_days": adaptive_window,
        "mean_interval_days": round(float(mean_interval), 1),
        "vol_threshold": min_vol,
        "vol_threshold_source": vol_threshold_source,
    },
    "parse_preflight": parse_preflight,
    "edge_case_flags": EDGE_CASE_FLAGS,
    "edge_case_flags_display": [human_label(x) for x in EDGE_CASE_FLAGS],
    "series_meta": SERIES_META,
    "cycles": CYCLES,
    "ss_series": SS_SERIES,
    "cgc_ranking": CGC_RANKING,
    "proj_series": PROJ_SERIES,
    "annual_payouts": annual_payouts,
    "divs": DIVS,
    "price_data": PRICE_DATA,
    "current_price": round(float(current_price), 4),
    "anchor_price": round(float(anchor_price), 4),
    "anchor_date": anchor_date.strftime("%Y-%m-%d"),
    "data_window_start": data_window_start,
    "data_window_end": data_window_end,
    "years_covered": years_covered,
    "series_adequacy": series_adequacy,
    "anomalies_excluded": anomalies_excluded,
}

out_file = f"./json/{TICKER}_DividendCycleAnalysis_output.json"
with open(out_file, "w") as f:
    json.dump(output, f, indent=2, default=str)

print(f"\nDividend Cycle Analysis complete. Output written to: {out_file}")
print(f"Stock: {STOCK_NAME} ({TICKER})")
print(f"Frequency: {human_label(frequency)} | Series: {', '.join(series_ids)} | Cycles: {len(CYCLES)}")
print(f"Edge case flags: {EDGE_CASE_FLAGS or 'none'}")
print(f"\nNext step: load {out_file} into the dashboard or downstream analysis flow.")
