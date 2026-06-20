# Dividend Cycle Analysis - Calculation Rundown

This document explains the live logic in `analyze-stock.py`. It is written to match the current code path rather than older legacy wording.

It also serves as the single combined strategy-and-calculation reference for the dashboard. The older separate strategy rundown is no longer needed; this file is the one place to check both the high-level framework and the detailed rule logic.

## Strategy overview

The dashboard is designed to turn historical dividend-cycle behaviour into a structured decision workflow.

The goal is not to predict price perfectly.

The goal is to answer, in a disciplined way:

1. Does this stock have a historically repeatable dividend-cycle pattern?
2. If yes, where is the expected buy zone for the next cycle?
3. Is the current price actually in a usable position?
4. Are there risk overrides that should reduce conviction?
5. If the trade works, which exit path has historically looked stronger?

The framework separates the process into three layers:

1. Structural quality
   - is the pattern historically repeatable?
2. Current opportunity
   - is price currently in the right place for that pattern?
3. Execution choice
   - if the setup is valid, what historically worked better as an exit?

That is why a stock can be structurally strong but still not actionable right now.

It is also why `Potential Score`, `Current Verdict`, and planner `Execution State` are intentionally different:
- `Potential Score` is the structural ranking layer
- `Current Verdict` is the live action-oriented interpretation layer
- `Execution State` is the planner's narrower execution-readiness summary

At a high level, the live dashboard flow is:

1. Load Dividend Cycle Analysis JSON.
2. Normalize stock-level and series-level fields.
3. Identify the next projected series.
4. Build the forward zone for that projected series.
5. Evaluate entry status, timing, sample quality, tail risk, fragility, stability trend, and exit history.
6. Render grouped cards, comparison views, drill-in detail, and planner outputs.

## What this script does

Dividend Cycle Analysis is the calculation engine behind the dashboard. It reads a stock's weekly price history plus dividend rows, measures how the stock behaved around each historical ex-dividend event, then projects the next setup for each series.

It does not decide the final action verdict by itself. The Python script calculates the historical pattern and forward setup. The dashboard then turns that into user-facing interpretation such as `Current Verdict`.

There is also a small metadata layer around the dashboard that comes from the master stock list rather than the analysis engine itself. Fields such as `asset type`, `sector`, and `market index` status are used for filtering, stock-list management, and quiet UI context. They do not change the analysis math in `analyze-stock.py`.

The script runs in five broad stages:
1. Parse and validate the CSV.
2. Clean dividend rows, detect payment frequency, and assign series.
3. Build cycle-level history and series-level statistics.
4. Project the next setup for each series.
5. Package everything into one JSON output.

## Inputs and output

Inputs:
- Weekly stock price CSV with price rows and dividend notes.
- Weekly index CSV for market-context checks.
- User config such as ticker, currency, exchange, and optional date override.

Output:
- One JSON file named `[TICKER]_DividendCycleAnalysis_output.json`

Important config knobs:
- `TODAY_OVERRIDE`
- `FORCE_WINDOW_DAYS`
- `ANCHOR_MEDIAN_LOOKBACK`
- `RECENT_ZONE_LOOKBACK`

`TODAY_OVERRIDE` is optional. If left as `None`, the script uses `date.today().isoformat()`.

## CSV extraction and source-data workflow

Before `analyze-stock.py` can do any cycle analysis, the project first needs price-and-dividend CSV data in the expected layout.

There are two main paths:

1. scripted extraction from Yahoo Finance
2. manual extraction from screenshots or PDFs into the same CSV structure

### Expected CSV shape

The live analysis expects rows with these exact columns:

- `Date`
- `Open`
- `High`
- `Low`
- `Close`
- `Adj Close`
- `Volume`
- `Notes`

Normal price rows fill the market-data columns and leave `Notes` blank.

Dividend rows do the opposite:
- `Date` is filled
- `Open` through `Volume` stay blank
- `Notes` contains the dividend text, for example `0.0125 Dividend`

This is why the extraction layer is important: it standardizes all source data into one combined price-plus-dividend CSV format before the analysis engine reads it.

### Scripted extraction

The project currently includes:

- `extract-weekly.py`
- `extract-daily.py`

Both scripts:
- read `STOCK_UNIVERSE` from `stock_registry.py`
- download price history and dividend history from Yahoo Finance using `yfinance`
- merge price rows and dividend rows into one CSV
- save the result into the `data` folder using the stock-name-based file path

#### Weekly extraction

`extract-weekly.py`:
- requests `10y` of history at `1wk` interval
- shifts weekly dates by `+4 days`
- writes output to:
  - `data/<stock_name>_weekly_historical_price.csv`

That date shift is there so the weekly bar lands closer to the end-of-week date used in the exported CSV.

#### Daily extraction

`extract-daily.py`:
- requests `10y` of history at `1d` interval
- does not apply the weekly date shift
- writes output to:
  - `data/<stock_name>_daily_historical_price.csv`

In both scripts:
- dates are formatted as `d Mon YYYY`
- price columns are formatted to `4` decimal places
- volume is written as an integer string
- dividend rows are inserted as blank market-data rows with `Notes = "<amount> Dividend"`

### Manual ExtractToCSV workflow

There is also a manual extraction prompt pattern for cases where data is coming from screenshots or PDFs rather than directly from Yahoo Finance.

The core instruction is:

- extract every row from every page
- preserve the exact row order and date text
- use the exact CSV columns:
  - `Date, Open, High, Low, Close, Adj Close, Volume, Notes`
- treat dividend rows as note-only rows
- output only raw CSV text

In practical terms, the manual extraction rules are:

- price rows
  - fill all seven market-data columns normally
  - leave `Notes` empty
- dividend rows
  - put the date in `Date`
  - leave `Open` through `Volume` blank
  - put the dividend text into `Notes`

So the manual prompt and the scripted extractors are solving the same problem:
- convert source data into one normalized CSV format that the analysis engine can consume without special-case parsing later

## Core definitions

These are the main terms used throughout the script:

- `PrevDP`
  - The reference price for each cycle.
  - It is the last closing price on or before the ex-div date.

- `Series`
  - A recurring slot in the dividend schedule such as `Q1`, `Q2`, `S1`, or `S2`.

- `Clean cycle`
  - A cycle that is not filtered out as macro, outlier, or degenerate.

- `Degenerate cycle`
  - A cycle where `wks_before <= 1`.
  - These are excluded from the main pattern statistics.

- `Success`
  - A cycle is a success if the dip offered more than 3% rebound back to the PrevDP anchor:
  - `success = ((prev_dp - low_px) / low_px * 100) > 3.0`

- `Pre-Exdiv Peak Exit`
  - The highest close reached after the cycle low but before the ex-div date.

- `Ex-Div Date Exit`
  - The first available close on or after the ex-div date.

## Stage 0 - Parse and validation

The script starts by validating that the input file is usable.

Checks:
- Required columns must exist:
  - `Date`
  - `Close`
  - `Volume`
- `Notes` is created if missing.
- Dates are parsed using several formats, then sorted.
- `Close` is coerced to numeric.
- `Volume` is coerced to numeric and missing values become `0`.
- Future weekly price rows with no settled `Close` yet are dropped if their date is after `TODAY`.

Hard-stop checks:
- Unparseable `Close` values after numeric coercion.
- Zero or negative `Close` values.
- Zero or negative dividend amounts.
- Missing required columns.
- Too few clean dividends after dividend filtering.

Warning-level checks:
- Large price continuity gaps.
- Too many zero-volume rows. The analysis continues, but the series is flagged for thin-trading history.

Duplicate-date check:
- If the same date appears more than once, it must be exactly one price row plus one dividend row.

## Stage 1 - Dividend cleaning, frequency detection, and series assignment

### 1. Extract dividend amounts

The script reads dividend amounts from `Notes` using regex. If no amount can be parsed and `AdjClose` exists, it can fall back there.

### 2. Remove unusual dividends

Not every dividend-looking row is treated as a normal recurring payout.

A dividend is filtered out if any of these are true:
- It arrived less than 45 days after the previous dividend.
- Its amount is below 40% of the baseline dividend amount.
- Its amount is above 2.5x the baseline dividend amount.

The baseline is:
- the median of the last 6 prior raw dividends when at least 4 are available
- otherwise the full-history raw dividend median

This makes the special-dividend filter more adaptive to genuine payout regime changes in mature names.

This is meant to remove:
- Stub payments
- Specials
- Odd one-off distributions

### 3. Detect payment frequency

The script uses the mean interval between clean dividends:

- 25-35 days -> `MONTHLY`
- 80-105 days -> `QUARTERLY`
- 160-210 days -> `SEMI-ANNUAL`
- 330-400 days -> `ANNUAL`
- Anything else -> `IRREGULAR`

Default lookback windows:
- Monthly -> 45 days
- Quarterly -> 91 days
- Semi-Annual -> 152 days
- Annual -> 182 days
- Irregular -> 152 days

If `FORCE_WINDOW_DAYS` is set, that overrides the default window.

### 4. Assign series labels

Series are assigned by schedule type:

- Quarterly:
  - `Q1`, `Q2`, `Q3`, `Q4`
- Semi-Annual:
  - `S1`, `S2`
  - The split is inferred from the largest gap between unique ex-div months.
- Monthly:
  - `M01` to `M12`
- Annual and Irregular:
  - `S1`

If only one unique series exists, the script raises the `SINGLE_SERIES` edge-case flag.

## Stage 2 - Build cycle-level history

Each clean dividend becomes one cycle candidate.

For each ex-div date:
- `before_start = exdiv_date - adaptive_window`
- `before_end = exdiv_date - 1 day`
- `after_end = exdiv_date + adaptive_window`

The script then creates:
- `before_data`
- `after_data`

Cycles with fewer than 3 rows in `before_data` are skipped.

Cycle status:
- `COMPLETE`
  - `after_data` has at least 3 rows and the full forward window is already in the past.
- `PARTIAL`
  - enough pre-window data exists, but the full forward window is not yet complete.

`incomplete = True` for anything that is not `COMPLETE`.

### Cycle metrics

For each cycle the script calculates:

- `prev_dp`
  - Last close on or before the ex-div date.

- `low_px`, `low_date`
  - Lowest close in `before_data`.

- `peak_px`, `peak_date`
  - Highest close in `before_data`.

- `low_vs_prevdp`
  - `(low_px - prev_dp) / prev_dp * 100`

- `peak_vs_prevdp`
  - `(peak_px - prev_dp) / prev_dp * 100`

- `rebound`
  - `(prev_dp - low_px) / low_px * 100`
  - This is the actual rebound available from the low back to the anchor.

- `wks_before`
  - `(exdiv_date - low_date).days / 7`

- `wks_to_peak`
  - `(peak_date - low_date).days / 7`
  - Only populated for complete cycles.

- `div_yield`
  - `div_amt / prev_dp * 100`

- `s1`
  - Dividend amount relative to dip depth.

- `s2`
  - Alias of `peak_vs_prevdp`

- `success`
  - `True` only if the rebound from the low back to PrevDP is more than 3%.

- `degen`
  - `True` when `wks_before <= 1`

- `volume_entry_ratio`
- `volume_trend`
- `max_drawdown_pre_exdiv`
- `recovery_time_days`

### Exit analysis

For complete cycles, the script adds an `exit_analysis` block.

It calculates three exit references:

1. `Optimal`
- Highest close after the cycle low anywhere in the bounded full cycle window.
- This is hindsight-only and used as a reference.

2. `Pre-Exdiv Peak Exit`
- Highest close after the low but still before ex-div.
- This is the bounded pre-exdiv peak reference.

3. `Ex-Div Date Exit`
- First available close on or after the ex-div date.

Stored fields include:
- exit prices
- exit dates
- gains from the low
- whether the hindsight-optimal exit happened before ex-div
- how many days before ex-div the pre-exdiv peak occurred

## Stage 2B - Outlier and macro filters

These filters run after raw cycles are built.

### Adaptive outlier flag

Outliers are judged per series using `low_vs_prevdp`.

Sigma threshold:
- `2.5` standard deviations if the series has fewer than 15 usable cycles
- `3.0` standard deviations otherwise

### Macro flag

A cycle is marked `macro` if all of these are true:
- Its `low_vs_prevdp` is far below the series median:
  - `low_vs_prevdp < median_lvp_full - 2 * lvp_std`
- Stock excess return is below `-3%`
- Market index return is `<= -5%`

The clean set used later excludes:
- `macro`
- `outlier`
- `degen`

## Stage 3 - Series-level statistics

Each series gets its own statistics block in `SS_SERIES`.

### Full vs clean

The script keeps both:
- `full`
- `clean`

`full` is broader descriptive history.
`clean` is the filtered set used for most forward logic.

### Timing rating

Timing is based on clean `wks_before`.

The script computes:
- average
- median
- standard deviation
- spread
- coefficient of variation

Timing verdict:
- `RELIABLE`
  - `wks_cv <= 15`
  - and `wks_spread <= max(3, 0.3 * wks_avg)`
- `BIMODAL`
  - not reliable, and the largest gap in sorted timing values is greater than 5 weeks
- `UNRELIABLE`
  - otherwise

### Bimodal clusters

When timing is bimodal:
- clean timings are split at the largest gap
- lower `wks_before` values are the `late` cluster
- higher `wks_before` values are the `early` cluster

The script records:
- median weeks for each cluster
- counts of how the last 3 clean cycles fell into `early` vs `late`
- `bimodal_primary_cluster`
  - `EARLY` if at least 2 of the last 3 clean cycles were in the early cluster
  - `LATE` if at least 2 of the last 3 were in the late cluster

### Price-zone consistency

`price_zone_consistent` is true only if all of these pass:
- median dip is below `-3%`
- win rate is at least `60%`
- dip-depth CV is below `60`

### Recent timing epoch note

The script also looks at the last 3 clean cycles as a short recency check.

If:
- recent timing CV <= 20
- and recent timing spread <= 6 weeks

then the note says timing is `approaching Reliable`.

This is descriptive context. It is not the main timing verdict.

### Calendar window

The script measures what calendar months the cycle lows tended to fall in.

It records:
- raw low months
- modal months covering at least 60% of observations
- a readable label such as `Sep/Oct window`
- spread in day-of-year terms
- a calendar rating:
  - `CALENDAR_CONSISTENT`
  - `CALENDAR_MODERATE`
  - `CALENDAR_WIDE`

Thresholds:
- Consistent: spread <= 60 days
- Moderate: 61 to 120 days
- Wide: more than 120 days

### Effective sample size

The script uses autocorrelation-adjusted sample size:

- `n_effective = n_clean * (1 - rho) / (1 + rho)`

Sample buckets:
- `ADEQUATE` if `n_effective >= 8`
- `MODERATE` if `n_effective >= 5`
- `THIN` if `n_effective >= 3`
- `INSUFFICIENT` otherwise

### Stability trend

Each clean cycle gets a `pattern_stability_score`, then the script fits a slope over time.

Verdict rules:
- `DEGRADING`
  - slope < `-5`
  - and recent average score < `60`
- `IMPROVING`
  - slope > `5`
  - and recent average score > `70`
- `STABLE`
  - otherwise
- `INSUFFICIENT_DATA`
  - if there are too few scored cycles

### Exit profile verdict

For each series with at least 3 complete clean cycles, the script compares:
- average gain from `Pre-Exdiv Peak Exit`
- average gain from `Ex-Div Date Exit`
- how often the hindsight-optimal exit happened before ex-div

Verdict rules:
- `PRE_EXDIV_PREFERRED`
  - if pre-exdiv average gain is at least 95% of ex-div-date average gain
  - and ex-div-date average gain is positive
- `POST_EXDIV_PREFERRED`
  - if ex-div-date average gain is positive
  - and hindsight-optimal average gain is at least 105% of ex-div-date average gain
  - and the optimal exit happened before ex-div less than 40% of the time
- `INDETERMINATE`
  - otherwise

The script also records:
- pre-exdiv peak window p25
- pre-exdiv peak window p75
- win rates for both exit paths using the same 3% gain threshold

### CGC ranking

If the stock has more than one meaningful series, the script ranks them with CGC.

For each series:
- win rate contributes half the score
- median `S2` contributes the other half

The score formula in code is:
- `min(100, win_rate * 0.5) + min(100, median_s2 * 2 * 0.5)`

This is a ranking aid, not the live trade trigger by itself.

## Stage 4 - Forward projection

This is the part that builds the next setup for each series.

### Project the next ex-div date

The script starts from the last dividend date in that series and estimates the next one using that series' own interval history.

Process:
- Use same-series clean dividend intervals.
- Remove intervals that are too short or too long compared with expected schedule.
- Build `avg_sid_interval`.
- Detect day-of-month drift if the last 3 day-of-month steps all move in the same direction.
- Add the interval to the last same-series date.
- If the projected date is already in the past, keep stepping forward until it lands in the future.
- If that overshoots badly, snap back to the modal calendar month.

The result is `proj_exdiv_date`.

### Forward anchor rule

This is the current live anchor rule.

The reference closing price (`series_anchor_price`) is taken from:
- the most recent prior ex-div event in chronology
- whose ex-div date has already occurred
- and whose `prev_dp` is available

If that cannot be found, the fallback is:
- the most recent same-series `prev_dp`

That reference price is displayed as-is in the dashboard anchor field.

The actual price level used for all zone and price calculations is ex-dividend adjusted:

- `zone_anchor_price = series_anchor_price - anchor_div_amount`

where `anchor_div_amount` is the dividend paid at that ex-div event. On ex-div date, the exchange mechanically sets the theoretical open at `prev_dp - dividend`, so subtracting the dividend is an accounting adjustment, not a market-noise estimate.

If the most recent anchor event is a special or bumper dividend (detected via `anomalies_excluded`), the anchor updates to that special event's `prev_dp` and the special dividend amount is used for the adjustment.

So the forward model combines:
- ex-dividend adjusted price level from the latest already-occurred ex-div event (`zone_anchor_price`)
- zone shape from the target series' own clean dip history

### Entry-zone construction

The zone is built from recent same-series clean dips.

Steps:
1. Take clean same-series cycles.
2. Use the last `RECENT_ZONE_LOOKBACK` cycles if available.
3. Extract `low_vs_prevdp`.
4. Winsorize those values at the 5th and 95th percentiles.
5. Choose percentile cutoffs based on effective sample size:
   - `10/90` if `n_effective >= 8`
   - `20/80` if `n_effective >= 5`
   - `30/70` if `n_effective >= 3`
   - full min/max otherwise
6. Apply those dip percentages to `zone_anchor_price` (the ex-dividend adjusted anchor).

Outputs:
- `zone_bot`
- `zone_top`

If stability is `DEGRADING`, the zone is widened on each side.

Current widening rule:
- `10%` on each side

### Projected price references

The script also records:
- `est_low_px`
  - `zone_anchor_price` adjusted by median clean dip
- `est_exdiv_px`
  - `zone_anchor_price` itself (ex-dividend adjusted anchor, not the raw prev_dp)
- `est_peak_px`
  - `zone_anchor_price` adjusted by median clean peak

### Entry status

Current price is compared against the projected zone:

- `BELOW`
  - current price is already below `zone_bot`
- `INSIDE`
  - current price is inside the zone
- `ABOVE`
  - current price is above `zone_top`

### Timing guidance for the next setup

If timing is `RELIABLE`:
- the script projects one estimated low date from the median weeks-before value

If timing is `BIMODAL`:
- the script gives two candidate watch dates
- one early cluster date
- one late cluster date
- plus a recent primary-cluster note if the last 3 clean cycles lean early or late

If timing is `UNRELIABLE`:
- the script avoids giving one precise date
- it tells the dashboard to monitor the zone continuously

### Dividend projection

Forward dividend amount is based on the last 4 clean same-series payments.

The script:
- takes the median of the last 4 clean same-series dividends
- classifies the recent same-series dividend trend as:
  - `RISING`
  - `DECLINING`
  - `STABLE`
- uses that to build a low/high dividend estimate band

Yield range is then calculated from:
- dividend estimate band
- projected entry zone

### Walk-forward zone hit rate

The script does a walk-forward replay on clean cycles.

For each clean cycle:
- rebuild the zone from the cycles that came before it
- use the same recent-lookback and winsorization logic
- anchor from the ex-dividend adjusted level of the latest prior ex-div event before that cycle (`prev_dp - div_amt`)
- test whether the cycle low actually entered the zone

This produces:
- `entry_zone_hit_rate`

That value matters because a mathematically neat zone is not useful if history often missed it.

### Tail risk

Tail risk asks a different question from normal dip depth:
- if you entered inside the projected zone, how much worse did bad cycles get?

Inputs:
- `worst_drawdown`
  - the most negative `low_vs_prevdp` from full non-degenerate history
- `worst_tail_avg`
  - average of the worst 5 drawdowns if available
  - otherwise the worst 3
  - otherwise the single worst cycle
- `tail_vs_zone_gap`
  - `worst_drawdown - bot_pct`

Warning threshold:
- `tail_warning = tail_vs_zone_gap < -3`

Qualitative levels:
- `SEVERE`
  - `tail_vs_zone_gap <= -8`
  - and `worst_tail_avg <= -12`
- `HIGH`
  - `tail_vs_zone_gap <= -5`
  - and `worst_tail_avg <= -9`
- `CAUTION`
  - if the zone gap warning fires
  - or `abs(worst_tail_avg) >= 10`
- `MODERATE`
  - if `abs(worst_tail_avg) >= 6`
  - or `abs(worst_drawdown) >= 12`
- `LOW`
  - otherwise

This design intentionally avoids letting one crisis-like outlier dominate the severity label by itself.

### Fragility

Fragility is about how often the zone was missed, not how deep the worst crash was.

The script calculates:
- `pct_cycles_outside_zone_clean = 100 - entry_zone_hit_rate`
- `fragility_warning = pct_cycles_outside_zone_clean > 30`

Interpretation:
- high fragility means the zone was often bypassed
- either price stayed too shallow
- or price fell straight through it

## Stage 5 - Output structure

The final JSON contains these main top-level sections:

- `meta`
  - stock identity and data-window information
- `parse_preflight`
  - parse and data-quality warnings
- `edge_case_flags`
  - sparse history, single series, irregular schedule, lapsed dividend, and similar flags
- `edge_case_flags_display`
  - human-friendly labels for those flags
- `series_meta`
  - high-level series descriptors used by the dashboard
- `cycles`
  - full cycle history
- `ss_series`
  - per-series statistics and verdicts
- `proj_series`
  - forward projections for each series
- `cgc_ranking`
  - cross-series ranking for the stock
- `annual_payouts`
  - yearly dividend totals and whether the latest year is partial
- `divs`
  - cleaned dividend schedule actually used in the model
- `price_data`
  - compact price history used by the dashboard
- `current_price`, `anchor_price`, `anchor_date`
  - live reference values
- `data_window_start`, `data_window_end`, `years_covered`
  - data coverage summary
- `series_adequacy`
  - per-series sample-quality summary

## What the dashboard adds on top

The dashboard uses the JSON to create:
- grouped stock cards
- comparison tables
- zone outcome scatter views
- cycle timeline views
- projection tables
- trade-planner milestone boards
- strategy and glossary explanations

The overview layer is currently split into four tabs:
- `Overview`
- `Potential & Upcoming`
- `Trade Planner`
- `Comparison`

What each one does:
- `Overview`
  - quick scan layer
  - includes the `Setup Map`
  - includes the mini-card stock view
  - can show quiet stock metadata such as sector together with name, exchange, and frequency
- `Potential & Upcoming`
  - includes grouped `Potential Stocks`
  - includes grouped `Upcoming Stocks to Watch`
- `Trade Planner`
  - includes a multi-stock planner board
  - includes per-stock milestone timelines
  - allows local overrides for official ex-div date, official dividend amount, and planned entry price
- `Comparison`
  - includes the `Zone Outcome Map`
  - includes the dense metric-by-metric comparison table

The Flask-backed `Edit Stock List` view sits outside the calculation model itself.

It is used to:
- choose which names from the master stock list are tracked
- mark the benchmark `Market index` row, such as `^STI`
- filter the master stock picker by stock type and by sector
- browse the master list through an in-modal picker panel rather than a floating dropdown
- use optional multi-select, paging, and `Select all filtered`

This stock-list flow changes which names get loaded or refreshed, but it does not change the math for an individual stock once that stock is analyzed.

The master stock list now also supports a real `Enabled` column.

That means:
- `Enabled only` in the picker refers to `Enabled=TRUE` in `master_stock_list.csv`
- enable / disable visibility is no longer inferred only from `Role`
- `Role` still matters for defaults such as `default_run_analysis`, but it is no longer the only visibility control

The picker's bulk-select behavior is intentionally conservative:
- `Select all filtered` applies to the full filtered match set, not just the currently rendered page
- market-index rows such as `^STI` are skipped by that bulk action by default
- the benchmark can still be added manually when needed

The `Setup Map` is presentation logic, not a new calculation model.

It currently uses:
- x-axis = current price position relative to the projected entry zone
- y-axis = possible next-cycle gain
- point color = `Current Verdict`
- hover tooltip = stock details including tail risk
- click = drill into that stock

The `Zone Outcome Map` is also presentation logic.

It currently has two modes:
- `Current cycle`
  - uses the nearest next projected series whose estimated low window has already started
  - x-axis = where the observed cycle low sits relative to the projected zone
  - y-axis = realized rebound vs the model's expected gain
- `Recent completed cycles (same series)`
  - uses recent completed cycles from the same series as the nearest next projection
  - the lookback is cycle-count-based, so quarterly / semi-annual / annual names are not forced into one fixed calendar range
  - x-axis = low vs zone position, shown as a percentage of the zone band, where `0%` is projected zone bottom and `100%` is projected zone top
  - y-axis = realized cycle strength vs the model's expected gain

The `Trade Planner` is a live planning layer, not a new forecasting model.

It currently:
- uses only the nearest next cycle for each stock
- supports multiple stocks at once
- includes a compact `Setup summary` block in planner detail
- shows milestone timelines for watch / dip / exit / ex-div
- allows official ex-div date, official dividend amount, and planned entry price overrides
- stores planner state locally in the browser
- can also remember already loaded stock JSONs locally for later refreshes, until that saved cache is cleared

### Trade Planner calculation flow

The planner does not build a new forecast model.

It starts from the nearest next projected series already calculated in Python, then applies a small set of local execution overrides.

Base inputs:
- `proj = proj_series[next_series_id]`
- `exit_profile = ss_series[next_series_id].exit_profile`
- `baseExDiv = proj.proj_exdiv_date`
- `baseEntryPrice = proj.zone_bot`
- `baseDivAmount = proj.proj_div_mid`
- `targetExitPx =`
  - `exit_profile.pre_exdiv_exit_px_med` if present
  - otherwise `proj.est_exdiv_px`

Override precedence:
- `effectiveExDiv`
  - `official_exdiv_date` if set
  - otherwise `baseExDiv`
- `effectiveDivAmount`
  - `official_dividend_amount` if set
  - otherwise `baseDivAmount`
- `effectiveEntryPrice`
  - `planned_entry_price` if set
  - otherwise `baseEntryPrice`

Planner outputs then recalculate from those effective values.

### Trade Planner formulas

#### Effective ex-div date

- `effective_exdiv_date = official_exdiv_date ?? proj.proj_exdiv_date`

This value becomes the planner's hard date anchor.

#### Days away

- `days_away = effective_exdiv_date - today`

This is shown in whole calendar days.

#### Planned entry

- `planned_entry = planned_entry_override ?? zone_bot`

If no manual entry price is given, the planner assumes the zone bottom as the base execution reference.

#### Expected gain

When both `planned_entry` and `target_exit_px` exist:

- `expected_gain_pct = ((target_exit_px - planned_entry) / planned_entry) * 100`

Otherwise:
- no expected-gain figure is shown

#### Yield on cost

When both `effective_div_amount` and `planned_entry` exist:

- `yield_on_cost_pct = (effective_div_amount / planned_entry) * 100`

Otherwise:
- no yield-on-cost figure is shown

#### Buy-watch and dip timing shift

For normal planner timing, the dashboard keeps the historical dip offsets and reanchors them to `effective_exdiv_date`.

If the projection has one estimated low date:

- `single_low_delta_days = est_low_date - baseExDiv`
- `shifted_low_date = effectiveExDiv + single_low_delta_days`

If the projection has two timing clusters:

- `cluster1_delta_days = est_low_date_cluster1 - baseExDiv`
- `cluster2_delta_days = est_low_date_cluster2 - baseExDiv`
- `shifted_cluster_1 = effectiveExDiv + cluster1_delta_days`
- `shifted_cluster_2 = effectiveExDiv + cluster2_delta_days`

The planner then sets:
- `dip_start = earliest shifted low date`
- `dip_end = latest shifted low date`

Watch timing uses:
- `watch_date = dip_start - 7 days`

If no usable dip date exists:
- `watch_date = effectiveExDiv - 21 days`

#### Exit timing shift

If the historical exit mode is `PRE_EXDIV_PREFERRED` and window stats exist:

- `exit_start = effectiveExDiv - pre_exdiv_peak_window_days_p75`
- `exit_end = effectiveExDiv - pre_exdiv_peak_window_days_p25`

Otherwise:
- `exit_point = effectiveExDiv`

So the planner preserves the historical exit structure, but repositions it around the effective ex-div anchor.

#### Irregular / unreliable timing reevaluation

For irregular or unreliable schedules with an official ex-div override, the planner does not always keep one narrow shifted dip point.

Instead it can widen into a re-evaluated dip window.

Conceptually:
- take the historical same-series `weeks_before_exdiv` spread
- convert that spread into a wider date band before `effectiveExDiv`
- show that as a broader `buy watch` / dip timing range

So the planner becomes:
- less precise
- but more honest for irregular names

The `Setup summary` block is presentation logic built from existing planner and dashboard fields.

It is meant to compress the execution read into:
- `Execution state`
- `Confidence`
- `Timing window`
- `Exit bias`
- short `Guidance`

How each line is derived:
- `Execution state`
  - mapped from `Current Verdict`
  - but phrased more narrowly for planner use
  - `Current Verdict` is the broader dashboard action guide
  - `Execution state` is the planner's live trade-readiness state
  - example:
    - `Actionable Now` -> `Ready`
    - `Small Trades Advised` -> `Caution`
    - `Watch Closely` / `Watch Only` -> `Watch`
    - `Too Risky` -> `Too risky`
- `Confidence`
  - not based on `n_effective` alone
  - combines:
    - sample adequacy / `n_effective`
    - timing reliability
    - tail-risk severity
  - rule ladder:
    - `Low`
      - insufficient sample
      - or unreliable timing
      - or severe tail risk
    - `High`
      - adequate sample
      - `n_effective >= 6`
      - reliable timing
      - low or moderate tail risk
    - `Moderate`
      - everything in between
  - compactly:
    - `Low` if `sample_adequacy = INSUFFICIENT`
      - or `timing = UNRELIABLE`
      - or `tail_risk = SEVERE`
    - `High` if all are true:
      - `sample_adequacy = ADEQUATE`
      - `n_effective >= 6`
      - `timing = RELIABLE`
      - `tail_risk in {LOW, MODERATE}`
    - otherwise `Moderate`
- `Timing window`
  - derived from the planner timeline
  - compares today's date to:
    - watch start
    - effective ex-div date
  - shown as:
    - `Upcoming`
    - `Open`
    - `Past`
  - compactly:
    - `Upcoming` if `today < watch_date`
    - `Open` if `watch_date <= today <= effective_exdiv_date`
    - `Past` if `today > effective_exdiv_date`
- `Exit bias`
  - short display version of the planner's preferred exit mode
- `Guidance`
  - short rules-of-thumb generated from:
    - entry status
    - exit mode
    - tail risk
    - timing reliability
    - whether overrides are active
  - wording is intentionally soft:
    - `consider entries within the zone if conditions still hold`
    - not `enter within zone`
    - `historical bias favors pre-exdiv exits`
    - not `exit before ex-div`

Inside the planner, the `Updated schedule and plan` section is the place where those overrides are applied.

What it changes:
- if `official ex-div date` is set
  - effective ex-div date
  - days to ex-div
  - watch / dip / exit milestone dates
  - planner board ordering and timing labels
- if `official dividend amount` is set
  - planner yield outputs
  - dividend-based planning context
- if `planned entry price` is set
  - planned entry shown in the planner
  - expected gain
  - yield-on-cost style planning outputs where applicable

What it does not change:
- historical timing rating
- tail risk
- fragility
- exit-mode verdict
- Potential Score
- Current Verdict logic outside the planner

So the planner override layer updates the live schedule and execution framing, but it does not rewrite the historical model itself.

In shorthand:
- Python gives the base pattern
- the planner applies:
  - `effective_exdiv_date`
  - `effective_dividend_amount`
  - `planned_entry`
- then recalculates:
  - `days_away`
  - `watch / dip / exit timing`
  - `expected_gain_pct`
  - `yield_on_cost_pct`

One important distinction:
- the Python script calculates the pattern and forward setup
- the dashboard calculates some presentation-layer decisions such as `Current Verdict`, `Zone Outcome Map`, and `Trade Planner` schedule views

The same separation applies to dashboard loading behavior:
- Python writes JSON outputs into the `json/` folder
- the Flask dashboard decides which of those outputs to load into the live session
- the current Flask-backed workflow now reloads only registry-linked JSONs, rather than every file found in `json/`

So:
- `Update stock data`
  - runs the pipeline
  - then reloads only registry-linked analysis outputs
- `Load existing stock data`
  - also loads only registry-linked analysis outputs
- extra JSON files can stay in the folder without being pulled into the dashboard automatically

So if you see:
- `Actionable Now`
- `Wait`
- `Small Trades Advised`
- `Too Risky`

those are dashboard interpretation labels built from the Python outputs, not raw fields emitted directly by the script.

## Dashboard assessment rules

The dashboard adds two important assessment layers on top of the raw JSON:

### Potential Score

Potential Score is a stock-level ranking score used in the grouped overview cards.

It is not a direct trade trigger.

Current weighted components:
- win rate: 28
- clean cycles: 18
- years of data: 10
- frequency: 10
- timing: 14
- tail risk: 10
- dividend trend: 5
- zone width: 5

Current label thresholds:
- `Strong Potential` if score >= 75
- `Watchlist` if score >= 60
- `Borderline` if score >= 50

This means a stock can have a strong structural profile while still not being actionable right now.

The grouped-card labels appear at these thresholds:
- `Strong Potential` if score >= 75
- `Watchlist` if score >= 60
- `Borderline` if score >= 50

One live guard now matters here:
- the raw `Potential Score` still displays
- but the grouped-card label is only shown when `n_effective >= 3`
- below that, the score is still visible as a rough ranking number, but the dashboard avoids giving it a confident shortlist label

### Current Verdict

Current Verdict is the action-oriented status shown by the dashboard. It is derived from price position, timing, tail risk, and cycle proximity.

Live rule order:

1. `Too Risky`
- tail risk is `Severe`

2. `Wait`
- price is above the zone and more than about 3% away from `zone_top`

3. `Small Trades Advised`
- price is inside the zone
- and either tail risk is `High`
- or timing is `Unreliable`

4. `Actionable Now`
- price is inside the zone
- and the caution rule above did not trigger

5. `Watch Closely`
- price is above the zone
- but within about 3% of `zone_top`
- and the next cycle is still within the near-term watch window

6. `Actionable Now` or `Small Trades Advised`
- price is slightly below the zone, within about 0.5% of `zone_bot`
- small undershoots can still be valid entries
- `Actionable Now` only survives this path when tail risk is `Low` or `Moderate`
- otherwise the slight-below case is shown more cautiously as `Small Trades Advised`

This creates one intentional asymmetry:
- if price is already inside the zone, a `Caution` tail profile can still remain `Actionable Now`
- if price has already slipped slightly below the zone, that same `Caution` tail profile is treated more carefully and downgraded to `Small Trades Advised`
- the idea is that an in-zone setup is the expected entry area, while a slight-below setup may already be starting to overshoot the projected floor

7. `Wait`
- price is materially below the zone
- which usually means the setup may have overshot the preferred entry area

8. `Watch Only`
- the next cycle is within the near-term monitoring window
- but price is still not in position

9. `On Radar`
- fallback for structurally interesting names that are not yet close to action

This is why:
- `Potential Score` answers "how strong is the structure?"
- `Current Verdict` answers "what should I do with it now?"
- `Execution state` in the planner answers "how live is this setup for execution right now?"

The overview mini cards can also show a compressed execution line such as:
- `Execution: Ready Â· moderate confidence Â· Pre-exdiv exit bias`

That line is only a compact bridge from overview scanning into planner use.
It does not replace `Current Verdict`.

### 3% hurdle

The current model still uses a `3%` rebound hurdle for:
- cycle success / failure
- win rate
- exit win rates
- several downstream quality summaries

This is still a fixed practical hurdle, not a spread-by-spread microstructure model.

For now the intended reading is:
- `3%` is a minimum meaningful trade hurdle
- it is meant to avoid calling tiny rebounds a true success
- it should be treated as a practical screening threshold, not a law of market structure

So if you see:
- `Win Rate`
- `Success`
- `Pre-Exdiv Peak Win Rate`
- `Ex-Div Date Exit Win Rate`

they are all still using that same `> 3%` hurdle.

### Zone Outcome Map trigger rules

The dashboard only plots a point when there is enough information for that mode.

`Current cycle` appears when:
- the nearest next projected series exists
- and its estimated low-window start has already passed

`Recent completed cycles (same series)` appears when:
- completed cycles exist for the same series as the nearest next projection
- and those cycles are not excluded as degenerate, outlier, or macro

This means the chart is intentionally selective. If there is no comparable live or recent cycle, no point is plotted.

## Practical reading order

If you want to read one stock quickly, this is the clean order:

1. Check frequency and series layout.
2. Check clean sample size and timing rating.
3. Check whether the zone is structurally consistent.
4. Check current price vs zone.
5. Check tail risk and fragility.
6. Check exit mode verdict.
7. Only then decide whether the setup is worth acting on.

That is the core logic of the current Dividend Cycle Analysis workflow.

