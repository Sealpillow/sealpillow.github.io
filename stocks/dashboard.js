"use strict";

const CONFIG = {
  minWinRate: 50,
  minCleanCycles: 3,
  minYearsData: 2,
  allowedFrequencies: ["QUARTERLY", "SEMI_ANNUAL", "MONTHLY"],
  allowIrregularFrequency: false,
  allowUnreliableTiming: true,
  maxTailRiskLevel: "SEVERE",
  monitoringDaysMin: 0,
  monitoringDaysMax: 90,
  potentialWeights: {
    winRate: 28,
    cleanCycles: 18,
    yearsData: 10,
    frequency: 10,
    timing: 14,
    tailRisk: 10,
    divTrend: 5,
    zoneWidth: 5,
  },
  potentialLabels: {
    strong: 75,
    watchlist: 60,
    borderline: 50,
  },
};

const TAIL_RISK_ORDER = {
  LOW: 0,
  MODERATE: 1,
  CAUTION: 2,
  HIGH: 3,
  SEVERE: 4,
  UNKNOWN: 99,
};

function buildGroupedStockView(stocks, userConfig = {}) {
  const config = mergeConfig(CONFIG, userConfig);
  const normalizedStocks = Array.isArray(stocks)
    ? stocks.map((stock) => normalizeStock(stock, config))
    : [];

  const potentialStocks = getPotentialStocks(normalizedStocks, config);
  const upcomingStocks = getUpcomingStocks(normalizedStocks, potentialStocks, config);

  return {
    potentialStocks,
    upcomingStocks,
  };
}

function getPotentialStocks(stocks, config) {
  return stocks
    .map((stock) => {
      const eligibility = isPotentialStock(stock, config);
      if (!eligibility.eligible) {
        return null;
      }

      const scores = scorePotentialStock(stock, config);
      const explanation = explainPotentialStock(stock, scores, config);
      const label = shouldShowPotentialLabel(stock) ? getPotentialLabel(scores.potentialScore, config) : null;

      return {
        ticker: stock.ticker,
        stockName: stock.stockName,
        potentialScore: scores.potentialScore,
        labels: label ? [label] : [],
        reasons: explanation.reasons,
        warnings: explanation.warnings,
        metrics: buildMetricsSummary(stock),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.potentialScore - a.potentialScore);
}

function getUpcomingStocks(stocks, potentialStocks, config) {
  return potentialStocks
    .map((stock) => {
      const metrics = stock.metrics || {};
      const days = readNumber(metrics.daysToExDiv);
      const priceVsZone = metrics.priceVsZone || {};
      const inWindow = days != null && days >= config.monitoringDaysMin && days <= config.monitoringDaysMax;
      const insideZone = metrics.entryStatus === 'INSIDE' || priceVsZone.insideZone === true;
      const nearAboveZone = metrics.entryStatus === 'ABOVE' && (priceVsZone.distancePct || Infinity) <= 3;
      const isWatchCandidate = inWindow || insideZone || nearAboveZone;
      if (!isWatchCandidate) {
        return null;
      }

      const reasons = Array.isArray(stock.reasons) ? stock.reasons.slice() : [];
      const warnings = Array.isArray(stock.warnings) ? stock.warnings.slice() : [];

      if (insideZone) {
        reasons.unshift('Current price is already inside the entry zone');
      } else if (nearAboveZone) {
        reasons.unshift('Current price is close to the entry zone');
      } else if (days <= 30) {
        reasons.unshift('Next dividend cycle is coming up soon');
      } else if (days <= 60) {
        reasons.unshift('Next dividend cycle is within the near-term watch window');
      } else {
        reasons.unshift('Next dividend cycle is within the broader watch window');
      }

      if (metrics.entryStatus === 'ABOVE' && !nearAboveZone) {
        warnings.push('Current price is still above the entry zone');
      } else if (metrics.entryStatus === 'BELOW') {
        warnings.push('Current price is already below the entry zone');
      }

      if (metrics.timingNext === 'UNRELIABLE') {
        warnings.push('Timing is less precise, so monitor the zone rather than a specific date');
      }

      const priority = insideZone ? 0 : nearAboveZone ? 1 : 2;
      const zoneDistance = readNumber(priceVsZone.distancePct, 9999);
      return {
        ticker: stock.ticker,
        stockName: stock.stockName,
        potentialScore: stock.potentialScore,
        upcomingScore: stock.potentialScore,
        labels: [],
        reasons: uniqueStrings(reasons),
        warnings: uniqueStrings(warnings),
        metrics,
        watchPriority: priority,
        zoneDistance,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const priorityDiff = readNumber(a.watchPriority, 9) - readNumber(b.watchPriority, 9);
      if (priorityDiff !== 0) return priorityDiff;
      const zoneDiff = readNumber(a.zoneDistance, 9999) - readNumber(b.zoneDistance, 9999);
      if (zoneDiff !== 0) return zoneDiff;
      const dayDiff = readNumber(a.metrics?.daysToExDiv, 9999) - readNumber(b.metrics?.daysToExDiv, 9999);
      if (dayDiff !== 0) return dayDiff;
      return b.potentialScore - a.potentialScore;
    });
}

function normalizeStock(stock, config) {
  const source = stock || {};
const inferred = extractDividendCycleAnalysisSummary(source);
  const merged = Object.assign({}, inferred, source);

  const ticker = readString(merged.ticker || merged.symbol || merged.code);
  const stockName = readString(
    merged.stockName || merged.stock_name || merged.name
  );
  const currency = readString(merged.currency || merged.currencyCode || merged.ccy);
  const currentPrice = readNumber(
    merged.currentPrice || merged.current_price || merged.price
  );
  const frequency = normalizeFrequency(merged.frequency);
  const frequencyDisplay = readString(merged.frequencyDisplay || merged.frequency_display);
  const nextExDiv = normalizeDate(merged.nextExDiv || merged.next_exdiv || merged.projExDivDate);
  const daysToExDiv = normalizeDaysToExDiv(
    merged.daysToExDiv,
    nextExDiv
  );
  const nextCycle = readString(merged.nextCycle || merged.next_cycle || merged.seriesId || merged.nextSeries);
  const estExDivPx = readNumber(merged.estExDivPx || merged.est_exdiv_px);
  const entryZoneLow = readNumber(
    merged.entryZoneLow || merged.entry_zone_low || merged.zone_bot
  );
  const entryZoneHigh = readNumber(
    merged.entryZoneHigh || merged.entry_zone_high || merged.zone_top
  );
  const entryStatus = normalizeEntryStatus(
    merged.entryStatus || merged.entry_status
  );
  const entryStatusDisplay = readString(merged.entryStatusDisplay || merged.entry_status_display);
  const exitMode = readString(
    merged.exitMode || merged.exit_mode || merged.exit_mode_verdict
  );
  const exitModeDisplay = readString(merged.exitModeDisplay || merged.exit_mode_display || merged.exit_mode_verdict_display);
  const avgGainPreExdiv = readNumber(
    merged.avgGainPreExdiv || merged.avg_gain_pre_exdiv
  );
  const avgGainPostExdivExit = readNumber(
    merged.avgGainPostExdivExit || merged.avg_gain_post_exdiv_exit
  );
  const preExdivPeakWindowDaysP25 = readNumber(
    merged.preExdivPeakWindowDaysP25 || merged.pre_exdiv_peak_window_days_p25
  );
  const preExdivPeakWindowDaysP75 = readNumber(
    merged.preExdivPeakWindowDaysP75 || merged.pre_exdiv_peak_window_days_p75
  );
  const winRateNext = clamp(
    readNumber(
      merged.winRateNext ||
        merged.win_rate_next ||
        merged.historicalWinRate ||
        merged.win_rate
    ),
    0,
    100
  );
  const possibleGainPct = readNumber(merged.possibleGainPct || merged.avg_win_pct || merged.avgWinPct);
  const cgcTopSeries = readString(
    merged.cgcTopSeries || merged.cgc_top_series || merged.topSeries
  );
  const cgcWinRate1 = clamp(
    readNumber(merged.cgcWinRate1 || merged.cgc_win_rate_1),
    0,
    100
  );
  const cleanCycles = Math.max(
    0,
    readNumber(merged.cleanCycles || merged.clean_cycles || merged.nClean, 0)
  );
  const nEffective = Math.max(
    0,
    readNumber(merged.nEffective || merged.n_effective, 0)
  );
  const sampleAdequacy = readString(merged.sampleAdequacy || merged.sample_adequacy || merged.sampleSize || merged.sample_size);
  const yearsData = Math.max(
    0,
    readNumber(merged.yearsData || merged.years_covered || merged.years, 0)
  );
  const timingNext = normalizeTiming(merged.timingNext || merged.timing_rating);
  const timingDisplay = readString(merged.timingDisplay || merged.timing_display || merged.timing_rating_display);
  const divTrend = normalizeDivTrend(merged.divTrend || merged.div_trend);
  const divTrendDisplay = readString(merged.divTrendDisplay || merged.div_trend_display);
  const yieldRange = normalizeYieldRange(merged.yieldRange || merged.yield_range);
  const zoneWidthPct =
    readNumber(merged.zoneWidthPct) != null
      ? readNumber(merged.zoneWidthPct)
      : getZoneWidthPct({
          entryZoneLow,
          entryZoneHigh,
        });
  const priceVsZone =
    merged.priceVsZone != null
      ? normalizePriceVsZone(merged.priceVsZone)
      : getPriceVsZone({
          currentPrice,
          entryZoneLow,
          entryZoneHigh,
          entryStatus,
        });
  const tailRiskLevel = normalizeTailRiskLevel(
    merged.tailRiskLevel || merged.tailRisk || merged.tail_risk
  );
  const tailRiskDisplay = readString(merged.tailRiskDisplay || merged.tail_risk_display || merged.tail_level_display || merged.tail_risk?.tail_level_display);
  const timingRating = timingNext;
  const potentialScore = merged.potentialScore != null
    ? clamp(readNumber(merged.potentialScore), 0, 100)
    : null;
  const actionabilityScore = merged.actionabilityScore != null
    ? clamp(readNumber(merged.actionabilityScore), 0, 100)
    : null;

  return {
    ticker,
    stockName,
    currency,
    currentPrice,
    frequency,
    frequencyDisplay,
    nextExDiv,
    daysToExDiv,
    nextCycle,
    estExDivPx,
    entryStatus,
    entryStatusDisplay,
    entryZoneLow,
    entryZoneHigh,
    exitMode,
    exitModeDisplay,
    avgGainPreExdiv,
    avgGainPostExdivExit,
    preExdivPeakWindowDaysP25,
    preExdivPeakWindowDaysP75,
    winRateNext,
    possibleGainPct,
    cgcTopSeries,
    cgcWinRate1,
    cleanCycles,
    nEffective,
    sampleAdequacy,
    yearsData,
    timingNext,
    timingDisplay,
    tailRisk: tailRiskLevel,
    tailRiskDisplay,
    divTrend,
    divTrendDisplay,
    yieldRange,
    potentialScore,
    zoneWidthPct,
    timingRating,
    tailRiskLevel,
    actionabilityScore,
    priceVsZone,
    raw: source,
    config: config || CONFIG,
  };
}

function getZoneWidthPct(stock) {
  const low = readNumber(stock.entryZoneLow);
  const high = readNumber(stock.entryZoneHigh);
  if (low == null || high == null || low <= 0 || high <= 0 || high < low) {
    return null;
  }
  const midpoint = (low + high) / 2;
  if (midpoint <= 0) {
    return null;
  }
  return round(((high - low) / midpoint) * 100, 2);
}

function getPriceVsZone(stock) {
  const currentPrice = readNumber(stock.currentPrice);
  const low = readNumber(stock.entryZoneLow);
  const high = readNumber(stock.entryZoneHigh);
  const entryStatus = normalizeEntryStatus(stock.entryStatus);

  if (currentPrice == null || low == null || high == null || low <= 0 || high <= 0) {
    return {
      relation: "UNKNOWN",
      distancePct: null,
      insideZone: false,
      nearZone: false,
      scoreHint: 0,
    };
  }

  if (currentPrice >= low && currentPrice <= high) {
    return {
      relation: "INSIDE",
      distancePct: 0,
      insideZone: true,
      nearZone: true,
      scoreHint: 100,
    };
  }

  if (currentPrice > high) {
    const distancePct = round(((currentPrice - high) / high) * 100, 2);
    return {
      relation: entryStatus || "ABOVE",
      distancePct,
      insideZone: false,
      nearZone: distancePct <= 3.5,
      scoreHint: clamp(80 - distancePct * 12, 0, 100),
    };
  }

  const distancePct = round(((low - currentPrice) / low) * 100, 2);
  return {
    relation: entryStatus || "BELOW",
    distancePct,
    insideZone: false,
    nearZone: distancePct <= 3.5,
    scoreHint: clamp(55 - distancePct * 15, 0, 100),
  };
}

// Prefers the server-computed value (main/analyze-stock.py's compute_potential_score,
// applied to `stock.raw.proj_series[stock.nextCycle]`) so both this file and
// prediction-log.html read one number instead of each deriving it independently --
// the two JS copies had already drifted out of sync once before this wrapper existed.
// Falls through to the original client-side formula (renamed *Legacy below) only for
// a stock whose JSON predates this field -- delete the Legacy body and this fallback
// once every file in data/analysis/manifest.json has been regenerated via analyze-batch.py.
function scorePotentialStock(stock, config) {
  const proj = stock.nextCycle && stock.raw?.proj_series?.[stock.nextCycle];
  if (proj && proj.potential_score != null) {
    return { potentialScore: proj.potential_score, scoreParts: {} };
  }
  return scorePotentialStockLegacy(stock, config);
}

function scorePotentialStockLegacy(stock, config) {
  const weights = config.potentialWeights;
  const scoreParts = {
    winRate: scoreWinRate(stock.winRateNext),
    cleanCycles: scoreCleanCycles(stock.cleanCycles),
    yearsData: scoreYearsData(stock.yearsData),
    frequency: scoreFrequency(stock.frequency),
    timing: scoreTiming(stock.timingNext),
    tailRisk: scoreTailRisk(stock.tailRiskLevel),
    divTrend: scoreDivTrend(stock.divTrend),
    zoneWidth: scoreZoneWidth(stock.zoneWidthPct),
  };

  const potentialScore = round(weightedScore(scoreParts, weights), 1);

  return {
    potentialScore,
    scoreParts,
  };
}



function explainPotentialStock(stock, scores, config) {
  const reasons = [];
  const warnings = [];

  if ((stock.winRateNext || 0) >= 70 && (stock.cleanCycles || 0) >= config.minCleanCycles) {
    reasons.push("High win rate with adequate clean cycle history");
  } else if ((stock.winRateNext || 0) >= config.minWinRate) {
    reasons.push("Historical win rate clears the minimum structural threshold");
  }

  if (stock.timingNext === "RELIABLE") {
    reasons.push("Reliable timing pattern");
  } else if (stock.timingNext === "BIMODAL") {
    reasons.push("Timing pattern is usable but split across two windows");
  }

  if ((stock.yearsData || 0) >= 5) {
    reasons.push("Longer operating history supports pattern repeatability");
  }

  if (stock.frequency === "QUARTERLY" || stock.frequency === "SEMI_ANNUAL") {
    reasons.push("Dividend frequency fits the preferred cycle structure");
  }

  if (stock.divTrend === "RISING") {
    reasons.push("Dividend trend is improving");
  } else if (stock.divTrend === "STABLE") {
    reasons.push("Dividend trend appears stable");
  }

  if (stock.zoneWidthPct != null && stock.zoneWidthPct <= 5) {
    reasons.push("Entry zone is relatively tight");
  }

  if (stock.tailRiskLevel === "CAUTION") {
    warnings.push("Tail risk calls for caution");
  } else if (TAIL_RISK_ORDER[stock.tailRiskLevel] >= TAIL_RISK_ORDER.HIGH) {
    warnings.push("Tail risk is on the high side");
  }

  if (stock.zoneWidthPct != null && stock.zoneWidthPct > 8) {
    warnings.push("Entry zone is relatively wide");
  }

  if (stock.timingNext === "UNRELIABLE") {
    warnings.push("Timing pattern is unreliable");
  }

  if ((stock.yearsData || 0) < 4) {
    warnings.push("Historical coverage is still limited");
  }

  if ((stock.cleanCycles || 0) < 6) {
    warnings.push("Clean cycle sample remains modest");
  }

  return {
    reasons: uniqueStrings(reasons),
    warnings: uniqueStrings(warnings),
  };
}

function explainUpcomingStock(stock, scores, config) {
  const explanation = explainPotentialStock(stock, scores, config);
  const reasons = explanation.reasons.slice();
  const warnings = explanation.warnings.slice();

  if (stock.priceVsZone.insideZone) {
    reasons.push("Current price inside entry zone");
  } else if (stock.priceVsZone.relation === "ABOVE" && stock.priceVsZone.nearZone) {
    reasons.push("Current price is just above the entry zone");
  } else if (stock.priceVsZone.relation === "BELOW" && stock.priceVsZone.nearZone) {
    warnings.push("Current price is below the zone and may have overshot");
  } else if (stock.priceVsZone.relation !== "UNKNOWN") {
    warnings.push("Current price is not close to the entry zone");
  }

  if (stock.entryStatus === "INSIDE") {
    reasons.push("Entry status is already inside the preferred range");
  } else if (stock.entryStatus === "ABOVE") {
    reasons.push("Setup is approaching the preferred entry range");
  } else if (stock.entryStatus === "BELOW") {
    warnings.push("Entry status is below the preferred range");
  }

  if (stock.daysToExDiv != null) {
    if (
      stock.daysToExDiv >= config.monitoringDaysMin &&
      stock.daysToExDiv <= config.monitoringDaysMax
    ) {
      reasons.push("Ex-dividend date is within the active monitoring window");
    } else if (stock.daysToExDiv < config.monitoringDaysMin) {
      warnings.push("Ex-dividend date has already passed or is too close");
    } else {
      warnings.push("Ex-dividend date is still outside the preferred window");
    }
  }

  return {
    reasons: uniqueStrings(reasons),
    warnings: uniqueStrings(warnings),
  };
}

// LEGACY FALLBACK note applies here too -- see scorePotentialStock above.
function isPotentialStock(stock, config) {
  const proj = stock.nextCycle && stock.raw?.proj_series?.[stock.nextCycle];
  if (proj && proj.potential_eligible != null) {
    return { eligible: proj.potential_eligible, reasons: proj.potential_ineligible_reasons || [] };
  }
  return isPotentialStockLegacy(stock, config);
}

function isPotentialStockLegacy(stock, config) {
  const reasons = [];

  if (stock.frequency === "IRREGULAR" && !config.allowIrregularFrequency) {
    reasons.push("Irregular dividend frequency");
  }

  if (
    Array.isArray(config.allowedFrequencies) &&
    config.allowedFrequencies.length &&
    !config.allowedFrequencies.includes(stock.frequency)
  ) {
    reasons.push("Frequency outside allowed set");
  }

  if ((stock.cleanCycles || 0) < config.minCleanCycles) {
    reasons.push("Clean cycles below threshold");
  }

  if ((stock.winRateNext || 0) < config.minWinRate) {
    reasons.push("Win rate below threshold");
  }

  if ((stock.yearsData || 0) < config.minYearsData) {
    reasons.push("Years of history below threshold");
  }

  if (stock.timingNext === "UNRELIABLE" && !config.allowUnreliableTiming) {
    reasons.push("Timing is unreliable");
  }

  if (isTailRiskTooHigh(stock.tailRiskLevel, config.maxTailRiskLevel)) {
    reasons.push("Tail risk exceeds maximum");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}



function extractDividendCycleAnalysisSummary(source) {
  if (!source || !source.proj_series || !source.meta) {
    return {};
  }

  const projEntry = getNearestProjectedSeriesEntry(source.proj_series);
  const proj = projEntry ? projEntry.proj : {};
  const exitProfile = projEntry ? source.ss_series?.[projEntry.id]?.exit_profile : null;
  const adequacy = projEntry ? source.series_adequacy?.[projEntry.id] : null;
  const cleanCycles = sumCleanCycles(source.ss_series);
  const cgcTop = Array.isArray(source.cgc_ranking) ? source.cgc_ranking[0] : null;
  const timing = projEntry ? source.ss_series?.[projEntry.id]?.timing : null;
  const stability = projEntry ? source.ss_series?.[projEntry.id]?.stability : null;

  return {
    ticker: source.meta.ticker,
    stockName: source.meta.stock_name,
    currency: source.meta.currency,
    currentPrice: source.current_price,
    frequency: source.meta.frequency,
    frequencyDisplay: source.meta.frequency_display,
    nextExDiv: proj.proj_exdiv_date,
    daysToExDiv: daysUntil(proj.proj_exdiv_date),
    nextCycle: projEntry ? projEntry.id : null,
    estExDivPx: proj.est_exdiv_px,
    entryStatus: proj.entry_status,
    entryStatusDisplay: proj.entry_status_display,
    entryZoneLow: proj.zone_bot,
    entryZoneHigh: proj.zone_top,
    exitMode: exitProfile && exitProfile.exit_mode_verdict,
    exitModeDisplay: exitProfile && exitProfile.exit_mode_verdict_display,
    avgGainPreExdiv: exitProfile && exitProfile.avg_gain_pre_exdiv,
    avgGainPostExdivExit: exitProfile && exitProfile.avg_gain_post_exdiv_exit,
    preExdivPeakWindowDaysP25: exitProfile && exitProfile.pre_exdiv_peak_window_days_p25,
    preExdivPeakWindowDaysP75: exitProfile && exitProfile.pre_exdiv_peak_window_days_p75,
    winRateNext: proj.historical_frequencies && proj.historical_frequencies.win_rate,
    possibleGainPct: proj.historical_frequencies && proj.historical_frequencies.avg_win_pct,
    cgcTopSeries: cgcTop && cgcTop.series_id,
    cgcWinRate1: cgcTop && cgcTop.win_rate,
    cleanCycles,
    nEffective: adequacy && adequacy.n_effective,
    sampleAdequacy: adequacy && adequacy.sample_size,
    yearsData: source.years_covered,
    timingNext: proj.timing_rating,
    timingDisplay: proj.timing_rating_display || timing?.rating_display,
    tailRisk: proj.tail_risk,
    tailRiskDisplay: proj.tail_risk && proj.tail_risk.tail_level_display,
    divTrend: proj.div_trend,
    divTrendDisplay: proj.div_trend_display,
    sampleSize: proj.sample_size,
    sampleSizeDisplay: proj.sample_size_display,
    stabilityVerdict: proj.stability_verdict,
    stabilityVerdictDisplay: proj.stability_verdict_display || stability?.stability_trend_verdict_display,
    yieldRange:
      proj.div_yield_lo != null && proj.div_yield_hi != null
        ? [proj.div_yield_lo, proj.div_yield_hi]
        : null,
    zoneWidthPct:
      proj.zone_bot != null && proj.zone_top != null
        ? getZoneWidthPct({
            entryZoneLow: proj.zone_bot,
            entryZoneHigh: proj.zone_top,
          })
        : null,
  };
}

function getNearestProjectedSeriesEntry(projSeries) {
  const entries = Object.entries(projSeries || {})
    .map(([id, proj]) => ({
      id,
      proj,
      daysToExDiv: daysUntil(proj && proj.proj_exdiv_date),
    }))
    .filter((entry) => entry.proj && entry.proj.proj_exdiv_date);

  if (!entries.length) {
    return null;
  }

  entries.sort((a, b) => {
    const aDays = a.daysToExDiv == null ? Number.POSITIVE_INFINITY : a.daysToExDiv;
    const bDays = b.daysToExDiv == null ? Number.POSITIVE_INFINITY : b.daysToExDiv;
    return aDays - bDays;
  });

  return entries[0];
}

function buildMetricsSummary(stock) {
  const finalVerdict = getFinalVerdict(stock);
  return {
    currency: stock.currency,
    currentPrice: stock.currentPrice,
    frequency: stock.frequency,
    frequencyDisplay: stock.frequencyDisplay,
    nextExDiv: stock.nextExDiv,
    daysToExDiv: stock.daysToExDiv,
    nextCycle: stock.nextCycle,
    estExDivPx: stock.estExDivPx,
    entryStatus: stock.entryStatus,
    entryStatusDisplay: stock.entryStatusDisplay,
    entryZoneLow: stock.entryZoneLow,
    entryZoneHigh: stock.entryZoneHigh,
    exitMode: stock.exitMode,
    exitModeDisplay: stock.exitModeDisplay,
    avgGainPreExdiv: stock.avgGainPreExdiv,
    avgGainPostExdivExit: stock.avgGainPostExdivExit,
    preExdivPeakWindowDaysP25: stock.preExdivPeakWindowDaysP25,
    preExdivPeakWindowDaysP75: stock.preExdivPeakWindowDaysP75,
    winRateNext: stock.winRateNext,
    possibleGainPct: stock.possibleGainPct,
    cgcTopSeries: stock.cgcTopSeries,
    cgcWinRate1: stock.cgcWinRate1,
    cleanCycles: stock.cleanCycles,
    nEffective: stock.nEffective,
    sampleAdequacy: stock.sampleAdequacy,
    yearsData: stock.yearsData,
    timingNext: stock.timingNext,
    timingDisplay: stock.timingDisplay,
    tailRisk: stock.tailRiskLevel,
    tailRiskDisplay: stock.tailRiskDisplay,
    divTrend: stock.divTrend,
    divTrendDisplay: stock.divTrendDisplay,
    yieldRange: stock.yieldRange,
    zoneWidthPct: stock.zoneWidthPct,
    timingRating: stock.timingRating,
    tailRiskLevel: stock.tailRiskLevel,
    actionabilityScore: stock.actionabilityScore,
    priceVsZone: stock.priceVsZone,
    finalVerdict: finalVerdict.label,
    finalVerdictTone: finalVerdict.tone,
    finalVerdictReason: finalVerdict.reason,
  };
}

// LEGACY FALLBACK note applies here too -- see scorePotentialStock above.
function getFinalVerdict(stock) {
  const proj = stock.nextCycle && stock.raw?.proj_series?.[stock.nextCycle];
  if (proj && proj.final_verdict) {
    return { label: proj.final_verdict, tone: proj.final_verdict_tone, reason: proj.final_verdict_reason };
  }
  return getFinalVerdictLegacy(stock);
}

function getFinalVerdictLegacy(stock) {
  const entryStatus = stock.entryStatus || "UNKNOWN";
  const timing = stock.timingNext || "UNKNOWN";
  const tail = stock.tailRiskLevel || "UNKNOWN";
  const priceVsZone = stock.priceVsZone || {};
  const days = readNumber(stock.daysToExDiv);
  const insideZone = entryStatus === "INSIDE" || priceVsZone.insideZone === true;
  const distancePct = Math.abs(readNumber(priceVsZone.distancePct, 9999));
  const nearAbove = entryStatus === "ABOVE" && distancePct <= 3 && days != null && days <= 90;
  const slightBelow = entryStatus === "BELOW" && distancePct <= 0.5;

  if (tail === "SEVERE") {
    return { label: "Too Risky", tone: "bad", reason: "Tail risk is too severe for a live setup." };
  }

  if (entryStatus === "ABOVE" && !nearAbove) {
    return { label: "Wait", tone: "warn", reason: "Price is too far above the entry zone right now." };
  }

  if (insideZone) {
    if (tail === "HIGH" || timing === "UNRELIABLE") {
    return { label: "Small Trades Advised", tone: "warn", reason: "The setup is live, but risk or timing lowers confidence." };
    }
    return { label: "Actionable Now", tone: "good", reason: "Price is in the zone and the setup is active now." };
  }

  if (nearAbove) {
    return { label: "Watch Closely", tone: "warn", reason: "Price is close to the zone and may become actionable soon." };
  }

  if (slightBelow) {
    if (tail === "HIGH" || timing === "UNRELIABLE") {
      return { label: "Small Trades Advised", tone: "warn", reason: "Price is only slightly below the zone, but risk or timing lowers confidence." };
    }
    if (tail === "LOW" || tail === "MODERATE") {
      return { label: "Actionable Now", tone: "good", reason: "Price is only slightly below the zone, which can still be a valid entry." };
    }
    return { label: "Small Trades Advised", tone: "warn", reason: "Price is only slightly below the zone, but the tail profile still calls for caution." };
  }

  if (entryStatus === "BELOW") {
    return { label: "Wait", tone: "warn", reason: "Price is well below the zone and may have overshot the expected entry area." };
  }

  if (days != null && days <= 90) {
    return { label: "Watch Only", tone: "pu", reason: "The next cycle is approaching, but price is not yet in position." };
  }

  return { label: "On Radar", tone: "muted", reason: "Structurally interesting, but not yet close to action." };
}

function scoreWinRate(value) {
  if (value == null) {
    return 0;
  }
  return clamp(((value - 35) / 45) * 100, 0, 100);
}

function scoreCleanCycles(value) {
  if (value == null) {
    return 0;
  }
  return clamp(((value - 2) / 8) * 100, 0, 100);
}

function scoreYearsData(value) {
  if (value == null) {
    return 0;
  }
  return clamp(((value - 1) / 7) * 100, 0, 100);
}

function scoreFrequency(value) {
  const map = {
    QUARTERLY: 100,
    SEMI_ANNUAL: 95,
    MONTHLY: 82,
    ANNUAL: 60,
    IRREGULAR: 20,
    UNKNOWN: 35,
  };
  return map[value] != null ? map[value] : map.UNKNOWN;
}

function scoreTiming(value) {
  const map = {
    RELIABLE: 100,
    BIMODAL: 72,
    UNRELIABLE: 20,
    UNKNOWN: 40,
  };
  return map[value] != null ? map[value] : map.UNKNOWN;
}

function scoreTailRisk(value) {
  const map = {
    LOW: 100,
    MODERATE: 82,
    CAUTION: 60,
    HIGH: 30,
    SEVERE: 0,
    UNKNOWN: 50,
  };
  return map[value] != null ? map[value] : map.UNKNOWN;
}

function scoreDivTrend(value) {
  const map = {
    RISING: 100,
    STABLE: 80,
    DECLINING: 30,
    FALLING: 30,
    UNKNOWN: 55,
  };
  return map[value] != null ? map[value] : map.UNKNOWN;
}

function scoreZoneWidth(value) {
  if (value == null) {
    return 55;
  }
  if (value <= 3) {
    return 100;
  }
  if (value <= 5) {
    return 88;
  }
  if (value <= 8) {
    return 68;
  }
  if (value <= 12) {
    return 45;
  }
  return 20;
}







function weightedScore(parts, weights) {
  let total = 0;
  let totalWeight = 0;

  Object.keys(weights || {}).forEach((key) => {
    const weight = readNumber(weights[key], 0);
    const value = clamp(readNumber(parts[key], 0), 0, 100);
    total += value * weight;
    totalWeight += weight;
  });

  if (!totalWeight) {
    return 0;
  }

  return total / totalWeight;
}

function getPotentialLabel(score, config) {
  if (score >= config.potentialLabels.strong) {
    return "Strong Potential";
  }
  if (score >= config.potentialLabels.watchlist) {
    return "Watchlist";
  }
  if (score >= config.potentialLabels.borderline) {
    return "Borderline";
  }
  return null;
}
function shouldShowPotentialLabel(stock){
  return readNumber(stock?.nEffective, 0) >= 3;
}



function normalizeFrequency(value) {
  const raw = slug(value);
  if (!raw) {
    return "UNKNOWN";
  }
  if (raw.includes("QUARTER")) {
    return "QUARTERLY";
  }
  if (raw.includes("SEMI") || raw.includes("HALF_YEAR")) {
    return "SEMI_ANNUAL";
  }
  if (raw.includes("MONTH")) {
    return "MONTHLY";
  }
  if (raw.includes("ANNUAL") || raw === "YEARLY") {
    return "ANNUAL";
  }
  if (raw.includes("IRREGULAR")) {
    return "IRREGULAR";
  }
  return raw;
}

function normalizeTiming(value) {
  const raw = slug(value);
  if (!raw) {
    return "UNKNOWN";
  }
  if (raw.includes("RELIABLE")) {
    return raw.includes("UNRELIABLE") ? "UNRELIABLE" : "RELIABLE";
  }
  if (raw.includes("BIMODAL")) {
    return "BIMODAL";
  }
  if (raw.includes("UNRELIABLE")) {
    return "UNRELIABLE";
  }
  return raw;
}

function normalizeEntryStatus(value) {
  const raw = slug(value);
  if (!raw) {
    return "UNKNOWN";
  }
  if (raw.includes("INSIDE")) {
    return "INSIDE";
  }
  if (raw.includes("ABOVE")) {
    return "ABOVE";
  }
  if (raw.includes("BELOW")) {
    return "BELOW";
  }
  return raw;
}

function normalizeDivTrend(value) {
  const raw = slug(value);
  if (!raw) {
    return "UNKNOWN";
  }
  if (raw.includes("RISING") || raw.includes("IMPROV")) {
    return "RISING";
  }
  if (raw.includes("DECLIN") || raw.includes("FALL")) {
    return "DECLINING";
  }
  if (raw.includes("STABLE") || raw.includes("FLAT")) {
    return "STABLE";
  }
  return raw;
}

function normalizeTailRiskLevel(value) {
  if (value && typeof value === "object") {
    const explicit = slug(value.tail_level || value.level);
    if (explicit) {
      if (explicit.includes("SEVERE")) return "SEVERE";
      if (explicit.includes("HIGH")) return "HIGH";
      if (explicit.includes("CAUTION")) return "CAUTION";
      if (explicit.includes("MODERATE")) return "MODERATE";
      if (explicit.includes("LOW")) return "LOW";
    }
    if (value.tail_warning === true) {
      const gap = readNumber(value.tail_vs_zone_gap);
      if (gap != null && gap <= -8) {
        return "SEVERE";
      }
      if (gap != null && gap <= -5) {
        return "HIGH";
      }
      return "CAUTION";
    }

    const worstDrawdown = Math.abs(readNumber(value.worst_drawdown_pct, 0));
    if (worstDrawdown >= 20) {
      return "SEVERE";
    }
    if (worstDrawdown >= 15) {
      return "HIGH";
    }
    if (worstDrawdown >= 10) {
      return "CAUTION";
    }
    if (worstDrawdown >= 6) {
      return "MODERATE";
    }
    return "LOW";
  }

  const raw = slug(value);
  if (!raw) {
    return "UNKNOWN";
  }
  if (raw.includes("SEVERE")) {
    return "SEVERE";
  }
  if (raw.includes("HIGH")) {
    return "HIGH";
  }
  if (raw.includes("CAUTION")) {
    return "CAUTION";
  }
  if (raw.includes("MODERATE")) {
    return "MODERATE";
  }
  if (raw.includes("LOW")) {
    return "LOW";
  }
  if (raw.includes("WARNING")) {
    return "CAUTION";
  }
  return "UNKNOWN";
}

function normalizeYieldRange(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => readNumber(item))
      .filter((item) => item != null);
  }

  if (typeof value === "string") {
    const matches = value.match(/-?\d+(\.\d+)?/g);
    return matches ? matches.map(Number) : [];
  }

  if (value && typeof value === "object") {
    const low = readNumber(value.low || value.min || value[0]);
    const high = readNumber(value.high || value.max || value[1]);
    return [low, high].filter((item) => item != null);
  }

  return [];
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function normalizeDaysToExDiv(value, nextExDiv) {
  const explicit = readNumber(value);
  if (explicit != null) {
    return Math.round(explicit);
  }
  return daysUntil(nextExDiv);
}

function normalizePriceVsZone(value) {
  if (!value || typeof value !== "object") {
    return getPriceVsZone({});
  }
  return {
    relation: normalizeEntryStatus(value.relation),
    distancePct: readNumber(value.distancePct),
    insideZone: Boolean(value.insideZone),
    nearZone: Boolean(value.nearZone),
    scoreHint: clamp(readNumber(value.scoreHint, 0), 0, 100),
  };
}

function isTailRiskTooHigh(level, maxAllowed) {
  const current = TAIL_RISK_ORDER[level] != null ? TAIL_RISK_ORDER[level] : TAIL_RISK_ORDER.UNKNOWN;
  const allowed = TAIL_RISK_ORDER[maxAllowed] != null ? TAIL_RISK_ORDER[maxAllowed] : TAIL_RISK_ORDER.CAUTION;
  return current > allowed;
}

function sumCleanCycles(ssSeries) {
  return Object.values(ssSeries || {}).reduce((sum, series) => {
    const count = readNumber(series && series.clean && series.clean.n_clean, 0);
    return sum + count;
  }, 0);
}

function daysUntil(dateString) {
  if (!dateString) {
    return null;
  }
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target - startOfToday) / 86400000);
}

function mergeConfig(baseConfig, userConfig) {
  const config = Object.assign({}, baseConfig, userConfig || {});

  config.allowedFrequencies = Array.isArray(userConfig.allowedFrequencies)
    ? userConfig.allowedFrequencies.map(normalizeFrequency)
    : baseConfig.allowedFrequencies.slice();

  config.potentialWeights = Object.assign(
    {},
    baseConfig.potentialWeights,
    userConfig.potentialWeights || {}
  );

  config.potentialLabels = Object.assign(
    {},
    baseConfig.potentialLabels,
    userConfig.potentialLabels || {}
  );

  config.maxTailRiskLevel = normalizeTailRiskLevel(config.maxTailRiskLevel);
  return config;
}

function readNumber(value, fallback = null) {
  if (value == null || value === "") {
    return fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function readString(value) {
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function slug(value) {
  return readString(value)
    .toUpperCase()
    .replace(/[%()]/g, " ")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clamp(value, min, max) {
  if (value == null || Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals) {
  if (!Number.isFinite(value)) {
    return value;
  }
  const factor = Math.pow(10, decimals || 0);
  return Math.round(value * factor) / factor;
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}


if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CONFIG,
    normalizeStock,
    getZoneWidthPct,
    getPriceVsZone,
    scorePotentialStock,
    explainPotentialStock,
    explainUpcomingStock,
    isPotentialStock,
    getPotentialStocks,
    getUpcomingStocks,
    buildGroupedStockView,
  };
}

if (typeof window !== "undefined") {
  window.DividendGroupedStocks = {
    CONFIG,
    normalizeStock,
    getZoneWidthPct,
    getPriceVsZone,
    scorePotentialStock,
    explainPotentialStock,
    explainUpcomingStock,
    isPotentialStock,
    getPotentialStocks,
    getUpcomingStocks,
    buildGroupedStockView,
  };
}

/* -- STATE & ELEMENTS ---------------------------------------------------- */
const state={
  stocks:{},        // key=ticker|filename ? {data, label, key}
  activeKey:null,   // currently drilled-into stock
  tab:0,
  view:"overview",  // "overview" | "drill"
overviewMode:"overview", // "overview" | "grouped" | "compare" | "planner"
  portfolio:[],     // [{ticker, quantity, avgCostPrice, purchaseDate, notes}], persisted separately in PORTFOLIO_STORAGE_KEY
  portfolioHistory:[], // [{date, totalValue, totalCost}], persisted separately in PORTFOLIO_HISTORY_STORAGE_KEY
  portfolioRealized:[], // [{ticker, quantity, sellPrice, sellDate, realizedPnl, notes}], persisted separately in PORTFOLIO_REALIZED_STORAGE_KEY
  portfolioDividends:[], // [{ticker, date, amount, notes}], persisted separately in PORTFOLIO_DIVIDENDS_STORAGE_KEY
  portfolioFees:[], // [{date, amount, notes}], persisted separately in PORTFOLIO_FEES_STORAGE_KEY
  portfolioRebates:[], // [{date, amount, notes}], persisted separately in PORTFOLIO_REBATES_STORAGE_KEY
  portfolioNetDeposits:[], // [{date, amount, notes}], persisted separately in PORTFOLIO_NET_DEPOSITS_STORAGE_KEY
  portfolioWithdrawals:[], // [{date, amount, notes}], persisted separately in PORTFOLIO_WITHDRAWALS_STORAGE_KEY
  portfolioAccountValue:[], // [{date, totalValue, notes}], persisted separately in PORTFOLIO_ACCOUNT_VALUE_STORAGE_KEY
  portfolioChartGranularity:"monthly", // "weekly" | "monthly" | "yearly"
  portfolioSubTab:"holdings", // "holdings" | "history" | "reconcile"
  portfolioReturnSort:{held:{field:"totalReturn",dir:"desc"},closed:{field:"totalReturn",dir:"desc"}},
  zoneOutcomeMode:"current",
  zoneOutcomeFilterKeys:["all"],
  setupMapFilterKeys:["all"],
  setupMapViewMode:"map",
  setupListSort:{below:{field:"gain",dir:"desc"},inside:{field:"gain",dir:"desc"},above:{field:"gain",dir:"desc"}},
  rememberLoadedStocks:true,
  serverLoadedFiles:[],
  reviewSort:{keep:"score",watch:"zoneHit",remove:"score"},
  reviewSearch:"",
  registryEntries:[],
  registryEditingIndex:null,
  masterStocks:[],
  registryMultiSelectEnabled:false,
  registrySelectedMasterTickers:[],
  registryMasterPage:1,
  stockDescriptions:{},
  stockFinancials:{},
  planner:{},
  plannerActiveKey:null,
  cmpSortKey:"none",
  cmpSortDir:"asc",
  cmpFilterSector:"all",
  cmpFilterEntryStatus:"all",
  groupedUpcomingSort:"smart",
  groupedPotentialSort:"potential",
  groupedPotentialSearch:"",
  groupedUpcomingSearch:"",
  groupedSubTab:"potential",
  groupedPotentialFilterFrequency:"all",
  groupedPotentialFilterTiming:"all",
  groupedPotentialFilterTail:"all",
  groupedPotentialFilterExitMode:"all",
  groupedPotentialFilterScore:"0",
  groupedUpcomingFilterFrequency:"all",
  groupedUpcomingFilterEntry:"all",
  groupedUpcomingFilterExitMode:"all",
  groupedUpcomingFilterTail:"all",
  groupedUpcomingFilterDays:"0",
  groupedUpcomingFilterGain:"0",
};
const app=document.getElementById("app");
const BACKEND_CONFIG = {
  enabled:["http:","https:"].includes(window.location.protocol),
  staticJsonBase:"./data/analysis",
  healthUrl:"/api/health",
  jsonFilesUrl:"/api/json-files",
  runPipelineUrl:"/api/run-pipeline",
  runPipelineStreamUrl:"/api/run-pipeline-stream",
  stockRegistryUrl:"/api/stock-registry",
  masterStocksUrl:"/api/master-stocks",
  stockDescriptionsUrl:"/api/stock-descriptions",
  stockDescriptionsStaticUrl:"./data/stock_descriptions.json",
  stockFinancialsUrl:"/api/stock-financials",
  stockFinancialsStaticUrl:"./data/stock_financials.json",
};
let backendHealthPromise=null;
let backendAvailable=false;
const PLANNER_STORAGE_KEY="dividend-cycle-dashboard-planner-v1";
// Separate key from PLANNER_STORAGE_KEY on purpose -- holdings are financial
// records the user is trusting the browser to keep, not transient UI state,
// so they shouldn't share a key with (or get wiped by) unrelated planner/UI
// state toggles like rememberLoadedStocks.
const PORTFOLIO_STORAGE_KEY="dividend-cycle-dashboard-portfolio-v1";
// Separate again from PORTFOLIO_STORAGE_KEY -- this is an accumulating log
// (appends over time as the user visits) not a bulk-replaced current-state
// blob, so it shouldn't be overwritten wholesale the way holdings are.
const PORTFOLIO_HISTORY_STORAGE_KEY="dividend-cycle-dashboard-portfolio-history-v1";
// Same reasoning as PORTFOLIO_HISTORY_STORAGE_KEY -- each of these is its own
// independent event log (a sale, a dividend, a fee period, a balance
// snapshot), not part of the bulk-replaced current-holdings blob.
const PORTFOLIO_REALIZED_STORAGE_KEY="dividend-cycle-dashboard-portfolio-realized-v1";
const PORTFOLIO_DIVIDENDS_STORAGE_KEY="dividend-cycle-dashboard-portfolio-dividends-v1";
const PORTFOLIO_FEES_STORAGE_KEY="dividend-cycle-dashboard-portfolio-fees-v1";
const PORTFOLIO_REBATES_STORAGE_KEY="dividend-cycle-dashboard-portfolio-rebates-v1";
const PORTFOLIO_NET_DEPOSITS_STORAGE_KEY="dividend-cycle-dashboard-portfolio-net-deposits-v1";
const PORTFOLIO_WITHDRAWALS_STORAGE_KEY="dividend-cycle-dashboard-portfolio-withdrawals-v1";
const PORTFOLIO_ACCOUNT_VALUE_STORAGE_KEY="dividend-cycle-dashboard-portfolio-account-value-v1";

/* -- HELPERS ------------------------------------------------------------- */
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
function n(v,d=2){const x=Number(v);return Number.isFinite(x)?x.toFixed(d):"-"}
function pct(v,d=1){const x=Number(v);return Number.isFinite(x)?`${x>=0?"+":""}${x.toFixed(d)}%`:"-"}
function pctRaw(v,d=1){const x=Number(v);return Number.isFinite(x)?`${x.toFixed(d)}%`:"-"}
function ccy(v,c=""){return(v===null||v===undefined)?"-":`${c?c+" ":""}${n(v,4)}`}
function compactCcy(v,c=""){
  if(v==null||!Number.isFinite(Number(v)))return"-";
  const abs=Math.abs(v);
  const fmt=abs>=1e9?`${(v/1e9).toFixed(2)}B`:abs>=1e6?`${(v/1e6).toFixed(1)}M`:abs>=1e3?`${(v/1e3).toFixed(0)}K`:String(Math.round(v));
  return`${c?c+" ":""}${fmt}`;
}
function dt(v){if(!v)return"-";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString("en-GB",{year:"numeric",month:"short",day:"numeric"})}
function dtShort(v){if(!v)return"-";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString("en-GB",{month:"short",day:"numeric"})}
function dtClusterRange(from,center,to,sdWks){if(!center)return"-";if(!from||!to||from===to){if(sdWks!=null&&sdWks>0){return`${dtShort(center)} <span class="date-wide" title="Timing spread too wide to show a date range (SD: ${sdWks.toFixed(1)}wk) — date shown is the best estimate.">±${sdWks.toFixed(1)}wk</span>`;}return dtShort(center);}return`${dtShort(from)} – ${dtShort(to)}<br><span class="date-best">best: ${dtShort(center)}</span>`}
function clusterDominanceTag(cd){
  if(!cd||!cd.total)return"-";
  const c1=cd.cluster1_count||0,c2=cd.cluster2_count||0,dom=cd.dominant,pct=cd.dominant_pct,rp=cd.recent_primary;
  const c1cls=dom===1?"cd-dom":"",c2cls=dom===2?"cd-dom":"";
  const fmtDip=v=>v!=null?`<span style="font-size:10px"> avg dip ${v>=0?"+":""}${v.toFixed(1)}%</span>`:"";
  let h=`<span class="cd-bar"><span class="${c1cls}" title="Cluster 1 — early dip (farther from ex-div). Count = historical cycles in this cluster. Avg dip = average low_vs_prevdp across those cycles.">C1: ${c1}${fmtDip(cd.cluster1_avg_dip)}</span><span class="cd-sep">/</span><span class="${c2cls}" title="Cluster 2 — late dip (closer to ex-div). Count = historical cycles in this cluster. Avg dip = average low_vs_prevdp across those cycles.">C2: ${c2}${fmtDip(cd.cluster2_avg_dip)}</span>`;
  if(pct!=null&&pct>=75)h+=` <span class="chip warn cd-warn" title="One cluster dominates — consider re-evaluating as RELIABLE timing">C${dom} leads ${pct}%</span>`;
  else if(dom!=null&&pct!=null)h+=` <span class="cd-pct">(${pct}%)</span>`;
  if(rp!=null)h+=` <span class="chip cd-recent" title="Prevailed in last 3 clean cycles">recent C${rp}</span>`;
  h+=`</span>`;
  return h;
}
function clusterTrackRecordTag(ca){
  if(!ca||!ca.resolved_count)return null;
  const c1cls=ca.c1_wins>ca.c2_wins?"cd-dom":"",c2cls=ca.c2_wins>ca.c1_wins?"cd-dom":"";
  return`<span class="cd-bar"><span class="${c1cls}" title="C1 wins in forward-validated predictions">C1: ${ca.c1_wins}</span><span class="cd-sep">/</span><span class="${c2cls}" title="C2 wins in forward-validated predictions">C2: ${ca.c2_wins}</span><span class="cd-pct">(${ca.resolved_count} resolved)</span></span>`;
}
function daysFrom(dateStr){if(!dateStr)return null;const d=new Date(dateStr),t=new Date();d.setHours(0,0,0,0);t.setHours(0,0,0,0);return Math.round((d-t)/86400000)}
function toBool(v){return v===true||String(v).toLowerCase()==="true"}
function monthName(m){return["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(m-1)]||"-"}
function doy(ds){const d=new Date(ds);return Number.isNaN(d.getTime())?null:Math.floor((d-new Date(d.getFullYear(),0,0))/86400000)}
function dayMonth(ds){const d=new Date(ds);return Number.isNaN(d.getTime())?ds:d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}
function tipLabel(label,text){return`${label}<span class="help" title="${esc(text)}">i</span>`}

function syncMobileTopbarActions(){
  const actions=document.querySelector(".topbar-actions");
  const toggle=document.getElementById("mobileActionsToggle");
  if(!actions||!toggle)return;
  const mobile=window.matchMedia("(max-width: 640px)").matches;
  if(!mobile){
    actions.classList.remove("collapsed","expanded");
    toggle.style.display="none";
    toggle.setAttribute("aria-expanded","false");
    return;
  }
  toggle.style.display="inline-flex";
  if(!actions.classList.contains("collapsed") && !actions.classList.contains("expanded")){
    actions.classList.add("collapsed");
  }
  toggle.setAttribute("aria-expanded",actions.classList.contains("expanded")?"true":"false");
}

function tagClass(v){
  const s=String(v||"").toUpperCase();
  if(["INSIDE","RELIABLE","ADEQUATE","STABLE","IMPROVING","CALENDAR_CONSISTENT","MODERATE_SAMPLE","LOW"].includes(s))return"good";
  if(["ABOVE","BIMODAL","MODERATE","CALENDAR_MODERATE","THIN","CAUTION"].includes(s))return"warn";
  if(["BELOW","UNRELIABLE","INSUFFICIENT","CALENDAR_WIDE","DEGRADING","HIGH","SEVERE"].includes(s))return"bad";
  return""
}

const CAL_RATING_TIP={
  "CALENDAR_CONSISTENT":"Lows cluster tightly — spread =60 days across all clean cycles. The calendar month is a reliable entry signal.",
  "CALENDAR_MODERATE":"Lows spread across 2–4 months (60–120 day spread). Calendar window gives a useful but approximate entry window.",
  "CALENDAR_WIDE":"Lows are scattered across more than 4 months (>120 day spread). Calendar month alone is not a reliable entry signal — use price zone only.",
};
function calRatingChip(rating,spreadDays,labelText){
  const label=labelText || "-";
  const tip=CAL_RATING_TIP[String(rating||"").toUpperCase()]||"";
  const spread=Number(spreadDays);
  const spreadStr=Number.isFinite(spread)?` (${spread}d spread)`:"";
  return tip
    ?`<span class="chip ${tagClass(rating)}" title="${esc(tip)}">${label}${spreadStr}</span>`
    :`<span class="chip ${tagClass(rating)}">${label}${spreadStr}</span>`
}

function stabilityColor(score){
  if(score>=75)return"var(--gn)";
  if(score>=50)return"var(--am)";
  return"var(--rd)"
}

function upcomingSeries(data){
  const entries=Object.entries(data.proj_series||{});
  if(!entries.length)return null;
  const today=new Date((data.meta?.today)||new Date().toISOString().slice(0,10));
  const future=entries.map(([id,proj])=>({id,proj,d:new Date(proj.proj_exdiv_date)}))
    .filter(x=>!Number.isNaN(x.d.getTime())&&x.d>=today)
    .sort((a,b)=>a.d-b.d);
  return future[0]||{id:entries[0][0],proj:entries[0][1]}
}

function validateData(data){
  if(!data||typeof data!=="object"||Array.isArray(data))
    throw new Error("JSON is empty or not an object.");
  const missing=["meta","proj_series","series_meta","cycles"].filter(k=>!(k in data));
  if(missing.length)
throw new Error(`Missing required Dividend Cycle Analysis keys: ${missing.join(", ")}.`);
  if(!Array.isArray(data.series_meta))
    throw new Error("series_meta must be an array.");
  if(!Array.isArray(data.cycles))
    throw new Error("cycles must be an array.");
  if(!data.meta.ticker&&!data.meta.stock_name)
    throw new Error("meta must include ticker or stock_name.");
}

/* -- ZONE BAR VISUAL ----------------------------------------------------- */
function zoneInline(bot,top,currency){
  const lo=Number(bot),hi=Number(top);
  if(!Number.isFinite(lo)||!Number.isFinite(hi))return"-";
  return`<span class="zone-inline">${ccy(lo,currency)} – ${ccy(hi,currency)}</span>`
}

/* -- STABILITY SPARKLINE ------------------------------------------------- */
function stabilitySparkline(scores){
  if(!Array.isArray(scores)||!scores.length)return"";
  const max=Math.max(...scores,1);
  const bars=scores.map(s=>{
    const h=Math.max(4,Math.round((s/100)*28));
    return`<div class="bar" style="height:${h}px;background:${stabilityColor(s)};flex:1" title="Score: ${s}"></div>`
  }).join("");
  return`<div class="spark-stability">${bars}</div>`
}

function projForSeries(data,sid){return data.proj_series?.[sid]||{}}

function cleanCyclesForSeries(data,sid){
  return (data.cycles||[]).filter(c=>c.series===sid&&!toBool(c.macro)&&!toBool(c.outlier)&&!toBool(c.degen)&&!c.incomplete)
    .sort((a,b)=>new Date(a.exdiv_date)-new Date(b.exdiv_date))
}

function renderHeroDataset(data){
  const m=data.meta||{};
  return`<div class="hero-section">
    <h2>Dataset Overview</h2>
    <div class="kv">
      <div>Exchange</div><div>${esc(m.exchange||"-")}</div>
      <div>Currency</div><div>${esc(m.currency||"-")}</div>
      <div>Data window</div><div>${dt(data.data_window_start)} to ${dt(data.data_window_end)}</div>
      <div>Years covered</div><div>${n(data.years_covered,2)}</div>
  <div>${tipLabel("Adaptive window","How far back Dividend Cycle Analysis looks before ex-div when searching for the cycle low.")}</div>
      <div>${n(m.adaptive_window_days,0)} days</div>
      <div>${tipLabel("Mean interval","Average number of days between dividend events after noisy cases are cleaned out.")}</div>
      <div>${n(m.mean_interval_days,1)} days</div>
    </div>
    ${(data.edge_case_flags_display||[]).length?`<div class="chips">${data.edge_case_flags_display.map(x=>`<span class="chip bad">${esc(x)}</span>`).join("")}</div>`:""}
  </div>`
}

/* -- TAB 0: SERIES ------------------------------------------------------- */
function debtEquityTone(pct){
  if(pct==null)return"";
  if(pct<60)return"good";
  if(pct<=120)return"warn";
  return"bad";
}
function dividendCoverageTone(x){
  if(x==null)return"";
  if(x>=1.3)return"good";
  if(x>=1.0)return"warn";
  return"bad";
}

// Stock-level (not per-series) financial-health summary, shown once above the
// series grid -- unlike 5yr price growth, which is small enough to repeat per
// series card, a multi-line financial block isn't worth duplicating per series.
function renderFinancialSummary(ticker,currency){
  const fin=financialsFor(ticker);
  if(!fin)return"";
  const health=fin.health;
  return`<div class="panel" style="margin-bottom:14px">
    <h2>Financial Health</h2>
    <p class="small muted" style="margin:0 0 10px">As of ${dt(fin.as_of)} · from the company's balance sheet &amp; cash flow statements (annual cadence, not live) · see the Financials tab for multi-year history</p>
    ${health?`<div class="section-note" style="margin:0 0 12px">${verdictPill(health.label,health.tone)} ${esc(health.reason)}</div>`:""}
    <div class="series-kv">
      <div>${tipLabel("Debt / Equity","Total debt divided by stockholders' equity — how much debt is used per dollar of the company's own capital. Below 60% is considered low leverage (green), 60–120% moderate (amber), above 120% high (red) for this portfolio; higher isn't automatically bad, but it means more of the balance sheet depends on lenders rather than shareholders. Computed from raw balance-sheet line items, not Yahoo's own pre-packaged ratio (confirmed unreliable — missing on large caps, and inconsistent with the raw statement data on at least one tested ticker).")}</div><div class="${debtEquityTone(fin.debt_to_equity_pct)}">${fin.debt_to_equity_pct!=null?`${n(fin.debt_to_equity_pct,1)}%`:"-"}</div>
      <div>${tipLabel("Net debt","Total debt minus cash and cash equivalents. Negative means the company holds more cash than debt — a net cash position, effectively a buffer. Positive means debt exceeds cash, which is normal for most businesses. Not colour-graded here: the same dollar figure is trivial for a large company and heavy for a small one — the debt/equity ratio above already accounts for size, this is just the raw balance.")}</div><div>${compactCcy(fin.net_debt,currency)}</div>
      <div>${tipLabel("Dividend coverage (FCF)","Free cash flow divided by cash dividends paid — how many times over the dividend was funded by cash the business actually generated. 1.3x or more is comfortable (green), 1.0–1.3x is thin (amber), below 1x means the company paid out more than it generated that period — funded from cash reserves or debt, not earnings (red). This is the clearest dividend-sustainability signal available from statement data.")}</div><div class="${dividendCoverageTone(fin.dividend_fcf_coverage)}">${fin.dividend_fcf_coverage!=null?`${n(fin.dividend_fcf_coverage,2)}x`:"-"}</div>
      <div>${tipLabel("Current ratio","Current assets divided by current liabilities. Shown for context only — not colour-graded. REITs/Trusts structurally run below 1 here (financed by refinancing, not working capital), so a naive low-ratio warning would misfire on most healthy REITs in this portfolio.")}</div><div>${fin.current_ratio!=null?n(fin.current_ratio,2):"-"}</div>
    </div>
  </div>`;
}

function panelSeries(data){
  const m=data.meta||{},meta=data.series_meta||[];
  if(!meta.length)return`<div class="empty">No series metadata found.</div>`;
  const gridStyle=meta.length<=4
    ? `style="grid-template-columns:repeat(${meta.length},minmax(0,1fr))"`
    : "";
  return renderFinancialSummary(m.ticker,m.currency)+`<div class="series-grid" ${gridStyle}>${meta.map(s=>renderSeriesCard(s,data,m)).join("")}</div>`
}

function renderExitProfile(ep){
  if(!ep || typeof ep !== "object") return "";

  const verdictMap = {
    PRE_EXDIV_PREFERRED: "Pre-Exdiv Peak Exit preferred",
    POST_EXDIV_PREFERRED: "Ex-Div Date Exit preferred",
    INDETERMINATE: "Indeterminate",
    INSUFFICIENT_DATA: "Insufficient data",
  };
  const verdict = verdictMap[ep.exit_mode_verdict] || (ep.exit_mode_verdict ? String(ep.exit_mode_verdict) : "-");
  const completeCycles = Number.isFinite(Number(ep.n_complete_cycles)) ? String(Number(ep.n_complete_cycles)) : "-";
  const optimalBefore = ep.pct_opt_before_exdiv != null ? pctRaw(ep.pct_opt_before_exdiv,0) : "-";
  const preExdivPeakWindow = ep.pre_exdiv_peak_window_days_p25 != null && ep.pre_exdiv_peak_window_days_p75 != null
    ? `${n(ep.pre_exdiv_peak_window_days_p25,1)}d - ${n(ep.pre_exdiv_peak_window_days_p75,1)}d`
    : "-";
  const medTiming = ep.med_days_vs_exdiv != null ? `${n(ep.med_days_vs_exdiv,1)}d` : "-";
  const avgOptimal = ep.avg_gain_optimal != null ? pctRaw(ep.avg_gain_optimal,2) : "-";
  const avgPreExDiv = ep.avg_gain_pre_exdiv != null ? pctRaw(ep.avg_gain_pre_exdiv,2) : "-";
  const avgPostExdivExitValue = ep.avg_gain_post_exdiv_exit;
  const avgPostExdivExit = avgPostExdivExitValue != null ? pctRaw(avgPostExdivExitValue,2) : "-";
  const preExDivWinRate = ep.pre_exdiv_win_rate != null ? pctRaw(ep.pre_exdiv_win_rate,1) : "-";
  const postExdivExitWinRateValue = ep.post_exdiv_exit_win_rate;
  const postExdivExitWinRate = postExdivExitWinRateValue != null ? pctRaw(postExdivExitWinRateValue,1) : "-";

  return `<div class="series-kv" style="margin-top:10px">
    <div class="series-subhead">Exit Analysis</div>
<div>${tipLabel("Exit mode","Simple summary of which exit style looked better in past complete cycles. Pre-Exdiv Peak Exit preferred means average pre-exdiv gain was at least 95% of average ex-div-date gain when the ex-div-date path was positive. Ex-Div Date Exit preferred means average optimal gain was more than 105% of average ex-div-date gain and fewer than 40% of optimal exits happened before ex-div.")}</div><div>${esc(verdict)}</div>
    <div>${tipLabel("Complete cycles","How many finished historical cycles were available to compare the two exit paths. More cycles usually means more confidence.")}</div><div>${esc(completeCycles)}</div>
    <div>${tipLabel("Optimal before ex-div","How often the best hindsight exit happened before the ex-dividend date. This is a reference check, not a direct trading rule.")}</div><div>${optimalBefore}</div>
    <div>${tipLabel("Usual pre-exdiv peak window","The usual range of days before ex-div where the pre-exdiv peak tended to occur. Think of this as a historical window, not an exact sell date.")}</div><div>${esc(preExdivPeakWindow)}</div>
    <div>${tipLabel("Median timing vs ex-div","Middle value for when the hindsight-best exit happened relative to ex-div. Negative means before ex-div; positive means after.")}</div><div>${esc(medTiming)}</div>
    <div>${tipLabel("Avg gain (optimal)","Average gain from the cycle low to the best hindsight exit in each complete cycle. Useful as a reference, but not directly tradable.")}</div><div>${avgOptimal}</div>
    <div>${tipLabel("Avg gain (pre-exdiv peak exit)","Average gain from the cycle low to the highest close reached before ex-div.")}</div><div>${avgPreExDiv}</div>
    <div>${tipLabel("Avg gain (ex-div date exit)","Average gain from the cycle low to the first available close on or after ex-div.")}</div><div>${avgPostExdivExit}</div>
<div>${tipLabel("Pre-exdiv peak win rate","Percent of complete cycles where the pre-exdiv peak exit cleared the model's 3% gain threshold.")}</div><div>${preExDivWinRate}</div>
<div>${tipLabel("Ex-div date exit win rate","Percent of complete cycles where the ex-div date exit cleared the model's 3% gain threshold.")}</div><div>${postExdivExitWinRate}</div>
  </div>`;
}

function renderSeriesCard(s,data,m){
  const proj=data.proj_series?.[s.id]||{};
  const ss=data.ss_series?.[s.id]||{};
  const primaryUpcomingId=upcomingSeries(data)?.id||null;
  const isReferenceOnly=primaryUpcomingId && s.id!==primaryUpcomingId;
  const tim=ss.timing||{};
  const clean=ss.clean||{};
  const risk=ss.risk||{};
  const stab=ss.stability||{};
  const liq=ss.liquidity||{};
  const ad=data.series_adequacy?.[s.id]||{};
  const cal=tim.cal_window||{};

  // risk flags
  const hasTailWarn=toBool(proj.tail_risk?.tail_warning);
  const hasFragWarn=toBool(proj.zone_fragility?.fragility_warning);
  const fragSeverity=resolveFragilitySeverity(proj);
  const anchorSourceLabel = proj.anchor_source === "previous_exdiv_prev_dp"
    ? "Most Recent Ex-Div Anchor"
    : proj.anchor_source === "special_exdiv_prev_dp"
      ? "Special Div Anchor (most recent ex-div)"
      : proj.anchor_source === "current_price_fallback"
        ? "Fallback: Current Price"
        : proj.anchor_source === "most_recent_prev_dp_fallback"
          ? "Fallback: Most Recent Available Anchor"
          : (proj.anchor_source || "-");
  const primaryClusterLabel = proj.est_watch_window_primary_note
    ? proj.est_watch_window_primary_note
        .replace("Primary cluster: EARLY", "Primary cluster: Early")
        .replace("Primary cluster: LATE", "Primary cluster: Late")
    : null;

  return`<div class="series-card">
    <!-- HEAD -->
    <div class="series-head">
      <div>
        <div class="pill"><span class="dot" style="background:${esc(s.color||"#4f8ef7")}"></span>${esc(s.id)}</div>
        <div class="small muted" style="margin-top:6px">${esc(s.label||"-")}</div>
        ${isReferenceOnly?`<div class="small muted" style="margin-top:6px">Reference only - the nearest next cycle is the main live setup.</div>`:""}
      </div>
      <span class="chip ${tagClass(ad.sample_size||proj.sample_size)}">${esc(proj.sample_size_display || "-")}</span>
    </div>

    <!-- CORE KV -->
    <div class="series-kv" style="margin-top:12px">
      <div class="series-subhead">Forward Setup</div>
      <div>${tipLabel("Projected ex-div date","The model's estimated next ex-dividend date for this series, based on the stock's same-series interval history and forward date projection rules.")}</div><div>${dt(proj.proj_exdiv_date)}</div>
      ${proj.est_low_date_cluster1?`<div>${tipLabel("Estimated low timing (Cluster 1)","Bimodal only. Cluster 1 = early dip — farther from ex-div date, more weeks before. Range = median ± 1 SD (population SD) of recent cluster timings. When SD ≤ 2 wks: date range shown. When SD > 2 wks: range replaced by ±Nwk badge (timing too spread to pin down). Single-point cluster: bare date only.")}</div><div>${dtClusterRange(proj.est_low_date_cluster1_from,proj.est_low_date_cluster1,proj.est_low_date_cluster1_to,proj.est_low_date_cluster1_sd_wks)}</div>`:""}
      ${proj.est_low_date_cluster2?`<div>${tipLabel("Estimated low timing (Cluster 2)","Bimodal only. Cluster 2 = late dip — closer to ex-div date, fewer weeks before. Range = median ± 1 SD (population SD) of recent cluster timings. When SD ≤ 2 wks: date range shown. When SD > 2 wks: range replaced by ±Nwk badge (timing too spread to pin down). Single-point cluster: bare date only.")}</div><div>${dtClusterRange(proj.est_low_date_cluster2_from,proj.est_low_date_cluster2,proj.est_low_date_cluster2_to,proj.est_low_date_cluster2_sd_wks)}</div>`:""}
      ${proj.cluster_dominance?`<div>${tipLabel("Cluster dominance","How often each cluster appeared across all historical cycles, with each cluster's average historical dip depth (% from anchor price). A dominant cluster (≥75%) suggests the stock may behave like RELIABLE single-cluster timing. C1 = early dip (farther from ex-div); C2 = late dip (closer). Recent indicates which cluster prevailed in the last 3 clean cycles.")}</div><div>${clusterDominanceTag(proj.cluster_dominance)}</div>`:""}
      ${proj.cluster_track_record&&clusterTrackRecordTag(proj.cluster_track_record)?`<div>${tipLabel("Cluster track record","C1/C2 win counts from out-of-sample predictions logged before outcomes were known. Unlike historical dominance, this reflects how often each window correctly called the actual dip in live forward testing — a growing empirical check that accumulates as cycles resolve.")}</div><div>${clusterTrackRecordTag(proj.cluster_track_record)}</div>`:""}
      ${!proj.est_low_date_cluster1&&proj.est_low_date?`<div>${tipLabel("Estimated low timing","For reliable timing only. Range is the p25–p75 watch window from historical weeks-before-ex-div values; best estimate is the median.")}</div><div>${dtClusterRange(proj.est_low_date_from,proj.est_low_date,proj.est_low_date_to)}</div>`:""}
      <div>Days away</div><div class="${(daysFrom(proj.proj_exdiv_date)||999)<=45?"warn":""}">${daysFrom(proj.proj_exdiv_date)!==null?`${daysFrom(proj.proj_exdiv_date)}d`:"-"}</div>
      <div>Current price</div><div>${ccy(data.current_price,m.currency)}</div>
      <div>${tipLabel("5yr price growth","Total price return over the past 5 years (weekly close ~5 years ago vs today). Excludes dividends — capital change only. Use as a background check: consistent growth suggests a healthy business; sustained decline may mean dividends are masking capital erosion.")}</div><div class="${growthCls(m.price_growth_5yr_pct)}">${growthFmt(m.price_growth_5yr_pct)}</div>
      <div>${tipLabel("Anchor method","The pre-dividend reference price used to anchor the forward zone. Normally taken from the most recent prior ex-div event (the closing price just before that ex-date). Falls back to the current live price if no prior ex-div cycle with a prev_dp is available. Displayed for reference only — the entry zone is built from the ex-dividend adjusted level: anchor minus the dividend paid, which is where the stock actually resets after the payout.")}</div>
      <div><div>${esc(anchorSourceLabel)}</div><div class="small muted">Anchor ref (pre-div) ${ccy(proj.anchor,m.currency)}</div></div>

      <div>${tipLabel("Entry zone","The projected buy range. Built from the ex-dividend adjusted anchor (anchor price minus the dividend paid), which is where the stock theoretically resets on ex-div date. Dip percentiles from clean historical cycles are applied to that adjusted level.")}</div>
      <div>${zoneInline(proj.zone_bot,proj.zone_top,m.currency)}</div>
      <div>Entry status</div><div class="${tagClass(proj.entry_status)}">${esc(proj.entry_status_display || "-")}</div>

    </div>

    <div class="series-kv" style="margin-top:10px">
      <div class="series-subhead">Historical Edge</div>
<div>${tipLabel("Win rate (clean)","Percent of clean cycles (excluding degen/macro/outlier) where the dip offered more than 3% rebound SOMEWHERE in the cycle window — not whether the projected zone specifically was touched. See Zone Hit Rate below for that.")}</div>
      <div class="${Number(risk.success_rate)>=70?"good":Number(risk.success_rate)>=50?"warn":"bad"}">${pctRaw(risk.success_rate,0)}</div>
      <div>${tipLabel("Win rate (all cycles)","Same numerator, but denominator includes degen and excluded cycles — every cycle attempt. Realistic expected rate across all cycles.")}</div>
      <div class="${Number(risk.success_rate_all)>=70?"good":Number(risk.success_rate_all)>=50?"warn":"bad"}">${risk.success_rate_all!=null?pctRaw(risk.success_rate_all,0):"-"}</div>
      <div>${tipLabel("Timing","How dependable the dip timing was in the past. Reliable means wks_cv <= 15 plus a tight spread check. Bimodal means two timing clusters split by a gap greater than 5 weeks — check cluster dominance in the Forward Setup section to see if one cluster accounts for 75%+ of cycles (which may warrant treating the stock as effectively Reliable) and which cluster historically produced the deeper dip. Unreliable means neither condition held, so price matters more than date.")}</div>
      <div class="${tagClass(tim.rating)}">${esc(tim.rating_display || "-")}</div>
      <div>${tipLabel("Dip depth CV","How similar the dip sizes were across past cycles. Lower means dips were more consistent, so the entry zone is easier to trust.")}</div>
      <div class="${Number(tim.dip_depth_cv)<45?"good":Number(tim.dip_depth_cv)<70?"warn":"bad"}">${pctRaw(tim.dip_depth_cv,1)}</div>
      <div>Clean / n_eff</div><div>${n(clean.n_clean,0)} / ${n(clean.n_effective,2)}</div>
      <div>Median dip</div><div class="bad">${pct(clean.low_vs_prevdp?.med,2)}</div>
      <div>Median peak</div><div class="good">${pct(clean.peak_vs_prevdp?.med,2)}</div>
<div class="series-subhead" style="margin-top:2px">Zone Hit Rate <span class="small muted" style="text-transform:none;letter-spacing:0;font-weight:400">— a different, harder question: not "did a dip happen" but "did THIS zone get touched"</span></div>
      <div>${tipLabel("Entry zone hit rate","Percent of clean cycles where price actually traded into the projected entry zone. This is stricter than Win Rate above — a stock can have a high win rate (a good dip happened) but a low zone hit rate (that dip didn't land in the specific projected band).")}</div>
      <div class="${Number(proj.historical_frequencies?.entry_zone_hit_rate)>=50?"good":Number(proj.historical_frequencies?.entry_zone_hit_rate)>=25?"warn":"bad"}">${pctRaw(proj.historical_frequencies?.entry_zone_hit_rate,0)}</div>
      ${proj.zone_fragility?.median_miss_pct!=null?`<div>${tipLabel("Typical miss distance","When the zone was missed, how far off (median, as % of the anchor price) the actual low typically was. Small values mean misses are usually near misses, not wild ones.")}</div><div>${proj.zone_fragility.median_miss_pct===0?"—":`±${n(proj.zone_fragility.median_miss_pct,1)}%`}</div>`:""}
      <div>Avg hold days</div><div>${n(proj.historical_frequencies?.avg_hold_days,0)}d</div>
      <div>Avg win / loss</div><div><span class="good">${pct(proj.historical_frequencies?.avg_win_pct,1)}</span> / <span class="bad">${pct(-(proj.historical_frequencies?.avg_loss_pct||0),1)}</span></div>
    </div>

    <div class="series-kv" style="margin-top:10px">
      <div class="series-subhead">Calendar & Stability</div>
      <div>Calendar window</div><div>${esc(cal.cal_window_label||"-")}</div>
      <div>${tipLabel("Calendar rating","Shows whether lows tended to happen around the same part of the calendar year. Consistent means day-of-year spread <= 60 days, Moderate means 61-120 days, and Wide means more than 120 days.")}</div>
      <div class="${tagClass(cal.cal_window_rating)}">${esc(cal.cal_window_rating_display || "-")}${Number.isFinite(Number(cal.cal_spread_days))?` · ${n(cal.cal_spread_days,0)}d`:""}</div>
      <div>${tipLabel("Stability trend","Whether the pattern has been getting cleaner, staying similar, or getting weaker in recent cycles. Improving needs slope > 5 with recent average score > 70. Degrading needs slope < -5 with recent average score < 60.")}</div>
      <div class="${tagClass(stab.stability_trend_verdict)}">${esc(stab.stability_trend_verdict_display || "-")}</div>
      <div>Recent avg score</div><div>${n(stab.stability_recent_avg,1)}</div>
    </div>
    ${stabilitySparkline(stab.scores)}

    <div class="series-kv" style="margin-top:10px">
      <div class="series-subhead">Dividend Profile</div>
      <div>Div trend</div><div class="${proj.div_trend==="RISING"?"good":proj.div_trend==="FALLING"||proj.div_trend==="DECLINING"?"bad":""}">${esc(proj.div_trend_display || "-")}</div>
      <div>Projected div range</div><div>${n(proj.div_amt_lo,4)} – ${n(proj.div_amt_hi,4)}</div>
      <div>Yield range</div><div>${pctRaw(proj.div_yield_lo,2)} – ${pctRaw(proj.div_yield_hi,2)}</div>
    </div>

    ${ss.exit_profile ? renderExitProfile(ss.exit_profile) : ""}

    <!-- RISK FLAGS -->
${hasTailWarn?`<div class="err-banner">Tail risk: worst drawdown ${n(proj.tail_risk?.worst_drawdown_pct,1)}% · tail stress avg ${n(proj.tail_risk?.worst_tail_avg,1)}%</div>`:""}
    ${fragSeverity
      ?(fragSeverity.tone==="bad"?`<div class="warn-banner">Zone fragility: ${n(proj.zone_fragility?.pct_cycles_outside_zone_clean,0)}% of clean cycles missed the zone — ${esc(fragSeverity.label)} ${esc(fragSeverity.detail)}</div>`:"")
      :(hasFragWarn?`<div class="warn-banner">Zone fragility: ${n(proj.zone_fragility?.pct_cycles_outside_zone_clean,0)}% of clean cycles missed the zone (load more stocks to compare relative standing)</div>`:"")}

    <!-- TIMING NOTE -->
    ${proj.est_low_date_note?`<div class="section-note" style="margin-top:10px">${esc(proj.est_low_date_note)}</div>`:""}
    ${proj.est_watch_window_note&&tim.rating==="BIMODAL"?`<div style="margin-top:6px;font-size:11px;color:var(--pu)">${esc(proj.est_watch_window_note)}</div>`:""}
    ${primaryClusterLabel&&tim.rating==="BIMODAL"?`<div style="margin-top:6px;font-size:11px;color:#9ad1ff">${esc(primaryClusterLabel)}</div>`:""}

    <!-- EPOCH RECENT -->
    ${tim.epoch_recent?.verdict?`<div class="small muted" style="margin-top:6px">Recent epoch: ${esc(String(tim.epoch_recent.verdict).replace("RELIABLE","Reliable"))} (cv=${n(tim.epoch_recent.cv,1)}%)</div>`:""}

  </div>`
}

/* -- TAB 1: PROJECTIONS -------------------------------------------------- */
function panelProjections(data){
  const m=data.meta||{},rows=Object.entries(data.proj_series||{});
  if(!rows.length)return`<div class="empty">No projection data found.</div>`;
  const primaryUpcomingId=upcomingSeries(data)?.id||null;
  const anchorSourceLabel = source => source === "previous_exdiv_prev_dp"
    ? "Most Recent Ex-Div Anchor"
    : source === "most_recent_prev_dp_fallback"
      ? "Fallback: Most Recent Available Anchor"
      : (source || "-");
  return`
  <div class="panel">
    <h2>Forward Projection Table</h2>
    <p class="small muted" style="margin:0 0 12px">The nearest next projected series is the main live setup. Later projected series are shown as reference only, because they depend on the dividend cycle continuing normally through the intervening payout.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Series</th>
          <th>Projected Ex-Div</th>
          <th>Days Away</th>
          <th>${tipLabel("Anchor","The pre-dividend closing price from the most recent prior ex-div event (displayed for reference only). The actual zone is built from the ex-dividend adjusted level: this price minus the dividend paid.")}</th>
<th>${tipLabel("Entry Zone","Projected buy range. Dip percentiles from clean historical cycles are applied to the ex-dividend adjusted anchor (anchor minus dividend paid) — the level where the stock mechanically resets on ex-div date.")}</th>
          <th>Est Low</th>
          <th>Est Ex-Div</th>
          <th>Est Peak</th>
          <th>Entry Status</th>
          <th>Timing</th>
<th>${tipLabel("Win Rate","Clean win rate / all-cycles win rate. Clean = only tradeable setups in denominator. All = every cycle attempt including degen.")}</th>
<th>${tipLabel("Zone Hit %","Percent of clean cycles where price actually entered the projected entry zone. Low values mean the zone was often missed from above or below.")}</th>
          <th>Avg Hold</th>
          <th>Yield Lo–Hi</th>
          <th>${tipLabel("Tail Risk","How much bad historical cycles fell below the expected zone. Higher levels mean downside has historically gone much deeper than the zone suggested.")}</th>
          <th>${tipLabel("Zone Fragility","How often the projected zone was missed, shown relative to every other loaded stock's own zone-hit rate (not a fixed threshold, which trips on nearly everything in this universe and stops being useful as a filter).")}</th>
        </tr></thead>
        <tbody>
        ${rows.map(([id,p])=>{
          const days=daysFrom(p.proj_exdiv_date);
          const isReferenceOnly=primaryUpcomingId && id!==primaryUpcomingId;
          const fragSev=resolveFragilitySeverity(p);
          return`<tr>
            <td><strong>${esc(id)}</strong>${isReferenceOnly?`<div class="small muted">Reference only</div>`:""}</td>
            <td>${dt(p.proj_exdiv_date)}</td>
            <td class="${days!==null&&days<=30?"warn":""}">${days!==null?`${days}d`:"-"}</td>
            <td><div>${ccy(p.anchor,m.currency)}</div><div class="small muted">${esc(anchorSourceLabel(p.anchor_source))}</div><div class="small muted">Anchor ref (pre-div)</div></td>
            <td><span style="font-family:var(--mono);font-size:12px">${ccy(p.zone_bot,m.currency)} – ${ccy(p.zone_top,m.currency)}</span></td>
            <td>${ccy(p.est_low_px,m.currency)}</td>
            <td>${ccy(p.est_exdiv_px,m.currency)}</td>
            <td>${ccy(p.est_peak_px,m.currency)}</td>
            <td class="${tagClass(p.entry_status)}">${esc(p.entry_status_display || "-")}</td>
            <td class="${tagClass(p.timing_rating)}">${esc(p.timing_rating_display || "-")}</td>
            <td class="${Number(p.historical_frequencies?.win_rate)>=70?"good":Number(p.historical_frequencies?.win_rate)>=50?"warn":"bad"}">${pctRaw(p.historical_frequencies?.win_rate,0)}${p.historical_frequencies?.win_rate_all!=null?`<span class="muted" style="font-size:10px"> / ${pctRaw(p.historical_frequencies.win_rate_all,0)}</span>`:""}</td>
            <td class="${Number(p.historical_frequencies?.entry_zone_hit_rate)>=50?"good":Number(p.historical_frequencies?.entry_zone_hit_rate)>=25?"warn":"bad"}">${pctRaw(p.historical_frequencies?.entry_zone_hit_rate,0)}${p.zone_fragility?.median_miss_pct?`<span class="muted" style="font-size:10px"> (miss ±${n(p.zone_fragility.median_miss_pct,1)}%)</span>`:""}</td>
            <td>${n(p.historical_frequencies?.avg_hold_days,0)}d</td>
            <td>${pctRaw(p.div_yield_lo,2)} – ${pctRaw(p.div_yield_hi,2)}</td>
            <td class="${tagClass(normalizeTailRiskLevel(p.tail_risk))}">${esc(p.tail_risk?.tail_level_display || "-")}</td>
            <td class="${fragSev?fragSev.tone:(toBool(p.zone_fragility?.fragility_warning)?"warn":"good")}">${fragSev?esc(fragSev.label):(toBool(p.zone_fragility?.fragility_warning)?"Yes":"No")}</td>
          </tr>`
        }).join("")}
        </tbody>
      </table>
    </div>
  </div>
  ${panelScenarios(data)}
  ${panelPositionCalculator(data)}
  `
}

function panelScenarios(data){
  const m=data.meta||{},entries=Object.entries(data.proj_series||{});
  const hasScenarios=entries.some(([,p])=>p.scenarios?.base);
  if(!hasScenarios)return"";
  const primaryUpcomingId=upcomingSeries(data)?.id||null;
  const gainPct=(entry,exit)=>{
    const e=Number(entry),x=Number(exit);
    if(!Number.isFinite(e)||!Number.isFinite(x)||e<=0)return"-";
    return pctRaw(((x-e)/e)*100,2);
  };
  return`<div class="panel">
    <h2>Entry Outcome Scenarios</h2>
    <p class="small muted" style="margin:0 0 12px">Shows how the projected trade changes depending on where you get filled inside the entry zone.</p>
    <div class="grid g${Math.min(entries.length,3)}">
    ${entries.map(([id,p])=>{
      const sc=p.scenarios||{};
      const isReferenceOnly=primaryUpcomingId && id!==primaryUpcomingId;
      if(!sc.base)return"";
      return`<div>
        <div class="label" style="margin-bottom:8px">${esc(id)}</div>
        <div class="small muted scenario-series-note" style="margin:-2px 0 8px">${isReferenceOnly?"Reference only - the nearest next cycle is the main live setup.":"&nbsp;"}</div>
        <div class="small muted" style="margin:-2px 0 8px">Entry zone: ${ccy(p.zone_bot,m.currency)} - ${ccy(p.zone_top,m.currency)}</div>
        <div class="scenario-grid">
          <div class="scenario-card">
            <div class="scenario-label" style="color:var(--pu)">Filled Lower</div>
            <div class="small scenario-desc">${esc(sc.upside?.description||"-")}</div>
            <div class="kv" style="margin-top:6px">
              <div>Entry</div><div>${ccy(sc.upside?.entry_px,m.currency)}</div>
              <div>Exit</div><div>${ccy(sc.upside?.exit_px,m.currency)}</div>
              <div>Est. Gain</div><div>${gainPct(sc.upside?.entry_px,sc.upside?.exit_px)}</div>
              <div>Hold</div><div>${n(sc.upside?.expected_hold_days,0)}d</div>
            </div>
          </div>
          <div class="scenario-card">
            <div class="scenario-label good">Filled Mid</div>
            <div class="small scenario-desc">${esc(sc.base?.description||"-")}</div>
            <div class="kv" style="margin-top:6px">
              <div>Entry</div><div>${ccy(sc.base?.entry_px,m.currency)}</div>
              <div>Exit</div><div>${ccy(sc.base?.exit_px,m.currency)}</div>
              <div>Est. Gain</div><div>${gainPct(sc.base?.entry_px,sc.base?.exit_px)}</div>
              <div>Hold</div><div>${n(sc.base?.expected_hold_days,0)}d</div>
            </div>
          </div>
          <div class="scenario-card">
            <div class="scenario-label warn">Filled Higher</div>
            <div class="small scenario-desc">${esc(sc.downside?.description||"-")}</div>
            <div class="kv" style="margin-top:6px">
              <div>Entry</div><div>${ccy(sc.downside?.entry_px,m.currency)}</div>
              <div>Exit</div><div>${ccy(sc.downside?.exit_px,m.currency)}</div>
              <div>Est. Gain</div><div>${gainPct(sc.downside?.entry_px,sc.downside?.exit_px)}</div>
              <div>Hold</div><div>${n(sc.downside?.expected_hold_days,0)}d</div>
            </div>
          </div>
        </div>
      </div>`
    }).join("")}
    </div>
  </div>`
}
function panelPositionCalculator(data){
  const up=upcomingSeries(data);
  if(!up)return"";
  const m=data.meta||{},proj=up.proj||{};
  const estDivMid=Number(proj.med_div_amt ?? (((Number(proj.div_amt_lo)||0)+(Number(proj.div_amt_hi)||0))/2) ?? 0) || 0;
  const defaultEntry=Number(proj.zone_bot ?? proj.est_low_px ?? data.current_price ?? 0) || 0;
  return `<div class="panel pc-panel" id="pcCalc">
    <div class="pc-head">
      <div>
        <h2>Position Calculator — ${esc(up.id)} (${dt(proj.proj_exdiv_date)})</h2>
        <p>Model the next actionable series using your own entry and size. Optional dividend overrides let you replace the estimated dividend with an announced amount and layer in any bonus dividend.</p>
      </div>
      <div class="pc-note">Base estimate uses the projected dividend midpoint. If an exact dividend is announced, fill the override field and the calculator will use that instead. Bonus dividend is always added on top.</div>
    </div>
    <div class="pc-input-grid">
      <div class="pc-field">
        <div class="pc-field-label">Entry Price (${esc(m.currency||'')})</div>
        <div class="pc-stepper"><button class="pc-btn" type="button" data-step-target="entry" data-step="-0.001">-</button><input id="pcEntry" type="text" inputmode="decimal" value="${n(defaultEntry,4)}" autocomplete="off"><button class="pc-btn" type="button" data-step-target="entry" data-step="0.001">+</button></div>
      </div>
      <div class="pc-field">
        <div class="pc-field-label">Units</div>
        <div class="pc-stepper"><button class="pc-btn" type="button" data-step-target="units" data-step="-100">-</button><input id="pcUnits" type="text" inputmode="numeric" placeholder="0" autocomplete="off"><button class="pc-btn" type="button" data-step-target="units" data-step="100">+</button></div>
      </div>
      <div class="pc-field">
        <div class="pc-field-label">Brokerage % Each Way</div>
        <div class="pc-stepper"><button class="pc-btn" type="button" data-step-target="fee" data-step="-0.01">-</button><input id="pcFee" type="text" inputmode="decimal" value="0.25" autocomplete="off"><button class="pc-btn" type="button" data-step-target="fee" data-step="0.01">+</button></div>
      </div>
      <div class="pc-field">
        <div class="pc-field-label">Announced Div Override</div>
        <div class="pc-stepper"><button class="pc-btn" type="button" data-step-target="announced" data-step="-0.001">-</button><input id="pcAnnounced" type="text" inputmode="decimal" placeholder="Optional" autocomplete="off"><button class="pc-btn" type="button" data-step-target="announced" data-step="0.001">+</button></div>
      </div>
      <div class="pc-field">
        <div class="pc-field-label">Bonus Dividend</div>
        <div class="pc-stepper"><button class="pc-btn" type="button" data-step-target="bonus" data-step="-0.001">-</button><input id="pcBonus" type="text" inputmode="decimal" value="0.0000" autocomplete="off"><button class="pc-btn" type="button" data-step-target="bonus" data-step="0.001">+</button></div>
      </div>
      <div class="pc-field">
        <div class="pc-field-label">Custom Exit Price</div>
        <div class="pc-stepper"><button class="pc-btn" type="button" data-step-target="customExit" data-step="-0.001">-</button><input id="pcCustomExit" type="text" inputmode="decimal" placeholder="Optional" autocomplete="off"><button class="pc-btn" type="button" data-step-target="customExit" data-step="0.001">+</button></div>
      </div>
    </div>
    <div class="pc-subgrid">
      <div class="pc-note">Projected range: zone ${ccy(proj.zone_bot,m.currency)} – ${ccy(proj.zone_top,m.currency)} · est. ex-div ${ccy(proj.est_exdiv_px,m.currency)} · est. peak ${ccy(proj.est_peak_px,m.currency)}</div>
      <div class="pc-note" id="pcDivSource">Dividend basis: midpoint estimate ${ccy(estDivMid,m.currency)} per unit.</div>
    </div>
    <div class="pc-card-grid" id="pcCards"></div>
  </div>`;
}

function initPositionCalculator(data){
  const root=document.getElementById("pcCalc");
  if(!root)return;
  const up=upcomingSeries(data);
  if(!up)return;
  const m=data.meta||{},proj=up.proj||{};
  const current=Number(data.current_price)||0;
  const estDivMid=Number(proj.med_div_amt ?? (((Number(proj.div_amt_lo)||0)+(Number(proj.div_amt_hi)||0))/2) ?? 0) || 0;
  const estExDiv=Number(proj.est_exdiv_px)||0;
  const estPeak=Number(proj.est_peak_px)||0;
  const inputs={
    entry:document.getElementById("pcEntry"),
    units:document.getElementById("pcUnits"),
    fee:document.getElementById("pcFee"),
    announced:document.getElementById("pcAnnounced"),
    bonus:document.getElementById("pcBonus"),
    customExit:document.getElementById("pcCustomExit")
  };
  const cards=document.getElementById("pcCards");
  const divSource=document.getElementById("pcDivSource");
  if(!inputs.entry||!inputs.units||!inputs.fee||!cards||!divSource)return;

  const parseNum=v=>{ const x=parseFloat(String(v).replace(/,/g,"")); return Number.isFinite(x)?x:0; };
  const money=v=>ccy(v,m.currency);
  const signClass=v=>v>0?"good":v<0?"bad":"";

  function render(){
    const entry=Math.max(0,parseNum(inputs.entry.value));
    const units=Math.max(0,Math.round(parseNum(inputs.units.value)));
    const feePct=Math.max(0,parseNum(inputs.fee.value));
    const announcedRaw=parseNum(inputs.announced.value);
    const bonus=Math.max(0,parseNum(inputs.bonus.value));
    const customExitRaw=parseNum(inputs.customExit.value);
    const customExitActive=String(inputs.customExit.value).trim()!=="" && customExitRaw>0;
    const announcedActive=String(inputs.announced.value).trim()!=="" && announcedRaw>0;
    const baseDiv=announcedActive?announcedRaw:estDivMid;
    const totalDivPerUnit=baseDiv+bonus;
    const feeRate=feePct/100;

    divSource.textContent=announcedActive
      ? `Dividend basis: announced ${money(baseDiv)} per unit${bonus>0?` + bonus ${money(bonus)}`:""}.`
      : `Dividend basis: midpoint estimate ${money(estDivMid)} per unit${bonus>0?` + bonus ${money(bonus)}`:""}.`;

    if(!(entry>0&&units>0)){
      cards.innerHTML=`<div class="pc-note" style="grid-column:1/-1">Enter an entry price and units to calculate deployed capital, dividend income, break-even price, and projected exits.</div>`;
      return;
    }

    const grossCost=entry*units;
    const buyFee=grossCost*feeRate;
    const capitalDeployed=grossCost+buyFee;
    const unrealized=(current-entry)*units;
    const divIncome=totalDivPerUnit*units;
    const breakEven=((capitalDeployed-divIncome)/(units*Math.max(1-feeRate,0.000001)));
    const exDivNet=(estExDiv*units*(1-feeRate))-capitalDeployed;
    const peakNet=(estPeak*units*(1-feeRate))-capitalDeployed;
    const customExitNet=customExitActive?((customExitRaw*units*(1-feeRate))-capitalDeployed):0;
    const totalExDiv=exDivNet+divIncome;
    const totalPeak=peakNet+divIncome;
    const totalCustom=customExitNet+divIncome;
    const yieldOnCost=capitalDeployed>0?(divIncome/capitalDeployed)*100:0;    const sellFeeExDiv=estExDiv*units*feeRate;
    const sellFeePeak=estPeak*units*feeRate;
    const card=(label,val,sub,cls="")=>`<div class="pc-card"><div class="pc-cl">${label}</div><div class="pc-cv ${cls}">${val}</div><div class="pc-cs">${sub}</div></div>`;
    cards.innerHTML=[
      card("Capital Deployed",money(capitalDeployed),`${n(units,0)} units @ ${money(entry)} incl. buy fee ${money(buyFee)}`,"warn"),
      card("Unrealised P&L",money(unrealized),`vs current ${money(current)}`,signClass(unrealized)),
      card("Dividend Income",money(divIncome),`${money(totalDivPerUnit)} × ${n(units,0)} units`,bonus>0?"good":"warn"),
      card("Dividend % on Capital",`${n(yieldOnCost,2)}%`,`Dividend ${money(divIncome)} on deployed capital ${money(capitalDeployed)}`,yieldOnCost>=3?"good":yieldOnCost>0?"warn":""),
      card("Break-even Price",money(breakEven),"Net exit price after dividend and brokerage"),
      card("Exit @ Ex-Div",money(exDivNet),`<span class="pc-cs-line">Sell fee ${money(sellFeeExDiv)}</span><span class="pc-cs-line">+ dividend ${money(divIncome)} = ~${money(totalExDiv)}</span>`,signClass(totalExDiv)),
      card("Exit @ Peak",money(peakNet),`<span class="pc-cs-line">Sell fee ${money(sellFeePeak)}</span><span class="pc-cs-line">+ dividend ${money(divIncome)} = ~${money(totalPeak)}</span>`,signClass(totalPeak)),
      card("Exit @ Custom",customExitActive?money(customExitNet):"-",customExitActive?`<span class="pc-cs-line">@ ${money(customExitRaw)}</span><span class="pc-cs-line">+ dividend ${money(divIncome)} = ~${money(totalCustom)}</span>`:"Enter a custom exit price to compare a real outcome.",customExitActive?signClass(totalCustom):"")
    ].join("");
  }

  root.querySelectorAll("[data-step-target]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const key=btn.dataset.stepTarget;
      const input=inputs[key];
      if(!input)return;
      const step=parseFloat(btn.dataset.step||"0")||0;
      const currentVal=parseNum(input.value);
      const next=Math.max(0,currentVal+step);
      input.value=(key==="units")?String(Math.round(next)):next.toFixed(4);
      if(key==="fee")input.value=next.toFixed(2);
      render();
    });
  });
  Object.values(inputs).forEach(input=>{ if(input){ input.addEventListener("input",render); input.addEventListener("change",render); } });
  render();
}

/* -- TAB 2: CGC RANKING -------------------------------------------------- */
function panelCGC(data){
  const cgc=data.cgc_ranking||[];
  if(!cgc.length)return`<div class="empty">No CGC ranking data found.</div>`;
  const maxScore=Math.max(...cgc.map(c=>Number(c.score)||0),1);

  return`
  <div class="panel">
    <h2>${tipLabel("Series Ranking (CGC)","Ranks each series by a combined score of recovery quality and upside. Higher means that series has looked historically stronger.")}</h2>
    <div class="cgc-grid" style="margin-bottom:18px">
    ${cgc.map(c=>{
      const pct_fill=Math.round((Number(c.score)/maxScore)*100);
      return`<div class="cgc-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="cgc-rank" style="color:${c.rank===1?"var(--am)":c.rank===2?"var(--mu)":"var(--bd)"}">#${c.rank}</div>
          <div class="pill" style="border-color:${esc(data.series_meta?.find(s=>s.id===c.series_id)?.color||"#4f8ef7")};font-weight:700">${esc(c.series_id)}</div>
        </div>
        <div class="cgc-score-bar"><div class="cgc-score-fill" style="width:${pct_fill}%"></div></div>
        <div class="series-kv" style="margin-top:10px">
          <div>Score</div><div><strong>${n(c.score,1)}</strong></div>
          <div>Win Rate</div><div class="${Number(c.win_rate)>=70?"good":Number(c.win_rate)>=50?"warn":"bad"}">${pctRaw(c.win_rate,0)}</div>
          <div>${tipLabel("Median S2","Typical upside after the dip, measured from the ex-div anchor price. Higher means the recovery was usually stronger.")}</div>
          <div class="good">${pct(c.median_s2,2)}</div>
          <div>Median dip</div><div class="bad">${pct(c.median_low_vs_prevdp,2)}</div>
          <div>Median rebound</div><div>${pct(c.median_rebound,2)}</div>
          <div>Clean cycles</div><div>${n(c.n_clean,0)}</div>
        </div>
      </div>`
    }).join("")}
    </div>
<div class="section-note">CGC score = composite of win rate and median S2 (upside). Rank 1 is the historically strongest series for this stock. No LLM interpretation — pure data from Dividend Cycle Analysis.</div>
  </div>`
}

/* -- TAB 3: CALENDAR ----------------------------------------------------- */
function panelCalendar(data){
  const meta=data.series_meta||[];
  if(!meta.length)return`<div class="empty">No calendar data found.</div>`;
  const html=`<div class="cal-grid" id="calGrid">${meta.map(s=>renderCalCard(s,data)).join("")}</div>
<div class="section-note" style="margin-top:14px"><strong>How to read this chart:</strong> Bar height = number of historical cycle lows in that month. All bars are coloured by <strong>success rate</strong> — the % of lows in that month where the dip offered more than 3% rebound back to the PrevDP anchor: <span style="color:var(--gn)">green &gt;=70%</span>, <span style="color:var(--am)">amber 40–69%</span>, <span style="color:var(--rd)">red &lt;40%</span>, grey = no lows. <strong>Modal months</strong> (where lows cluster most often) are marked with a coloured border. Hover any bar to see individual cycles: id, date, weeks before ex-div, and outcome (success / not success). Per-month sample sizes are often just 1–2 cycles, so treat colour as directional rather than precise.</div>`;
  // Wire touch support after next paint
  setTimeout(()=>{
    const grid=document.getElementById("calGrid");
    if(!grid)return;
    grid.addEventListener("touchstart",e=>{
      const col=e.target.closest(".month-col");
      if(!col)return;
      e.preventDefault();
      // close any open tip, toggle this one
      grid.querySelectorAll(".month-col.tip-open").forEach(el=>{if(el!==col)el.classList.remove("tip-open")});
      col.classList.toggle("tip-open");
    },{passive:false});
    // tap outside closes all
    document.addEventListener("touchstart",e=>{
      if(!e.target.closest("#calGrid"))
        grid.querySelectorAll(".month-col.tip-open").forEach(el=>el.classList.remove("tip-open"));
    });
  },0);
  return html;
}

function renderCalCard(s,data){
  const tim=data.ss_series?.[s.id]?.timing||{};
  const cal=tim.cal_window||{};
  const months=Array.isArray(cal.low_months)?cal.low_months:[];
  const modal=Array.isArray(cal.modal_months)?cal.modal_months:[];

  // FIXED: include outlier string-boolean filter
  const cleanCycles=(data.cycles||[]).filter(c=>{
    return c.series===s.id
      &&!toBool(c.macro)&&!toBool(c.degen)&&!c.incomplete&&!toBool(c.outlier)
      &&c.low_date
  });
  const lowDates=cleanCycles.map(c=>({
    id:c.id,date:c.low_date,wks:c.wks_before,
    month:new Date(c.low_date).getMonth()+1,
    doy:doy(c.low_date),
    success:toBool(c.success),
    zoneHit:toBool(c.zone_hit)
  })).filter(x=>x.doy!==null).sort((a,b)=>a.doy-b.doy);

  const exactRange=lowDates.length?`${dayMonth(lowDates[0].date)} to ${dayMonth(lowDates[lowDates.length-1].date)}`:"-";
  const counts=Array.from({length:12},(_,i)=>months.filter(m=>m===i+1).length);
  const maxCount=Math.max(...counts,1);

  // month success rate coloring
  const monthSuccessRate=Array.from({length:12},(_,i)=>{
    const hits=lowDates.filter(x=>x.month===i+1);
    if(!hits.length)return null;
    return hits.filter(x=>x.success).length/hits.length;
  });

  return`<div class="cal-card">
    <div class="series-head">
      <div>
        <div class="pill"><span class="dot" style="background:${esc(s.color||"#4f8ef7")}"></span>${esc(s.id)}</div>
        <div class="small muted" style="margin-top:6px">${esc(s.label||"-")}</div>
      </div>
      ${calRatingChip(cal.cal_window_rating,cal.cal_spread_days,cal.cal_window_rating_display)}
    </div>

    <div class="cal-meta">
      <div class="card">
        <div class="label">${tipLabel("Window Label","Plain-English summary of when lows usually happened on the calendar, such as 'May window' or 'Feb/Apr window'.")}</div>
        <div class="value" style="font-size:17px">${esc(cal.cal_window_label||"-")}</div>
        <div class="small muted">Modal: ${modal.length?modal.map(monthName).join(", "):"-"}</div>
      </div>
      <div class="card">
        <div class="label">${tipLabel("Observed Range","Smallest circular window covering all clean low dates. Computed as 365 minus the largest gap between consecutive day-of-year values, so Dec/Jan windows are not inflated.")}</div>
        <div class="value" style="font-size:17px">${esc(exactRange)}</div>
        <div class="small muted">${n(cal.cal_spread_days,0)}d spread · ${n(cal.n,0)} clean cycles</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:12px;margin-bottom:6px;font-size:11px;color:var(--mu)">
      <span style="font-weight:600;color:var(--tx)">Bar colour = success rate</span>
<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(62,217,160,.6);vertical-align:middle;margin-right:4px"></span>&gt;=70% success</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(245,197,66,.6);vertical-align:middle;margin-right:4px"></span>40–70%</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(240,112,112,.5);vertical-align:middle;margin-right:4px"></span>&lt;40%</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(122,130,154,.35);vertical-align:middle;margin-right:4px"></span>No lows</span>
      <span style="border:1px solid ${esc(s.color||"#4f8ef7")};border-radius:3px;padding:1px 5px">Bordered = modal month</span>
    </div>
    <div class="month-bars">
    ${counts.map((count,idx)=>{
      const h=Math.max(6,(count/maxCount)*60);
      const mn=idx+1;
      const isModal=modal.includes(mn);
      const sr=monthSuccessRate[idx];
      // always colour by success rate
      let barColor;
      if(sr!==null){barColor=sr>=0.7?"rgba(62,217,160,.6)":sr>=0.4?"rgba(245,197,66,.6)":"rgba(240,112,112,.5)"}
      else if(count>0){barColor="rgba(122,130,154,.45)"}
      else{barColor="rgba(122,130,154,.18)"}
      // modal months get a bright border on the box to mark them
      const boxStyle=isModal?`border-color:${s.color||"#4f8ef7"};box-shadow:0 0 0 1px ${s.color||"#4f8ef7"}33`:"";

      const hits=lowDates.filter(x=>x.month===mn);
      const tipRows=hits.length
        ?hits.map(x=>`<div class="month-tip-row"><span>${esc(x.id)}</span><span>${esc(dayMonth(x.date))} · ${n(x.wks,1)}wk · ${x.success?"Success":"Not success"}</span></div>`).join("")
        :`<div class="month-tip-row"><span style="color:var(--mu)">No lows</span><span></span></div>`;

      return`<div class="month-col">
        <div class="month-box" style="${boxStyle}">
          <div class="month-fill" style="height:${h}px;background:${barColor}"></div>
        </div>
        <div class="month-tip">
          <div class="month-tip-head">${monthName(mn)}${isModal?" - Modal":""}</div>
          <div class="month-tip-sub">${hits.length?`${hits.length} low(s) · ${sr!==null?Math.round(sr*100)+"% success":""}`:""}</div>
          ${tipRows}
        </div>
        <div class="month-lbl">${monthName(mn).slice(0,1)}</div>
        <div class="month-lbl">${count}</div>
      </div>`
    }).join("")}
    </div>
  </div>`
}

/* -- TAB 4: CYCLES ------------------------------------------------------- */
function panelProgressStrip(data){
  const up=upcomingSeries(data);
  if(!up)return `<div class="empty">No upcoming projection found.</div>`;
  const sid=up.id, proj=up.proj, sm=(data.series_meta||[]).find(s=>s.id===sid)||{}, ss=data.ss_series?.[sid]||{};
  const todayStr=data.meta?.today||new Date().toISOString().slice(0,10);
  const cycles=cleanCyclesForSeries(data,sid);
  const priorExdivCycles=(data.cycles||[])
    .filter(c=>c && c.exdiv_date && c.exdiv_date < proj.proj_exdiv_date && !toBool(c.degen))
    .slice()
    .sort((a,b)=>new Date(a.exdiv_date)-new Date(b.exdiv_date));
  const last=priorExdivCycles.length?priorExdivCycles[priorExdivCycles.length-1]:null;
  const cal=ss.timing?.cal_window||{};
  const exitProfile=ss.exit_profile||{};
  const events=[];
  // Find the most recent actual ex-div event — regular cycle OR special dividend.
  // The price has adjusted from whichever happened last, so that's the true anchor for the strip.
  const _lastRegularDate=last?.exdiv_date||"";
  const specialsInWindow=(data.anomalies_excluded||[])
    .filter(a=>a.date&&a.date<=todayStr&&a.date<proj.proj_exdiv_date);
  const mostRecentSpecial=specialsInWindow.length
    ?specialsInWindow.reduce((a,b)=>a.date>b.date?a:b)
    :null;
  const specialIsAnchor=mostRecentSpecial&&mostRecentSpecial.date>_lastRegularDate;

  if(specialIsAnchor){
    // Special dividend is the most recent price-reset event — use it as the left anchor
    events.push({
      label:'Last Ex-Div',sub:mostRecentSpecial.date,date:mostRecentSpecial.date,color:'#a78bfa',special:true,
      detail:[
        `Type: Special / excluded dividend (price anchor)`,
        `Date: ${mostRecentSpecial.date}`,
        `Amount: ${ccy(mostRecentSpecial.amount,data.meta?.currency||'')}`,
        `Note: ${mostRecentSpecial.reason||'-'}`,
        `Anchor price: ${ccy(proj.anchor,data.meta?.currency||'')}`
      ]
    });
    // Any earlier special divs between last regular and this anchor are shown as secondary markers
    specialsInWindow
      .filter(a=>a.date<mostRecentSpecial.date&&a.date>_lastRegularDate)
      .forEach(sd=>{
        events.push({
          label:'Special Div',sub:sd.date,date:sd.date,color:'#a78bfa',special:true,
          detail:[`Type: Special / excluded dividend`,`Date: ${sd.date}`,`Amount: ${ccy(sd.amount,data.meta?.currency||'')}`,`Note: ${sd.reason||'-'}`]
        });
      });
  } else {
    // Regular cycle is the most recent ex-div — use it as the left anchor
    if(last?.exdiv_date){
      const lastSeriesMeta=(data.series_meta||[]).find(s=>s.id===last.series)||{};
      events.push({
        label:'Last Ex-Div',
        sub:last.exdiv_date,
        date:last.exdiv_date,
        color:lastSeriesMeta.color||'#3b82f6',
        detail:[
          `Series: ${last.series||'-'}`,
          `Date: ${last.exdiv_date}`,
          `Dividend: ${ccy(last.div_amt,data.meta?.currency||'')}`,
          `Prev_dp: ${ccy(last.prev_dp,data.meta?.currency||'')}`
        ]
      });
    }
    // Show any special divs that fall after the last regular cycle within this window
    specialsInWindow
      .filter(a=>a.date>_lastRegularDate)
      .forEach(sd=>{
        events.push({
          label:'Special Div',sub:sd.date,date:sd.date,color:'#a78bfa',special:true,
          detail:[`Type: Special / excluded dividend`,`Date: ${sd.date}`,`Amount: ${ccy(sd.amount,data.meta?.currency||'')}`,`Note: ${sd.reason||'-'}`]
        });
      });
  }
  const stripAnchorDate=specialIsAnchor?mostRecentSpecial.date:(_lastRegularDate||'');
  if(proj.timing_rating==='BIMODAL'){
    if(proj.est_low_date_cluster1&&proj.est_low_date_cluster1>stripAnchorDate)events.push({label:'Cluster 1',sub:proj.est_low_date_cluster1,date:proj.est_low_date_cluster1,color:'#f5c542',detail:[`Timing: ${proj.timing_rating_display || '-'}`,`Early cluster: ${proj.est_low_date_cluster1}`,`Est. low: ${ccy(proj.est_low_px,data.meta?.currency||'')}`]});
    if(proj.est_low_date_cluster2&&proj.est_low_date_cluster2>stripAnchorDate)events.push({label:'Cluster 2',sub:proj.est_low_date_cluster2,date:proj.est_low_date_cluster2,color:'#e8a838',detail:[`Timing: ${proj.timing_rating_display || '-'}`,`Late cluster: ${proj.est_low_date_cluster2}`,`Est. low: ${ccy(proj.est_low_px,data.meta?.currency||'')}`]});
  }else if(proj.timing_rating==='RELIABLE'&&proj.est_low_date){
    if(proj.est_low_date>stripAnchorDate)events.push({label:'Est. Low',sub:proj.est_low_date,date:proj.est_low_date,color:'#00e5ff',detail:[`Timing: ${proj.timing_rating_display || '-'}`,`Est. low date: ${proj.est_low_date}`,`Est. low px: ${ccy(proj.est_low_px,data.meta?.currency||'')}`]});
  }else{
    const watchSub=cal.cal_window_rating&&cal.cal_window_rating!=='CALENDAR_WIDE'?(cal.cal_window_label||'Monitor'):'Monitor';
    events.push({label:'Watch Zone',sub:watchSub,date:todayStr,color:'#f5c542',detail:[`Entry status: ${proj.entry_status_display || '-'}`,`Current price: ${ccy(data.current_price,data.meta?.currency||'')}`,`Zone: ${ccy(proj.zone_bot,data.meta?.currency||'')} - ${ccy(proj.zone_top,data.meta?.currency||'')}`,`Calendar window: ${cal.cal_window_label||'-'}`]});
  }
  if(
    exitProfile.exit_mode_verdict==='PRE_EXDIV_PREFERRED' &&
    proj.proj_exdiv_date &&
    exitProfile.pre_exdiv_peak_window_days_p25 != null &&
    exitProfile.pre_exdiv_peak_window_days_p75 != null
  ){
    const exdivDate=new Date(proj.proj_exdiv_date);
    const midpointDays=(Number(exitProfile.pre_exdiv_peak_window_days_p25)+Number(exitProfile.pre_exdiv_peak_window_days_p75))/2;
    const peakExitDate=new Date(exdivDate.getTime() - midpointDays*86400000);
    if(!Number.isNaN(peakExitDate.getTime())){
      events.push({
        label:'Peak Exit Ref',
        sub:`${n(exitProfile.pre_exdiv_peak_window_days_p25,0)}-${n(exitProfile.pre_exdiv_peak_window_days_p75,0)}d pre`,
        date:peakExitDate.toISOString().slice(0,10),
        color:'#9f8cc9',
        detail:[
          `Exit mode: ${exitProfile.exit_mode_verdict_display || '-'}`,
          `Historical reference only`,
          `Usual peak window: ${n(exitProfile.pre_exdiv_peak_window_days_p25,1)}d - ${n(exitProfile.pre_exdiv_peak_window_days_p75,1)}d before ex-div`,
          `Projected ex-div: ${proj.proj_exdiv_date}`,
        ]
      });
    }
  }
    const todayGuide={label:'Today',sub:todayStr,date:todayStr,color:'#d4daf0',detail:[`Current price: ${ccy(data.current_price,data.meta?.currency||'')}`,`Entry status: ${proj.entry_status_display || '-'}`,`Zone: ${ccy(proj.zone_bot,data.meta?.currency||'')} - ${ccy(proj.zone_top,data.meta?.currency||'')}`]};
  events.push(todayGuide);
  if(proj.proj_exdiv_date){
    const isExitDatePreferred=exitProfile.exit_mode_verdict==='POST_EXDIV_PREFERRED';
    events.push({
      label:isExitDatePreferred?'Ex-Div Exit':'Proj Ex-Div',
      sub:proj.proj_exdiv_date,
      date:proj.proj_exdiv_date,
      color:sm.color||'#3b82f6',
      detail:[
        `Series: ${sid}`,
        `Projected ex-div: ${proj.proj_exdiv_date}`,
        `Est. ex-div px: ${ccy(proj.est_exdiv_px,data.meta?.currency||'')}`,
        ...(isExitDatePreferred?[`Exit mode: ${exitProfile.exit_mode_verdict_display || '-'}`]:[])
      ]
    });
  }
  const dated=events.map(ev=>({ ...ev, d:new Date(ev.date) })).filter(ev=>!Number.isNaN(ev.d.getTime())).sort((a,b)=>a.d-b.d);
  if(!dated.length)return `<div class="empty">No upcoming timeline data found.</div>`;
  const span=Math.max(1,dated[dated.length-1].d-dated[0].d);
  const todayEvent=dated.find(ev=>ev.label==='Today');
  const markerEvents=dated.filter(ev=>ev.label!=='Today');
  // rightPad=100 gives labels at the far-right edge room to render;
  // base width grows with event count; also expand so tightly-spaced events get ≥80px apart
  const leftPad=20,rightPad=100,minGap=60,topLanes=[],bottomLanes=[];
  let width=Math.max(900,200+(dated.length-1)*220);
  if(markerEvents.length>1){
    const minDateGap=Math.min(...markerEvents.slice(1).map((ev,i)=>ev.d-markerEvents[i].d).filter(g=>g>0));
    if(minDateGap>0){
      const neededWidth=Math.ceil(80*span/minDateGap)+leftPad+rightPad;
      width=Math.min(Math.max(width,neededWidth),3200);
    }
  }
  markerEvents.forEach(ev=>{
    ev.left=leftPad+((width-leftPad-rightPad)*((ev.d-dated[0].d)/span));
    ev.lane=0;
    for(let i=0;i<4;i++){
      if(topLanes[i]===undefined||ev.left-topLanes[i]>=minGap){ev.lane=i;topLanes[i]=ev.left;break;}
    }
    ev.bottomLane=0;
    for(let i=0;i<3;i++){
      if(bottomLanes[i]===undefined||ev.left-bottomLanes[i]>=minGap){ev.bottomLane=i;bottomLanes[i]=ev.left;break;}
    }
  });
  let clusterStart=0;
  while(clusterStart<markerEvents.length){
    let clusterEnd=clusterStart;
    while(clusterEnd+1<markerEvents.length && markerEvents[clusterEnd+1].left-markerEvents[clusterEnd].left<44){
      clusterEnd++;
    }
    const clusterSize=clusterEnd-clusterStart+1;
    if(clusterSize>1){
      const center=(clusterSize-1)/2;
      for(let i=clusterStart;i<=clusterEnd;i++){
        markerEvents[i].nudge=(i-clusterStart-center)*26;
      }
    }else{
      markerEvents[clusterStart].nudge=0;
    }
    clusterStart=clusterEnd+1;
  }
  if(todayEvent){
    todayEvent.left=leftPad+((width-leftPad-rightPad)*((todayEvent.d-dated[0].d)/span));
  }
  return `<div class="prog-wrap"><h2>Cycle Progress Strip</h2><div class="prog-strip"><div class="prog-inner" style="width:${width}px"><div class="prog-line"></div>${todayEvent?`<div class="prog-guide" style="left:${n(todayEvent.left,1)}px" title="${esc(todayEvent.detail.join('\n'))}"></div><div class="prog-guide-label" style="left:${n(todayEvent.left,1)}px">${esc(todayEvent.label)}</div>`:""}${markerEvents.map(ev=>`<div class="prog-dot" style="left:${n(ev.left+(ev.nudge||0),1)}px" title="${esc(ev.detail.join('\n'))}"><div class="plbl-top" style="top:${6+ev.lane*10}px;color:${ev.color}">${esc(ev.label)}</div><div class="pdot ${ev.label==='Peak Exit Ref'?'ref':ev.special?'special':''}" style="border-color:${ev.color}"></div><div class="plbl-bot" style="top:${52+ev.bottomLane*12}px">${esc(ev.sub)}</div></div>`).join('')}</div></div><div class="section-note">Timeline for the next actionable series. Anchored to the most recent actual ex-div event (regular or special) — whichever last caused a price adjustment — so cycle position reflects reality, not just the scheduled series cadence.</div></div>`
}

function panelDatesDrift(data){
  const meta=data.series_meta||[];
  if(!meta.length)return `<div class="empty">No cycle data found.</div>`;
  return `<div class="drift-grid">${meta.map(sm=>{
    const sid=sm.id;
    const proj=projForSeries(data,sid);
    const seriesCycs=(data.cycles||[]).filter(c=>c.series===sid&&!c.incomplete).slice().sort((a,b)=>new Date(a.exdiv_date)-new Date(b.exdiv_date));
    if(!seriesCycs.length)return `<div class="drift-card"><h2>Dates & Drift - ${esc(sid)}</h2><div class="empty">No cycle dates found.</div></div>`;
    const exdivDates=seriesCycs.map(c=>c.exdiv_date).filter(Boolean);
    const intervals=[];
    for(let i=1;i<exdivDates.length;i++)intervals.push(Math.round((new Date(exdivDates[i])-new Date(exdivDates[i-1]))/86400000));
    const avgInt=intervals.length?n(intervals.reduce((a,b)=>a+b,0)/intervals.length,1):'-';
    const lastExDiv=exdivDates.length?exdivDates[exdivDates.length-1]:'-';
    const doms=exdivDates.map(d=>new Date(d).getDate()).filter(Number.isFinite);
    let domSlope=0;
    if(doms.length>=3){
      let sx=0,sy=0,sxy=0,sx2=0;
      doms.forEach((d,i)=>{sx+=i;sy+=d;sxy+=i*d;sx2+=i*i;});
      domSlope=(doms.length*sxy-sx*sy)/(((doms.length*sx2)-(sx*sx))||1);
    }
    const hasDrift=Math.abs(domSlope)>0.3;
    const projDom=proj.proj_exdiv_date?new Date(proj.proj_exdiv_date).getDate():null;
    const lastDom=seriesCycs.length?new Date(seriesCycs[seriesCycs.length-1].exdiv_date).getDate():projDom;
    const deltaDom=(projDom!=null&&lastDom!=null)?projDom-lastDom:null;
    const seq=seriesCycs.map(c=>{
      const dom=new Date(c.exdiv_date).getDate();
return `<div class="dn"><div class="dv" style="border-color:${sm.color||'#4f8ef7'};color:${sm.color||'#4f8ef7'}">${esc(c.exdiv_date.slice(0,7))}</div><div class="dlbl">Day-of-month: ${dom}</div></div><div class="darr">-&gt;</div>`;
    }).join('');
const projNode=proj.proj_exdiv_date?`<div class="dn"><div class="dv dproj">${esc(proj.proj_exdiv_date.slice(0,7))}</div><div class="dlbl">Proj</div>${deltaDom===null?'':`<div class="ddelta ${deltaDom>=0?'good':'bad'}">${deltaDom>=0?'+':''}${deltaDom}d</div>`}</div>`:'';
return `<div class="drift-card"><h2>Dates & Drift - ${esc(sid)}</h2><div class="drift-note">Drift detection: ${esc(sid)} ex-div dates are compared by day-of-month across cycles. A shift greater than 0.3 days per cycle suggests the schedule is structurally drifting rather than staying pinned to the same part of the month.</div>${hasDrift?`<div class="drift-note warn">Day-of-month drift detected for ${esc(sid)}: ${n(domSlope,2)} days per cycle.</div>`:''}<div class="drift-cards"><div class="card"><div class="label">Last Ex-Div</div><div class="value" style="font-size:16px">${dt(lastExDiv)}</div><div class="small muted">${esc(sid)}</div></div><div class="card"><div class="label">Proj Ex-Div</div><div class="value" style="font-size:16px">${dt(proj.proj_exdiv_date)}</div><div class="small muted">next expected</div></div><div class="card"><div class="label">Avg Interval</div><div class="value">${avgInt}d</div><div class="small muted">between payments</div></div><div class="card"><div class="label">Drift / Cycle</div><div class="value ${hasDrift?'warn':'good'}">${n(domSlope,2)}d</div><div class="small muted">${hasDrift?'Day-of-month drift':'Stable'}</div></div></div><div class="dseq">${seq}${projNode}</div></div>`;
  }).join('')}</div>`;
}

function panelFullCalendar(data){
  const meta=data.series_meta||[];
  const currency=data.meta?.currency||'';
  const events=[];
  meta.forEach((sm,seriesIdx)=>{
    cleanCyclesForSeries(data,sm.id).forEach((c,idx)=>{
    if(c.low_date)events.push({date:c.low_date,label:'Low',series:sm.id,color:'#00e5ff',top:-50-(idx%4)*20,bottom:pctRaw(c.low_vs_prevdp,1),detail:[`Cycle: ${c.id}`,`Series: ${sm.id}`,`Low date: ${c.low_date}`,`Low vs PrevDP: ${pctRaw(c.low_vs_prevdp,1)}`,`Success: ${toBool(c.success)?'Yes':'No'}`]});
      if(c.exdiv_date)events.push({date:c.exdiv_date,label:`${sm.id} Ex-Div`,series:sm.id,color:sm.color||'#3b82f6',top:-90-((idx+seriesIdx)%3)*20,bottom:ccy(c.div_amt,currency),detail:[`Cycle: ${c.id}`,`Series: ${sm.id}`,`Ex-div: ${c.exdiv_date}`,`Dividend: ${ccy(c.div_amt,currency)}`]});
    });
    const proj=projForSeries(data,sm.id);
    if(proj.est_low_date)events.push({date:proj.est_low_date,label:`${sm.id} Low Proj`,series:sm.id,color:'#f5c542',top:-70,bottom:ccy(proj.est_low_px,currency),detail:[`Series: ${sm.id}`,`Projected low: ${proj.est_low_date}`,`Est. low px: ${ccy(proj.est_low_px,currency)}`]});
    if(proj.est_low_date_cluster1)events.push({date:proj.est_low_date_cluster1,label:`${sm.id} C1`,series:sm.id,color:'#f5c542',top:-70,bottom:ccy(proj.est_low_px,currency),detail:[`Series: ${sm.id}`,`Cluster 1: ${proj.est_low_date_cluster1}`,`Est. low px: ${ccy(proj.est_low_px,currency)}`]});
    if(proj.est_low_date_cluster2)events.push({date:proj.est_low_date_cluster2,label:`${sm.id} C2`,series:sm.id,color:'#e8a838',top:-90,bottom:ccy(proj.est_low_px,currency),detail:[`Series: ${sm.id}`,`Cluster 2: ${proj.est_low_date_cluster2}`,`Est. low px: ${ccy(proj.est_low_px,currency)}`]});
    if(proj.proj_exdiv_date)events.push({date:proj.proj_exdiv_date,label:`${sm.id} Proj`,series:sm.id,color:'#f5c542',top:-50-(seriesIdx%2)*20,bottom:ccy(proj.med_div_amt??proj.div_amt_lo,currency),detail:[`Series: ${sm.id}`,`Projected ex-div: ${proj.proj_exdiv_date}`,`Projected dividend: ${ccy(proj.med_div_amt??proj.div_amt_lo,currency)}`]});
  });
  const todayStr=data.meta?.today||new Date().toISOString().slice(0,10);
  events.push({date:todayStr,label:'TODAY',series:'',color:'#d4daf0',top:-70,bottom:todayStr,detail:[`Today: ${todayStr}`,`Current price: ${ccy(data.current_price,currency)}`]});
  const dated=events.map(ev=>({ ...ev, d:new Date(ev.date) })).filter(ev=>!Number.isNaN(ev.d.getTime())).sort((a,b)=>a.d-b.d);
  if(!dated.length)return `<div class="empty">No calendar events found.</div>`;
  const minD=dated[0].d, maxD=dated[dated.length-1].d;
  const span=Math.max(1,maxD-minD);
  const minYear=minD.getFullYear(), maxYear=maxD.getFullYear();
  const width=Math.max(1400,220*(maxYear-minYear+1));
  const leftPad=60, rightPad=60, axisY=140;
  const toLeft=d=>leftPad+((width-leftPad-rightPad)*((d-minD)/span));
  const years=[];
  for(let y=minYear;y<=maxYear;y++){
    const d=new Date(`${y}-01-01`);
    if(!Number.isNaN(d.getTime()))years.push({year:y,left:toLeft(d)});
  }
  return `<div class="panel"><h2>Full Calendar</h2><div class="cal-strip"><div class="cal-inner" style="min-width:${n(width,0)}px"><div class="cal-line"></div>${dated.map(ev=>`<div class="cal-dot" style="left:${n(toLeft(ev.d),1)}px;top:${axisY}px" title="${esc(ev.detail.join('\n'))}"><div class="cal-top" style="top:${ev.top}px;color:${ev.color}">${esc(ev.label)}</div><div class="cal-circle" style="border-color:${ev.color}"></div><div class="cal-bot">${esc(ev.bottom||'')}</div></div>`).join('')}${years.map(y=>`<div class="cal-year" style="left:${n(y.left,1)}px"></div><div class="cal-year-lbl" style="left:${n(y.left+3,1)}px">${y.year}</div>`).join('')}</div></div><div class="section-note">Full event timeline across all clean cycles and projected milestones. Historical lows are cyan, historical ex-div markers use each series color, projected forward markers are amber, and TODAY is the pale reference point.</div></div>`
}

function panelStrategy(data){
  return `<div class="panel"><h2>Strategy</h2><div class="sr-wrap">
<div class="sr-flow-card">
  <div class="sr-flow-head">
    <div>
      <p class="sr-pill" style="background:var(--color-background-info);color:var(--color-text-info);margin:0">Execution Map</p>
      <p class="sr-flow-title">How the setup should be traded</p>
      <p class="sr-flow-sub">Read this as a decision ladder: confirm the zone, decide how much timing helps, check whether price is actually in the window, apply risk overrides, then choose the exit path history has favored.</p>
    </div>
  </div>
  <svg class="sr-flow-svg" viewBox="0 0 720 690" xmlns="http://www.w3.org/2000/svg" aria-label="Dividend cycle strategy decision flow">
    <defs>
      <marker id="sr-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      </marker>
    </defs>
    <g class="sr-node sr-gray">
      <rect x="215" y="24" width="250" height="56" rx="10"></rect>
      <text class="sr-th" x="340" y="46" text-anchor="middle">1. Is the next-series zone usable?</text>
  <text class="sr-ts" x="340" y="64" text-anchor="middle">Consistent or Moderate only</text>
    </g>
    <path class="sr-arr" d="M465 52 L550 52" marker-end="url(#sr-arrow)"></path>
  <text class="sr-ts" x="507" y="46" text-anchor="middle" style="fill:#f3b0b0">Weak</text>
    <g class="sr-callout sr-stop">
      <rect x="556" y="32" width="110" height="40" rx="8"></rect>
      <text class="sr-th" x="611" y="56" text-anchor="middle">Stop</text>
    </g>
    <path class="sr-arr" d="M340 80 L340 110" marker-end="url(#sr-arrow)"></path>
    <text class="sr-ts" x="356" y="101" text-anchor="start" style="fill:#d3c1ff">passes</text>

    <g class="sr-node sr-gray">
      <rect x="215" y="110" width="250" height="56" rx="10"></rect>
      <text class="sr-th" x="340" y="132" text-anchor="middle">2. How much can timing help?</text>
      <text class="sr-ts" x="340" y="150" text-anchor="middle">RELIABLE helps; otherwise price leads</text>
    </g>
    <path d="M215 138 L122 138" class="sr-arr" style="stroke:#2fa37d" marker-end="url(#sr-arrow)"></path>
  <text class="sr-ts" x="168" y="132" text-anchor="middle" style="fill:#8ef0c4">Reliable</text>
    <g class="sr-callout sr-enter">
      <rect x="14" y="118" width="104" height="40" rx="8"></rect>
      <text class="sr-ts" x="66" y="132" text-anchor="middle">Zone + timing</text>
      <text class="sr-ts" x="66" y="148" text-anchor="middle">both active</text>
    </g>
    <path d="M465 138 L550 138" class="sr-arr" style="stroke:#d29235" marker-end="url(#sr-arrow)"></path>
  <text class="sr-ts" x="507" y="128" text-anchor="middle" style="fill:#f6df92">Bimodal / Unreliable</text>
    <g class="sr-callout sr-caution">
      <rect x="556" y="116" width="110" height="44" rx="8"></rect>
      <text class="sr-ts" x="611" y="132" text-anchor="middle">Use price zone</text>
      <text class="sr-ts" x="611" y="148" text-anchor="middle">timing secondary</text>
    </g>
    <path class="sr-arr" d="M340 166 L340 196" marker-end="url(#sr-arrow)"></path>

    <g class="sr-node sr-gray">
      <rect x="215" y="196" width="250" height="56" rx="10"></rect>
      <text class="sr-th" x="340" y="218" text-anchor="middle">3. Is price in the opportunity window?</text>
      <text class="sr-ts" x="340" y="236" text-anchor="middle">BELOW, IN-ZONE, or ABOVE</text>
    </g>
    <path d="M215 224 L122 224" class="sr-arr" marker-end="url(#sr-arrow)"></path>
    <text class="sr-ts" x="168" y="218" text-anchor="middle">Below</text>
    <g class="sr-callout sr-gray">
      <rect x="14" y="204" width="104" height="40" rx="8"></rect>
      <text class="sr-ts" x="66" y="228" text-anchor="middle">Wait for reset</text>
    </g>
    <path d="M465 224 L550 224" class="sr-arr" style="stroke:#d86160" marker-end="url(#sr-arrow)"></path>
    <text class="sr-ts" x="507" y="218" text-anchor="middle" style="fill:#f3b0b0">Above</text>
    <g class="sr-callout sr-stop">
      <rect x="556" y="204" width="110" height="40" rx="8"></rect>
      <text class="sr-th" x="611" y="228" text-anchor="middle">Do not chase</text>
    </g>
    <path class="sr-arr" d="M340 252 L340 282" marker-end="url(#sr-arrow)"></path>
  <text class="sr-ts" x="356" y="273" text-anchor="start" style="fill:#8ef0c4">In-zone</text>

    <g class="sr-node sr-gray">
      <rect x="215" y="282" width="250" height="56" rx="10"></rect>
      <text class="sr-th" x="340" y="304" text-anchor="middle">4. Do risk overrides reduce conviction?</text>
  <text class="sr-ts" x="340" y="322" text-anchor="middle">Tail, fragility, or degrading trend</text>
    </g>
    <path d="M465 310 L550 310" class="sr-arr" style="stroke:#d29235" marker-end="url(#sr-arrow)"></path>
    <text class="sr-ts" x="507" y="304" text-anchor="middle" style="fill:#f6df92">Any Yes</text>
    <g class="sr-callout sr-caution">
      <rect x="556" y="290" width="110" height="40" rx="8"></rect>
    <text class="sr-ts" x="611" y="314" text-anchor="middle">Small trades</text>
    </g>
    <path class="sr-arr" d="M340 338 L340 368" marker-end="url(#sr-arrow)"></path>
    <text class="sr-ts" x="356" y="359" text-anchor="start">None</text>

    <g class="sr-node sr-enter">
      <rect x="215" y="368" width="250" height="56" rx="10"></rect>
      <text class="sr-th" x="340" y="390" text-anchor="middle">5. Enter only inside the zone</text>
      <text class="sr-ts" x="340" y="408" text-anchor="middle">Limit order inside zone_bot to zone_top</text>
    </g>
    <path class="sr-arr" d="M340 424 L340 454" marker-end="url(#sr-arrow)"></path>

    <g class="sr-node sr-enter">
      <rect x="215" y="454" width="250" height="56" rx="10"></rect>
      <text class="sr-th" x="340" y="476" text-anchor="middle">6. Which exit path has stronger gains?</text>
      <text class="sr-ts" x="340" y="494" text-anchor="middle">Pre-Exdiv Peak or Ex-Div Date</text>
    </g>
    <path class="sr-arr" d="M290 510 L220 540" marker-end="url(#sr-arrow)"></path>
    <text class="sr-ts" x="236" y="530" text-anchor="middle" style="fill:#8ef0c4">Pre-Exdiv Peak</text>
    <g class="sr-callout sr-enter">
      <rect x="92" y="540" width="170" height="48" rx="8"></rect>
      <text class="sr-ts" x="177" y="558" text-anchor="middle">Pre-exdiv peak</text>
      <text class="sr-ts" x="177" y="574" text-anchor="middle">stronger gains</text>
    </g>
    <path class="sr-arr" d="M177 588 L177 618" marker-end="url(#sr-arrow)"></path>
    <g class="sr-callout sr-caution">
      <rect x="92" y="618" width="170" height="44" rx="8"></rect>
      <text class="sr-ts" x="177" y="636" text-anchor="middle">Use the usual</text>
      <text class="sr-ts" x="177" y="652" text-anchor="middle">exit window</text>
    </g>

    <path class="sr-arr" d="M390 510 L460 540" marker-end="url(#sr-arrow)"></path>
    <text class="sr-ts" x="444" y="530" text-anchor="middle" style="fill:#8ef0c4">Ex-Div Date</text>
    <g class="sr-callout sr-enter">
      <rect x="418" y="540" width="170" height="48" rx="8"></rect>
      <text class="sr-ts" x="503" y="558" text-anchor="middle">Ex-div date</text>
      <text class="sr-ts" x="503" y="574" text-anchor="middle">stronger gains</text>
    </g>

    <path d="M92 640 L12 640 L12 52 L205 52" fill="none" stroke="#62708d" stroke-width="1" stroke-dasharray="5 4" marker-end="url(#sr-arrow)"></path>
    <path d="M588 564 L704 564 L704 52 L475 52" fill="none" stroke="#62708d" stroke-width="1" stroke-dasharray="5 4" marker-end="url(#sr-arrow)"></path>
    <text class="sr-ts" x="12" y="332" text-anchor="middle">next</text>
    <text class="sr-ts" x="12" y="345" text-anchor="middle">cycle</text>
    <text class="sr-ts" x="704" y="306" text-anchor="middle">next</text>
    <text class="sr-ts" x="704" y="319" text-anchor="middle">cycle</text>
  </svg>
  <div class="sr-note-row">
    <span><i style="background:#2fa37d"></i> Valid Setup</span>
    <span><i style="background:#d29235"></i> Smaller Size / Weaker Timing Confidence</span>
    <span><i style="background:#d86160"></i> Not Actionable</span>
  </div>
</div>
<p class="sr-section-head">Pillar 1 — The Core Thesis</p>
<div class="sr-card">
  <span class="sr-pill" style="background:var(--color-background-info);color:var(--color-text-info)">Foundation</span>
  <p class="sr-title">Price reliably dips before ex-date, then recovers</p>
  <p class="sr-body">SGX dividend stocks tend to sell off in the weeks before their ex-dividend date as short-term traders exit. If this dip is <em>consistent in depth</em> and <em>reliable in timing</em>, you can buy into the dip and then manage the trade with one of two defined exit paths: <em>Pre-Exdiv Peak Exit</em> or <em>Ex-Div Date Exit</em>. Forward projection uses the <em>ex-dividend adjusted anchor</em> (closing price just before the most recent prior ex-div event, minus the dividend paid) as the price reference, and the <em>target series' own clean dip pattern</em> for zone shape. The strategy only activates when the historical record proves this pattern is real, not coincidental.</p>
</div>
<p class="sr-section-head">Pillar 2 — Why three separate quality tests must all pass</p>
<div class="sr-two">
  <div class="sr-card">
    <span class="sr-pill" style="background:var(--color-background-success);color:var(--color-text-success)">Dip Depth</span>
    <p class="sr-title">dip_med &lt; -3%</p>
    <p class="sr-body">The median dip must be meaningful. A -1% average move is noise; -3% or more gives enough room to absorb transaction costs and still profit from the recovery.</p>
  </div>
  <div class="sr-card">
    <span class="sr-pill" style="background:var(--color-background-success);color:var(--color-text-success)">Win Rate</span>
    <p class="sr-title">win_rate = 60%</p>
    <p class="sr-body">At least 60% of clean cycles must have offered more than 3% rebound from the cycle low back to the PrevDP anchor for the zone to remain structurally usable. Below this, the pattern is too inconsistent to treat the dip as a dependable setup.</p>
  </div>
</div>
<div class="sr-card">
  <span class="sr-pill" style="background:var(--color-background-success);color:var(--color-text-success)">Consistency</span>
  <p class="sr-title">dip_depth_cv &lt; 60% — the hidden gatekeeping condition</p>
  <p class="sr-body">Even with a good median and high win rate, if the dip depth varies wildly cycle-to-cycle (coefficient of variation above 60%), you cannot size a position reliably. A -3% median with CV = 90% means some cycles dip -1% and others -8% — the zone you calculate from history is unreliable as a forward guide. Requiring CV &lt; 60% ensures the dip depth is sufficiently <em>predictable</em>, not just good on average.</p>
</div>
<p class="sr-section-head">Pillar 3 — Why n_effective matters more than raw cycle count</p>
<div class="sr-card">
  <span class="sr-pill" style="background:#EEEDFE;color:#3C3489">Statistical</span>
  <p class="sr-title">Autocorrelation deflates your true sample size</p>
  <p class="sr-body">If consecutive dividend cycles behave similarly (autocorrelation rho &gt; 0), you don't actually have N independent data points — you have fewer. The formula <code>n x (1-rho) / (1+rho)</code> gives the effective independent sample size. A stock with 12 cycles but rho = 0.5 has n_effective ~ 4. This feeds directly into whether a THIN or INSUFFICIENT warning fires and how much confidence to place in the win rate and zone estimates.</p>
  <div class="sr-rule">
    <div class="sr-rule-row"><span class="sr-label">n_eff = 8</span><span class="sr-val">Use 10th percentile for zone_bot — tight, reliable bound</span></div>
    <div class="sr-rule-row"><span class="sr-label">n_eff 5–7</span><span class="sr-val">Fall back to 20th percentile — wider, more conservative</span></div>
    <div class="sr-rule-row"><span class="sr-label">n_eff 3–4</span><span class="sr-val">30th percentile — treat as directional signal only</span></div>
    <div class="sr-rule-row"><span class="sr-label">n_eff &lt; 3</span><span class="sr-val">Insufficient — minimum of observed lows, extreme caution</span></div>
  </div>
</div>
<p class="sr-section-head">Pillar 4 — Timing reliability and what BIMODAL means for execution</p>
<div class="sr-two">
  <div class="sr-card">
    <span class="sr-pill" style="background:var(--color-background-success);color:var(--color-text-success)">Reliable</span>
    <p class="sr-title">Timing CV low, single cluster</p>
    <p class="sr-body">The dip consistently occurs within a narrow window of weeks before ex-date. In the live model this means <code>wks_cv = 15</code> plus a tight spread check, so you can combine the price zone <em>and</em> the timing signal — enter when both align.</p>
  </div>
  <div class="sr-card">
    <span class="sr-pill" style="background:var(--color-background-warning);color:var(--color-text-warning)">Bimodal</span>
    <p class="sr-title">Two distinct entry clusters detected</p>
    <p class="sr-body">The dip occurs at two separate calendar windows across cycles — sometimes early (Cluster 1, farther from ex-div), sometimes late (Cluster 2, closer to ex-div). By default you cannot predict which cluster this cycle will follow, so set a limit order in the price zone and monitor <em>both</em> windows. Check <strong>Cluster dominance</strong> in the drill view: if one cluster accounts for ≥75% of all historical cycles, the stock may behave more like Reliable timing and that dominant window deserves more weight. The avg dip figure next to each cluster count shows which window historically produced deeper entry opportunities — useful when counts are close but one cluster consistently dips further.</p>
  </div>
</div>
<div class="sr-card">
  <span class="sr-pill" style="background:var(--color-background-danger);color:var(--color-text-danger)">Unreliable</span>
  <p class="sr-title">Timing alone gives no signal — price zone is your only guide</p>
  <p class="sr-body">Timing CV is too high, or the calendar spread is wide (&gt;4 months, CALENDAR_WIDE). Week-count and calendar windows both fail as entry triggers. The price zone is the only filter with any predictive value. Set a passive limit order and let the price come to you.</p>
</div>
<p class="sr-section-head">Pillar 5 — Why current entry status overrides everything else</p>
<div class="sr-card">
  <span class="sr-pill" style="background:#EEEDFE;color:#3C3489">Price vs Zone</span>
  <p class="sr-title">The zone is a forward anchor, not a historical average</p>
  <p class="sr-body">zone_bot and zone_top are derived by taking the target series' recent clean dip distribution and applying it to the <em>ex-dividend adjusted anchor</em> — the prior ex-div closing price minus the dividend paid at that event, which is the level the stock mechanically resets to on ex-div date. This keeps the zone grounded in the latest real price reset while still using the target series' own dip pattern. If the current price is <em>already above zone_top</em>, the dip has either not happened yet (wait) or has already recovered (missed). Chasing a price above zone_top means you are buying after the pattern has played out — you are no longer playing the dip, you are holding a fully-priced dividend stock with no margin of safety.</p>
  <div class="sr-rule">
    <div class="sr-rule-row"><span class="sr-label">Forward anchor</span><span class="sr-val">Most recent prior ex-div event sets the level — ex-div adjusted (closing price minus dividend paid)</span></div>
    <div class="sr-rule-row"><span class="sr-label">Zone shape</span><span class="sr-val">Target series' recent clean low_vs_prevdp distribution sets zone_bot and zone_top</span></div>
<div class="sr-rule-row"><span class="sr-label">Below zone</span><span class="sr-badge" style="background:var(--color-background-secondary);color:var(--color-text-secondary)">Small undershoots can still be valid; deeper undershoots become Wait because price may have overshot</span></div>
  <div class="sr-rule-row"><span class="sr-label">In-zone</span><span class="sr-badge" style="background:var(--color-background-success);color:var(--color-text-success)">Place limit order — pattern is active</span></div>
  <div class="sr-rule-row"><span class="sr-label">Above zone</span><span class="sr-badge" style="background:var(--color-background-danger);color:var(--color-text-danger)">Do not chase — margin of safety is gone</span></div>
  </div>
</div>
<p class="sr-section-head">Pillar 6 — Risk filters that override a positive setup</p>
<div class="sr-two">
  <div class="sr-card">
    <span class="sr-pill" style="background:var(--color-background-warning);color:var(--color-text-warning)">Tail Risk</span>
    <p class="sr-title">Extreme outlier cycles exist</p>
  <p class="sr-body">Even a structurally good series can still have rare bad cycles. Tail risk means that after entering inside the expected buy zone, price has sometimes fallen much lower than the zone suggested. Treat the zone as a normal landing area, not a guaranteed floor.</p>
  <div class="sr-rule">
    <div class="sr-rule-row"><span class="sr-label">Low</span><span class="sr-val">Tail stress average stays relatively contained</span></div>
    <div class="sr-rule-row"><span class="sr-label">Moderate</span><span class="sr-val">Tail stress average is around 6%+ downside, or single worst cycle is around 12%+ down</span></div>
    <div class="sr-rule-row"><span class="sr-label">Caution</span><span class="sr-val">Price has historically fallen more than 3% below the projected zone bottom, or tail stress average is around 10%+ down</span></div>
    <div class="sr-rule-row"><span class="sr-label">High</span><span class="sr-val">Worst cycle fell at least 5% below zone bottom and tail stress average is at least about 9% down</span></div>
    <div class="sr-rule-row"><span class="sr-label">Severe</span><span class="sr-val">Worst cycle fell at least 8% below zone bottom and tail stress average is at least about 12% down</span></div>
  </div>
  </div>
  <div class="sr-card">
    <span class="sr-pill" style="background:var(--color-background-warning);color:var(--color-text-warning)">Fragility</span>
    <p class="sr-title">Zone is often missed in historical cycles</p>
    <p class="sr-body">How often the projected zone was missed historically. The underlying number (<code>entry_zone_hit_rate</code>) is always shown; the qualitative flag is graded relative to every other stock currently loaded (bottom 25%, below median, near median, or top 25%) rather than a fixed cutoff — across this tracked universe, a fixed "more than 30% missed" bar turned out to trip on nearly every series, so it stopped being able to separate a relatively fragile setup from a relatively sound one. Treat the zone as approximate rather than dependable either way — even a top-quartile zone still gets missed some of the time.</p>
  </div>
</div>
<div class="sr-card">
  <span class="sr-pill" style="background:var(--color-background-danger);color:var(--color-text-danger)">Stability Trend</span>
<p class="sr-title">Degrading trend means the edge is diminishing over time</p>
<p class="sr-body">If recent cycles are scoring worse than older ones (stability_trend_verdict = Degrading), the historical win rate overstates the forward edge. The pattern may be fading due to changing market structure, increased awareness of the trade, or fundamental business change. Even if other gates pass, this should usually push the setup toward <em>Small Trades Advised</em>, <em>Wait</em>, or <em>Too Risky</em> rather than full conviction.</p>
</div>
<p class="sr-section-head">Pillar 7 — How Exit Mode is determined</p>
<div class="sr-two">
  <div class="sr-card">
    <span class="sr-pill" style="background:var(--color-background-info);color:var(--color-text-info)">Exit Logic</span>
    <p class="sr-title">Two practical exit paths are compared on complete cycles only</p>
  <p class="sr-body">The exit analysis does <em>not</em> use an unconstrained post-exdiv peak. It compares two bounded paths from the cycle low: <em>Pre-Exdiv Peak Exit</em> and <em>Ex-Div Date Exit</em>. The first path uses the highest close reached before ex-dividend after the cycle low. The second path uses the first available close on or after the ex-dividend date. Only complete historical cycles are included so the comparison is based on finished setups rather than partial forward projections.</p>
  <div class="sr-rule">
      <div class="sr-rule-row"><span class="sr-label">Pre-Exdiv Peak Exit</span><span class="sr-val">Gain from cycle low to the highest close reached before the ex-dividend date</span></div>
      <div class="sr-rule-row"><span class="sr-label">Ex-Div Date Exit</span><span class="sr-val">Gain from cycle low to the first available close on or after the ex-dividend date</span></div>
      <div class="sr-rule-row"><span class="sr-label">Optimal</span><span class="sr-val">Hindsight best exit in the full cycle, used only as a reference check, not as the traded base case</span></div>
      <div class="sr-rule-row"><span class="sr-label">Timing Metric</span><span class="sr-val">Usual pre-exdiv peak window = 25th to 75th percentile of <code>ex-div date - pre-exdiv peak exit date</code> across complete cycles</span></div>
    </div>
  </div>
  <div class="sr-card">
    <span class="sr-pill" style="background:#EEEDFE;color:#3C3489">Decision Rule</span>
    <p class="sr-title">The verdict is based on average gains plus optimal-exit evidence</p>
    <p class="sr-body">The model first calculates average gains and win rates for the two practical exits. It also records the usual pre-exdiv peak window as descriptive context. The actual verdict then checks where the hindsight-optimal exit tended to happen and whether the pre-exdiv peak exit remained competitive versus the ex-div date exit. This keeps the window informative without making it a direct rule input.</p>
    <div class="sr-rule">
      <div class="sr-rule-row"><span class="sr-label">Pre-Exdiv Peak Exit Preferred</span><span class="sr-val">Average pre-exdiv peak exit gain is at least 95% of the average ex-div date exit gain when the ex-div date exit is positive</span></div>
      <div class="sr-rule-row"><span class="sr-label">Ex-Div Date Exit Preferred</span><span class="sr-val">Average optimal gain is more than 105% of the average ex-div date exit gain and fewer than 40% of optimal exits happened before ex-dividend</span></div>
      <div class="sr-rule-row"><span class="sr-label">Indeterminate</span><span class="sr-val">Neither side has enough historical edge to justify a strong verdict</span></div>
      <div class="sr-rule-row"><span class="sr-label">Insufficient Data</span><span class="sr-val">Too few complete cycles to judge the exit pattern with confidence</span></div>
    </div>
  </div>
</div>
<div class="sr-card">
  <span class="sr-pill" style="background:var(--color-background-warning);color:var(--color-text-warning)">Interpretation</span>
  <p class="sr-title">Use Exit Mode as historical evidence, not a promise</p>
  <p class="sr-body">Exit Mode tells you which exit path has historically looked stronger for that series. It does not guarantee the next cycle will behave the same way. The safest reading is: <em>if this setup works similarly to past complete cycles, which exit style has usually been more rewarding?</em></p>
</div>
<p class="sr-section-head">Pillar 8 — CGC ranking as the final series selector</p>
<div class="sr-card">
  <span class="sr-pill" style="background:var(--color-background-info);color:var(--color-text-info)">Series Selection</span>
  <p class="sr-title">When multiple series qualify, CGC rank decides which to prioritise</p>
  <p class="sr-body">CGC (Combined Grade &amp; Confidence) combines win rate and S2 (second-period return, the post-dip recovery) into a single ranked score. Rank 1 with score &gt; 60 means both the probability of success and the magnitude of return are highest. A series with high win rate but shallow S2 is safe but low-yield. A series with deep S2 but low win rate is high-variance. CGC balances both — always lead with rank 1 when entering a position.</p>
</div>
</div></div>`
}

function panelCycles(data){
  const m=data.meta||{};
  const rows=(data.cycles||[]).slice().sort((a,b)=>new Date(b.exdiv_date)-new Date(a.exdiv_date));
  if(!rows.length)return`<div class="empty">No cycle data found.</div>`;

  // summary counts
  const clean=rows.filter(r=>!toBool(r.macro)&&!toBool(r.outlier)&&!toBool(r.degen)&&!r.incomplete);
  const nSuccess=clean.filter(r=>toBool(r.success)).length;

  return`<div class="panel">
    <h2>Cycle Log</h2>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>ID</th><th>Series</th><th>Ex-Div</th><th>Div Amt</th>
          <th>PrevDP</th><th>Low Px</th><th>Peak Px</th>
          <th>Low vs PDP</th><th>Peak vs PDP</th>
<th>Wks Before</th><th>${tipLabel("Success","Whether that cycle's dip offered more than 3% rebound from the low back to the PrevDP anchor. This is the basic win-or-loss outcome used in the model.")}</th>
          <th>${tipLabel("Zone Hit","Whether price actually traded into the projected entry zone during that cycle.")}</th>
          <th>${tipLabel("Stab Score","0–100 score for how closely that cycle matched the usual pattern. Higher means more typical; blank means there was not enough prior history to score it.")}</th>
          <th>Flags</th>
        </tr></thead>
        <tbody>
        ${rows.map(r=>{
          const flags=[];
          if(r.incomplete)flags.push("incomplete");
          if(toBool(r.macro))flags.push("macro");
          if(toBool(r.outlier))flags.push("outlier");
          if(toBool(r.degen))flags.push("degen");
          const isClean=!flags.length;
          const success=toBool(r.success);
          const zoneHit=r.zone_hit!==null&&r.zone_hit!==undefined?toBool(r.zone_hit):null;
          const stabScore=r.pattern_stability_score;
          return`<tr style="${!isClean?"opacity:.6":""}">
            <td>${esc(r.id||"-")}</td>
            <td>${esc(r.series||"-")}</td>
            <td>${dt(r.exdiv_date)}</td>
            <td>${n(r.div_amt,4)}</td>
            <td>${ccy(r.prev_dp,m.currency)}</td>
            <td>${ccy(r.low_px,m.currency)}</td>
            <td>${ccy(r.peak_px,m.currency)}</td>
            <td class="bad">${pct(r.low_vs_prevdp,2)}</td>
            <td class="good">${pct(r.peak_vs_prevdp,2)}</td>
            <td>${n(r.wks_before,2)}</td>
            <td class="${success?"good":"bad"}">${success?"Yes":"No"}</td>
            <td class="${zoneHit===null?"muted":zoneHit?"good":"warn"}">${zoneHit===null?"-":zoneHit?"Yes":"No"}</td>
            <td>${stabScore!==null&&stabScore!==undefined?`<span style="color:${stabilityColor(stabScore)}">${n(stabScore,0)}</span>`:"-"}</td>
            <td>${flags.length?`<span class="chip" style="font-size:10px">${esc(flags.join(", "))}</span>`:"-"}</td>
          </tr>`
        }).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="10">${rows.length} total cycles · ${clean.length} clean · ${nSuccess}/${clean.length} wins</td>
          <td colspan="4" style="text-align:right">Non-clean rows dimmed</td>
        </tr></tfoot>
      </table>
    </div>
    <div class="section-note">Zone Hit and Pattern Stability Score are populated for newer cycles only. Non-clean cycles (macro / outlier / degen / incomplete) are dimmed and excluded from stats.</div>
  </div>`
}

/* -- TAB 5: DIVIDENDS ---------------------------------------------------- */
function panelDividends(data){
  const m=data.meta||{};
  const annual=(data.annual_payouts||[]).slice().sort((a,b)=>a.yr-b.yr);
  const divs=(data.divs||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));

  // sparkline data for annual payouts
  const sparkMax=annual.length?Math.max(...annual.map(r=>Number(r.total)||0),0.001):0.001;
  const sparkBars=annual.map(r=>{
    const h=Math.max(4,Math.round((Number(r.total)/sparkMax)*32));
    return`<div class="payout-bar" style="height:${h}px" title="${r.yr}: ${n(r.total,4)}"></div>`
  }).join("");

  return`<div class="grid g2">
    <div class="panel">
      <h2>Annual Payouts</h2>
      ${annual.length?`
        <div style="display:flex;align-items:flex-end;gap:12px;margin-bottom:12px">
          <div class="payout-spark">${sparkBars}</div>
          <div class="small muted">Payout history sparkline</div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Year</th><th>Count</th><th>Total</th><th>Series</th><th>Partial</th></tr></thead>
          <tbody>${annual.map(r=>`<tr>
            <td>${esc(r.yr)}</td>
            <td>${n(r.count,0)}</td>
            <td><strong>${n(r.total,4)}</strong></td>
            <td>${esc((r.series||[]).join(", "))}</td>
            <td class="${r.partial?"warn":"good"}">${r.partial?"Partial":"Full"}</td>
          </tr>`).join("")}
          </tbody>
        </table></div>
      `:`<div class="empty">No annual payout data.</div>`}
    </div>
    <div class="panel">
      <h2>Dividend History</h2>
      ${divs.length?`<div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>Series</th><th>Date</th><th>Amount</th><th>Note</th></tr></thead>
        <tbody>${divs.map(r=>`<tr>
          <td>${esc(r.id||"-")}</td>
          <td>${esc(r.series||"-")}</td>
          <td>${dt(r.date)}</td>
          <td>${n(r.amount,4)}</td>
          <td class="muted">${esc(r.note||"-")}</td>
        </tr>`).join("")}
        </tbody>
      </table></div>`:`<div class="empty">No dividend history.</div>`}
      ${(()=>{const excl=(data.anomalies_excluded||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));if(!excl.length)return"";return`<div style="margin-top:16px"><div class="small muted" style="margin-bottom:6px;font-weight:600">Special / Excluded Dividends</div><div class="section-note" style="margin-bottom:8px">Detected in source data but excluded from cycle analysis — amount exceeded 2.5× the recent baseline. Shown here for reference only.</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Reason</th></tr></thead><tbody>${excl.map(a=>`<tr><td>${dt(a.date)}</td><td style="color:#a78bfa">${ccy(a.amount,m.currency)}</td><td class="muted">${esc(a.reason||"-")}</td></tr>`).join("")}</tbody></table></div></div>`})()}
    </div>
  </div>`
}

/* -- TAB 6: PRICE CHART -------------------------------------------------- */
function panelPriceHTML(){
  return`<div class="panel chart-shell">
    <h2>Interactive Price History</h2>
    <div class="chart-controls">
      <label class="toggle"><input type="checkbox" id="tgPrice" checked> Price line</label>
      <label class="toggle"><input type="checkbox" id="tgZones" checked> Entry zones</label>
      <label class="toggle"><input type="checkbox" id="tgDivs" checked> Ex-div markers</label>
      <label class="toggle"><input type="checkbox" id="tgLows" checked> Cycle lows</label>
      <label class="toggle"><input type="checkbox" id="tgPeaks" checked> Cycle peaks</label>
    </div>
    <div class="date-range-row">
      <label>From <input type="date" id="priceFrom"></label>
      <label>To <input type="date" id="priceTo"></label>
      <button class="preset-btn" id="pricePreset6M">6M</button>
      <button class="preset-btn" id="pricePreset1Y">1Y</button>
      <button class="preset-btn" id="pricePreset2Y">2Y</button>
      <button class="preset-btn" id="pricePreset3Y">3Y</button>
      <button class="preset-btn" id="pricePreset5Y">5Y</button>
      <button class="preset-btn" id="pricePresetAll">All</button>
    </div>
    <div class="spark-wrap">
      <svg class="spark" id="priceSvg" viewBox="0 0 1200 320" preserveAspectRatio="none"></svg>
      <div class="tooltip" id="chartTip"></div>
    </div>
    <div class="legend">
      <span><i style="background:#4f8ef7"></i>Price</span>
      <span><i style="background:rgba(62,217,160,.35);border:1px solid var(--gn)"></i>Zone bot</span>
      <span><i style="background:#f5c542"></i>Ex-div</span>
      <span><i style="background:#00e5ff"></i>Cycle low</span>
      <span><i style="background:#ff6b35"></i>Cycle peak</span>
    </div>
    <div class="section-note">Hover markers to inspect date and value. Scroll to zoom, drag to pan. Zone band shows entry zone bot for each series, calculated from the ex-dividend adjusted anchor (anchor minus dividend paid).</div>
  </div>`
}

let _priceChartData=null;
function renderPriceChart(data){
  _priceChartData=data;
  const svg=document.getElementById("priceSvg");
  if(!svg)return;
  const tip=document.getElementById("chartTip");

  // date range setup — initialise inputs once per tab load, preserve on re-render
  const fromEl=document.getElementById("priceFrom"),toEl=document.getElementById("priceTo");
  const allPriceData=data.price_data||[];
  const allDates=allPriceData.map(p=>p.d).filter(Boolean).sort();
  if(fromEl&&!fromEl.dataset.init){fromEl.value=allDates[0]||"";fromEl.dataset.init="1"}
  if(toEl&&!toEl.dataset.init){toEl.value=allDates[allDates.length-1]||"";toEl.dataset.init="1"}
  const startDate=fromEl?.value||"",endDate=toEl?.value||"";

  const priceData=allPriceData.filter(p=>(!startDate||p.d>=startDate)&&(!endDate||p.d<=endDate));
  const cycles=(data.cycles||[]).filter(c=>(!startDate||(c.low_date>=startDate||c.peak_date>=startDate))&&(!endDate||(c.low_date<=endDate||c.peak_date<=endDate)));
  const divs=(data.divs||[]).filter(d=>(!startDate||d.date>=startDate)&&(!endDate||d.date<=endDate));

  const currency=data.meta?.currency||"";
  const w=1200,h=320,pad=28;

  const values=priceData.map(p=>Number(p.c)).filter(Number.isFinite);
  if(!values.length)return;
  const minV=Math.min(...values),maxV=Math.max(...values),rangeV=Math.max(maxV-minV,.0001);
  const xAt=i=>pad+i/Math.max(priceData.length-1,1)*(w-pad*2);
  const yAt=v=>h-pad-((Number(v)-minV)/rangeV)*(h-pad*2);

  const nearestPriceMap=new Map(priceData.map((p,i)=>[p.d,{x:xAt(i),y:yAt(p.c),row:p}]));
  const datedPrices=priceData.map((p,i)=>({idx:i,ms:new Date(p.d).getTime(),x:xAt(i),y:yAt(p.c),row:p})).filter(p=>Number.isFinite(p.ms));
  function nearestPriceHit(dateStr){
    const exact=nearestPriceMap.get(dateStr);
    if(exact)return exact;
    const targetMs=new Date(dateStr).getTime();
    if(!Number.isFinite(targetMs)||!datedPrices.length)return null;
    let best=null;
    for(const p of datedPrices){
      const diff=Math.abs(p.ms-targetMs);
      const isEarlierOrSame=p.ms<=targetMs;
      if(!best||diff<best.diff||(diff===best.diff&&isEarlierOrSame&&!best.isEarlierOrSame))best={diff,isEarlierOrSame,hit:p};
    }
    return best?best.hit:null;
  }
  function circle(x,y,color,r,meta){return`<circle class="marker" cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="rgba(0,0,0,.4)" stroke-width="1" data-meta="${esc(JSON.stringify(meta))}"></circle>`}

  // axis lines
  let html=`<line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="#283550"/>`;
  html+=`<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" stroke="#283550"/>`;

  // zone bot bands for each proj series
  Object.entries(data.proj_series||{}).forEach(([id,p])=>{
    const bot=Number(p.zone_bot),top=Number(p.zone_top);
    if(!Number.isFinite(bot)||!Number.isFinite(top))return;
    const y1=yAt(top),y2=yAt(bot);
    const sm=data.series_meta?.find(s=>s.id===id);
    const col=sm?.color||"#4f8ef7";
    html+=`<rect id="zoneRect_${id}" x="${pad}" y="${y1}" width="${w-pad*2}" height="${Math.max(2,y2-y1)}" fill="${col}" fill-opacity=".08" stroke="${col}" stroke-opacity=".3" stroke-width="1" stroke-dasharray="4,3"/>`;
  });

  // price line
  const pts=priceData.map((p,i)=>`${xAt(i).toFixed(2)},${yAt(p.c).toFixed(2)}`).join(" ");
  html+=`<polyline id="layerPrice" fill="none" stroke="#4f8ef7" stroke-width="2.5" points="${pts}"/>`;
  html+=priceData.map((p,i)=>`<circle class="price-hit" cx="${xAt(i)}" cy="${yAt(p.c)}" r="8" fill="transparent" data-meta="${esc(JSON.stringify({kind:"Price",date:p.d,value:`${currency} ${n(p.c,4)}`}))}"></circle>`).join("");

  // ex-div
  html+=`<g id="layerDivs">${divs.map(d=>{const hit=nearestPriceHit(d.date);if(!hit)return"";const px=hit.row?.c!=null?`${currency} ${n(hit.row.c,4)}`:"-";return circle(hit.x,hit.y,"#f5c542",5,{kind:"Ex-div",date:d.date,value:`${currency} ${n(d.amount,4)}`,extra:`${d.series||"-"} | Price ${px}`})}).join("")}</g>`;
  // lows
  html+=`<g id="layerLows">${cycles.map(c=>{const hit=nearestPriceMap.get(c.low_date);if(!hit||c.low_px==null)return"";return circle(hit.x,hit.y,"#00e5ff",5,{kind:"Cycle low",date:c.low_date,value:`${currency} ${n(c.low_px,4)}`,extra:`${c.id} | ${n(c.low_vs_prevdp,2)}% vs PrevDP`})}).join("")}</g>`;
  // peaks
  html+=`<g id="layerPeaks">${cycles.map(c=>{const hit=nearestPriceMap.get(c.peak_date);if(!hit||c.peak_px==null)return"";return circle(hit.x,hit.y,"#ff6b35",5,{kind:"Cycle peak",date:c.peak_date,value:`${currency} ${n(c.peak_px,4)}`,extra:`${c.id} | ${n(c.peak_vs_prevdp,2)}% vs PrevDP`})}).join("")}</g>`;

  svg.innerHTML=html;

  // layer toggles — renderPriceChart re-runs on every date-range keystroke,
  // preset click, and zoom/pan, but these checkboxes persist across renders
  // (only svg.innerHTML is replaced). Attaching a fresh listener every call
  // would accumulate indefinitely, so each checkbox is bound at most once
  // (dataset.layerBindInit guard). The sync functions re-look-up their target
  // element/rects on every call rather than closing over one instance, so the
  // toggle keeps working against whatever is currently in the DOM instead of
  // a stale, detached reference from a prior render.
  function bindLayer(tgId,layerId){
    const tg=document.getElementById(tgId);
    if(!tg)return;
    const sync=()=>{
      const layer=document.getElementById(layerId);
      if(layer)layer.style.display=tg.checked?"":"none";
    };
    sync();
    if(!tg.dataset.layerBindInit){
      tg.dataset.layerBindInit="1";
      tg.addEventListener("change",sync);
    }
  }
  bindLayer("tgDivs","layerDivs");bindLayer("tgLows","layerLows");bindLayer("tgPeaks","layerPeaks");

  const tgPrice=document.getElementById("tgPrice");
  if(tgPrice){
    const syncPrice=()=>{
      const layerPrice=document.getElementById("layerPrice");
      if(layerPrice)layerPrice.style.display=tgPrice.checked?"":"none";
    };
    syncPrice();
    if(!tgPrice.dataset.layerBindInit){
      tgPrice.dataset.layerBindInit="1";
      tgPrice.addEventListener("change",syncPrice);
    }
  }

  const tgZones=document.getElementById("tgZones");
  if(tgZones){
    const syncZones=()=>{
      svg.querySelectorAll("[id^='zoneRect_']").forEach(r=>r.style.display=tgZones.checked?"":"none");
    };
    syncZones();
    if(!tgZones.dataset.layerBindInit){
      tgZones.dataset.layerBindInit="1";
      tgZones.addEventListener("change",syncZones);
    }
  }

  // tooltips — use fixed positioning relative to viewport so scroll doesn't offset them
  const showTip=(e,meta)=>{
    tip.innerHTML=`<strong>${esc(meta.kind)}</strong><span class="muted">${dt(meta.date)}</span><div style="margin-top:5px">${esc(meta.value||"-")}</div>${meta.extra?`<div class="muted">${esc(meta.extra)}</div>`:""}`;
    tip.style.display="block";
    // position: try right of cursor first, flip left if near right edge
    const vw=window.innerWidth;
    const tipW=180;
    const cx=e.clientX??e.touches?.[0]?.clientX??0;
    const cy=e.clientY??e.touches?.[0]?.clientY??0;
    const left=cx+16+tipW>vw ? cx-tipW-8 : cx+16;
    tip.style.position="fixed";
    tip.style.left=`${left}px`;
    tip.style.top=`${Math.max(8,cy-10)}px`;
    tip.style.zIndex="9999";
  };
  svg.querySelectorAll(".marker,.price-hit").forEach(node=>{
    const getMeta=()=>JSON.parse(node.dataset.meta);
    node.addEventListener("mousemove",e=>showTip(e,getMeta()));
    node.addEventListener("mouseleave",()=>tip.style.display="none");
    // touch: tap to show, tap elsewhere to hide
    node.addEventListener("touchstart",e=>{e.preventDefault();showTip(e,getMeta())},{passive:false});
  });
  document.addEventListener("touchstart",e=>{
    if(!e.target.closest("#priceSvg"))tip.style.display="none";
  });

  // date range input re-render
  if(fromEl)fromEl.oninput=()=>renderPriceChart(_priceChartData);
  if(toEl)toEl.oninput=()=>renderPriceChart(_priceChartData);

  // preset buttons — set From to N years back from the last data date, keep To at max
  const _presetMap={pricePreset6M:{m:6},pricePreset1Y:{y:1},pricePreset2Y:{y:2},pricePreset3Y:{y:3},pricePreset5Y:{y:5}};
  Object.entries(_presetMap).forEach(([id,cfg])=>{
    const b=document.getElementById(id);
    if(!b)return;
    b.onclick=()=>{
      const endVal=allDates[allDates.length-1]||"";
      if(!endVal)return;
      if(toEl)toEl.value=endVal;
      if(fromEl){const d=new Date(endVal);cfg.y?d.setFullYear(d.getFullYear()-cfg.y):d.setMonth(d.getMonth()-cfg.m);fromEl.value=d.toISOString().split("T")[0];}
      renderPriceChart(_priceChartData);
    };
  });
  const _allBtn=document.getElementById("pricePresetAll");
  if(_allBtn)_allBtn.onclick=()=>{
    if(fromEl)fromEl.value=allDates[0]||"";
    if(toEl)toEl.value=allDates[allDates.length-1]||"";
    renderPriceChart(_priceChartData);
  };
  // Zoom/pan — attach once per SVG element instance
  if(!svg.dataset.zoomPanInit){
    svg.dataset.zoomPanInit="1";
    const allMs=allDates.map(d=>new Date(d).getTime()).filter(Number.isFinite).sort((a,b)=>a-b);
    const msMin=allMs[0],msMax=allMs[allMs.length-1];
    const MIN_SPAN=28*864e5;
    const msToStr=ms=>new Date(ms).toISOString().slice(0,10);
    const getRange=()=>{
      const f=fromEl?.value?new Date(fromEl.value).getTime():msMin;
      const t=toEl?.value?new Date(toEl.value).getTime():msMax;
      return{f,t,span:t-f};
    };
    const applyRange=(f,t)=>{
      const sp=t-f;
      if(sp<MIN_SPAN){const mid=(f+t)/2;f=mid-MIN_SPAN/2;t=mid+MIN_SPAN/2;}
      if(f<msMin){t+=msMin-f;f=msMin;}
      if(t>msMax){f-=t-msMax;t=msMax;}
      if(fromEl)fromEl.value=msToStr(Math.max(msMin,f));
      if(toEl)toEl.value=msToStr(Math.min(msMax,t));
      renderPriceChart(_priceChartData);
    };
    const svgFrac=cx=>{
      const r=svg.getBoundingClientRect();
      const lx=pad/w*r.width,rx=(w-pad)/w*r.width;
      return Math.max(0,Math.min(1,(cx-r.left-lx)/(rx-lx)));
    };
    svg.addEventListener("wheel",e=>{
      e.preventDefault();
      const frac=svgFrac(e.clientX);
      const{f,t,span}=getRange();
      const pivot=f+frac*span;
      const nSpan=Math.max(MIN_SPAN,Math.min(msMax-msMin,span*(e.deltaY>0?1.3:1/1.3)));
      applyRange(pivot-frac*nSpan,pivot+(1-frac)*nSpan);
    },{passive:false});
    let drag=null,rafId=null,pendingX=null;
    svg.addEventListener("mousedown",e=>{
      if(e.button!==0)return;
      e.preventDefault();
      const{f,t,span}=getRange();
      const r=svg.getBoundingClientRect();
      const plotPx=(w-pad*2)/w*r.width;
      drag={x:e.clientX,f,t,msPx:span/Math.max(1,plotPx)};
      svg.dataset.dragging="1";
      svg.style.cursor="grabbing";
    });
    window.addEventListener("mousemove",e=>{
      if(!drag)return;
      pendingX=e.clientX;
      if(rafId)return;
      rafId=requestAnimationFrame(()=>{
        rafId=null;
        if(!drag||pendingX==null)return;
        const shift=(drag.x-pendingX)*drag.msPx;
        applyRange(drag.f+shift,drag.t+shift);
      });
    });
    window.addEventListener("mouseup",()=>{
      if(!drag)return;
      drag=null;rafId=null;pendingX=null;
      const el=document.getElementById("priceSvg");
      if(el){delete el.dataset.dragging;el.style.cursor="grab";}
    });
  }
  if(!svg.dataset.dragging)svg.style.cursor="grab";
}

/* -- TAB 7: GLOSSARY ----------------------------------------------------- */
function panelFinancials(data){
  const m=data.meta||{};
  const fin=financialsFor(m.ticker);
  if(!fin){
    return`<div class="panel"><h2>Financials</h2><div class="empty">No financial statement data loaded yet for this stock. Run <code>extract-financials.py</code> to fetch it (a separate, occasional script — financial statements change quarterly/annually, not weekly, so this isn't part of the normal price-refresh pipeline).</div></div>`;
  }
  const history=Array.isArray(fin.history)&&fin.history.length?fin.history:[fin];
  const rows=history.map(h=>`<tr>
    <td>${dt(h.as_of)}</td>
    <td>${h.health?verdictPill(h.health.label,h.health.tone):"-"}</td>
    <td class="num">${compactCcy(h.total_debt,m.currency)}</td>
    <td class="num">${compactCcy(h.total_equity,m.currency)}</td>
    <td class="num ${debtEquityTone(h.debt_to_equity_pct)}">${h.debt_to_equity_pct!=null?`${n(h.debt_to_equity_pct,1)}%`:"-"}</td>
    <td class="num">${compactCcy(h.net_debt,m.currency)}</td>
    <td class="num">${compactCcy(h.free_cash_flow,m.currency)}</td>
    <td class="num">${compactCcy(h.cash_dividends_paid,m.currency)}</td>
    <td class="num ${dividendCoverageTone(h.dividend_fcf_coverage)}">${h.dividend_fcf_coverage!=null?`${n(h.dividend_fcf_coverage,2)}x`:"-"}</td>
    <td class="num">${h.current_ratio!=null?n(h.current_ratio,2):"-"}</td>
  </tr>`).join("");
  return`<div class="panel">
    <h2>Financials</h2>
    <p class="small muted" style="margin:0 0 12px">Raw balance-sheet and cash-flow line items from the company's filed financial statements, computed here directly rather than using Yahoo Finance's own pre-packaged ratios — confirmed unreliable during testing (missing on large-cap tickers, and inconsistent with the raw statement data on at least one tested ticker). Annual cadence, not live, and not yet factored into Current Verdict, Potential Score, or the structural health override — informational only for now.</p>
    <div class="cmp-table-wrap drag-scroll">
      <table>
        <thead><tr>
          <th>Period</th>
          <th>${tipLabel("Health","Rule-based read combining leverage and dividend coverage for that period. Current ratio isn't part of this read — see its own note below.")}</th>
          <th class="num">${tipLabel("Total Debt","All interest-bearing debt from the balance sheet.")}</th>
          <th class="num">${tipLabel("Equity","Stockholders' equity from the balance sheet.")}</th>
          <th class="num">${tipLabel("Debt / Equity","Total debt divided by equity for that period. Below 60% = low leverage (green), 60–120% = moderate (amber), above 120% = high (red).")}</th>
          <th class="num">${tipLabel("Net Debt","Total debt minus cash and cash equivalents. Negative = net cash position (more cash than debt, a buffer). Positive = debt exceeds cash, normal for most businesses. Not colour-graded — the debt/equity column already accounts for company size, this is just the raw balance.")}</th>
          <th class="num">${tipLabel("Free Cash Flow","Cash generated after operating and capital expenditure needs, from the cash flow statement.")}</th>
          <th class="num">${tipLabel("Dividends Paid","Cash actually paid out to shareholders that period, from the cash flow statement.")}</th>
          <th class="num">${tipLabel("FCF Coverage","Free cash flow divided by dividends paid. 1.3x+ = comfortable (green), 1.0–1.3x = thin (amber), below 1x = funded from cash reserves or debt, not earnings (red).")}</th>
          <th class="num">${tipLabel("Current Ratio","Current assets divided by current liabilities. Not colour-graded — REITs/Trusts structurally run below 1 here.")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function panelGlossary(){
  const terms=[
    ["Entry Zone","Projected price range where historical dips tend to occur. Dip percentiles from the target series' recent clean cycles (winsorized at the 5th and 95th percentiles) are applied to the ex-dividend adjusted anchor — the anchor price minus the dividend paid at that ex-div event, which is where the stock mechanically resets on ex-div date."],
    ["Most Recent Ex-Div Anchor","The latest prior ex-div event whose ex-div date has already occurred before the projected cycle. Its pre-dividend closing price (prev_dp) is shown as a reference. The entry zone is built from the ex-dividend adjusted level: prev_dp minus the dividend paid, reflecting the actual price reset on ex-div date."],
    ["PrevDP","Previous dividend-period anchor price. Dividend Cycle Analysis uses this to measure how deep the dip was and how far the peak recovered each cycle. Forward projection uses the most recent prior ex-div event's closing price as a reference, then subtracts the dividend paid to get the ex-dividend adjusted anchor — the actual price level used to build the entry zone."],
    ["Win Rate","Percent of clean cycles where the dip offered more than 3% rebound back to the PrevDP anchor. Higher means the pattern produced a meaningful trade more often."],
    ["N_effective","Autocorrelation-adjusted sample size. If cycles are correlated with each other, n_eff will be smaller than n_clean. The live buckets are: Adequate >= 8, Moderate >= 5, Thin >= 3, and Insufficient below 3."],
    ["Dip Depth CV","Coefficient of variation of the dip sizes (low_vs_prevdp). Low CV means dips were similar in magnitude — zone is tighter."],
    ["Reliable timing","The week-count when the cycle low occurs is tightly clustered. In the live model this means wks_cv <= 15 plus a spread check of max(3, 0.3 x average weeks-before), so the dip timing can be used as a more specific date guide."],
    ["Bimodal timing","Two timing clusters exist. In the live model this appears after failing the Reliable test, when the largest gap between sorted clean timings is greater than 5 weeks. Cluster 1 = early dip (more weeks before ex-div); Cluster 2 = late dip (fewer weeks before ex-div). Watch both windows by default. If the drill view shows one cluster at ≥75% dominance across all historical cycles, favour that window and treat the timing closer to Reliable. The avg dip shown next to each cluster count indicates which window historically produced deeper dips — a secondary signal when counts alone are inconclusive."],
    ["Unreliable timing","Timing is neither Reliable nor Bimodal, so the low timing is too scattered to give a specific date target. Use price zone first and do not rely on the calendar alone."],
    ["Calendar Window Rating","Measures how tightly the historical cycle lows cluster across the calendar year. The spread is the smallest circular window that covers all clean low dates (so a Dec/Jan stock is not penalised). Consistent means a spread of 60 days or less. Moderate means 61–120 days. Wide means more than 120 days, so calendar timing alone is not reliable."],
["Calendar Month Bar Colours","All bars are coloured by success rate — the % of lows in that month where the dip offered more than 3% rebound back to the PrevDP anchor: green >=70%, amber 40–69%, red <40%, grey = no lows. Modal months (where lows cluster most often) are marked with a coloured border instead of a colour override, so the success rate is always visible. In the hover tooltip, Success means the cycle cleared that rebound threshold; Not success means it did not. Sample sizes per month are often just 1–2, so treat colour as directional."],
    ["Pattern Stability Score","0–100 score per cycle measuring how consistent that cycle's behaviour was vs the historical norm. Scored only for cycles with enough history."],
    ["Zone Hit","Whether the price entered the entry zone during that cycle using the same walk-forward zone construction logic. Low zone-hit rate means the zone was easy to miss in practice, not just that it was mathematically too tight."],
["CGC Score","Composite score ranking series by historical edge. It blends win rate and median S2 (peak return above entry) roughly 50/50. Higher = better historical edge for that series."],
["3% hurdle","The live model still treats a cycle as a success only when the rebound from the low back to the PrevDP anchor is more than 3%. This same hurdle feeds win rate and exit win rates. Treat it as a practical minimum trade hurdle, not a stock-specific spread model."],
    ["Potential Score","Weighted stock-level overview score used to rank the grouped cards. It blends win rate, clean cycles, years of data, frequency, timing, tail risk, dividend trend, and zone width. Current weights are 28, 18, 10, 10, 14, 10, 5, and 5 respectively. The labels appear at these thresholds: Strong Potential >= 75, Watchlist >= 60, and Borderline >= 50. The raw score can still show on weak samples, but those shortlist labels are now gated when `n_effective` is below 3. Eligibility for Potential/Watchlist at all is a separate check (win rate, clean cycles, years of data, allowed frequency, tail risk not Severe, plus the structural health override — see Structurally Weak) — the score number can compute even for an ineligible stock, but it won't appear in the Potential or Upcoming lists."],
    ["Asset Type Badge","Small label shown only for non-stock instruments in the live views, such as ETF, REIT, Trust, or Index. It is there to add quick context without cluttering ordinary stock cards. The badge is descriptive only and does not change the scoring or verdict logic by itself."],
    ["Sector","Lightweight stock metadata loaded from the master stock list, such as Financials, Consumer Staples, or Real Estate. It is shown quietly in selected views to help scanning and comparison, but it does not affect scoring, verdicts, or planner calculations."],
    ["Market Index","Benchmark reference instrument used for market context, such as ^STI. In the current setup the true benchmark row is treated separately from normal stocks and is not meant to be interpreted as a regular dividend setup candidate."],
    ["Edit Stock List","Flask-backed stock registry manager used to choose which names are tracked. The master stock picker can now be filtered by stock type and by sector, while Include in analysis and Use as market index control whether a row becomes a live analysis target or the benchmark context row."],
    ["Zone Outcome Map","Scatter view used to test how the low-zone idea is behaving. Current-cycle mode appears when the nearest next projected series already has an estimated low window start in the past. Recent completed cycles mode uses recent completed cycles from the same series. The x-axis shows where the low landed relative to the zone: 0 = zone bottom, 1 = zone top, below 0 = pushed under the zone, above 1 = stayed above it. The y-axis compares actual cycle strength with the model's expected gain."],
    ["Tail Risk Warning","Means price has sometimes fallen well below the expected buy zone in bad historical cycles. Even if you enter inside the zone, downside can still be larger than the zone suggests. The level now uses a tail-stress average of the worst 5 cycles when available, otherwise the worst 3, otherwise the single worst cycle. Current level guide: Low means contained downside. Moderate means the tail-stress average is about 6%+ down or the single worst cycle is about 12%+ down. Caution means more than 3% below zone bottom or a tail-stress average about 10%+ down. High means at least 5% below zone bottom plus a tail-stress average about 9%+ down. Severe means at least 8% below zone bottom plus a tail-stress average about 12%+ down."],
["Current Verdict","Action-oriented summary of what to do now. It is separate from Potential Score. Tail risk Severe and the structural health override (see Structurally Weak) are checked first and win outright; otherwise the logic checks price vs zone, then timing and tail risk, then whether the next cycle is near. Treat the verdict as a guideline, not a hard block: you may still act with your own judgment, sizing, and caution."],
["Actionable Now","Current price is inside the entry zone, or only slightly below it within about 0.5% of zone bottom, while tail risk is not High or Severe and timing is not Unreliable. The slight-below path is intentionally stricter: it only stays fully actionable when tail risk is Low or Moderate. A Caution tail profile can still remain actionable inside the zone, but not once price has already slipped slightly below it."],
["Small Trades Advised","Current price is inside the zone, or only slightly below it, but either tail risk is High or timing is Unreliable. Slight-below cases with a Caution tail profile also land here by design, because the setup may already be starting to overshoot the projected floor. Also shown when a single structural health flag (see Structurally Weak) softened what would otherwise be an Actionable Now reading — the reason text on the card names which flag applied. The setup is live, but exposure should be lighter than normal."],
["Watch Closely","Current price is above the zone but within about 3% of zone_top, and the next ex-div is within 90 days, so the setup may become actionable soon."],
["Wait","Price is above the zone and either too far away (>3% from zone_top) or the next ex-div is more than 90 days out. Also used when price is materially below the zone and likely past the expected entry area."],
["Watch Only","The next ex-div is within 90 days but price is not yet in position — not inside the zone, not near the top, not slightly below."],
["On Radar","Fallback status for structurally interesting stocks that are not yet close enough to action."],
    ["Too Risky","Triggered when tail risk is Severe. The broader pattern may still exist, but downside is too harsh for a live setup."],
    ["Structurally Weak","Triggered when 2 or more of these are true at once: pattern stability is Degrading, the zone's hit rate is in the bottom 25% of the full tracked universe, 5yr price growth is -30% or worse, debt is more than 150% of equity, or free cash flow covers less than 0.7x of the dividend paid. The last two come from the company's own balance sheet and cash-flow statements (see the Financials tab) — gated well past the thresholds that colour those numbers red on screen (>120% debt/equity, <1.0x coverage), so a single weak reading doesn't immediately suppress the verdict; this data is annual, refreshed only when extract-financials.py is manually re-run, unlike the weekly price-based flags. Checked right after tail risk Severe, before price position, so it overrides an otherwise-clean setup — the pattern itself is what's breaking down, not today's price. Also removes the stock from Potential/Watchlist entirely, not just the verdict. A single one of these flags instead softens an Actionable Now reading down to Small Trades Advised without changing eligibility — see that entry's reason text for which flag applied."],
    ["Trade Planner","Planning view for the nearest next cycle only. It turns the projected setup into milestone timelines for watch, dip, exit, and ex-div. Official ex-div date, official dividend amount, and planned entry price can be overridden without changing the historical ratings."],
    ["Updated schedule and plan","Planner section that shows what changes after overrides are applied. It updates after any planner override is set. Official ex-div date changes the live milestone dates and days-away counts. Official dividend amount updates dividend and yield-related planner outputs. Planned entry price updates the planned entry, expected gain, and related execution metrics. It does not change the historical ratings such as timing, tail risk, fragility, or exit-mode verdict."],
    ["Zone Fragility","Percent of clean cycles where price never entered the entry zone. Graded in percentile bands (bottom 25% / below median / near median / top 25%) rather than a fixed cutoff — a flat 30%-missed threshold turned out to trip on nearly every tracked series, so it stopped being able to tell a relatively fragile setup from a relatively sound one. Ranked against the full analyzed universe from the last pipeline run when that's available (same number every session); falls back to ranking against whatever's currently loaded in this browser tab otherwise. A bottom-25% reading is also one of the three structural health flags — see Structurally Weak."],
    ["Stability Trend","Direction of pattern stability scores across recent cycles. Improving appears when slope > 5 and recent average score > 70. Degrading appears when slope < -5 and recent average score < 60. Otherwise the trend is Stable."],
    ["Exit Mode","Historical summary of which bounded exit path looked stronger. Pre-Exdiv Peak Exit preferred means average pre-exdiv gain is at least 95% of average ex-div-date gain when ex-div-date gain is positive. Ex-Div Date Exit preferred means average optimal gain is more than 105% of average ex-div-date gain and fewer than 40% of optimal exits happened before ex-div."],
    ["S2 (peak return)","Peak price vs PrevDP expressed as a percentage. Measures the upside captured above the dividend entry price, not just vs the dip."],
    ["5yr price growth","Total price return over the past 5 years, from the weekly close closest to 5 years ago to the current price. Excludes dividends — capital change only. Green = ≥ 15% (growing), amber = 0–15% (flat to modest), red = negative (declining). Use as a background check: consistent growth suggests a healthy business; a sustained decline may mean dividends are masking capital erosion. Shown in the Forward Setup section, mini-card, and Setup Map list view. Null when fewer than 5 years of price history are available."],
  ];
  return`<div class="grid g3">
    ${terms.map(([t,d])=>`<div class="card">
      <div class="label">${esc(t)}</div>
      <div class="small">${esc(d)}</div>
    </div>`).join("")}
  </div>`
}

/* -- RENDER APP ---------------------------------------------------------- */
/* -- MULTI-STOCK HELPERS ----------------------------------------------- */
function stockKey(data,filename){
  return data.meta?.ticker||filename||("stock_"+Date.now())
}

function stockList(){return Object.values(state.stocks)}
function activeStockList(){return stockList().filter(s=>s.data?.meta?.active!==false)}

// fragility_warning (analyze-stock.py) fires past a fixed 30% zone-miss rate --
// across the tracked universe that trips on effectively every series, so as a
// boolean it can no longer tell a relatively fragile setup from a relatively
// sound one. This computes standing against whatever's currently loaded
// instead of a fixed number, so the signal discriminates again. Returns null
// when too few stocks are loaded for a percentile comparison to mean anything.
// Prefers analyze-batch.py's precomputed fragility_percentile_band (ranked against
// the FULL analyzed universe, deterministic across sessions) over the live
// fragilitySeverity() below (ranked only against whatever's currently loaded in this
// browser tab, so it can shift as stocks are toggled active/inactive). Falls back to
// the live computation when a stock's JSON predates the field.
function resolveFragilitySeverity(proj){
  const band=proj?.zone_fragility?.fragility_percentile_band;
  if(band){
    const tone=band==="BOTTOM_25"?"bad":band==="BELOW_MEDIAN"?"warn":band==="TOP_25"?"good":"";
    return{tone,label:proj.zone_fragility.fragility_percentile_band_display,detail:"vs full tracked universe"};
  }
  return fragilitySeverity(proj?.historical_frequencies?.entry_zone_hit_rate);
}
function fragilitySeverity(hitRate){
  if(hitRate==null)return null;
  const allRates=activeStockList().flatMap(s=>Object.values(s.data?.proj_series||{})
    .map(p=>p.historical_frequencies?.entry_zone_hit_rate)
    .filter(v=>v!=null));
  if(allRates.length<8)return null;
  const sorted=[...allRates].sort((a,b)=>a-b);
  const pctAt=p=>sorted[Math.min(sorted.length-1,Math.floor((p/100)*sorted.length))];
  const p25=pctAt(25),p50=pctAt(50),p75=pctAt(75);
  if(hitRate<=p25)return{tone:"bad",label:"Bottom 25%",detail:`vs loaded stocks (median ${n(p50,0)}%)`};
  if(hitRate<p50)return{tone:"warn",label:"Below median",detail:`vs loaded stocks (median ${n(p50,0)}%)`};
  if(hitRate>=p75)return{tone:"good",label:"Top 25%",detail:`vs loaded stocks (median ${n(p50,0)}%)`};
  return{tone:"",label:"Near median",detail:`vs loaded stocks (median ${n(p50,0)}%)`};
}
function persistedStocksPayload(){
  return stockList().map(entry=>({
    key:entry.key,
    label:entry.label,
    data:entry.data,
  }));
}
function normalizedServerLoadedFiles(){
  return Array.from(new Set((state.serverLoadedFiles||[])
    .map(v=>String(v||"").trim())
    .filter(Boolean)));
}
function persistPlannerState(){
  const payload={
    planner:state.planner||{},
    plannerActiveKey:state.plannerActiveKey||null,
    overviewMode:state.overviewMode||"overview",
    zoneOutcomeMode:state.zoneOutcomeMode||"current",
    portfolioChartGranularity:state.portfolioChartGranularity||"monthly",
    portfolioSubTab:state.portfolioSubTab||"holdings",
    portfolioReturnSort:state.portfolioReturnSort||{held:{field:"totalReturn",dir:"desc"},closed:{field:"totalReturn",dir:"desc"}},
    zoneOutcomeFilterKeys:Array.isArray(state.zoneOutcomeFilterKeys)?state.zoneOutcomeFilterKeys:["all"],
    setupMapFilterKeys:Array.isArray(state.setupMapFilterKeys)?state.setupMapFilterKeys:["all"],
    setupMapViewMode:state.setupMapViewMode||"map",
    setupListSort:state.setupListSort||{below:{field:"gain",dir:"desc"},inside:{field:"gain",dir:"desc"},above:{field:"gain",dir:"desc"}},
    rememberLoadedStocks:state.rememberLoadedStocks!==false,
    serverLoadedFiles:state.rememberLoadedStocks===false?[]:normalizedServerLoadedFiles(),
    stocks:state.rememberLoadedStocks===false?[]:persistedStocksPayload(),
    activeKey:state.activeKey||null,
    view:state.view||"overview",
    tab:Number.isFinite(state.tab)?state.tab:0,
    reviewSort:state.reviewSort||{col:"potential",dir:"desc"},
    reviewFilterEntry:state.reviewFilterEntry||"all",
    reviewFilterShow:state.reviewFilterShow||"all",
    reviewOverrides:state.reviewOverrides&&typeof state.reviewOverrides==="object"?state.reviewOverrides:{},
  };
  try{
    localStorage.setItem(PLANNER_STORAGE_KEY,JSON.stringify(payload));
  }catch(_){
    try{
      const fallback=Object.assign({},payload,{
        stocks:[],
        activeKey:null,
        view:"overview",
        tab:0,
      });
      localStorage.setItem(PLANNER_STORAGE_KEY,JSON.stringify(fallback));
    }catch(__){}
  }
}
function hydratePlannerState(){
  try{
    const raw=localStorage.getItem(PLANNER_STORAGE_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(parsed&&typeof parsed==="object"){
      state.stocks={};
      state.rememberLoadedStocks=parsed.rememberLoadedStocks!==false;
      state.serverLoadedFiles=Array.isArray(parsed.serverLoadedFiles)?parsed.serverLoadedFiles.filter(Boolean):[];
      const savedStocks=Array.isArray(parsed.stocks)?parsed.stocks:[];
      savedStocks.forEach(entry=>{
        if(!entry||typeof entry!=="object"||!entry.data)return;
        try{
          validateData(entry.data);
          const key=entry.key||stockKey(entry.data,entry.label||entry.data?.meta?.ticker||"saved");
          state.stocks[key]={
            key,
            label:entry.label||entry.data?.meta?.ticker||key,
            data:entry.data,
          };
        }catch(_){}
      });
      state.planner=parsed.planner&&typeof parsed.planner==="object"?parsed.planner:{};
      state.plannerActiveKey=parsed.plannerActiveKey||null;
      if(["overview","grouped","compare","planner","review","portfolio"].includes(parsed.overviewMode)){
        state.overviewMode=parsed.overviewMode;
      }
      if(["current","recent"].includes(parsed.zoneOutcomeMode)){
        state.zoneOutcomeMode=parsed.zoneOutcomeMode;
      }
      if(["weekly","monthly","yearly"].includes(parsed.portfolioChartGranularity)){
        state.portfolioChartGranularity=parsed.portfolioChartGranularity;
      }
      if(["holdings","history","reconcile"].includes(parsed.portfolioSubTab)){
        state.portfolioSubTab=parsed.portfolioSubTab;
      }
      if(parsed.portfolioReturnSort&&typeof parsed.portfolioReturnSort==="object"){
        const validFields={
          held:["ticker","investedAmount","totalReturn","totalReturnPct","unrealizedPnl","dividends"],
          closed:["ticker","lastClosedDate","realizedCostBasis","totalReturn","totalReturnPct","realizedPnl","dividends"],
        };
        const restored={};
        ["held","closed"].forEach(table=>{
          const v=parsed.portfolioReturnSort[table];
          restored[table]=(v&&validFields[table].includes(v.field)&&["asc","desc"].includes(v.dir))
            ?v:{field:"totalReturn",dir:"desc"};
        });
        state.portfolioReturnSort=restored;
      }
      state.zoneOutcomeFilterKeys=Array.isArray(parsed.zoneOutcomeFilterKeys)?parsed.zoneOutcomeFilterKeys:["all"];
      state.setupMapFilterKeys=Array.isArray(parsed.setupMapFilterKeys)?parsed.setupMapFilterKeys:["all"];
      if(["map","list"].includes(parsed.setupMapViewMode))state.setupMapViewMode=parsed.setupMapViewMode;
      if(parsed.setupListSort&&typeof parsed.setupListSort==="object"){
        const zones=["below","inside","above"];
        const restored={};
        zones.forEach(z=>{
          const v=parsed.setupListSort[z];
          if(v&&["ticker","name","growth5yr","gain"].includes(v.field)&&["asc","desc"].includes(v.dir)){
            restored[z]=v;
          }else{
            restored[z]={field:"gain",dir:"desc"};
          }
        });
        state.setupListSort=restored;
      }
      if(parsed.reviewSort&&typeof parsed.reviewSort==="object"&&
         typeof parsed.reviewSort.col==="string"&&["asc","desc"].includes(parsed.reviewSort.dir)){
        state.reviewSort=parsed.reviewSort;
      }
      if(["all","potential","nonpotential"].includes(parsed.reviewFilterEntry))state.reviewFilterEntry=parsed.reviewFilterEntry;
      if(["all","potential","nonpotential"].includes(parsed.reviewFilterShow))state.reviewFilterShow=parsed.reviewFilterShow;
      if(parsed.reviewOverrides&&typeof parsed.reviewOverrides==="object"&&!Array.isArray(parsed.reviewOverrides)){
        const validOverrides={};
        Object.entries(parsed.reviewOverrides).forEach(([k,v])=>{if(v==="keep"||v==="watch"||v==="remove")validOverrides[k]=v;});
        state.reviewOverrides=validOverrides;
      }
      state.activeKey=parsed.activeKey&&state.stocks[parsed.activeKey]?parsed.activeKey:(stockList()[0]?.key||null);
      state.view=parsed.view==="drill"&&state.activeKey?"drill":"overview";
      state.tab=Number.isFinite(Number(parsed.tab))?Number(parsed.tab):0;
    }
  }catch(_){}
}
function validatePortfolioEntry(h){
  if(!h||typeof h!=="object")return null;
  const ticker=String(h.ticker||"").trim();
  const quantity=Number(h.quantity);
  const avgCostPrice=Number(h.avgCostPrice);
  if(!ticker||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(avgCostPrice)||avgCostPrice<0)return null;
  return{
    ticker,
    quantity,
    avgCostPrice,
    purchaseDate:h.purchaseDate?String(h.purchaseDate).slice(0,10):"",
    notes:h.notes?String(h.notes).slice(0,200):"",
  };
}
function savePortfolio(){
  try{
    localStorage.setItem(PORTFOLIO_STORAGE_KEY,JSON.stringify(state.portfolio||[]));
  }catch(_){}
}
function hydratePortfolio(){
  try{
    const raw=localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed)){
      state.portfolio=parsed.map(validatePortfolioEntry).filter(Boolean);
    }
  }catch(_){}
}
function validatePortfolioHistoryEntry(h){
  if(!h||typeof h!=="object")return null;
  const date=String(h.date||"").slice(0,10);
  const totalValue=Number(h.totalValue);
  const totalCost=Number(h.totalCost);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(totalValue)||!Number.isFinite(totalCost))return null;
  return{date,totalValue,totalCost};
}
function savePortfolioHistory(){
  try{
    localStorage.setItem(PORTFOLIO_HISTORY_STORAGE_KEY,JSON.stringify(state.portfolioHistory||[]));
  }catch(_){}
}
function hydratePortfolioHistory(){
  try{
    const raw=localStorage.getItem(PORTFOLIO_HISTORY_STORAGE_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed)){
      state.portfolioHistory=parsed.map(validatePortfolioHistoryEntry).filter(Boolean).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
    }
  }catch(_){}
}
// Called once per Portfolio-tab render with today's totals -- appends at
// most one entry per calendar day (dedup on the log's last date) so this
// only accumulates on days the user actually opens the tab. Nothing can run
// in the background on a static site, so a genuinely continuous daily log
// isn't possible here; this is the honest, achievable version of that.
function recordPortfolioSnapshot(totalValue,totalCost){
  if(!Number.isFinite(totalValue)||!Number.isFinite(totalCost))return;
  const today=new Date().toISOString().slice(0,10);
  const log=state.portfolioHistory||[];
  const last=log[log.length-1];
  if(last&&last.date===today){
    last.totalValue=totalValue;
    last.totalCost=totalCost;
  }else{
    log.push({date:today,totalValue,totalCost});
  }
  state.portfolioHistory=log;
  savePortfolioHistory();
}
function validatePortfolioRealizedEntry(h){
  if(!h||typeof h!=="object")return null;
  const ticker=String(h.ticker||"").trim();
  const quantity=Number(h.quantity);
  const sellPrice=Number(h.sellPrice);
  const realizedPnl=Number(h.realizedPnl);
  if(!ticker||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(sellPrice)||sellPrice<0||!Number.isFinite(realizedPnl))return null;
  return{
    ticker,quantity,sellPrice,
    sellDate:h.sellDate?String(h.sellDate).slice(0,10):"",
    realizedPnl,
    notes:h.notes?String(h.notes).slice(0,200):"",
  };
}
function savePortfolioRealized(){
  try{localStorage.setItem(PORTFOLIO_REALIZED_STORAGE_KEY,JSON.stringify(state.portfolioRealized||[]));}catch(_){}
}
function hydratePortfolioRealized(){
  try{
    const raw=localStorage.getItem(PORTFOLIO_REALIZED_STORAGE_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed))state.portfolioRealized=parsed.map(validatePortfolioRealizedEntry).filter(Boolean);
  }catch(_){}
}
function validatePortfolioDividendEntry(h){
  if(!h||typeof h!=="object")return null;
  const ticker=String(h.ticker||"").trim();
  const date=String(h.date||"").slice(0,10);
  const amount=Number(h.amount);
  if(!ticker||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount))return null;
  return{ticker,date,amount,notes:h.notes?String(h.notes).slice(0,200):""};
}
function savePortfolioDividends(){
  try{localStorage.setItem(PORTFOLIO_DIVIDENDS_STORAGE_KEY,JSON.stringify(state.portfolioDividends||[]));}catch(_){}
}
function hydratePortfolioDividends(){
  try{
    const raw=localStorage.getItem(PORTFOLIO_DIVIDENDS_STORAGE_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed))state.portfolioDividends=parsed.map(validatePortfolioDividendEntry).filter(Boolean);
  }catch(_){}
}
function validatePortfolioFeeEntry(h){
  if(!h||typeof h!=="object")return null;
  const date=String(h.date||"").slice(0,10);
  const amount=Number(h.amount);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount)||amount<0)return null;
  return{date,amount,notes:h.notes?String(h.notes).slice(0,200):""};
}
function savePortfolioFees(){
  try{localStorage.setItem(PORTFOLIO_FEES_STORAGE_KEY,JSON.stringify(state.portfolioFees||[]));}catch(_){}
}
function hydratePortfolioFees(){
  try{
    const raw=localStorage.getItem(PORTFOLIO_FEES_STORAGE_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed))state.portfolioFees=parsed.map(validatePortfolioFeeEntry).filter(Boolean);
  }catch(_){}
}
function validatePortfolioRebateEntry(h){
  if(!h||typeof h!=="object")return null;
  const date=String(h.date||"").slice(0,10);
  const amount=Number(h.amount);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount)||amount<0)return null;
  return{date,amount,notes:h.notes?String(h.notes).slice(0,200):""};
}
function savePortfolioRebates(){
  try{localStorage.setItem(PORTFOLIO_REBATES_STORAGE_KEY,JSON.stringify(state.portfolioRebates||[]));}catch(_){}
}
function hydratePortfolioRebates(){
  try{
    const raw=localStorage.getItem(PORTFOLIO_REBATES_STORAGE_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed))state.portfolioRebates=parsed.map(validatePortfolioRebateEntry).filter(Boolean);
  }catch(_){}
}
// Unlike fees, a net-deposit period can legitimately be negative (a month
// with a net withdrawal), so amount isn't clamped to >= 0 here.
function validatePortfolioNetDepositEntry(h){
  if(!h||typeof h!=="object")return null;
  const date=String(h.date||"").slice(0,10);
  const amount=Number(h.amount);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount))return null;
  return{date,amount,notes:h.notes?String(h.notes).slice(0,200):""};
}
function savePortfolioNetDeposits(){
  try{localStorage.setItem(PORTFOLIO_NET_DEPOSITS_STORAGE_KEY,JSON.stringify(state.portfolioNetDeposits||[]));}catch(_){}
}
function hydratePortfolioNetDeposits(){
  try{
    const raw=localStorage.getItem(PORTFOLIO_NET_DEPOSITS_STORAGE_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed))state.portfolioNetDeposits=parsed.map(validatePortfolioNetDepositEntry).filter(Boolean);
  }catch(_){}
}
// Gross withdrawal amount, always >= 0 -- already netted into Net Deposits
// above (which is net of withdrawals), this just makes it visible on its own.
function validatePortfolioWithdrawalEntry(h){
  if(!h||typeof h!=="object")return null;
  const date=String(h.date||"").slice(0,10);
  const amount=Number(h.amount);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount)||amount<0)return null;
  return{date,amount,notes:h.notes?String(h.notes).slice(0,200):""};
}
function savePortfolioWithdrawals(){
  try{localStorage.setItem(PORTFOLIO_WITHDRAWALS_STORAGE_KEY,JSON.stringify(state.portfolioWithdrawals||[]));}catch(_){}
}
function hydratePortfolioWithdrawals(){
  try{
    const raw=localStorage.getItem(PORTFOLIO_WITHDRAWALS_STORAGE_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed))state.portfolioWithdrawals=parsed.map(validatePortfolioWithdrawalEntry).filter(Boolean);
  }catch(_){}
}
// unrealizedPnl is optional -- the statement's own Holdings-table Unrealized
// P/L as of this date, if given. When present, the Reconcile tab can check
// this exact date instead of substituting today's live price and picking up
// drift from whatever's moved since this snapshot.
// dividendAccruals is also optional -- dividends declared but not yet paid
// as of this date, so not yet reflected in totalValue (cash+stock only).
// Most brokers' own "Total Asset" figure includes this; adding it here is
// what lets Reconcile's Expected total match that broker figure instead of
// running a bit low by whatever's still pending.
function validatePortfolioAccountValueEntry(h){
  if(!h||typeof h!=="object")return null;
  const date=String(h.date||"").slice(0,10);
  const totalValue=Number(h.totalValue);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(totalValue))return null;
  const entry={date,totalValue,notes:h.notes?String(h.notes).slice(0,200):""};
  if(h.unrealizedPnl!=null&&Number.isFinite(Number(h.unrealizedPnl)))entry.unrealizedPnl=Number(h.unrealizedPnl);
  if(h.dividendAccruals!=null&&Number.isFinite(Number(h.dividendAccruals)))entry.dividendAccruals=Number(h.dividendAccruals);
  return entry;
}
function savePortfolioAccountValue(){
  try{localStorage.setItem(PORTFOLIO_ACCOUNT_VALUE_STORAGE_KEY,JSON.stringify(state.portfolioAccountValue||[]));}catch(_){}
}
function hydratePortfolioAccountValue(){
  try{
    const raw=localStorage.getItem(PORTFOLIO_ACCOUNT_VALUE_STORAGE_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed))state.portfolioAccountValue=parsed.map(validatePortfolioAccountValueEntry).filter(Boolean).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  }catch(_){}
}
function plannerKeys(){
  return Object.keys(state.planner||{}).filter(k=>state.stocks[k]);
}
function plannerEntry(key){
  return (state.planner&&state.planner[key])||{};
}
function plannerHas(key){
  return !!(state.planner&&state.planner[key]&&state.stocks[key]);
}
function ensurePlannerActive(){
  const keys=plannerKeys();
  if(!keys.length){state.plannerActiveKey=null;return null;}
  if(!state.plannerActiveKey||!keys.includes(state.plannerActiveKey)){
    state.plannerActiveKey=keys[0];
  }
  return state.plannerActiveKey;
}
function togglePlanner(key){
  if(!state.stocks[key])return;
  if(plannerHas(key)){
    delete state.planner[key];
    if(state.plannerActiveKey===key) state.plannerActiveKey=null;
  }else{
    state.planner[key]={officialExDivDate:"",officialDivAmount:"",plannedEntryPrice:""};
    state.plannerActiveKey=key;
  }
  ensurePlannerActive();
  persistPlannerState();
  renderApp();
}
function updatePlannerOverride(key,patch){
  if(!state.stocks[key])return;
  const current=plannerEntry(key);
  state.planner[key]=Object.assign({},current,patch);
  persistPlannerState();
}
function plannerOverrideStatus(planner){
  const hasDate=!!planner.officialExDivDate;
  const hasDiv=String(planner.officialDivAmount||"").trim()!=="";
  const hasEntry=String(planner.plannedEntryPrice||"").trim()!=="";
  const count=[hasDate,hasDiv,hasEntry].filter(Boolean).length;
  if(!count)return"Estimated";
  if(hasDate && count===1)return"Official date set";
  if(count===1)return"Custom input set";
  return"Custom overrides";
}
function isoDateParts(value){
  if(!value)return null;
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return null;
  d.setHours(0,0,0,0);
  return d;
}
function isoShift(value,days){
  const d=isoDateParts(value);
  if(!d||!Number.isFinite(Number(days)))return null;
  d.setDate(d.getDate()+Number(days));
  return d.toISOString().slice(0,10);
}
function diffDays(fromDate,toDate){
  const a=isoDateParts(fromDate), b=isoDateParts(toDate);
  if(!a||!b)return null;
  return Math.round((b-a)/86400000);
}
function quantileFromSorted(sortedVals,q){
  if(!Array.isArray(sortedVals)||!sortedVals.length)return null;
  if(sortedVals.length===1)return sortedVals[0];
  const pos=(sortedVals.length-1)*q;
  const lo=Math.floor(pos);
  const hi=Math.ceil(pos);
  if(lo===hi)return sortedVals[lo];
  const w=pos-lo;
  return sortedVals[lo] + (sortedVals[hi]-sortedVals[lo]) * w;
}
function plannerProjectionData(data,key){
  const up=upcomingSeries(data);
  if(!up)return null;
  const proj=up.proj||{};
  const ss=data.ss_series?.[up.id]||{};
  const exitProfile=ss.exit_profile||{};
  const planner=plannerEntry(key);
  const baseExDiv=proj.proj_exdiv_date;
  const effectiveExDiv=planner.officialExDivDate || baseExDiv;
  const overrideStatus=plannerOverrideStatus(planner);
  const singleLowDelta=diffDays(baseExDiv, proj.est_low_date);
  const cluster1Delta=diffDays(baseExDiv, proj.est_low_date_cluster1);
  const cluster2Delta=diffDays(baseExDiv, proj.est_low_date_cluster2);
  const timingVals=((ss.timing?.vals)||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  const shouldReevaluateTiming = Boolean(
    planner.officialExDivDate &&
    (
      data.meta?.frequency === "IRREGULAR" ||
      ss.timing?.rating === "UNRELIABLE"
    )
  );
  let reevaluatedDipStart=null;
  let reevaluatedDipEnd=null;
  let timingReevaluationNote=null;
  let buyWatchLabel="Monitor zone continuously";
  if(shouldReevaluateTiming && timingVals.length){
    const lowWks = timingVals.length >= 5 ? quantileFromSorted(timingVals,0.25) : timingVals[0];
    const highWks = timingVals.length >= 5 ? quantileFromSorted(timingVals,0.75) : timingVals[timingVals.length-1];
    reevaluatedDipStart = isoShift(effectiveExDiv,-Math.round(Number(highWks) * 7));
    reevaluatedDipEnd = isoShift(effectiveExDiv,-Math.round(Number(lowWks) * 7));
    buyWatchLabel = `${dt(reevaluatedDipStart)} - ${dt(reevaluatedDipEnd)}`;
    timingReevaluationNote = "Official ex-div date applied. Timing has been re-evaluated as a broader watch window because this setup is irregular or historically unreliable.";
  }else if(singleLowDelta!=null){
    buyWatchLabel=dt(isoShift(effectiveExDiv,singleLowDelta));
  }else if(cluster1Delta!=null&&cluster2Delta!=null){
    buyWatchLabel=`${dt(isoShift(effectiveExDiv,cluster1Delta))} · ${dt(isoShift(effectiveExDiv,cluster2Delta))}`;
  }
  let sellPlan="-";
  if(exitProfile.exit_mode_verdict==="PRE_EXDIV_PREFERRED" && exitProfile.pre_exdiv_peak_window_days_p25!=null && exitProfile.pre_exdiv_peak_window_days_p75!=null){
    const start=isoShift(effectiveExDiv,-Number(exitProfile.pre_exdiv_peak_window_days_p75));
    const end=isoShift(effectiveExDiv,-Number(exitProfile.pre_exdiv_peak_window_days_p25));
    sellPlan=`${dt(start)} - ${dt(end)}`;
  }else if(exitProfile.exit_mode_verdict==="POST_EXDIV_PREFERRED"){
    sellPlan=`On or just after ${dt(effectiveExDiv)}`;
  }
  const officialDivAmount=readNumber(planner.officialDivAmount);
  const plannedEntryPrice=readNumber(planner.plannedEntryPrice);
  const baseDivAmount = (readNumber(proj.div_amt_lo,0)+readNumber(proj.div_amt_hi,0))/2;
  const effectiveDivAmount = officialDivAmount!=null
    ? officialDivAmount
    : baseDivAmount;
  const baseEntryPrice = readNumber(proj.zone_bot);
  const effectiveEntryPrice = plannedEntryPrice!=null && plannedEntryPrice>0
    ? plannedEntryPrice
    : baseEntryPrice;
  const targetExitPx = exitProfile.exit_mode_verdict==="PRE_EXDIV_PREFERRED"
    ? readNumber(proj.est_peak_px)
    : readNumber(proj.est_exdiv_px);
  const baseExpectedGainPct = baseEntryPrice!=null && targetExitPx!=null && baseEntryPrice>0
    ? round(((targetExitPx-baseEntryPrice)/baseEntryPrice)*100,2)
    : null;
  const expectedGainPct = effectiveEntryPrice!=null && targetExitPx!=null && effectiveEntryPrice>0
    ? round(((targetExitPx-effectiveEntryPrice)/effectiveEntryPrice)*100,2)
    : null;
  const baseYieldOnCostPct = baseEntryPrice!=null && baseDivAmount!=null && baseEntryPrice>0
    ? round((baseDivAmount/baseEntryPrice)*100,2)
    : null;
  const yieldOnCostPct = effectiveEntryPrice!=null && effectiveDivAmount!=null && effectiveEntryPrice>0
    ? round((effectiveDivAmount/effectiveEntryPrice)*100,2)
    : null;
  return {
    id:up.id,
    proj,
    ss,
    exitProfile,
    baseExDiv,
    effectiveExDiv,
    buyWatchLabel,
    sellPlan,
    overrideStatus,
    hasOverride:overrideStatus!=="Estimated",
    baseDivAmount,
    baseEntryPrice,
    baseExpectedGainPct,
    baseYieldOnCostPct,
    effectiveDivAmount,
    effectiveEntryPrice,
    expectedGainPct,
    yieldOnCostPct,
    targetExitPx,
    timingReevaluationNote,
    reevaluatedDipStart,
    reevaluatedDipEnd,
  };
}
function plannerTimelineModel(plan){
  if(!plan||!plan.effectiveExDiv)return null;
  const dipDates=[];
  const singleLowDelta=diffDays(plan.baseExDiv, plan.proj.est_low_date);
  const cluster1Delta=diffDays(plan.baseExDiv, plan.proj.est_low_date_cluster1);
  const cluster2Delta=diffDays(plan.baseExDiv, plan.proj.est_low_date_cluster2);
  if(plan.reevaluatedDipStart && plan.reevaluatedDipEnd){
    dipDates.push(plan.reevaluatedDipStart, plan.reevaluatedDipEnd);
  }else if(singleLowDelta!=null){
    dipDates.push(isoShift(plan.effectiveExDiv,singleLowDelta));
  }else{
    if(cluster1Delta!=null) dipDates.push(isoShift(plan.effectiveExDiv,cluster1Delta));
    if(cluster2Delta!=null) dipDates.push(isoShift(plan.effectiveExDiv,cluster2Delta));
  }
  const validDipDates=dipDates.filter(Boolean).sort();
  const dipStart=validDipDates[0]||null;
  const dipEnd=validDipDates[validDipDates.length-1]||dipStart;
  const watchDate=dipStart ? isoShift(dipStart,-7) : isoShift(plan.effectiveExDiv,-21);

  let exitStart=null, exitEnd=null, exitPoint=null;
  if(plan.exitProfile.exit_mode_verdict==="PRE_EXDIV_PREFERRED" && plan.exitProfile.pre_exdiv_peak_window_days_p25!=null && plan.exitProfile.pre_exdiv_peak_window_days_p75!=null){
    exitStart=isoShift(plan.effectiveExDiv,-Number(plan.exitProfile.pre_exdiv_peak_window_days_p75));
    exitEnd=isoShift(plan.effectiveExDiv,-Number(plan.exitProfile.pre_exdiv_peak_window_days_p25));
  }else{
    exitPoint=plan.effectiveExDiv;
  }

  const allDates=[watchDate,dipStart,dipEnd,exitStart,exitEnd,exitPoint,plan.effectiveExDiv]
    .filter(Boolean)
    .map(isoDateParts)
    .filter(Boolean)
    .map(d=>d.getTime());
  if(!allDates.length)return null;
  const startTs=Math.min(...allDates)-(2*86400000);
  const endTs=Math.max(...allDates)+(2*86400000);
  const span=Math.max(1,endTs-startTs);
  const pos=(dateStr)=>{
    const d=isoDateParts(dateStr);
    if(!d)return 0;
    return clamp(((d.getTime()-startTs)/span)*100,0,100);
  };

  return {
    watchDate,
    dipStart,
    dipEnd,
    exitStart,
    exitEnd,
    exitPoint,
    exDivDate:plan.effectiveExDiv,
    watchPos:pos(watchDate),
    dipStartPos:pos(dipStart),
    dipEndPos:pos(dipEnd),
    exitStartPos:pos(exitStart||exitPoint),
    exitEndPos:pos(exitEnd||exitPoint),
    exDivPos:pos(plan.effectiveExDiv),
    dipLabel:(plan.reevaluatedDipStart && plan.reevaluatedDipEnd) ? "Re-evaluated dip window" : (dipStart&&dipEnd&&dipStart!==dipEnd?"Dip window":"Typical dip"),
    exitLabel:exitStart&&exitEnd&&exitStart!==exitEnd?"Preferred exit":"Exit point",
  };
}
function plannerMilestoneSummary(model){
  if(!model)return"";
  const exitText=model.exitStart&&model.exitEnd&&model.exitStart!==model.exitEnd
    ? `${dt(model.exitStart)} - ${dt(model.exitEnd)}`
    : dt(model.exitPoint||model.exitEnd||model.exitStart);
  const dipText=model.dipStart&&model.dipEnd&&model.dipStart!==model.dipEnd
    ? `${dt(model.dipStart)} - ${dt(model.dipEnd)}`
    : dt(model.dipStart||model.dipEnd);
  return `<div class="planner-milestones">
    <div class="mini-stat"><span class="ms-label">Watch begins: </span>${esc(dt(model.watchDate))}</div>
    <div class="mini-stat"><span class="ms-label">${esc(model.dipLabel)}: </span>${esc(dipText)}</div>
    <div class="mini-stat"><span class="ms-label">${esc(model.exitLabel)}: </span>${esc(exitText)}</div>
    <div class="mini-stat"><span class="ms-label">Ex-div date: </span>${esc(dt(model.exDivDate))}</div>
  </div>`;
}
function plannerTimelineLabel(dateStr){
  return dateStr ? dt(dateStr) : "-";
}
function plannerTimelineRangeLabel(start,end){
  if(start && end && start!==end) return `${dt(start)} - ${dt(end)}`;
  return plannerTimelineLabel(start||end);
}
function executionStateFromVerdict(metrics,plan){
  const verdict=metrics?.finalVerdict||"";
  if(verdict==="Actionable Now") return {label:"Ready", tone:"good"};
  if(verdict==="Small Trades Advised") return {label:"Caution", tone:"warn"};
  if(verdict==="Watch Closely" || verdict==="Watch Only") return {label:"Watch", tone:"warn"};
  if(verdict==="On Radar") return {label:"Early", tone:"muted"};
  if(verdict==="Too Risky") return {label:"Too risky", tone:"bad"};
  if(verdict==="Structurally Weak") return {label:"Structurally weak", tone:"bad"};
  if((plan?.overrideStatus||"").toLowerCase().includes("reference")) return {label:"Reference only", tone:"muted"};
  if(verdict==="Wait") return {label:"Wait", tone:"warn"};
  return {label:"Review", tone:"muted"};
}
function plannerSetupConfidence(metrics){
  const adequacy=String(metrics?.sampleAdequacy||"").toUpperCase();
  const nEffective=readNumber(metrics?.nEffective);
  const timing=String(metrics?.timingNext||metrics?.timingRating||"").toUpperCase();
  const tail=String(metrics?.tailRiskLevel||"").toUpperCase();
  if(adequacy==="INSUFFICIENT" || timing==="UNRELIABLE" || tail==="SEVERE"){
    return {label:"Low", note:"Sample, timing, or downside risk weakens confidence."};
  }
  if(
    adequacy==="ADEQUATE" &&
    (nEffective==null || nEffective>=6) &&
    timing==="RELIABLE" &&
    (tail==="LOW" || tail==="MODERATE")
  ){
    return {label:"High", note:"Clean sample, stable timing, and manageable tail risk."};
  }
  return {label:"Moderate", note:"Usable setup, but at least one caution remains."};
}
function plannerTimingWindowSummary(plan){
  const model=plannerTimelineModel(plan);
  if(!model?.watchDate || !plan?.effectiveExDiv){
    return {label:"Unknown", note:"Watch timing not available yet."};
  }
  const today=new Date();
  today.setHours(0,0,0,0);
  const watchTs=isoDateParts(model.watchDate)?.getTime();
  const exDivTs=isoDateParts(plan.effectiveExDiv)?.getTime();
  if(!Number.isFinite(watchTs) || !Number.isFinite(exDivTs)){
    return {label:"Unknown", note:"Watch timing not available yet."};
  }
  if(today.getTime() < watchTs){
    return {label:"Upcoming", note:plan.buyWatchLabel||plannerTimelineRangeLabel(model.watchDate,plan.effectiveExDiv)};
  }
  if(today.getTime() <= exDivTs){
    return {label:"Open", note:plan.buyWatchLabel||plannerTimelineRangeLabel(model.watchDate,plan.effectiveExDiv)};
  }
  return {label:"Past", note:plan.buyWatchLabel||plannerTimelineRangeLabel(model.watchDate,plan.effectiveExDiv)};
}
function plannerSetupGuidance(item){
  const metrics=item?.metrics||{};
  const plan=item?.plan||{};
  const guidance=[];
  if(metrics.entryStatus==="INSIDE"){
    guidance.push("Consider entries within the zone if conditions still hold.");
  }else if(metrics.entryStatus==="ABOVE"){
    guidance.push("Avoid chasing while price stays above the zone.");
  }else if(metrics.entryStatus==="BELOW"){
    guidance.push("Price is below the zone, so avoid forcing size too quickly.");
  }
  if(metrics.exitMode==="PRE_EXDIV_PREFERRED"){
    guidance.push("Historical bias favors pre-exdiv exits, so monitor early peak signals.");
  }else if(metrics.exitMode){
    guidance.push("Historical bias favors the ex-div exit path over waiting for extra upside.");
  }
  if(metrics.tailRiskLevel==="CAUTION" || metrics.tailRiskLevel==="HIGH"){
    guidance.push("Keep sizing disciplined because the tail profile still needs respect.");
  }else if(metrics.timingNext==="UNRELIABLE"){
    guidance.push("Treat timing as loose and keep the watch window flexible.");
  }else if(plan.hasOverride){
    guidance.push("Use the updated schedule first; the historical ratings remain unchanged.");
  }
  return guidance.slice(0,3);
}
function renderPlannerSetupSummary(item){
  if(!item?.plan || !item?.metrics)return"";
  const setupState=executionStateFromVerdict(item.metrics,item.plan);
  const confidence=plannerSetupConfidence(item.metrics);
  const timingWindow=plannerTimingWindowSummary(item.plan);
  const guidance=plannerSetupGuidance(item);
  const timingDisplay=timingWindow.note||timingWindow.label;
  return `<div class="planner-setup-summary">
    <div class="label">Execution snapshot</div>
    <div class="small muted" style="margin-top:4px">Compact execution read for the live plan. Current Verdict stays as the broader action judgment; this block narrows that into trade-ready status, timing, and next-step guidance.</div>
    <div class="planner-setup-stack">
      <div class="planner-setup-top">
        <div class="item">
          <div class="label">Execution State</div>
          <span class="value ${setupState.tone==="good"?"good":setupState.tone==="warn"?"warn":setupState.tone==="bad"?"bad":""}">${esc(setupState.label)}</span>
        </div>
        <div class="item">
          <div class="label">Confidence</div>
          <span class="value ${esc(String(confidence.label).toLowerCase())}">${esc(confidence.label)}</span>
        </div>
      </div>
      <div class="planner-setup-block">
        <div class="label">Entry zone</div>
        <span class="value neutral">${zoneInline(item.plan.proj.zone_bot,item.plan.proj.zone_top,item.currency)}</span>
      </div>
      <div class="planner-setup-block">
        <div class="label">Timing</div>
        <span class="value neutral">${esc(timingDisplay)}</span>
        <div class="small muted" style="margin-top:4px">${esc(timingWindow.label)} timing window based on the current planner timeline.</div>
      </div>
      <div class="planner-setup-block">
        <div class="label">Exit bias</div>
        <span class="value neutral">${esc(plannerExitModeChipLabel(item.metrics.exitModeDisplay||"-"))}</span>
      </div>
      <div class="planner-setup-block">
        <div class="label">Confidence note</div>
        <div class="small muted" style="margin-top:4px">${esc(confidence.note)}</div>
      </div>
      <div class="planner-setup-block">
        <div class="label">Guidance</div>
        ${guidance.length?`<ul class="planner-guidance">${guidance.map(line=>`<li>${esc(line)}</li>`).join("")}</ul>`:`<div class="small muted" style="margin-top:4px">No extra guidance for this setup.</div>`}
      </div>
    </div>
  </div>`;
}
function compactExecutionSummary(metrics,plan){
  const state=executionStateFromVerdict(metrics,plan).label;
  const confidence=plannerSetupConfidence(metrics).label.toLowerCase();
  const exitBias=metrics?.exitMode==="PRE_EXDIV_PREFERRED"
    ? "Pre-exdiv exit bias"
    : metrics?.exitMode
      ? "Ex-div exit bias"
      : "Exit bias unknown";
  return `Execution: ${state} · ${confidence} confidence · ${exitBias}`;
}
function plannerCompactTimelineLabels(model){
  if(!model)return[];
  const labels=[
    {pos:model.watchPos, text:"Watch", lane:"top"},
    {pos:(Math.min(model.dipStartPos,model.dipEndPos)+Math.max(model.dipStartPos,model.dipEndPos))/2, text:model.dipStart!==model.dipEnd?"Dip":"Low", lane:"top"},
    {pos:model.exDivPos, text:"Ex-div", lane:"bottom"},
  ];
  labels.sort((a,b)=>a.pos-b.pos);
  return labels.filter((label,idx)=>{
    if(idx===0)return true;
    return Math.abs(label.pos-labels[idx-1].pos) >= 14;
  });
}
function renderPlannerDiffSummary(plan,currency){
  if(!plan?.hasOverride)return"";
  const changes=[];
  if(plan.baseExDiv && plan.effectiveExDiv && plan.baseExDiv!==plan.effectiveExDiv){
    changes.push({
      label:"Ex-div date",
      base:dt(plan.baseExDiv),
      next:dt(plan.effectiveExDiv),
    });
  }
  if(plan.proj?.est_low_date || plan.buyWatchLabel){
    const baseWatch=(plan.proj?.est_low_date_cluster1 && plan.proj?.est_low_date_cluster2)
      ? `${dt(plan.proj.est_low_date_cluster1)} · ${dt(plan.proj.est_low_date_cluster2)}`
      : (plan.proj?.est_low_date ? dt(plan.proj.est_low_date) : "-");
    if(baseWatch!==plan.buyWatchLabel){
      changes.push({
        label:"Buy watch",
        base:baseWatch,
        next:plan.buyWatchLabel,
      });
    }
  }
  if(plan.baseEntryPrice!=null && plan.effectiveEntryPrice!=null && Math.abs(plan.baseEntryPrice-plan.effectiveEntryPrice) > 0.000001){
    changes.push({
      label:"Planned entry",
      base:ccy(plan.baseEntryPrice,currency),
      next:ccy(plan.effectiveEntryPrice,currency),
    });
  }
  if(plan.baseDivAmount!=null && plan.effectiveDivAmount!=null && Math.abs(plan.baseDivAmount-plan.effectiveDivAmount) > 0.000001){
    changes.push({
      label:"Dividend amount",
      base:ccy(plan.baseDivAmount,currency),
      next:ccy(plan.effectiveDivAmount,currency),
    });
  }
  if(plan.baseExpectedGainPct!=null && plan.expectedGainPct!=null && Math.abs(plan.baseExpectedGainPct-plan.expectedGainPct) > 0.009){
    changes.push({
      label:"Expected gain",
      base:pctRaw(plan.baseExpectedGainPct,2),
      next:pctRaw(plan.expectedGainPct,2),
    });
  }
  if(plan.baseYieldOnCostPct!=null && plan.yieldOnCostPct!=null && Math.abs(plan.baseYieldOnCostPct-plan.yieldOnCostPct) > 0.009){
    changes.push({
      label:"Yield on cost",
      base:pctRaw(plan.baseYieldOnCostPct,2),
      next:pctRaw(plan.yieldOnCostPct,2),
    });
  }
  if(!changes.length)return"";
  return `<div class="planner-diff-grid">${changes.map(change=>`<div class="planner-diff-card"><div class="label">${esc(change.label)}</div><span class="planner-diff-base">${esc(change.base)}</span><span class="planner-diff-new"><span class="planner-diff-arrow">-></span> ${esc(change.next)}</span></div>`).join("")}</div>`;
}
function plannerChangedClass(baseValue,nextValue,tolerance=0.000001){
  if(baseValue==null||nextValue==null)return"";
  if(typeof baseValue==="string"||typeof nextValue==="string") return String(baseValue)!==String(nextValue) ? " changed" : "";
  return Math.abs(Number(baseValue)-Number(nextValue))>tolerance ? " changed" : "";
}
function scatterLabelIndexes(items,yAccessor,maxLabels=10){
  if(!Array.isArray(items)||!items.length)return new Set();
  if(items.length<=12)return new Set(items.map((_,idx)=>idx));
  const scored=items.map((item,idx)=>({
    idx,
    xAbs:Math.abs(Number(item.zonePosition)||0),
    yAbs:Math.abs(Number(yAccessor(item))||0),
    score:(Math.abs(Number(item.zonePosition)-0.5)||0) + Math.abs(Number(yAccessor(item))||0),
  }));
  const picks=[
    ...scored.slice().sort((a,b)=>b.score-a.score).slice(0,Math.ceil(maxLabels/2)),
    ...scored.slice().sort((a,b)=>b.xAbs-a.xAbs).slice(0,Math.ceil(maxLabels/3)),
    ...scored.slice().sort((a,b)=>b.yAbs-a.yAbs).slice(0,Math.ceil(maxLabels/3)),
  ];
  const out=new Set();
  for(const pick of picks){
    out.add(pick.idx);
    if(out.size>=maxLabels)break;
  }
  return out;
}
function scatterLabelPlacement(cx,cy,idx,bounds){
  const {left,right,top,bottom}=bounds;
  const anchor = cx > right - 72 ? "end" : "start";
  const rawX = anchor==="end" ? cx - 10 : cx + 10;
  const rawY = cy + (idx % 2 === 0 ? -12 : 14);
  return {
    x: Math.max(left + 6, Math.min(right - 6, rawX)),
    y: Math.max(top + 12, Math.min(bottom - 8, rawY)),
    anchor,
  };
}
function renderPlannerTimeline(plan, compact=false){
  const model=plannerTimelineModel(plan);
  if(!model)return"";
  const dipLeft=Math.min(model.dipStartPos,model.dipEndPos);
  const dipWidth=Math.max(1.4,Math.abs(model.dipEndPos-model.dipStartPos));
  const exitLeft=Math.min(model.exitStartPos,model.exitEndPos);
  const exitWidth=Math.max(1.4,Math.abs(model.exitEndPos-model.exitStartPos));
  const watchTip=esc(`Watch begins: ${plannerTimelineLabel(model.watchDate)}`);
  const dipTip=esc(`${model.dipLabel}: ${plannerTimelineRangeLabel(model.dipStart,model.dipEnd)}`);
  const exitTip=esc(`${model.exitLabel}: ${plannerTimelineRangeLabel(model.exitStart||model.exitPoint,model.exitEnd||model.exitPoint)}`);
  const exDivTip=esc(`Ex-div date: ${plannerTimelineLabel(model.exDivDate)}`);
  const dipMarkers=model.dipStart===model.dipEnd
    ? `<span class="planner-timeline-marker dip" style="left:${model.dipStartPos}%" title="${dipTip}"></span>`
    : `<span class="planner-timeline-marker dip" style="left:${model.dipStartPos}%" title="${dipTip}"></span><span class="planner-timeline-marker dip" style="left:${model.dipEndPos}%" title="${dipTip}"></span>`;
  const exitMarker=(model.exitStart&&model.exitEnd&&model.exitStart!==model.exitEnd)
    ? ""
    : `<span class="planner-timeline-marker exit" style="left:${model.exitStartPos}%" title="${exitTip}"></span>`;
  const compactLabels=compact ? plannerCompactTimelineLabels(model) : null;
  return `<div class="planner-timeline">
    <div class="planner-timeline-head">
      <span>${compact?"Timeline":"Trade timeline"}</span>
      <span>${plan.hasOverride?"Adjusted for override":"Estimated milestones"}</span>
    </div>
    <div class="planner-timeline-rail-wrap">
      ${compact
        ? compactLabels.map(label=>`<div class="planner-timeline-label ${label.lane}" style="left:${label.pos}%">${esc(label.text)}</div>`).join("")
        : `<div class="planner-timeline-label top" style="left:${model.watchPos}%">Watch</div>
      <div class="planner-timeline-label top" style="left:${(dipLeft + (dipWidth/2))}%">${esc(model.dipLabel)}</div>
      <div class="planner-timeline-label bottom" style="left:${(exitLeft + (exitWidth/2))}%">${esc(model.exitLabel)}</div>
      <div class="planner-timeline-label bottom" style="left:${model.exDivPos}%">Ex-div</div>`}
      <div class="planner-timeline-rail">
        <div class="planner-timeline-band dip" style="left:${dipLeft}%;width:${dipWidth}%" title="${dipTip}"></div>
        <div class="planner-timeline-band exit" style="left:${exitLeft}%;width:${exitWidth}%" title="${exitTip}"></div>
        <span class="planner-timeline-marker watch" style="left:${model.watchPos}%" title="${watchTip}"></span>
        ${dipMarkers}
        ${exitMarker}
        <span class="planner-timeline-marker exdiv" style="left:${model.exDivPos}%" title="${exDivTip}"></span>
      </div>
    </div>
    ${compact?"":plannerMilestoneSummary(model)}
  </div>`;
}
function renderPlannerBoardTimeline(plannerItems){
  const rows=plannerItems.map(item=>{
    const model=plannerTimelineModel(item.plan);
    return model?{item,model}:null;
  }).filter(Boolean);
  if(!rows.length)return"";
  const timestamps=rows.flatMap(({model})=>[
    model.watchDate,
    model.dipStart,
    model.dipEnd,
    model.exitStart,
    model.exitEnd,
    model.exitPoint,
    model.exDivDate,
  ].filter(Boolean).map(v=>isoDateParts(v)?.getTime()).filter(Number.isFinite));
  if(!timestamps.length)return"";
  const startTs=Math.min(...timestamps)-(2*86400000);
  const endTs=Math.max(...timestamps)+(2*86400000);
  const span=Math.max(1,endTs-startTs);
  const pos=(dateStr)=>{
    const d=isoDateParts(dateStr);
    if(!d)return 0;
    return clamp(((d.getTime()-startTs)/span)*100,0,100);
  };
  const nowTs=new Date().setHours(0,0,0,0);
  const nowPos=clamp(((nowTs-startTs)/span)*100,0,100);
  const tickCount=5;
  const ticks=Array.from({length:tickCount},(_,idx)=>{
    const ratio=tickCount===1?0:idx/(tickCount-1);
    const ts=Math.round(startTs + (span*ratio));
    return {
      pos:round(ratio*100,2),
      label:dt(new Date(ts).toISOString().slice(0,10)),
    };
  });
  return `<div class="planner-board">
    <div class="planner-board-head">
      <div>
        <div class="label">Planner timeline board</div>
        <div class="small muted" style="margin-top:4px">One shared date axis across all planned stocks, so overlaps and upcoming milestones stand out faster.</div>
      </div>
      <div class="planner-board-legend">
        <span><i class="watch"></i> Watch</span>
        <span><i class="dip"></i> Dip / entry timing</span>
        <span><i class="exit"></i> Exit window</span>
        <span><i class="exdiv"></i> Ex-div</span>
      </div>
    </div>
    <div class="planner-board-axis">
      <div></div>
      <div class="planner-board-axis-rail">
        ${ticks.map(t=>`<span class="planner-board-tick" style="left:${t.pos}%"></span><span class="planner-board-tick-label" style="left:${t.pos}%">${esc(t.label)}</span>`).join("")}
        <span class="planner-board-now" style="position:absolute;left:${nowPos}%;top:-2px;transform:translateX(-50%)">Today</span>
      </div>
    </div>
    <div class="planner-board-rows">
      ${rows.map(({item,model})=>{
        const dipLeft=Math.min(pos(model.dipStart),pos(model.dipEnd));
        const dipWidth=Math.max(1.4,Math.abs(pos(model.dipEnd)-pos(model.dipStart)));
        const exitStartPos=pos(model.exitStart||model.exitPoint);
        const exitEndPos=pos(model.exitEnd||model.exitPoint);
        const exitLeft=Math.min(exitStartPos,exitEndPos);
        const exitWidth=Math.max(1.4,Math.abs(exitEndPos-exitStartPos));
        const watchTip=esc(`Watch begins: ${plannerTimelineLabel(model.watchDate)}`);
        const dipTip=esc(`${model.dipLabel}: ${plannerTimelineRangeLabel(model.dipStart,model.dipEnd)}`);
        const exitTip=esc(`${model.exitLabel}: ${plannerTimelineRangeLabel(model.exitStart||model.exitPoint,model.exitEnd||model.exitPoint)}`);
        const exDivTip=esc(`Ex-div date: ${plannerTimelineLabel(model.exDivDate)}`);
        const dipMarkers=model.dipStart===model.dipEnd
          ? `<span class="planner-board-marker dip" style="left:${pos(model.dipStart)}%" title="${dipTip}"></span>`
          : `<span class="planner-board-marker dip" style="left:${pos(model.dipStart)}%" title="${dipTip}"></span><span class="planner-board-marker dip" style="left:${pos(model.dipEnd)}%" title="${dipTip}"></span>`;
        const exitMarker=(model.exitStart&&model.exitEnd&&model.exitStart!==model.exitEnd)
          ? ""
          : `<span class="planner-board-marker exit" style="left:${exitStartPos}%" title="${exitTip}"></span>`;
        return `<div class="planner-board-row">
          <div class="planner-board-label">
            <div class="planner-board-ticker">${esc(item.ticker)}</div>
            <div class="planner-board-sub">${esc(item.stockName||"")} · ${esc(item.plan.overrideStatus)}</div>
          </div>
          <div class="planner-board-track">
            <span class="planner-board-now-line" style="left:${nowPos}%"></span>
            <span class="planner-board-band dip" style="left:${dipLeft}%;width:${dipWidth}%" title="${dipTip}"></span>
            <span class="planner-board-band exit" style="left:${exitLeft}%;width:${exitWidth}%" title="${exitTip}"></span>
            <span class="planner-board-marker watch" style="left:${pos(model.watchDate)}%" title="${watchTip}"></span>
            ${dipMarkers}
            ${exitMarker}
            <span class="planner-board-marker exdiv" style="left:${pos(model.exDivDate)}%" title="${exDivTip}"></span>
          </div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}
function plannerSortValue(item){
  const model=plannerTimelineModel(item?.plan);
  const watchTs=isoDateParts(model?.watchDate)?.getTime();
  if(Number.isFinite(watchTs)) return watchTs;
  const exDivTs=isoDateParts(item?.plan?.effectiveExDiv)?.getTime();
  if(Number.isFinite(exDivTs)) return exDivTs;
  return Number.POSITIVE_INFINITY;
}

function buildPlannerItems(){
  return plannerKeys().map(key=>{
    const stock=state.stocks[key];
    const data=stock?.data||{};
    const meta=data.meta||{};
    const plan=plannerProjectionData(data,key);
    const metrics=buildMetricsSummary(normalizeStock(data,{}));
    return {
      key,
      ticker:meta.ticker||key,
      stockName:meta.stock_name||"",
      currency:meta.currency||"",
      currentPrice:data.current_price,
      metrics,
      plan,
      overrides:plannerEntry(key),
    };
  }).filter(item=>item.plan).sort((a,b)=>{
    const timingDiff=plannerSortValue(a)-plannerSortValue(b);
    if(Number.isFinite(timingDiff) && timingDiff!==0) return timingDiff;
    const aTicker=(a.ticker||a.key||"").toUpperCase();
    const bTicker=(b.ticker||b.key||"").toUpperCase();
    return aTicker.localeCompare(bTicker);
  });
}
function plannerCsvCell(value){
  const text=value==null?"":String(value);
  return `"${text.replace(/"/g,'""')}"`;
}
function exportPlannerCsv(){
  const plannerItems=buildPlannerItems();
  if(!plannerItems.length)return;
  const headers=[
    "Ticker","Stock Name","Cycle","Current Verdict","Tail Risk","Override Status",
    "Projected Ex-Div","Effective Ex-Div","Buy Watch","Sell Plan",
    "Entry Zone Bottom","Entry Zone Top","Planned Entry Price","Target Exit Price",
    "Expected Gain Pct","Effective Dividend Amount","Yield On Cost Pct",
    "Official Ex-Div Override","Official Dividend Override","Planned Entry Override",
    "Timing Reevaluation Note"
  ];
  const rows=plannerItems.map(item=>{
    const plan=item.plan||{};
    const proj=plan.proj||{};
    const overrides=item.overrides||{};
    return [
      item.ticker||item.key||"",
      item.stockName||"",
      plan.id||"",
      item.metrics?.finalVerdict||"",
      item.metrics?.tailRiskDisplay||item.metrics?.tailRiskLevel||"",
      plan.overrideStatus||"",
      plan.baseExDiv||"",
      plan.effectiveExDiv||"",
      plan.buyWatchLabel||"",
      plan.sellPlan||"",
      proj.zone_bot,
      proj.zone_top,
      plan.effectiveEntryPrice,
      plan.targetExitPx,
      plan.expectedGainPct,
      plan.effectiveDivAmount,
      plan.yieldOnCostPct,
      overrides.officialExDivDate||"",
      overrides.officialDivAmount||"",
      overrides.plannedEntryPrice||"",
      plan.timingReevaluationNote||"",
    ];
  });
  const csv=[headers,...rows].map(row=>row.map(plannerCsvCell).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=`trade-planner-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function updateStockBar(){
  const stocks=stockList();
  const status=document.getElementById("loadStatus");
  if(!stocks.length){
    status.textContent="No stocks loaded";
    status.classList.remove("is-loaded");
    return;
  }
  status.textContent=`${stocks.length} stock${stocks.length>1?"s":""} loaded`;
  status.classList.add("is-loaded");
}

async function backendHealth(){
  if(BACKEND_CONFIG.staticJsonBase)return {ok:false};
  if(!BACKEND_CONFIG.enabled)return {ok:false};
  if(!backendHealthPromise){
    backendHealthPromise=fetch(BACKEND_CONFIG.healthUrl,{cache:"no-store"})
      .then(r=>r.ok?r.json():{ok:false})
      .catch(()=>({ok:false}));
  }
  const payload=await backendHealthPromise;
  backendAvailable=!!payload?.ok;
  return payload;
}

function syncBackendButtons(){
  const loadBtn=document.getElementById("loadServerStocksBtn");
  const runBtn=document.getElementById("runPipelineBtn");
  const registryBtn=document.getElementById("manageRegistryBtn");
  if(!loadBtn||!runBtn||!registryBtn)return;
  const mode=BACKEND_CONFIG.enabled && backendAvailable;
  loadBtn.style.display=mode?"inline-flex":"none";
  runBtn.style.display=mode?"inline-flex":"none";
  registryBtn.style.display=mode?"inline-flex":"none";
}

async function backendJsonFiles(){
  const res=await fetch(BACKEND_CONFIG.jsonFilesUrl,{cache:"no-store"});
  if(!res.ok)throw new Error("Unable to read server JSON list");
  const payload=await res.json();
  return Array.isArray(payload?.files)?payload.files:[];
}

async function backendJsonPayload(filename){
  if(BACKEND_CONFIG.staticJsonBase){
    const res=await fetch(`${BACKEND_CONFIG.staticJsonBase}/${encodeURIComponent(filename)}`,{cache:"no-store"});
    if(!res.ok)throw new Error(`Unable to load ${filename}`);
    return await res.json();
  }
  const res=await fetch(`${BACKEND_CONFIG.jsonFilesUrl}/${encodeURIComponent(filename)}`,{cache:"no-store"});
  if(!res.ok)throw new Error(`Unable to load ${filename}`);
  return await res.json();
}

async function staticAutoLoad(){
  const status=document.getElementById("loadStatus");
  try{
    const [res]=await Promise.all([
      fetch(`${BACKEND_CONFIG.staticJsonBase}/manifest.json`,{cache:"no-store"}),
      BACKEND_CONFIG.stockDescriptionsStaticUrl?fetchStockDescriptions():Promise.resolve(),
      BACKEND_CONFIG.stockFinancialsStaticUrl?fetchStockFinancials():Promise.resolve(),
    ]);
    if(!res.ok){if(status)status.textContent="No stock data found";return;}
    const payload=await res.json();
    const files=(Array.isArray(payload?.files)?payload.files:[]).filter(f=>f&&f!=="manifest.json");
    if(!files.length){if(status)status.textContent="No stock data found";return;}
    let loaded=0;
    showProgress(0,files.length);
    for(const filename of files){
      if(status)status.textContent=`Loading ${loaded+1} / ${files.length}…`;
      try{const data=await backendJsonPayload(filename);addStock(data,filename);loaded++;}catch(_){}
      showProgress(loaded,files.length);
    }
    hideProgress();
    if(status)status.textContent=`Loaded ${loaded} stock${loaded===1?"":"s"}`;
    renderApp();
  }catch(err){
    hideProgress();
    if(status)status.textContent=`Load failed: ${err.message}`;
  }
}

function registryAnalysisFilenames(entries){
  return Array.from(new Set((Array.isArray(entries)?entries:[])
    .filter(entry=>entry && !entry.is_index && entry.run_analysis!==false)
    .map(entry=>String(entry.ticker||"").trim().toUpperCase())
    .filter(Boolean)
    .map(ticker=>`${ticker}_DividendCycleAnalysis_output.json`)));
}

function showProgress(current,total){
  const wrap=document.getElementById("loadProgressWrap");
  const bar=document.getElementById("loadProgressBar");
  const pill=document.getElementById("loadProgressPill");
  const pillFill=document.getElementById("loadProgressPillFill");
  const pillText=document.getElementById("loadProgressPillText");
  if(!wrap||!bar)return;
  const pct=total>0?Math.round((current/total)*100):0;
  bar.classList.remove("indeterminate");
  bar.style.width=pct+"%";
  wrap.classList.add("active");
  if(pill&&pillFill&&pillText){
    pillFill.style.width=pct+"%";
    pillText.textContent=total>0?`${current} / ${total} stocks (${pct}%)`:"Loading…";
    pill.classList.add("active");
  }
}
function showIndeterminateProgress(){
  const wrap=document.getElementById("loadProgressWrap");
  const bar=document.getElementById("loadProgressBar");
  const pill=document.getElementById("loadProgressPill");
  const pillText=document.getElementById("loadProgressPillText");
  if(!wrap||!bar)return;
  bar.classList.add("indeterminate");
  wrap.classList.add("active");
  if(pill&&pillText){pillText.textContent="Loading…";pill.classList.add("active");}
}
function hideProgress(){
  const wrap=document.getElementById("loadProgressWrap");
  const bar=document.getElementById("loadProgressBar");
  const pill=document.getElementById("loadProgressPill");
  if(!wrap||!bar)return;
  wrap.classList.remove("active");
  if(pill)pill.classList.remove("active");
  setTimeout(()=>{bar.classList.remove("indeterminate");bar.style.width="0%";
    const f=document.getElementById("loadProgressPillFill");if(f)f.style.width="0%";
  },250);
}

async function loadStocksFromServer(filenames,options={}){
  const names=Array.from(new Set((Array.isArray(filenames)?filenames:[]).filter(Boolean)));
  if(!names.length)return 0;
  const status=document.getElementById("loadStatus");
  const {persistFiles=true,replaceServerFiles=false}=options;
  let loaded=0;
  showProgress(0,names.length);
  for(const filename of names){
    status.textContent=`Loading ${loaded+1} / ${names.length}…`;
    try{
      const data=await backendJsonPayload(filename);
      addStock(data,filename);
      loaded+=1;
    }catch(_){}
    showProgress(loaded,names.length);
  }
  hideProgress();
  if(persistFiles){
    const nextFiles=replaceServerFiles?names:[...normalizedServerLoadedFiles(),...names];
    state.serverLoadedFiles=Array.from(new Set(nextFiles));
    persistPlannerState();
  }
  status.textContent=`Loaded ${loaded} server stock${loaded===1?"":"s"}`;
  return loaded;
}

async function loadRegistryServerStocks(){
  const [files,entries]=await Promise.all([
    backendJsonFiles(),
    fetchRegistryEntries(),
  ]);
  if(!files.length){
    document.getElementById("loadStatus").textContent="No existing server stock data found";
    return 0;
  }
  const wanted=registryAnalysisFilenames(entries);
  const wantedSet=new Set(wanted);
  const matched=files.filter(name=>wantedSet.has(name));
  const missing=wanted.filter(name=>!matched.includes(name));
  if(!matched.length){
    document.getElementById("loadStatus").textContent = missing.length
      ? "No registry-linked stock data found yet"
      : "No tracked analysis stocks are selected in the registry";
    return 0;
  }
  const loaded=await loadStocksFromServer(matched,{persistFiles:true,replaceServerFiles:true});
  if(missing.length){
    document.getElementById("loadStatus").textContent=`Loaded ${loaded} registry stock${loaded===1?"":"s"} · ${missing.length} missing JSON`;
  }
  return loaded;
}

async function runPipelineFromDashboard(){
  const status=document.getElementById("loadStatus");
  status.textContent="Updating stock data...";
  const btn=document.getElementById("runPipelineBtn");
  if(btn)btn.disabled=true;
  showIndeterminateProgress();
  try{
    const res=await fetch(BACKEND_CONFIG.runPipelineStreamUrl,{method:"POST"});
    if(!res.ok)throw new Error("Pipeline request failed (HTTP "+res.status+")");
    const reader=res.body.getReader();
    const dec=new TextDecoder();
    let buf="",pipelineOk=true,pipelineError=null;
    outer:while(true){
      const{done,value}=await reader.read();
      if(done)break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split("\n");
      buf=lines.pop();
      for(const line of lines){
        if(!line.startsWith("data: "))continue;
        let d;try{d=JSON.parse(line.slice(6))}catch{continue}
        if(d.line){
          const m=d.line.match(/\[(\d+)\/(\d+)\]/);
          if(m)showProgress(parseInt(m[1]),parseInt(m[2]));
          else if(/STEP 1\/2/i.test(d.line))status.textContent="Step 1/2: Refreshing price data…";
          else if(/STEP 2\/2/i.test(d.line))status.textContent="Step 2/2: Running analysis…";
        }
        if(d.done){pipelineOk=d.ok;if(!d.ok)pipelineError="Pipeline exited with code "+d.returncode;}
        if(d.error){pipelineOk=false;pipelineError=d.error;}
      }
    }
    if(!pipelineOk)throw new Error(pipelineError||"Stock data update failed");
    status.textContent="Stock data updated. Reloading server JSONs...";
    await loadRegistryServerStocks();
  }finally{
    if(btn)btn.disabled=false;
    hideProgress();
  }
}

async function initBackendMode(){
  const health=await backendHealth();
  backendAvailable=!!health?.ok;
  syncBackendButtons();
  if(backendAvailable){
    try{
      await Promise.all([fetchMasterStocks(),fetchStockDescriptions(),fetchStockFinancials()]);
    }catch(_){}
  }
  renderApp();
  if(BACKEND_CONFIG.staticJsonBase){staticAutoLoad();return;}
  if(!backendAvailable)return;
  try{
    const entries=await fetchRegistryEntries();
    const validFilenames=new Set(registryAnalysisFilenames(entries));
    let purged=0;
    for(const key of Object.keys(state.stocks||{})){
      if(!validFilenames.has(state.stocks[key]?.label)){delete state.stocks[key];purged++;}
    }
    if(purged>0){
      if(Array.isArray(state.serverLoadedFiles))
        state.serverLoadedFiles=state.serverLoadedFiles.filter(f=>validFilenames.has(f));
      persistPlannerState();
      renderApp();
    }
  }catch(_){}
  const shouldRestore=state.rememberLoadedStocks!==false && !stockList().length && normalizedServerLoadedFiles().length;
  if(!shouldRestore)return;
  try{
    await loadStocksFromServer(normalizedServerLoadedFiles(),{persistFiles:true,replaceServerFiles:true});
    renderApp();
  }catch(err){
    document.getElementById("loadStatus").textContent=`Restore failed: ${err.message}`;
  }
}

function registryStatus(message){
  const node=document.getElementById("registryStatus");
  if(node)node.textContent=message;
}

function registryFormValues(){
  return {
    stock_name:(document.getElementById("registryStockName")?.value||"").trim(),
    ticker:(document.getElementById("registryTicker")?.value||"").trim().toUpperCase(),
    run_analysis:!!document.getElementById("registryRunAnalysis")?.checked,
    is_index:!!document.getElementById("registryIsIndex")?.checked,
  };
}

function normalizedRegistrySelectedTickers(values){
  return Array.from(new Set((Array.isArray(values)?values:[])
    .map(value=>String(value||"").trim().toUpperCase())
    .filter(Boolean)));
}

function registryMultiSelectEnabled(){
  return true;
}

function buildRegistryEntryFromMaster(entry){
  return {
    stock_name:(entry?.stock_name||entry?.company_name||"").trim(),
    ticker:String(entry?.ticker||"").trim().toUpperCase(),
    run_analysis:entry?.default_run_analysis!==false && !entry?.is_index,
    is_index:!!entry?.is_index,
  };
}

function setRegistrySelectedMasterTickers(values){
  state.registrySelectedMasterTickers=normalizedRegistrySelectedTickers(values);
  updateRegistryMultiSelectUI();
}

function toggleRegistrySelectedMasterTicker(ticker){
  const key=String(ticker||"").trim().toUpperCase();
  if(!key)return;
  const current=new Set(normalizedRegistrySelectedTickers(state.registrySelectedMasterTickers));
  if(current.has(key)) current.delete(key);
  else current.add(key);
  setRegistrySelectedMasterTickers(Array.from(current));
}

function visibleMasterStockTickers(query=""){
  return filteredMasterStocksFull(query)
    .filter(entry=>!entry?.is_index)
    .map(entry=>String(entry?.ticker||"").trim().toUpperCase())
    .filter(Boolean);
}

function registrySelectedSummary(){
  const count=normalizedRegistrySelectedTickers(state.registrySelectedMasterTickers).length;
  if(!count){
    return "Click one or more stocks to select them, then use Add selected.";
  }
  return `${count} stock${count===1?"":"s"} selected. Click Add selected to add them all.`;
}

function updateRegistryMultiSelectUI(){
  const selectedCount=normalizedRegistrySelectedTickers(state.registrySelectedMasterTickers).length;
  const note=document.getElementById("registrySelectionNote");
  const saveBtn=document.getElementById("saveRegistryEntryBtn");
  if(note) note.textContent=registrySelectedSummary();
  if(saveBtn){
    const editing=state.registryEditingIndex!==null&&state.registryEditingIndex!==undefined;
    saveBtn.textContent=editing
      ?"Update stock"
      :selectedCount
        ?`Add selected (${selectedCount})`
        :"Add stock";
  }
}

function resetRegistryForm(){
  const masterStock=document.getElementById("registryMasterStock");
  const stockName=document.getElementById("registryStockName");
  const ticker=document.getElementById("registryTicker");
  const sector=document.getElementById("registrySector");
  const runAnalysis=document.getElementById("registryRunAnalysis");
  const isIndex=document.getElementById("registryIsIndex");
  const saveBtn=document.getElementById("saveRegistryEntryBtn");
  if(masterStock)masterStock.value="";
  if(stockName)stockName.value="";
  if(ticker)ticker.value="";
  if(sector)sector.value="";
  if(runAnalysis)runAnalysis.checked=true;
  if(isIndex)isIndex.checked=false;
  state.registryEditingIndex=null;
  state.registrySelectedMasterTickers=[];
  state.registryMasterPage=1;
  state.registryMultiSelectEnabled=true;
  updateRegistryMultiSelectUI();
  renderMasterStockOptions(document.getElementById("registryMasterStock")?.value||"");
}

function masterStockLabel(entry){
  if(!entry)return"";
  return `${entry.symbol} - ${entry.company_name}`;
}

function masterStockByTicker(ticker){
  const key=String(ticker||"").trim().toUpperCase();
  if(!key)return null;
  return (state.masterStocks||[]).find(entry=>String(entry?.ticker||"").trim().toUpperCase()===key) || null;
}

function displayAssetTypeLabel(value){
  const type=String(value||"").trim();
  if(!type || type.toLowerCase()==="stock")return"";
  if(type.toLowerCase()==="reit")return"REIT";
  if(type.toLowerCase()==="trust")return"Trust";
  if(type.toLowerCase()==="etf")return"ETF";
  if(type.toLowerCase()==="index")return"Index";
  return type;
}

function assetTypeLabelForTicker(ticker){
  return displayAssetTypeLabel(masterStockByTicker(ticker)?.type);
}

function sectorLabelForTicker(ticker){
  const entry=masterStockByTicker(ticker);
  return String(entry?.sector || "").trim();
}

function assetTypeChipForTicker(ticker){
  const label=assetTypeLabelForTicker(ticker);
  if(!label)return"";
  return `<span class="chip asset-type">${esc(label)}</span>`;
}

function entityMetaInline(ticker){
  const bits=[];
  const assetType=assetTypeLabelForTicker(ticker);
  const sector=sectorLabelForTicker(ticker);
  if(assetType)bits.push(assetType);
  if(sector)bits.push(sector);
  return bits.length?esc(bits.join(" · ")):"";
}

function masterStockMetaLine(entry){
  if(!entry)return"";
  return [
    entry.type,
    entry.sector,
    entry.role,
    entry.stock_name,
    entry.ticker,
  ].filter(Boolean).join(" · ");
}

function currentMasterStockFilter(){
  return document.getElementById("registryMasterFilter")?.value || "all";
}

function currentSectorFilter(){
  return document.getElementById("registrySectorFilter")?.value || "all";
}

function matchesMasterStockFilter(entry,filterValue){
  const type=String(entry?.type||"").toLowerCase();
  const role=String(entry?.role||"").toLowerCase();
  if(filterValue==="dividend") return role==="dividend_core" || role==="dividend_secondary";
  if(filterValue==="etf") return type==="etf";
  if(filterValue==="benchmark") return role==="macro_benchmark" || entry?.is_index;
  if(filterValue==="reit_trust") return type==="reit" || type==="trust";
  return true;
}

function matchesSectorFilter(entry,filterValue){
  if(!filterValue || filterValue==="all") return true;
  const sector=String(entry?.sector || "").trim().toLowerCase();
  return sector===filterValue;
}

function renderSectorFilterOptions(){
  const select=document.getElementById("registrySectorFilter");
  if(!select)return;
  const current=select.value || "all";
  const sectors=Array.from(new Set((state.masterStocks||[])
    .map(entry=>String(entry?.sector || "").trim())
    .filter(Boolean)))
    .sort((a,b)=>a.localeCompare(b));
  select.innerHTML=[
    '<option value="all">All sectors</option>',
    ...sectors.map(sector=>`<option value="${esc(sector.toLowerCase())}">${esc(sector)}</option>`)
  ].join("");
  select.value=sectors.some(sector=>sector.toLowerCase()===current) ? current : "all";
}

function filteredMasterStocksFull(query=""){
  const q=String(query||"").trim().toLowerCase();
  const filterValue=currentMasterStockFilter();
  const sectorFilter=currentSectorFilter();
  const entries=(state.masterStocks||[])
    .filter(entry=>entry&&entry.enabled!==false)
    .filter(entry=>matchesMasterStockFilter(entry,filterValue))
    .filter(entry=>matchesSectorFilter(entry,sectorFilter));
  if(!q)return entries;
  return entries.filter(entry=>{
    const haystack=[
      entry.symbol,
      entry.company_name,
      entry.ticker,
      entry.stock_name,
      entry.sector,
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function filteredMasterStocks(query="",page=1){
  const safePage=Math.max(1,Number(page)||1);
  const start=(safePage-1)*40;
  return filteredMasterStocksFull(query).slice(start,start+40);
}

function renderMasterStockOptions(query=""){
  const list=document.getElementById("masterStockMenu");
  if(!list)return;
  const fullMatches=filteredMasterStocksFull(query);
  const totalPages=Math.max(1,Math.ceil(fullMatches.length/40));
  state.registryMasterPage=Math.min(Math.max(1,Number(state.registryMasterPage)||1),totalPages);
  const currentPage=state.registryMasterPage;
  const entries=filteredMasterStocks(query,currentPage);
  const selectedSet=new Set(normalizedRegistrySelectedTickers(state.registrySelectedMasterTickers));
  const rangeStart=fullMatches.length?((currentPage-1)*40)+1:0;
  const rangeEnd=Math.min(currentPage*40,fullMatches.length);
  const countLabel=fullMatches.length
    ? `Showing ${rangeStart}-${rangeEnd} of ${fullMatches.length} matches`
    : "0 matches";
  const head=`<div class="registry-master-head"><div class="registry-master-count">${esc(countLabel)}</div><div class="check-filter-actions"><button type="button" class="check-filter-link" data-master-action="all">Select all filtered</button><button type="button" class="check-filter-link" data-master-action="none">None</button></div></div>`;
  const footer=fullMatches.length>40
    ? `<div class="registry-master-footer"><div class="registry-master-page">Page ${currentPage} of ${totalPages}</div><div class="registry-master-pager"><button type="button" class="check-filter-link" data-master-page="prev" ${currentPage<=1?'disabled':''}>Prev</button><button type="button" class="check-filter-link" data-master-page="next" ${currentPage>=totalPages?'disabled':''}>Next</button></div></div>`
    : "";
  if(!entries.length){
    list.innerHTML=`${head}<div class="registry-master-empty">No matching stocks for this stock type / sector filter.</div>`;
  }else{
    list.innerHTML=`${head}${entries.map(entry=>`
      <button class="registry-master-option${selectedSet.has(String(entry.ticker||"").toUpperCase())?" is-selected":""}" type="button" data-master-stock="${esc(entry.ticker||"")}">
        <input type="checkbox" tabindex="-1" aria-hidden="true" ${selectedSet.has(String(entry.ticker||"").toUpperCase())?"checked":""}>
        <span class="registry-master-option-copy">
          <span>${esc(masterStockLabel(entry))}</span>
          <small>${esc(masterStockMetaLine(entry))}</small>
        </span>
      </button>
    `).join("")}${footer}`;
  }
}

function applyMasterStockToForm(entry,options={}){
  if(!entry)return;
  const {preserveFlags=false}=options;
  const stockName=document.getElementById("registryStockName");
  const ticker=document.getElementById("registryTicker");
  const sector=document.getElementById("registrySector");
  const runAnalysis=document.getElementById("registryRunAnalysis");
  const isIndex=document.getElementById("registryIsIndex");
  if(stockName)stockName.value=entry.stock_name||"";
  if(ticker)ticker.value=(entry.ticker||"").toUpperCase();
  if(sector)sector.value=entry.sector||"";
  if(!preserveFlags){
    if(runAnalysis)runAnalysis.checked=entry.default_run_analysis!==false;
    if(isIndex)isIndex.checked=!!entry.is_index;
  }
}

function renderRegistryTable(){
  const body=document.getElementById("registryTableBody");
  if(!body)return;
  const allEntries=Array.isArray(state.registryEntries)?state.registryEntries:[];

  // Counts for badge + tab labels
  const ac=allEntries.filter(e=>!e.is_index&&e.active!==false).length;
  const mo=allEntries.filter(e=>e.active===false).length;
  const ix=allEntries.filter(e=>e.is_index).length;

  const badge=document.getElementById("registrySummaryBadge");
  if(badge) badge.textContent=allEntries.length?`${ac} Active · ${ix} Index · ${mo} Monitor`:"";

  // Update tab labels with live counts
  const tabCounts={active:ac,monitor:mo,index:ix};
  const tabLabels={active:"Active",monitor:"Monitor",index:"Index"};
  document.querySelectorAll("[data-reg-tab]").forEach(btn=>{
    const t=btn.dataset.regTab;
    btn.textContent=`${tabLabels[t]} (${tabCounts[t]??0})`;
  });

  // Filter by active tab
  const tab=state.registryActiveTab||"active";
  let tabEntries;
  if(tab==="active") tabEntries=allEntries.filter(e=>!e.is_index&&e.active!==false);
  else if(tab==="monitor") tabEntries=allEntries.filter(e=>e.active===false);
  else tabEntries=allEntries.filter(e=>e.is_index);

  // Apply search within tab
  const q=(document.getElementById("registryTableSearch")?.value||"").trim().toLowerCase();
  const entries=q?tabEntries.filter(e=>(String(e.stock_name||"")+' '+String(e.ticker||'')).toLowerCase().includes(q)):tabEntries;

  if(!entries.length){
    body.innerHTML=q
      ?'<tr><td colspan="7" class="muted">No entries match the filter.</td></tr>'
      :`<tr><td colspan="7" class="muted">No ${tab} entries.</td></tr>`;
    return;
  }

  body.innerHTML=entries.map(entry=>{
    const i=allEntries.indexOf(entry);
    const isIdx=!!entry.is_index;
    const isActive=entry.active!==false&&!isIdx;
    const pill=isIdx
      ?`<span class="reg-pill reg-pill-index">Index</span>`
      :isActive
        ?`<button class="reg-pill reg-pill-active" type="button" data-registry-toggle="${i}" title="Click to hide from dashboard">Active</button>`
        :`<button class="reg-pill reg-pill-monitor" type="button" data-registry-toggle="${i}" title="Click to show in dashboard">Monitor</button>`;
    return `<tr>
      <td>${esc(entry.stock_name||"")}</td>
      <td><span class="mono">${esc(entry.ticker||"")}</span></td>
      <td>${esc(sectorLabelForTicker(entry.ticker)||"-")}</td>
      <td>${entry.run_analysis===false?"No":"Yes"}</td>
      <td>${entry.is_index?"Yes":"No"}</td>
      <td>${pill}</td>
      <td><div class="registry-row-actions">
        <button class="btn btn-compact" type="button" data-registry-edit="${i}">Edit</button>
        <button class="btn btn-compact" type="button" data-registry-delete="${i}" style="opacity:.8">Remove</button>
      </div></td>
    </tr>`;
  }).join("");
}

function setRegistryTab(tab){
  state.registryActiveTab=tab;
  document.querySelectorAll("[data-reg-tab]").forEach(btn=>{
    btn.classList.toggle("is-active",btn.dataset.regTab===tab);
  });
  renderRegistryTable();
}

function openRegistryOverlay(){
  const overlay=document.getElementById("registryOverlay");
  if(!overlay)return;
  state.registryMultiSelectEnabled=true;
  state.registryActiveTab=state.registryActiveTab||"active";
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden","false");
  document.querySelectorAll("[data-reg-tab]").forEach(btn=>{
    btn.classList.toggle("is-active",btn.dataset.regTab===state.registryActiveTab);
  });
  updateRegistryMultiSelectUI();
}

function closeRegistryOverlay(){
  const overlay=document.getElementById("registryOverlay");
  if(!overlay)return;
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden","true");
  resetRegistryForm();
}

function openQuickGuideOverlay(){
  const overlay=document.getElementById("quickGuideOverlay");
  if(!overlay)return;
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden","false");
}

function closeQuickGuideOverlay(){
  const overlay=document.getElementById("quickGuideOverlay");
  if(!overlay)return;
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden","true");
}

async function fetchRegistryEntries(){
  const res=await fetch(BACKEND_CONFIG.stockRegistryUrl,{cache:"no-store"});
  const payload=await res.json().catch(()=>({ok:false,error:"Registry response could not be read"}));
  if(!res.ok||payload?.ok===false){
    throw new Error(payload?.error||"Unable to load stock registry");
  }
  state.registryEntries=Array.isArray(payload.entries)?payload.entries:[];
  renderRegistryTable();
  registryStatus(`Loaded ${state.registryEntries.length} registry entr${state.registryEntries.length===1?"y":"ies"}.`);
  return state.registryEntries;
}

async function fetchStockDescriptions(){
  const url=BACKEND_CONFIG.stockDescriptionsStaticUrl||BACKEND_CONFIG.stockDescriptionsUrl;
  try{
    const res=await fetch(url,{cache:"no-store"});
    if(!res.ok){console.warn(`stock descriptions: ${url} returned ${res.status}`);return;}
    const payload=await res.json().catch(()=>null);
    if(!payload||typeof payload!=="object"||Array.isArray(payload)){console.warn(`stock descriptions: ${url} returned an unexpected payload shape`);return;}
    if(payload.ok===true&&payload.descriptions&&typeof payload.descriptions==="object"){
      state.stockDescriptions=payload.descriptions;
    }else if(payload.ok===undefined){
      state.stockDescriptions=payload;
    }
  }catch(err){console.warn(`stock descriptions: failed to load ${url}`,err);}
}

async function fetchStockFinancials(){
  const url=BACKEND_CONFIG.stockFinancialsStaticUrl||BACKEND_CONFIG.stockFinancialsUrl;
  try{
    const res=await fetch(url,{cache:"no-store"});
    if(!res.ok){console.warn(`stock financials: ${url} returned ${res.status}`);return;}
    const payload=await res.json().catch(()=>null);
    if(!payload||typeof payload!=="object"||Array.isArray(payload)){console.warn(`stock financials: ${url} returned an unexpected payload shape`);return;}
    if(payload.ok===true&&payload.financials&&typeof payload.financials==="object"){
      state.stockFinancials=payload.financials;
    }else if(payload.ok===undefined){
      state.stockFinancials=payload;
    }
  }catch(err){console.warn(`stock financials: failed to load ${url}`,err);}
}

// Shared "no data yet" lookup used by both the Series & Risk summary and the
// Financials tab, so the empty-state logic lives in one place.
function financialsFor(ticker){
  return (state.stockFinancials||{})[ticker||""]||null;
}

async function fetchMasterStocks(){
  const res=await fetch(BACKEND_CONFIG.masterStocksUrl,{cache:"no-store"});
  const payload=await res.json().catch(()=>({ok:false,error:"Master stock response could not be read"}));
  if(!res.ok||payload?.ok===false){
    throw new Error(payload?.error||"Unable to load master stock list");
  }
  state.masterStocks=Array.isArray(payload.entries)?payload.entries:[];
  renderSectorFilterOptions();
  renderMasterStockOptions(document.getElementById("registryMasterStock")?.value||"");
  return state.masterStocks;
}

function selectMasterStockByTicker(ticker){
  const matched=(state.masterStocks||[]).find(entry=>(entry.ticker||"").toUpperCase()===String(ticker||"").toUpperCase());
  if(!matched)return;
  if(registryMultiSelectEnabled() && (state.registryEditingIndex===null||state.registryEditingIndex===undefined)){
    toggleRegistrySelectedMasterTicker(matched.ticker);
    const input=document.getElementById("registryMasterStock");
    if(input) input.focus();
    renderMasterStockOptions(input?.value||"");
    registryStatus(`${normalizedRegistrySelectedTickers(state.registrySelectedMasterTickers).length} stock${normalizedRegistrySelectedTickers(state.registrySelectedMasterTickers).length===1?"":"s"} selected for bulk add.`);
    return;
  }
  const input=document.getElementById("registryMasterStock");
  if(input)input.value=masterStockLabel(matched);
  applyMasterStockToForm(matched);
  registryStatus(`Loaded ${matched.ticker} from the master stock list.`);
}

function addSelectedMasterStocksToRegistry(){
  const tickers=normalizedRegistrySelectedTickers(state.registrySelectedMasterTickers);
  if(!tickers.length){
    registryStatus("Pick one or more master stocks first.");
    return;
  }
  if(!Array.isArray(state.registryEntries)) state.registryEntries=[];
  let added=0;
  let skipped=0;
  tickers.forEach(ticker=>{
    const master=masterStockByTicker(ticker);
    if(!master) return;
    const exists=(state.registryEntries||[]).some(item=>String(item?.ticker||"").trim().toUpperCase()===ticker);
    if(exists){
      skipped+=1;
      return;
    }
    state.registryEntries.push(buildRegistryEntryFromMaster(master));
    added+=1;
  });
  markRegistryChanged();
  renderRegistryTable();
  const messages=[];
  if(added) messages.push(`added ${added}`);
  if(skipped) messages.push(`skipped ${skipped} duplicate${skipped===1?"":"s"}`);
  registryStatus(messages.length ? `Bulk add complete: ${messages.join(", ")}.` : "No new stocks were added.");
  resetRegistryForm();
}

function markRegistryChanged(){
  const btn=document.getElementById("saveRegistryBtn");
  if(btn){btn.classList.add("has-changes");btn.textContent="● Save registry";}
}

async function saveRegistryEntries(){
  const res=await fetch(BACKEND_CONFIG.stockRegistryUrl,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({entries:state.registryEntries||[]}),
  });
  const payload=await res.json().catch(()=>({ok:false,error:"Registry response could not be read"}));
  if(!res.ok||payload?.ok===false){
    throw new Error(payload?.error||"Unable to save stock registry");
  }
  registryStatus(`Registry saved with ${payload.count} entr${payload.count===1?"y":"ies"}.`);
  const btn=document.getElementById("saveRegistryBtn");
  if(btn){btn.classList.remove("has-changes");btn.textContent="Save registry";}
}

function upsertRegistryEntry(){
  if(registryMultiSelectEnabled() && (state.registryEditingIndex===null||state.registryEditingIndex===undefined) && normalizedRegistrySelectedTickers(state.registrySelectedMasterTickers).length){
    addSelectedMasterStocksToRegistry();
    return;
  }
  const entry=registryFormValues();
  if(!entry.stock_name||!entry.ticker){
    registryStatus("Stock name and ticker are required.");
    return;
  }
  if(entry.is_index){
    entry.run_analysis=false;
  }
  const duplicateIndex=(state.registryEntries||[]).findIndex((item,idx)=>
    idx!==state.registryEditingIndex &&
    String(item.ticker||"").toUpperCase()===entry.ticker.toUpperCase()
  );
  if(duplicateIndex>=0){
    registryStatus(`Ticker already exists: ${entry.ticker}`);
    return;
  }
  if(!Array.isArray(state.registryEntries))state.registryEntries=[];
  if(state.registryEditingIndex===null||state.registryEditingIndex===undefined){
    state.registryEntries.push(entry);
    registryStatus(`Added ${entry.ticker} to the registry draft.`);
  }else{
    state.registryEntries[state.registryEditingIndex]=entry;
    registryStatus(`Updated ${entry.ticker} in the registry draft.`);
  }
  markRegistryChanged();
  renderRegistryTable();
  resetRegistryForm();
}

function editRegistryEntry(index){
  const entry=(state.registryEntries||[])[index];
  if(!entry)return;
  state.registrySelectedMasterTickers=[];
  const matchedMaster=(state.masterStocks||[]).find(item=>(item.ticker||"").toUpperCase()===(entry.ticker||"").toUpperCase());
  const masterInput=document.getElementById("registryMasterStock");
  if(masterInput)masterInput.value=matchedMaster?masterStockLabel(matchedMaster):"";
  document.getElementById("registryStockName").value=entry.stock_name||"";
  document.getElementById("registryTicker").value=entry.ticker||"";
  document.getElementById("registrySector").value=(matchedMaster?.sector||"");
  document.getElementById("registryRunAnalysis").checked=entry.run_analysis!==false;
  document.getElementById("registryIsIndex").checked=!!entry.is_index;
  state.registryEditingIndex=index;
  updateRegistryMultiSelectUI();
  registryStatus(`Editing ${entry.ticker}. Save the entry, then save the registry file.`);
}

function removeRegistryEntry(index){
  const entry=(state.registryEntries||[])[index];
  if(!entry)return;
  if(!confirm(`Remove "${entry.stock_name}" from the registry?`))return;
  state.registryEntries.splice(index,1);
  markRegistryChanged();
  renderRegistryTable();
  if(state.registryEditingIndex===index)resetRegistryForm();
  registryStatus(`Removed ${entry.ticker} from the registry draft.`);
}

async function toggleRegistryActive(index){
  const entry=(state.registryEntries||[])[index];
  if(!entry||entry.is_index)return;
  const nowActive=entry.active!==false;
  if(nowActive){entry.active=false;}else{delete entry.active;}
  renderRegistryTable();
  try{
    await saveRegistryEntries();
    registryStatus(`${entry.ticker} is now ${entry.active===false?"monitoring only (hidden from dashboard)":"active (shown in dashboard)"}.`);
  }catch(err){
    registryStatus(`Save failed: ${err.message}`);
  }
}

/* ?? GROUPED STOCK PANELS ?????????????????????????????????????????????? */
function groupedStockData(){
  const api=window.DividendGroupedStocks;
  if(!api||typeof api.buildGroupedStockView!=="function")return null;
  try{return api.buildGroupedStockView(activeStockList().map(s=>s.data))}
  catch(err){console.warn("Grouped stock view failed",err);return null}
}

function stockKeyByTicker(ticker){
  const hit=stockList().find(s=>(s.data.meta?.ticker||s.key)===ticker);
  return hit?hit.key:null
}

function groupedDecisionLine(item,type){
  const metrics=item.metrics||{};
  if(metrics.finalVerdict){
    return `Current verdict: ${metrics.finalVerdict}. ${metrics.finalVerdictReason||""}`.trim();
  }
  if(type==="upcoming"){
    if(metrics.entryStatus==="INSIDE") return "Decision: watch now because price is already in the preferred entry zone.";
    if(metrics.entryStatus==="ABOVE" && readNumber(metrics.priceVsZone?.distancePct,9999)<=3) return "Decision: watch now because price is close to the entry zone.";
    if(metrics.currentPrice!=null && metrics.estExDivPx!=null){
      return `Decision: keep on watch because current price is ${pctRaw(((metrics.currentPrice/metrics.estExDivPx)-1)*100,1)} versus the projected ex-div anchor.`;
    }
    if(readNumber(metrics.daysToExDiv)!=null) return `Decision: keep on watch because the next dividend cycle is ${metrics.daysToExDiv} days away.`;
    return "Decision: keep on watch because this potential stock has a live near-term setup condition.";
  }
  const parts=[];
  if(metrics.winRateNext!=null) parts.push(`${pctRaw(metrics.winRateNext,0)} win rate`);
  if(metrics.cleanCycles!=null) parts.push(`${metrics.cleanCycles} clean cycles`);
  if(metrics.yearsData!=null) parts.push(`${n(metrics.yearsData,1)}y history`);
  if(!parts.length) return "Decision: included because its historical dividend-cycle profile passed the structural filter.";
  return `Decision: included because its structural profile passed the filter with ${parts.slice(0,3).join(', ')}.`;
}

function groupedWhyIncludedLine(values,type){
  if(!Array.isArray(values)||!values.length)return "";
  const prefix=type==="upcoming"?"Why watch":"Why included";
  return `<div class="small muted" style="margin-top:10px;line-height:1.55"><strong style="color:var(--tx)">${prefix}:</strong> ${esc(values[0])}</div>`
}

function groupedDecisionSummary(item,type){
  return `<div class="small" style="margin-top:10px;line-height:1.55;color:#cfd7ec">${esc(groupedDecisionLine(item,type))}</div>`
}

function groupedWarningLine(values){
  if(!Array.isArray(values)||!values.length)return "";
  return `<div class="small" style="margin-top:8px;color:var(--am);line-height:1.5"><strong style="color:var(--am)">Main caution:</strong> ${esc(values[0])}</div>`
}

function verdictPill(label,tone){
  const cls=tone==="good"?"good":tone==="warn"?"warn":tone==="bad"?"bad":"";
  return `<span class="chip ${cls}" style="font-size:10px">${esc(label||"-")}</span>`
}

function groupedMetric(label,value){
  return `<div class="mini-stat"><span class="ms-label">${esc(label)}: </span>${value}</div>`
}

function groupedDualMetric(labelA,valueA,labelB,valueB){
  return `<div class="mini-stat wide"><div class="mini-inline-grid"><span class="segment"><span class="ms-label">${esc(labelA)}: </span>${valueA}</span><span class="segment"><span class="ms-label">${esc(labelB)}: </span>${valueB}</span></div></div>`
}
function plannerExitModeChipLabel(label){
  if(!label) return "-";
  if(label === "Pre-Exdiv Peak Exit preferred") return "Pre-Exdiv Exit preferred";
  if(label === "Ex-Div Date Exit preferred") return "Ex-Div Exit preferred";
  return label;
}
function setupMapVerdictFill(tone){
  const fills={good:"#3ed9a0",warn:"#f5c542",bad:"#f07070",pu:"#a78bfa",muted:"#7a829a"};
  return fills[tone]||fills.muted;
}
function growthCls(v){return v==null?"":v>=15?"good":v>=0?"warn":"bad"}
function growthFmt(v){if(v==null)return"-";return(v>=0?"+":"")+v.toFixed(1)+"%"}
function growthColor(v){return v==null?"var(--mu)":v>=15?"var(--hit)":v>=0?"var(--warn)":"var(--miss)"}
function projectionWindowStart(proj){
  const dates=["est_low_date_cluster1","est_low_date_cluster2","est_low_date"]
    .map(key=>proj?.[key])
    .filter(Boolean)
    .map(v=>new Date(v))
    .filter(d=>!Number.isNaN(d.getTime()))
    .sort((a,b)=>a-b);
  return dates[0]||null;
}
function seriesExpectedGainPct(proj){
  const base=proj?.scenarios?.base;
  const entry=readNumber(base?.entry_px);
  const exitPx=readNumber(base?.exit_px);
  if(entry!=null&&exitPx!=null&&entry>0)return ((exitPx-entry)/entry)*100;
  return readNumber(proj?.historical_frequencies?.avg_win_pct);
}
function zoneOutcomeFill(outcome){
  const fills={"Above zone":"#6ba8ff","Inside zone":"#3ed9a0","Below zone":"#f07070"};
  return fills[outcome]||"#7a829a";
}
function pctShare(part,total){
  if(!total)return "0.0%";
  return `${((part/total)*100).toFixed(1)}%`;
}
function recentOutcomeCycleLimit(frequency){
  const map={QUARTERLY:4,SEMI_ANNUAL:3,ANNUAL:2,MONTHLY:6,IRREGULAR:3};
  return map[frequency]||3;
}
function cycleFlagTrue(value){
  return value===true||value==="True"||value==="TRUE";
}
function cycleFlagFalse(value){
  return value===false||value==="False"||value==="FALSE";
}
function buildCurrentZoneOutcomeItems(){
  return activeStockList().map(s=>{
    const up=upcomingSeries(s.data);
    if(!up?.proj)return null;
    const start=projectionWindowStart(up.proj);
    const zoneBot=readNumber(up.proj.zone_bot);
    const zoneTop=readNumber(up.proj.zone_top);
    if(!start||zoneBot==null||zoneTop==null||zoneBot<=0||zoneTop<=0||zoneTop<zoneBot)return null;
    const prices=(s.data?.price_data||[])
      .map(p=>({date:new Date(p?.d),close:readNumber(p?.c)}))
      .filter(p=>!Number.isNaN(p.date.getTime())&&p.close!=null)
      .sort((a,b)=>a.date-b.date);
    if(!prices.length)return null;
    const latest=prices[prices.length-1];
    if(start>latest.date)return null;
    const postStart=prices.filter(p=>p.date>=start);
    if(!postStart.length)return null;
    const actualMinEntry=postStart.reduce((min,p)=>p.close<min.close?p:min,postStart[0]);
    let zonePosition=0.5;
    if(actualMinEntry.close<zoneBot)zonePosition=-((zoneBot-actualMinEntry.close)/zoneBot);
    else if(actualMinEntry.close>zoneTop)zonePosition=1+((actualMinEntry.close-zoneTop)/zoneTop);
    else if(zoneTop>zoneBot)zonePosition=(actualMinEntry.close-zoneBot)/(zoneTop-zoneBot);
    const zoneOutcome=actualMinEntry.close<zoneBot?"Below zone":actualMinEntry.close>zoneTop?"Above zone":"Inside zone";
    const expectedGainPct=seriesExpectedGainPct(up.proj);
    const actualReboundPct=actualMinEntry.close>0?((latest.close-actualMinEntry.close)/actualMinEntry.close)*100:null;
    const strengthDeltaPct=(actualReboundPct!=null&&expectedGainPct!=null)?actualReboundPct-expectedGainPct:null;
    const performanceLabel=
      strengthDeltaPct==null?"Unknown":
      strengthDeltaPct>1?"Overperformed vs expected":
      strengthDeltaPct<-1?"Underperformed vs expected":
      "Near expected";
    return {
      key:s.key,
      ticker:s.data?.meta?.ticker||s.key,
      stockName:s.data?.meta?.stock_name||"",
      series:up.id,
      startDate:start,
      actualMinClose:actualMinEntry.close,
      actualMinDate:actualMinEntry.date,
      latestClose:latest.close,
      latestDate:latest.date,
      zoneBot,
      zoneTop,
      zoneOutcome,
      zonePosition,
      expectedGainPct,
      actualReboundPct,
      strengthDeltaPct,
      performanceLabel,
    };
  }).filter(Boolean);
}
function buildRecentZoneOutcomeItems(){
  return activeStockList().flatMap(s=>{
    const up=upcomingSeries(s.data);
    if(!up?.proj||!up?.id)return [];
    const estExDivPx=readNumber(up.proj.est_exdiv_px);
    const zoneBot=readNumber(up.proj.zone_bot);
    const zoneTop=readNumber(up.proj.zone_top);
    if(estExDivPx==null||zoneBot==null||zoneTop==null||estExDivPx<=0||zoneBot<=0||zoneTop<=0) return [];
    const lowBandPct=((zoneBot/estExDivPx)-1)*100;
    const highBandPct=((zoneTop/estExDivPx)-1)*100;
    const expectedGainPct=seriesExpectedGainPct(up.proj);
    const cycles=(s.data?.cycles||[])
      .filter(c=>c?.series===up.id)
      .filter(c=>!cycleFlagTrue(c?.incomplete))
      .filter(c=>!cycleFlagTrue(c?.macro))
      .filter(c=>cycleFlagFalse(c?.outlier))
      .sort((a,b)=>new Date(b.exdiv_date)-new Date(a.exdiv_date))
      .slice(0,recentOutcomeCycleLimit(s.data?.meta?.frequency));
    return cycles.map(cycle=>{
      const lowPct=readNumber(cycle.low_vs_prevdp);
      const peakPct=readNumber(cycle.peak_vs_prevdp);
      if(lowPct==null||peakPct==null)return null;
      let zonePosition=0.5;
      if(lowPct<lowBandPct) zonePosition=-((lowBandPct-lowPct)/Math.abs(lowBandPct||1));
      else if(lowPct>highBandPct) zonePosition=1+((lowPct-highBandPct)/Math.abs(highBandPct||1));
      else if(highBandPct>lowBandPct) zonePosition=(lowPct-lowBandPct)/(highBandPct-lowBandPct);
      const zoneOutcome=lowPct<lowBandPct?"Below zone":lowPct>highBandPct?"Above zone":"Inside zone";
      const strengthDeltaPct=expectedGainPct!=null?peakPct-expectedGainPct:null;
      const performanceLabel=
        strengthDeltaPct==null?"Unknown":
        strengthDeltaPct>1?"Overperformed vs expected":
        strengthDeltaPct<-1?"Underperformed vs expected":
        "Near expected";
      return {
        key:s.key,
        ticker:s.data?.meta?.ticker||s.key,
        stockName:s.data?.meta?.stock_name||"",
        series:up.id,
        cycleId:cycle.id,
        exdivDate:new Date(cycle.exdiv_date),
        zoneBot,
        zoneTop,
        zoneOutcome,
        zonePosition,
        expectedGainPct,
        actualReboundPct:peakPct,
        strengthDeltaPct,
        performanceLabel,
        actualMinClose:readNumber(cycle.low_px),
        actualMinDate:new Date(cycle.low_date),
        lowVsPrevDpPct:lowPct,
        latestClose:null,
        latestDate:null,
      };
    }).filter(Boolean);
  });
}
function buildZoneOutcomeItems(mode="current"){
  return mode==="recent" ? buildRecentZoneOutcomeItems() : buildCurrentZoneOutcomeItems();
}
function zoneOutcomeFilterControl(items){
  const options=activeStockList().map(s=>({
    value:s.key,
    label:`${s.data?.meta?.ticker||s.key}${s.data?.meta?.stock_name?` · ${s.data.meta.stock_name}`:""}`
  }));
  const availableValues=new Set(options.map(o=>o.value));
  const rawSelected=Array.isArray(state.zoneOutcomeFilterKeys)?state.zoneOutcomeFilterKeys:["all"];
  const selected=rawSelected.filter(v=>v==="all"||availableValues.has(v));
  state.zoneOutcomeFilterKeys=rawSelected.length===0 ? [] : (selected.length?selected:["all"]);
  const selectedKeys=state.zoneOutcomeFilterKeys.includes("all") ? options.map(opt=>opt.value) : state.zoneOutcomeFilterKeys;
  const allSelected=state.zoneOutcomeFilterKeys.includes("all")||selectedKeys.length===options.length;
  const selectedLabels=allSelected
    ? "All stocks"
    : !selectedKeys.length
      ? "None"
      : selectedKeys.length===1
        ? options.find(opt=>opt.value===selectedKeys[0])?.label.split(" · ")[0] || "1 stock"
        : `${selectedKeys.length} stocks`;
  return `<div class="stock-selector" style="margin:0 0 12px"><span class="small muted">Show</span><div class="check-filter"><button type="button" class="check-filter-btn" id="zoneOutcomeFilterBtn">${esc(selectedLabels||"Choose stocks")}</button><div class="check-filter-menu" id="zoneOutcomeFilterMenu" style="display:none"><div class="check-filter-actions"><button type="button" class="check-filter-link" data-zonefilter-action="all">All</button><button type="button" class="check-filter-link" data-zonefilter-action="none">None</button></div><label class="check-filter-item"><input type="checkbox" data-zonefilter-all ${allSelected?"checked":""}> All stocks</label>${options.map(opt=>`<label class="check-filter-item"><input type="checkbox" data-zonefilter-item="${esc(opt.value)}" ${allSelected||state.zoneOutcomeFilterKeys.includes(opt.value)?"checked":""}> ${esc(opt.label)}</label>`).join("")}</div></div><button type="button" class="btn" id="zoneOutcomeFilterApply" style="font-size:11px;padding:6px 12px">Apply</button></div>`;
}
function setupMapFilterControl(items){
  const options=activeStockList().map(s=>({
    value:s.key,
    label:`${s.data?.meta?.ticker||s.key}${s.data?.meta?.stock_name?` · ${s.data.meta.stock_name}`:""}`
  }));
  const availableValues=new Set(options.map(o=>o.value));
  const rawSelected=Array.isArray(state.setupMapFilterKeys)?state.setupMapFilterKeys:["all"];
  const selected=rawSelected.filter(v=>v==="all"||availableValues.has(v));
  state.setupMapFilterKeys=rawSelected.length===0 ? [] : (selected.length?selected:["all"]);
  const selectedKeys=state.setupMapFilterKeys.includes("all") ? options.map(opt=>opt.value) : state.setupMapFilterKeys;
  const allSelected=state.setupMapFilterKeys.includes("all")||selectedKeys.length===options.length;
  const selectedLabels=allSelected
    ? "All stocks"
    : !selectedKeys.length
      ? "None"
      : selectedKeys.length===1
        ? options.find(opt=>opt.value===selectedKeys[0])?.label.split(" · ")[0] || "1 stock"
        : `${selectedKeys.length} stocks`;
  return `<div class="stock-selector" style="margin:0 0 12px"><span class="small muted">Show</span><div class="check-filter"><button type="button" class="check-filter-btn" id="setupMapFilterBtn">${esc(selectedLabels||"Choose stocks")}</button><div class="check-filter-menu" id="setupMapFilterMenu" style="display:none"><input class="cfm-search" type="text" placeholder="Filter stocks…" autocomplete="off"><div class="check-filter-actions"><button type="button" class="check-filter-link" data-setupfilter-action="all">All</button><button type="button" class="check-filter-link" data-setupfilter-action="none">None</button></div><label class="check-filter-item"><input type="checkbox" data-setupfilter-all ${allSelected?"checked":""}> All stocks</label>${options.map(opt=>`<label class="check-filter-item"><input type="checkbox" data-setupfilter-item="${esc(opt.value)}" ${allSelected||state.setupMapFilterKeys.includes(opt.value)?"checked":""}> ${esc(opt.label)}</label>`).join("")}</div></div><button type="button" class="btn" id="setupMapFilterApply" style="font-size:11px;padding:6px 12px">Apply</button></div>`;
}
function buildSetupMapItems(){
  return activeStockList().map(s=>{
    const metrics=normalizeStock(s.data,{});
    const low=readNumber(metrics.entryZoneLow);
    const high=readNumber(metrics.entryZoneHigh);
    const current=readNumber(metrics.currentPrice);
    const gain=readNumber(metrics.possibleGainPct);
    if(current==null||low==null||high==null||gain==null||low<=0||high<=0||high<low) return null;
    let zonePosition=0.5;
    if(current<low) zonePosition=-((low-current)/low);
    else if(current>high) zonePosition=1+((current-high)/high);
    else if(high>low) zonePosition=(current-low)/(high-low);
    const verdict=getFinalVerdict(metrics);
    return {
      key:s.key,
      ticker:metrics.ticker||s.key,
      stockName:metrics.stockName||s.data?.meta?.stock_name||"",
      zonePosition,
      possibleGainPct:gain,
      tailRiskLevel:metrics.tailRiskLevel||metrics.tailRisk,
      tailRiskDisplay:metrics.tailRiskDisplay||"-",
      finalVerdict:verdict.label,
      finalVerdictTone:verdict.tone,
      currentPrice:current,
      entryZoneLow:low,
      entryZoneHigh:high,
      growth5yr:s.data?.meta?.price_growth_5yr_pct??null,
    };
  }).filter(Boolean);
}
function setupMapListView(items){
  const sortMap=state.setupListSort||{};
  const defaultSrt={field:"gain",dir:"desc"};
  const groups=[
    {key:"below",label:"Below Zone",cls:"below",test:i=>i.zonePosition<0},
    {key:"inside",label:"Inside Zone",cls:"inside",test:i=>i.zonePosition>=0&&i.zonePosition<=1},
    {key:"above",label:"Above Zone",cls:"above",test:i=>i.zonePosition>1},
  ];
  const cols=groups.map(g=>{
    const srt=sortMap[g.key]||defaultSrt;
    function sortedRows(rows){
      return [...rows].sort((a,b)=>{
        let av,bv;
        if(srt.field==="ticker"){av=a.ticker;bv=b.ticker;}
        else if(srt.field==="name"){av=a.stockName;bv=b.stockName;}
        else if(srt.field==="growth5yr"){av=a.growth5yr;bv=b.growth5yr;}
        else{av=a.possibleGainPct;bv=b.possibleGainPct;}
        if(av==null&&bv==null)return 0;
        if(av==null)return 1;
        if(bv==null)return -1;
        if(typeof av==="string")return srt.dir==="asc"?av.localeCompare(bv):bv.localeCompare(av);
        return srt.dir==="asc"?av-bv:bv-av;
      });
    }
    function shCell(field,label,cls,style){
      const active=srt.field===field;
      const arrow=active?(srt.dir==="asc"?"↑":"↓"):"↕";
      return `<span class="sh-sort${active?" sorted":""}${cls?" "+cls:""}" data-sort-field="${field}" data-sort-zone="${g.key}"${style?` style="${style}"`:""}>${label}<span class="sort-arrow">${arrow}</span></span>`;
    }
    const rows=sortedRows(items.filter(g.test));
    const rowsHtml=rows.length
      ? rows.map(item=>{
          const gainColor=item.possibleGainPct>=5?"var(--hit)":item.possibleGainPct>=2?"var(--warn)":"var(--mu)";
          return `<div class="setup-list-row" data-key="${esc(item.key)}">
            <span class="setup-list-dot" style="background:${setupMapVerdictFill(item.finalVerdictTone)}"></span>
            <span class="setup-list-ticker">${esc(item.ticker)}</span>
            <span class="setup-list-name">${esc(item.stockName)}</span>
            <span style="font-size:10px;font-family:var(--mono);color:${growthColor(item.growth5yr)};white-space:nowrap">${growthFmt(item.growth5yr)}</span>
            <span class="setup-list-gain" style="color:${gainColor}">${n(item.possibleGainPct,1)}%</span>
          </div>`;
        }).join("")
      : `<div style="padding:14px;font-size:12px;color:var(--mu)">None</div>`;
    return `<div class="setup-list-col">
      <div class="setup-list-col-head ${g.cls}">${g.label}<span class="col-count">${rows.length}</span></div>
      <div class="setup-list-col-subhead">
        <span style="width:8px;flex-shrink:0"></span>
        ${shCell("ticker","Ticker","","min-width:52px")}
        ${shCell("name","Name","sh-name")}
        ${shCell("growth5yr","5yr","sh-num")}
        ${shCell("gain","Gain","sh-num")}
      </div>
      <div class="setup-list-col-rows">${rowsHtml}</div>
    </div>`;
  }).join("");
  return `<div class="setup-list-cols">${cols}</div>`;
}

function panelSetupMap(){
  const allItems=buildSetupMapItems();
  const filterControl=setupMapFilterControl(allItems);
  const activeKeys=(Array.isArray(state.setupMapFilterKeys)?state.setupMapFilterKeys:["all"]);
  const items=activeKeys.includes("all")
    ? allItems
    : allItems.filter(item=>activeKeys.includes(item.key));
  const viewMode=state.setupMapViewMode||"map";
  const viewToggle=`<div class="view-seg" style="margin:0 0 12px"><button class="view-seg-btn${viewMode==="map"?" active":""}" id="setupMapViewMap">Map</button><button class="view-seg-btn${viewMode==="list"?" active":""}" id="setupMapViewList">List</button></div>`;
  if(!items.length)return `<div class="panel"><h2>Setup Map</h2>${viewToggle}${filterControl}<div class="empty">No stocks are selected for this chart.</div></div>`;
  if(viewMode==="list")return `<div class="panel"><h2>Setup Map</h2>${viewToggle}${filterControl}${setupMapListView(items)}</div>`;
  const width=980,height=360;
  const margin={top:26,right:26,bottom:68,left:68};
  const plotW=width-margin.left-margin.right;
  const plotH=height-margin.top-margin.bottom;
  const xValues=items.map(i=>i.zonePosition);
  const yValues=items.map(i=>i.possibleGainPct);
  const xMin=Math.min(-0.18,Math.min(...xValues)-0.04);
  const xMax=Math.max(1.18,Math.max(...xValues)+0.04);
  const yMax=Math.max(8,Math.ceil(Math.max(...yValues)/2)*2);
  const xPx=v=>margin.left+((v-xMin)/(xMax-xMin))*plotW;
  const yPx=v=>margin.top+plotH-(v/yMax)*plotH;
  const yTicks=[0,0.25,0.5,0.75,1].map(r=>round(yMax*r,1));
  const bandX=Math.max(margin.left,Math.min(margin.left+plotW,xPx(0)));
  const bandW=Math.max(0,Math.min(margin.left+plotW,xPx(1))-bandX);
  const yGrid=yTicks.map(v=>{
    const y=yPx(v);
    return `<g><line x1="${margin.left}" y1="${n(y,1)}" x2="${margin.left+plotW}" y2="${n(y,1)}" stroke="rgba(255,255,255,.06)" stroke-dasharray="4 6"></line><text class="setup-map-value-label" x="${margin.left-10}" y="${n(y+4,1)}" text-anchor="end">${n(v,0)}%</text></g>`;
  }).join("");
  const points=items.map((item,idx)=>{
    const cx=xPx(item.zonePosition);
    const cy=yPx(item.possibleGainPct);
    const labelPos=scatterLabelPlacement(cx,cy,idx,{left:margin.left,right:margin.left+plotW,top:margin.top,bottom:margin.top+plotH});
    const tipMeta=esc(JSON.stringify({
      ticker:item.ticker,
      stockName:item.stockName,
      verdict:item.finalVerdict,
      tailRisk:item.tailRiskDisplay,
      possibleGain:`${n(item.possibleGainPct,1)}%`,
      zone:`${n(item.entryZoneLow,4)} - ${n(item.entryZoneHigh,4)}`
    }));
    return `<g class="setup-map-point" data-key="${esc(item.key)}" data-meta="${tipMeta}" tabindex="0"><circle cx="${n(cx,1)}" cy="${n(cy,1)}" r="7" fill="${setupMapVerdictFill(item.finalVerdictTone)}" stroke="none"></circle><text class="setup-map-point-label" x="${n(labelPos.x,1)}" y="${n(labelPos.y,1)}" text-anchor="${labelPos.anchor}">${esc(item.ticker)}</text></g>`;
  }).join("");
  return `<div class="panel"><h2>Setup Map</h2>${viewToggle}<p class="small muted" style="margin:0 0 12px">Each point is one loaded stock. Left means price is below the projected zone, the shaded band is inside the zone, and right means price is above it. Higher points have higher possible next-cycle gain.</p>${filterControl}<div class="setup-map-shell"><div class="setup-map-stage"><svg class="setup-map-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Scatter plot of price position versus possible gain"><rect x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" rx="12" fill="rgba(255,255,255,.015)" stroke="rgba(255,255,255,.05)"></rect><rect x="${n(bandX,1)}" y="${margin.top}" width="${n(bandW,1)}" height="${plotH}" fill="rgba(79,142,247,.10)"></rect>${yGrid}<line x1="${margin.left}" y1="${margin.top+plotH}" x2="${margin.left+plotW}" y2="${margin.top+plotH}" stroke="rgba(255,255,255,.12)"></line><line x1="${n(xPx(0),1)}" y1="${margin.top}" x2="${n(xPx(0),1)}" y2="${margin.top+plotH}" stroke="rgba(255,255,255,.1)" stroke-dasharray="4 6"></line><line x1="${n(xPx(1),1)}" y1="${margin.top}" x2="${n(xPx(1),1)}" y2="${margin.top+plotH}" stroke="rgba(255,255,255,.1)" stroke-dasharray="4 6"></line><text class="setup-map-band-label" x="${n(bandX+bandW/2,1)}" y="${margin.top+16}" text-anchor="middle">Projected entry zone</text>${points}<text class="setup-map-axis-label" x="${n((margin.left+xPx(0))/2,1)}" y="${height-18}" text-anchor="middle">Below zone</text><text class="setup-map-axis-label" x="${n((xPx(0)+xPx(1))/2,1)}" y="${height-18}" text-anchor="middle">Inside zone</text><text class="setup-map-axis-label" x="${n((xPx(1)+margin.left+plotW)/2,1)}" y="${height-18}" text-anchor="middle">Above zone</text><text class="setup-map-axis-label" x="16" y="${margin.top-6}">Possible gain</text></svg><div class="tooltip" id="setupMapTip"></div></div><div class="setup-map-legend"><span><i style="background:#3ed9a0"></i>Actionable now</span><span><i style="background:#f5c542"></i>Watch or small trades advised</span><span><i style="background:#a78bfa"></i>Watch only</span><span><i style="background:#7a829a"></i>On radar</span><span><i style="background:#f07070"></i>Too risky</span></div><div class="setup-map-note">All visible stocks are labelled here. Hover still gives the full detail for every stock, then click any point to drill in.</div></div></div>`
}
function panelZoneOutcomeMap(){
  const mode=state.zoneOutcomeMode||"current";
  const allItems=buildZoneOutcomeItems(mode);
  const filterControl=zoneOutcomeFilterControl(allItems);
  const activeKeys=(Array.isArray(state.zoneOutcomeFilterKeys)?state.zoneOutcomeFilterKeys:["all"]);
  const items=activeKeys.includes("all")
    ? allItems
    : allItems.filter(item=>activeKeys.includes(item.key));
  if(!items.length)return `<div class="panel"><h2>Zone Outcome Map</h2>${mode==="current"?`<div class="tabs" style="margin:0 0 12px"><button class="tab active" id="zoneOutcomeCurrent">Current cycle</button><button class="tab" id="zoneOutcomeRecent">Recent completed cycles (same series)</button></div>`:`<div class="tabs" style="margin:0 0 12px"><button class="tab" id="zoneOutcomeCurrent">Current cycle</button><button class="tab active" id="zoneOutcomeRecent">Recent completed cycles (same series)</button></div>`}${filterControl}<div class="empty">No stocks are selected for this chart.</div></div>`;
  const width=980,height=390;
  const margin={top:28,right:26,bottom:74,left:72};
  const plotW=width-margin.left-margin.right;
  const plotH=height-margin.top-margin.bottom;
  const xValues=items.map(i=>i.zonePosition);
  const yValues=items.map(i=>i.strengthDeltaPct).filter(v=>v!=null);
  const xMin=Math.min(-0.18,Math.min(...xValues)-0.04);
  const xMax=Math.max(1.18,Math.max(...xValues)+0.04);
  const maxAbsY=Math.max(6,...yValues.map(v=>Math.abs(v)));
  const yLimit=Math.ceil(maxAbsY/5)*5;
  const xPx=v=>margin.left+((v-xMin)/(xMax-xMin))*plotW;
  const yPx=v=>margin.top+plotH-(((v+yLimit)/(2*yLimit))*plotH);
  const yTicks=[-yLimit,-yLimit/2,0,yLimit/2,yLimit];
  const xTicks=[xMin,0,0.5,1,xMax]
    .filter((v,idx,arr)=>arr.findIndex(x=>Math.abs(x-v)<0.02)===idx)
    .sort((a,b)=>a-b);
  const bandX=Math.max(margin.left,Math.min(margin.left+plotW,xPx(0)));
  const bandW=Math.max(0,Math.min(margin.left+plotW,xPx(1))-bandX);
  const yGrid=yTicks.map(v=>{
    const y=yPx(v);
    return `<g><line x1="${margin.left}" y1="${n(y,1)}" x2="${margin.left+plotW}" y2="${n(y,1)}" stroke="${v===0?"rgba(255,255,255,.16)":"rgba(255,255,255,.06)"}" stroke-dasharray="${v===0?"":"4 6"}"></line><text class="setup-map-value-label" x="${margin.left-10}" y="${n(y+4,1)}" text-anchor="end">${v>0?"+":""}${n(v,0)}%</text></g>`;
  }).join("");
  const xGrid=xTicks.map(v=>{
    const x=xPx(v);
    return `<g><line x1="${n(x,1)}" y1="${margin.top+plotH}" x2="${n(x,1)}" y2="${margin.top+plotH+6}" stroke="rgba(255,255,255,.12)"></line><text class="setup-map-value-label" x="${n(x,1)}" y="${height-34}" text-anchor="middle">${n(v*100,0)}%</text></g>`;
  }).join("");
  const points=items.map((item,idx)=>{
    const cx=xPx(item.zonePosition);
    const cy=yPx(item.strengthDeltaPct||0);
    const labelPos=scatterLabelPlacement(cx,cy,idx,{left:margin.left,right:margin.left+plotW,top:margin.top,bottom:margin.top+plotH});
    const tipMeta=esc(JSON.stringify({
      ticker:item.ticker,
      stockName:item.stockName,
      series:item.series,
      cycleId:item.cycleId||"",
      exdiv:item.exdivDate?dt(item.exdivDate):"",
      zoneOutcome:item.zoneOutcome,
      actualMin:`${n(item.actualMinClose,4)} on ${dt(item.actualMinDate)}`,
      actualMinLabel:item.cycleId?"Cycle low":`Min close since ${dt(item.startDate)}`,
      zone:`${n(item.zoneBot,4)} - ${n(item.zoneTop,4)}`,
      start:`${dt(item.startDate)}`,
      rebound:`${pctRaw(item.actualReboundPct,1)}`,
      expected:`${pctRaw(item.expectedGainPct,1)}`,
      delta:`${item.strengthDeltaPct>0?"+":""}${pctRaw(item.strengthDeltaPct,1)}`,
      performance:item.performanceLabel
    }));
    return `<g class="zone-outcome-point" data-key="${esc(item.key)}" data-meta="${tipMeta}" tabindex="0"><circle cx="${n(cx,1)}" cy="${n(cy,1)}" r="7" fill="${zoneOutcomeFill(item.zoneOutcome)}" stroke="none"></circle><text class="setup-map-point-label secondary" x="${n(labelPos.x,1)}" y="${n(labelPos.y,1)}" text-anchor="${labelPos.anchor}">${esc(item.ticker)}</text></g>`;
  }).join("");
  const aboveCount=items.filter(i=>i.zoneOutcome==="Above zone").length;
  const insideCount=items.filter(i=>i.zoneOutcome==="Inside zone").length;
  const belowCount=items.filter(i=>i.zoneOutcome==="Below zone").length;
  const reachedCount=insideCount+belowCount;
  const overperfItems=items.filter(i=>i.performanceLabel==="Overperformed vs expected");
  const overperfAbove=overperfItems.filter(i=>i.zoneOutcome==="Above zone").length;
  const overperfTouched=overperfItems.filter(i=>i.zoneOutcome!=="Above zone").length;
  const modeToggle=`<div class="tabs" style="margin:0 0 12px"><button class="tab ${mode==="current"?"active":""}" id="zoneOutcomeCurrent">Current cycle</button><button class="tab ${mode==="recent"?"active":""}" id="zoneOutcomeRecent">Recent completed cycles (same series)</button></div>`;
  const intro=mode==="recent"
    ? `Each point uses recent completed cycles from the same series as the nearest next projection. Quarterly, annual, and semi-annual names are handled by cycle count, not by one fixed calendar range. Left means the cycle pushed below the normalized zone band, the shaded band means it landed inside that band, and right means it stayed above it. The x-axis shows zone position as a percentage of the band: 0% is zone bottom and 100% is zone top. Higher points beat the model's mid expected gain by more; lower points lagged it.`
    : `Each point uses the nearest next projected series whose estimated low window has already started. Left means the cycle pushed below the zone, the shaded band means it touched the zone, and right means it stayed above the zone. Higher points rebounded more strongly than the model's mid expected gain; lower points lagged it.`;
  const foot=mode==="recent"
    ? `This recent-past mode uses completed cycles from the same series and compares each cycle's actual low-vs-anchor dip to the current series' normalized projected zone band. It is a practical consistency check rather than a perfect historical replay. Overperformance still does not automatically mean the zone was missed: right now ${overperfItems.length?`${overperfAbove} of ${overperfItems.length}`:"0 of 0"} overperforming recent cycles stayed above the zone, while ${overperfItems.length?overperfTouched:0} still touched or entered it.`
    : `This is a live sanity check, not a final ex-post audit. It uses the minimum weekly close from the loaded JSON price history after the estimated low-window start, then compares the rebound from that close to the model's mid expected gain. Overperformance does not automatically mean the zone was missed: right now ${overperfItems.length?`${overperfAbove} of ${overperfItems.length}`:"0 of 0"} overperforming cycles stayed above the zone, while ${overperfItems.length?overperfTouched:0} still touched or entered it.`;
  const keypoints=(mode==="recent"
    ? [
        `In recent completed cycles from the same series, <strong>${pctShare(reachedCount,items.length)}</strong> still reached or went through the zone, while <strong>${pctShare(aboveCount,items.length)}</strong> stayed above it. This suggests the zone is still useful, but some stocks may stay above it.`,
        overperfItems.length
          ? `Among cycles that <strong>overperformed vs expected</strong>, <strong>${pctShare(overperfAbove,overperfItems.length)}</strong> still stayed above the zone and <strong>${pctShare(overperfTouched,overperfItems.length)}</strong> still touched or entered it. Strong cycles explain some misses, but not all of them.`
          : `No recent completed cycles are currently classified as overperforming vs expected in this loaded set.`,
        `Use the x-axis as a zone-position scale: <strong>0% = projected zone bottom</strong>, <strong>100% = projected zone top</strong>. Below 0% means the cycle pushed under the zone; above 100% means it never got down into it.`
      ]
    : [
        `For the live current-cycle check, <strong>${pctShare(reachedCount,items.length)}</strong> of testable setups have already reached or gone through the zone, while <strong>${pctShare(aboveCount,items.length)}</strong> are still above it.`,
        overperfItems.length
          ? `Among current cycles that <strong>overperformed vs expected</strong>, <strong>${pctShare(overperfAbove,overperfItems.length)}</strong> still stayed above the zone and <strong>${pctShare(overperfTouched,overperfItems.length)}</strong> still touched or entered it. Strong cycles explain some misses, but not all of them.`
          : `No current testable cycles are currently classified as overperforming vs expected in this loaded set.`,
        `Use the x-axis as a normalized zone scale: <strong>0 = projected zone bottom</strong>, <strong>1 = projected zone top</strong>. Below 0 means the cycle pushed under the zone; above 1 means it never got down into it.`
      ]).map(text=>`<div class="setup-map-keypoint">${text}</div>`).join("");
  return `<div class="panel"><h2>Zone Outcome Map</h2>${modeToggle}${filterControl}<p class="small muted" style="margin:0 0 12px">${intro}</p><div class="setup-map-summary" style="margin:0 0 12px"><div class="card"><div class="label">${mode==="recent"?"Recent Cycles":"Testable Cycles"}</div><div class="value" style="font-size:18px">${items.length}</div></div><div class="card"><div class="label">Above Zone</div><div class="value" style="font-size:18px;color:#6ba8ff">${aboveCount}</div></div><div class="card"><div class="label">Inside Zone</div><div class="value" style="font-size:18px;color:var(--gn)">${insideCount}</div></div><div class="card"><div class="label">Below Zone</div><div class="value" style="font-size:18px;color:var(--rd)">${belowCount}</div></div></div><div class="setup-map-keypoints">${keypoints}</div><div class="setup-map-shell"><div class="setup-map-stage"><svg class="setup-map-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Scatter plot of actual cycle outcome versus rebound strength"><rect x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" rx="12" fill="rgba(255,255,255,.015)" stroke="rgba(255,255,255,.05)"></rect><rect x="${n(bandX,1)}" y="${margin.top}" width="${n(bandW,1)}" height="${plotH}" fill="rgba(79,142,247,.10)"></rect>${yGrid}${xGrid}<line x1="${margin.left}" y1="${margin.top+plotH}" x2="${margin.left+plotW}" y2="${margin.top+plotH}" stroke="rgba(255,255,255,.12)"></line><line x1="${n(xPx(0),1)}" y1="${margin.top}" x2="${n(xPx(0),1)}" y2="${margin.top+plotH}" stroke="rgba(255,255,255,.1)" stroke-dasharray="4 6"></line><line x1="${n(xPx(1),1)}" y1="${margin.top}" x2="${n(xPx(1),1)}" y2="${margin.top+plotH}" stroke="rgba(255,255,255,.1)" stroke-dasharray="4 6"></line><text class="setup-map-band-label" x="${n(bandX+bandW/2,1)}" y="${margin.top+16}" text-anchor="middle">Projected entry zone reached</text>${points}<text class="setup-map-axis-label" x="${n((margin.left+xPx(0))/2,1)}" y="${height-18}" text-anchor="middle">Below zone</text><text class="setup-map-axis-label" x="${n((xPx(0)+xPx(1))/2,1)}" y="${height-18}" text-anchor="middle">Inside zone</text><text class="setup-map-axis-label" x="${n((xPx(1)+margin.left+plotW)/2,1)}" y="${height-18}" text-anchor="middle">Above zone</text><text class="setup-map-axis-label" x="${n(margin.left+plotW/2,1)}" y="${height-8}" text-anchor="middle">Normalized low vs zone (0 = bottom, 1 = top)</text><text class="setup-map-axis-label" x="16" y="${margin.top-6}">${mode==="recent"?"Peak vs expected":"Rebound vs expected"}</text></svg><div class="tooltip" id="zoneOutcomeTip"></div></div><div class="setup-map-legend"><span><i style="background:#6ba8ff"></i>Stayed above zone</span><span><i style="background:#3ed9a0"></i>Touched zone</span><span><i style="background:#f07070"></i>Went below zone</span></div><div class="setup-map-note">${foot}</div></div></div>`;
}
function renderGroupedStockCard(item,type){
  const key=stockKeyByTicker(item.ticker);
  const metrics=item.metrics||{};
  const isUpcoming=type==="upcoming";
  const score=isUpcoming?item.upcomingScore:item.potentialScore;
  const labels=Array.isArray(item.labels)?item.labels:[];
  const days=metrics.daysToExDiv;
  const currency=metrics.currency||metrics.currencyCode||"";
  const entityMeta=entityMetaInline(item.ticker);
  const nameLine=[item.stockName||"", entityMeta].filter(Boolean).join(" · ");
  const zone=(metrics.entryZoneLow!=null&&metrics.entryZoneHigh!=null)?`${ccy(metrics.entryZoneLow,currency)} - ${ccy(metrics.entryZoneHigh,currency)}`:"-";
  const currentPrice=metrics.currentPrice!=null?ccy(metrics.currentPrice,currency):"-";
  return `<div class="mini-card grouped-stock-card"${key?` data-key="${esc(key)}"`:""}>
    <div class="mini-card-head">
      <div>
          <div class="mini-card-ticker">${esc(item.ticker||"-")}</div>
          <div class="mini-card-meta">
            <div class="mini-card-name">${esc(nameLine)}</div>
          </div>
        </div>
      <div style="display:flex;align-items:flex-end;flex-direction:column;gap:6px">
        <div style="display:flex;align-items:flex-end;flex-direction:column;gap:6px">
          ${verdictPill(metrics.finalVerdict,metrics.finalVerdictTone)}
        </div>
        <div class="mini-card-name" style="color:var(--tx);font-size:10px;letter-spacing:.08em">${esc(labels[0]||(isUpcoming?"Upcoming":"Potential"))}</div>
        <div style="font-family:var(--mono);font-size:16px;font-weight:700;color:${score>=75?"var(--gn)":score>=60?"var(--am)":"var(--tx)"}">${n(score,1)}</div>
      </div>
    </div>
    <div class="mini-card-stats">
      ${groupedMetric("Next ex-div",metrics.nextExDiv?dt(metrics.nextExDiv):"-")}
      ${groupedMetric("Days",days!=null?`${days}d`:"-")}
      ${groupedMetric("Frequency",metrics.frequencyDisplay || "-")}
      ${groupedMetric("Next Cycle",metrics.nextCycle?esc(metrics.nextCycle):"-")}
      ${groupedDualMetric("Current Price",currentPrice,"Zone",zone)}
      ${groupedMetric("Est. Ex-Div Px",metrics.estExDivPx!=null?ccy(metrics.estExDivPx,currency):"-")}
      ${groupedMetric("Est. Yield",metrics.yieldRange&&metrics.yieldRange.length===2?`${pctRaw(metrics.yieldRange[0],2)} - ${pctRaw(metrics.yieldRange[1],2)}`:"-")}
      ${groupedMetric("Entry",metrics.entryStatus?`<span class="${tagClass(metrics.entryStatus)}">${esc(metrics.entryStatusDisplay||"-")}</span>`:"-")}
      ${groupedMetric("Timing",metrics.timingNext?`<span class="${tagClass(metrics.timingNext)}">${esc(metrics.timingDisplay||"-")}</span>`:"-")}
      ${groupedMetric("Tail Risk",metrics.tailRiskLevel?`<span class="${tagClass(metrics.tailRiskLevel)}">${esc(metrics.tailRiskDisplay||"-")}</span>`:"-")}
      ${groupedMetric("Exit Mode",esc(metrics.exitModeDisplay || "-"))}
      ${metrics.exitMode==="PRE_EXDIV_PREFERRED" ? groupedMetric("Usual Pre-Exdiv Peak Window",metrics.preExdivPeakWindowDaysP25!=null&&metrics.preExdivPeakWindowDaysP75!=null?`${n(metrics.preExdivPeakWindowDaysP25,1)}d - ${n(metrics.preExdivPeakWindowDaysP75,1)}d`:"-") : ""}
      ${groupedMetric("Avg Gain (Pre-Exdiv Peak Exit)",metrics.avgGainPreExdiv!=null?pctRaw(metrics.avgGainPreExdiv,1):"-")}
      ${groupedMetric("Avg Gain (Ex-Div Date Exit)",metrics.avgGainPostExdivExit!=null?pctRaw(metrics.avgGainPostExdivExit,1):"-")}
      ${groupedMetric("Possible Gain (Next Cycle)",metrics.possibleGainPct!=null?pctRaw(metrics.possibleGainPct,1):"-")}
    </div>
    ${groupedDecisionSummary(item,type)}
    ${groupedWhyIncludedLine(item.reasons,type)}
    ${groupedWarningLine(item.warnings)}
    ${key?`<button class="planner-action" type="button" data-planner-toggle="${esc(key)}">${plannerHas(key)?"Remove from Planner":"Add to Planner"}</button>`:""}
  </div>`
}

function sortGroupedItems(items,type){
  const list=[...(items||[])];
  const mode=type==="potential" ? (state.groupedPotentialSort||"potential") : (state.groupedUpcomingSort||"smart");
  return list.sort((a,b)=>{
    if(mode==="potential") return (b.potentialScore||0)-(a.potentialScore||0);
    if(mode==="gain") return readNumber(b.metrics?.possibleGainPct,0)-readNumber(a.metrics?.possibleGainPct,0);
    if(mode==="estexdiv") return readNumber(b.metrics?.estExDivPx,-Infinity)-readNumber(a.metrics?.estExDivPx,-Infinity);
    if(mode==="preexit") return readNumber(b.metrics?.avgGainPreExdiv,-Infinity)-readNumber(a.metrics?.avgGainPreExdiv,-Infinity);
    if(mode==="exdivexit") return readNumber(b.metrics?.avgGainPostExdivExit,-Infinity)-readNumber(a.metrics?.avgGainPostExdivExit,-Infinity);
    if(mode==="winrate") return readNumber(b.metrics?.winRateNext,0)-readNumber(a.metrics?.winRateNext,0);
    if(mode==="cycles") return readNumber(b.metrics?.cleanCycles,0)-readNumber(a.metrics?.cleanCycles,0);
    if(mode==="exitmode"){
      const order={PRE_EXDIV_PREFERRED:0,POST_EXDIV_PREFERRED:1,INDETERMINATE:2,INSUFFICIENT_DATA:3};
      return (order[a.metrics?.exitMode]??9)-(order[b.metrics?.exitMode]??9);
    }
    if(mode==="days") return readNumber(a.metrics?.daysToExDiv,9999)-readNumber(b.metrics?.daysToExDiv,9999);
    if(mode==="zone") return readNumber(a.zoneDistance,9999)-readNumber(b.zoneDistance,9999);
    const priorityDiff=readNumber(a.watchPriority,9)-readNumber(b.watchPriority,9);
    if(priorityDiff!==0) return priorityDiff;
    const zoneDiff=readNumber(a.zoneDistance,9999)-readNumber(b.zoneDistance,9999);
    if(zoneDiff!==0) return zoneDiff;
    const dayDiff=readNumber(a.metrics?.daysToExDiv,9999)-readNumber(b.metrics?.daysToExDiv,9999);
    if(dayDiff!==0) return dayDiff;
    return (b.potentialScore||0)-(a.potentialScore||0);
  })
}

function filterGroupedItems(items,type){
  return (items||[]).filter(item=>{
    const m=item.metrics||{};
    if(type==="potential"){
      if(state.groupedPotentialFilterFrequency!=="all" && m.frequency!==state.groupedPotentialFilterFrequency) return false;
      if(state.groupedPotentialFilterTiming!=="all" && m.timingNext!==state.groupedPotentialFilterTiming) return false;
      if(state.groupedPotentialFilterTail!=="all" && m.tailRisk!==state.groupedPotentialFilterTail) return false;
      if(state.groupedPotentialFilterExitMode!=="all" && m.exitMode!==state.groupedPotentialFilterExitMode) return false;
      if(readNumber(state.groupedPotentialFilterScore,0)>0 && readNumber(item.potentialScore,0)<readNumber(state.groupedPotentialFilterScore,0)) return false;
      return true;
    }
  if(type==="upcoming"){
    if(state.groupedUpcomingFilterFrequency!=="all" && m.frequency!==state.groupedUpcomingFilterFrequency) return false;
    if(state.groupedUpcomingFilterEntry!=="all" && m.entryStatus!==state.groupedUpcomingFilterEntry) return false;
    if(state.groupedUpcomingFilterTail!=="all" && m.tailRisk!==state.groupedUpcomingFilterTail) return false;
    if(state.groupedUpcomingFilterExitMode!=="all" && m.exitMode!==state.groupedUpcomingFilterExitMode) return false;
    if(readNumber(state.groupedUpcomingFilterDays,0)>0 && readNumber(m.daysToExDiv,9999)>readNumber(state.groupedUpcomingFilterDays,0)) return false;
    if(readNumber(state.groupedUpcomingFilterGain,0)>0 && readNumber(m.possibleGainPct,0)<readNumber(state.groupedUpcomingFilterGain,0)) return false;
      return true;
    }
    return true;
  })
}

function groupedOption(value,label,currentValue){
  return `<option value="${esc(value)}" ${String(currentValue)===String(value)?"selected":""}>${label}</option>`
}

function groupedSelect(id,label,currentValue,options){
  return `<span class="small muted">${label}</span><select id="${id}">${options.map(opt=>groupedOption(opt.value,opt.label,currentValue)).join("")}</select>`
}

function renderGroupedControls(type){
  const frequencyOptions=[
    {value:"all",label:"All"},
    {value:"QUARTERLY",label:"Quarterly"},
    {value:"SEMI_ANNUAL",label:"Semi-Annual"},
    {value:"MONTHLY",label:"Monthly"},
    {value:"ANNUAL",label:"Annual"},
  ];
  const exitModeOptions=[
    {value:"all",label:"All"},
    {value:"PRE_EXDIV_PREFERRED",label:"Pre-Exdiv Peak Exit Preferred"},
    {value:"POST_EXDIV_PREFERRED",label:"Ex-Div Date Exit Preferred"},
    {value:"INDETERMINATE",label:"Indeterminate"},
    {value:"INSUFFICIENT_DATA",label:"Insufficient Data"},
  ];

  if(type==="potential"){
    return `<input id="groupedPotentialSearch" type="text" placeholder="Search by ticker or name…" autocomplete="off" value="${esc(state.groupedPotentialSearch||'')}">`
      + `<div class="stock-selector" style="margin:8px 0 12px">`
      + groupedSelect("groupedPotentialSort","Sort by",state.groupedPotentialSort||"potential",[
          {value:"potential",label:"Potential Score"},
          {value:"gain",label:"Possible Gain"},
          {value:"estexdiv",label:"Est. Ex-Div Px"},
          {value:"preexit",label:"Pre-Exdiv Peak Exit Gain"},
          {value:"exdivexit",label:"Ex-Div Date Exit Gain"},
          {value:"exitmode",label:"Exit Mode"},
          {value:"winrate",label:"Win Rate"},
          {value:"cycles",label:"Clean Cycles"},
        ])
      + groupedSelect("groupedPotentialFilterFrequency","Frequency",state.groupedPotentialFilterFrequency||"all",frequencyOptions)
      + groupedSelect("groupedPotentialFilterTiming","Timing",state.groupedPotentialFilterTiming||"all",[
          {value:"all",label:"All"},
          {value:"RELIABLE",label:"Reliable"},
          {value:"BIMODAL",label:"Bimodal"},
          {value:"UNRELIABLE",label:"Unreliable"},
        ])
      + groupedSelect("groupedPotentialFilterTail","Tail",state.groupedPotentialFilterTail||"all",[
          {value:"all",label:"All"},
          {value:"LOW",label:"Low"},
          {value:"MODERATE",label:"Moderate"},
          {value:"CAUTION",label:"Caution"},
          {value:"HIGH",label:"High"},
          {value:"SEVERE",label:"Severe"},
        ])
      + groupedSelect("groupedPotentialFilterExitMode","Exit",state.groupedPotentialFilterExitMode||"all",exitModeOptions)
      + groupedSelect("groupedPotentialFilterScore","Min Score",state.groupedPotentialFilterScore||"0",[
          {value:"0",label:"Any"},
          {value:"50",label:"&gt;= 50"},
          {value:"60",label:"&gt;= 60"},
          {value:"75",label:"&gt;= 75"},
        ])
      + `</div>`
  }

  if(type==="upcoming"){
    return `<input id="groupedUpcomingSearch" type="text" placeholder="Search by ticker or name…" autocomplete="off" value="${esc(state.groupedUpcomingSearch||'')}">`
      + `<div class="stock-selector" style="margin:8px 0 12px">`
      + groupedSelect("groupedUpcomingSort","Sort by",state.groupedUpcomingSort||"smart",[
          {value:"smart",label:"Watch Priority"},
          {value:"days",label:"Days to Ex-Div"},
          {value:"zone",label:"Closest to Zone"},
          {value:"potential",label:"Potential Score"},
          {value:"gain",label:"Possible Gain"},
          {value:"estexdiv",label:"Est. Ex-Div Px"},
          {value:"preexit",label:"Pre-Exdiv Peak Exit Gain"},
          {value:"exdivexit",label:"Ex-Div Date Exit Gain"},
          {value:"exitmode",label:"Exit Mode"},
          {value:"winrate",label:"Win Rate"},
        ])
      + groupedSelect("groupedUpcomingFilterFrequency","Frequency",state.groupedUpcomingFilterFrequency||"all",frequencyOptions)
      + groupedSelect("groupedUpcomingFilterEntry","Entry",state.groupedUpcomingFilterEntry||"all",[
          {value:"all",label:"All"},
          {value:"INSIDE",label:"Inside"},
          {value:"ABOVE",label:"Above"},
          {value:"BELOW",label:"Below"},
        ])
      + groupedSelect("groupedUpcomingFilterTail","Tail",state.groupedUpcomingFilterTail||"all",[
          {value:"all",label:"All"},
          {value:"LOW",label:"Low"},
          {value:"MODERATE",label:"Moderate"},
          {value:"CAUTION",label:"Caution"},
          {value:"HIGH",label:"High"},
          {value:"SEVERE",label:"Severe"},
        ])
      + groupedSelect("groupedUpcomingFilterExitMode","Exit",state.groupedUpcomingFilterExitMode||"all",exitModeOptions)
      + groupedSelect("groupedUpcomingFilterDays","Days",state.groupedUpcomingFilterDays||"0",[
          {value:"0",label:"Any"},
          {value:"30",label:"&lt;= 30"},
          {value:"60",label:"&lt;= 60"},
          {value:"90",label:"&lt;= 90"},
        ])
      + groupedSelect("groupedUpcomingFilterGain","Min Gain",state.groupedUpcomingFilterGain||"0",[
          {value:"0",label:"Any"},
          {value:"5",label:"&gt;= 5%"},
          {value:"8",label:"&gt;= 8%"},
          {value:"10",label:"&gt;= 10%"},
        ])
      + `</div>`
  }

  return "";
}

function panelGroupedSection(title,subtitle,items,type){
  const filtered=filterGroupedItems(items,type);
  const controls=renderGroupedControls(type);
  if(!filtered||!filtered.length)return `<div class="panel"><h2>${title}</h2><p class="small muted" style="margin:0 0 12px">${subtitle}</p>${controls}<p class="small muted" style="margin:0">No stocks currently match these filters.</p></div>`;
  const sorted=sortGroupedItems(filtered,type);
  const countLine=filtered.length<items.length?`<p class="small muted" style="margin:0 0 10px">Showing ${filtered.length} of ${items.length}</p>`:"";
  return `<div class="panel"><h2>${title}</h2><p class="small muted" style="margin:0 0 12px">${subtitle}</p>${controls}${countLine}<div class="mini-grid" id="groupedGrid-${type}">${sorted.map(item=>renderGroupedStockCard(item,type)).join("")}</div></div>`
}

function panelGroupedStocks(){
  const grouped=groupedStockData();
  if(!grouped)return"";
  const subTab=state.groupedSubTab==="upcoming"?"upcoming":"potential";
  const subTabs=`<div class="tabs" style="margin-bottom:12px">
    <button class="tab ${subTab==="potential"?"active":""}" id="groupedSubTabPotential">Potential Stocks (${grouped.potentialStocks.length})</button>
    <button class="tab ${subTab==="upcoming"?"active":""}" id="groupedSubTabUpcoming">Upcoming Stocks to Watch (${grouped.upcomingStocks.length})</button>
  </div>`;
  const body=subTab==="upcoming"
    ? panelGroupedSection(
        "Upcoming Stocks to Watch",
        "Potential stocks included here if the next ex-dividend date is within 90 days or the current price is inside or close to the entry zone.",
        grouped.upcomingStocks,
        "upcoming"
      )
    : panelGroupedSection(
        "Potential Stocks",
        "Stocks that passed the structural screen: win rate >= 50%, clean cycles >= 3, years of data >= 2, allowed dividend frequency, with timing and tail risk reflected in ranking.",
        grouped.potentialStocks,
        "potential"
      );
  return `<div class="section-note" style="margin-bottom:12px">Current Verdict is a guideline for prioritising attention, not a hard block. You may still act with your own judgment, sizing, and caution.</div>${subTabs}${body}`;
}
/* ?? REVIEW REMOVE HELPERS ???????????????????????????????????????????? */
function revConfirmRemove(btn){
  const key=btn.dataset.key;
  btn.outerHTML=`<div class="rev-remove-confirm" style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
    <span style="font-size:10px;color:var(--mu);white-space:nowrap">Remove from watchlist?</span>
    <button data-key="${esc(key)}" onclick="event.stopPropagation();revConfirmYes(this)" style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #6b3a3a;background:var(--bg);color:#c47a7a;cursor:pointer;white-space:nowrap">Yes, remove</button>
    <button onclick="event.stopPropagation();revCancelRemove()" style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid var(--bd);background:var(--bg);color:var(--mu);cursor:pointer;white-space:nowrap">Cancel</button>
  </div>`;
}
async function revConfirmYes(btn){
  const key=btn.dataset.key;
  const ticker=state.stocks[key]?.data?.meta?.ticker||key;
  btn.disabled=true;btn.textContent="Removing…";
  try{
    const regResp=await fetch(BACKEND_CONFIG.stockRegistryUrl);
    const regData=await regResp.json();
    if(!regData.ok)throw new Error(regData.error||"Failed to load registry");
    const updated=regData.entries.filter(e=>e.ticker!==ticker);
    const saveResp=await fetch(BACKEND_CONFIG.stockRegistryUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entries:updated})});
    const saveData=await saveResp.json();
    if(!saveData.ok)throw new Error(saveData.error||"Failed to save registry");
    const removedLabel=state.stocks[key]?.label;
    delete state.stocks[key];
    if(state.reviewOverrides)delete state.reviewOverrides[key];
    if(removedLabel&&Array.isArray(state.serverLoadedFiles))
      state.serverLoadedFiles=state.serverLoadedFiles.filter(f=>f!==removedLabel);
    persistPlannerState();renderApp();
  }catch(err){
    btn.disabled=false;btn.textContent="Yes, remove";
    const wrap=btn.closest(".rev-remove-confirm");
    if(wrap){const existing=wrap.querySelector(".rev-err");
      if(existing)existing.textContent=err.message;
      else wrap.insertAdjacentHTML("beforeend",`<span class="rev-err" style="font-size:10px;color:#e05a5a;white-space:normal;max-width:140px;word-break:break-word">${esc(err.message)}</span>`);
    }
  }
}
function revCancelRemove(){renderApp();}

/* ?? REVIEW PANEL ??????????????????????????????????????????????????? */
function panelReview(){
  const allStocks=activeStockList();
  if(!allStocks.length)return`<div class="panel"><h2>Review</h2><div class="empty">No stocks loaded. Use "Load existing stock data" or "Update stock data" to begin.</div></div>`;

  const cfg=mergeConfig(CONFIG,{});
  const overrides=state.reviewOverrides||{};

  // Build row data
  const rows=allStocks.map(s=>{
    const data=s.data;
    const cgcTop=Array.isArray(data.cgc_ranking)?data.cgc_ranking[0]:null;
    const bestSid=cgcTop?.series_id||upcomingSeries(data)?.id;
    const proj=bestSid?data.proj_series?.[bestSid]:null;
    const hf=proj?.historical_frequencies||{};
    const ssSeries=bestSid?data.ss_series?.[bestSid]:null;
    const calWin=ssSeries?.timing?.cal_window||{};
    const normalized=normalizeStock(data,cfg);
    const eligResult=isPotentialStock(normalized,cfg);
    const eligible=eligResult.eligible;
    const potScore=eligible?scorePotentialStock(normalized,cfg).potentialScore:null;
    return{
      key:s.key,
      ticker:data.meta?.ticker||s.key,
      stockName:data.meta?.stock_name||"",
      eligible,
      potScore,
      potReasons:eligResult.reasons||[],
      entryStatus:proj?.entry_status,
      entryStatusDisplay:proj?.entry_status_display,
      winRate:hf.win_rate,
      winRateAll:hf.win_rate_all,
      zoneHit:hf.entry_zone_hit_rate,
      avgGain:hf.avg_win_pct,
      calRating:calWin.cal_window_rating,
      calDisplay:calWin.cal_window_rating_display,
      stability:proj?.stability_verdict,
      growth5yr:data.meta?.price_growth_5yr_pct,
      frequency:data.meta?.frequency,
      frequencyDisplay:data.meta?.frequency_display,
      structHealthOverride:proj?.structural_health_override_applied===true,
      structHealthFlags:proj?.structural_health_flags||[],
    };
  });

  // Auto-assign with edge-case handling
  const autoAssign=r=>{
    // Structural health override (2+ of: degrading pattern, zone fragility in the
    // bottom 25% of the tracked universe, severe 5yr decline) always wins -- a
    // stock this system has flagged is not showing pattern breakdown through its
    // own price position today, so the ordinary KEEP/WATCH gates below (which
    // only look at zoneHit/stability individually) would otherwise still route
    // it to "watch" even though the same stock's Verdict/Score elsewhere already
    // read "Structurally Weak" and got pulled from Potential entirely.
    if(r.structHealthOverride) return"remove";
    // KEEP — eligible, zone well-reachable (>15%), pattern not degrading
    if(r.eligible&&r.zoneHit>15&&r.stability!=="DEGRADING") return"keep";
    // WATCH-A — eligible, good execution (>15%), but degrading pattern
    if(r.eligible&&r.zoneHit>15&&r.stability==="DEGRADING") return"watch";
    // WATCH-B — eligible, zone barely reachable (1-15%), quality justifies monitoring
    //   Gate: score ≥65, improving stability, or strong avg gain (≥6%)
    //   Growth is NOT a gate here — zone has been reached, so this is a quality question
    if(r.eligible&&r.zoneHit>0&&r.zoneHit<=15&&
       (r.potScore>=65||r.stability==="IMPROVING"||(r.avgGain!=null&&r.avgGain>=6)))
      return"watch";
    // WATCH-C — eligible, zone never reached, quality or momentum signal present
    //   Gate: high score (≥70), improving pattern, growth ≥15% + score ≥65, or currently inside
    //   Growth at 15% (~2.85%/yr) is above Singapore CPI (~2-3%/yr) — real momentum, not inflation drift
    //   Growth gate requires score ≥65: growth alone in a dividend strategy is thin justification —
    //   a rising stock with weak dividend fundamentals is better bought outright; the zone model adds no value
    if(r.eligible&&r.zoneHit===0&&
       (r.potScore>=70||r.stability==="IMPROVING"||
        (r.growth5yr!=null&&r.growth5yr>=15&&r.potScore!=null&&r.potScore>=65)||
        r.entryStatus==="INSIDE"))
      return"watch";
    // WATCH-D — fails screen but strong execution (zone hit ≥50% + win rate ≥65%)
    if(!r.eligible&&r.zoneHit!=null&&r.zoneHit>=50&&r.winRate!=null&&r.winRate>=65) return"watch";
    // WATCH-E — fails screen but strong business fundamentals with some zone activity
    if(!r.eligible&&r.growth5yr!=null&&r.growth5yr>=25&&r.zoneHit>0) return"watch";
    return"remove";
  };
  const getAssign=r=>overrides[r.key]||autoAssign(r);

  // Generate reason sentence
  const getReason=r=>{
    const assigned=getAssign(r);
    const wasAuto=autoAssign(r);
    const overrideSuffix=overrides[r.key]&&overrides[r.key]!==wasAuto?" (manually moved)":"";
    if(assigned==="keep"){
      const parts=[];
      if(r.potScore!=null) parts.push(r.potScore>=75?`High potential score (${n(r.potScore,0)})`:`Score ${n(r.potScore,0)}`);
      if(r.winRate!=null) parts.push(`${pctRaw(r.winRate,0)} win rate`);
      if(r.zoneHit!=null&&r.zoneHit>0) parts.push(`${pctRaw(r.zoneHit,0)} zone hit`);
      if(r.calRating==="CALENDAR_CONSISTENT") parts.push("consistent calendar");
      else if(r.calRating==="CALENDAR_MODERATE") parts.push("moderate calendar spread");
      if(r.growth5yr!=null&&r.growth5yr>=20) parts.push(`${n(r.growth5yr,0)}% 5yr growth`);
      return(parts.join(" · ")||"Passes the structural potential screen.")+overrideSuffix;
    }else if(assigned==="watch"){
      // WATCH-A: well-accessible zone but pattern deteriorating
      if(r.eligible&&r.zoneHit>15&&r.stability==="DEGRADING")
        return`Zone is well-accessible (${pctRaw(r.zoneHit,0)} hit rate) but pattern stability has been declining — timing or dip depth is shifting in recent cycles. Valid setup; trade with caution.${overrideSuffix}`;
      // remaining zoneHit>0 + DEGRADING is now zoneHit 1–15% range
      if(r.eligible&&r.zoneHit>0&&r.stability==="DEGRADING")
        return`Pattern consistency is trending down in recent cycles — timing or dip depth is shifting from historical norms. Valid setup but trade with caution.${overrideSuffix}`;
      // WATCH-B: barely reachable zone (1–15%)
      if(r.eligible&&r.zoneHit>0&&r.zoneHit<=15)
        return`Entry zone is rarely reached (${pctRaw(r.zoneHit,0)} zone hit) — a valid setup exists but practical entry opportunities are very uncommon.${overrideSuffix}`;
      // WATCH-C: zone never reached — improving pattern signal
      if(r.eligible&&r.zoneHit===0&&r.stability==="IMPROVING")
        return`Entry zone has not yet been triggered, but the cycle pattern is strengthening (improving stability). Could become actionable if price pulls back.${overrideSuffix}`;
      // WATCH-C: zone never reached — high potential score signal
      if(r.eligible&&r.zoneHit===0&&r.potScore!=null&&r.potScore>=70)
        return`Entry zone has never been reached in practice, but a strong potential score (${n(r.potScore,0)})${r.winRate!=null?` and ${pctRaw(r.winRate,0)} win rate`:""} justify monitoring. Watch for a broad pullback to create an entry.${overrideSuffix}`;
      // WATCH-C: zone never reached — steady climber (growth + quality floor)
      if(r.eligible&&r.zoneHit===0&&r.growth5yr!=null)
        return`${n(r.growth5yr,0)}% 5yr price growth${r.potScore!=null?` with a decent potential score (${n(r.potScore,0)})`:""} suggests a quality stock whose entry zone has been left behind by a rising price. Monitor for a broad pullback to bring price back into range.${overrideSuffix}`;
      // WATCH-C fallback: zone=0 but currently inside (first-time entry window)
      if(r.eligible&&r.zoneHit===0)
        return`Entry zone has never been reached historically, but current price is inside the zone — a potential entry window is open now.${overrideSuffix}`;
      // WATCH-D: fails screen but strong execution metrics
      if(!r.eligible&&r.zoneHit!=null&&r.zoneHit>=50&&r.winRate!=null&&r.winRate>=65)
        return`Doesn't pass the structural screen but price enters the zone ${pctRaw(r.zoneHit,0)} of the time with a ${pctRaw(r.winRate,0)} win rate — worth monitoring as more cycle data accumulates.${overrideSuffix}`;
      // WATCH-E: fails screen but strong business fundamentals
      if(!r.eligible&&r.growth5yr!=null&&r.growth5yr>=25)
        return`Doesn't pass the structural screen but ${n(r.growth5yr,0)}% 5yr growth indicates a healthy business. Monitor for a cycle pattern to develop.${overrideSuffix}`;
      return`Edge case — doesn't fit cleanly into Keep or Remove. Review manually.${overrideSuffix}`;
    }else{
      if(r.structHealthOverride){
        const flagText={DEGRADING:"pattern stability is degrading",FRAGILE_ZONE:"zone fragility is in the bottom 25% of the tracked universe",PRICE_DECLINE:"5yr price growth is severely negative",HIGH_LEVERAGE:"debt is more than 150% of equity",DIVIDEND_NOT_COVERED:"free cash flow covers less than 0.7x of the dividend paid"};
        const flags=(r.structHealthFlags||[]).map(f=>flagText[f]||f).join("; ");
        return`Structural health override — ${flags||"multiple structural health flags"}. Current price position doesn't change this.${overrideSuffix}`;
      }
      if(r.zoneHit===0&&!r.eligible){
        const extra=r.potReasons[0]?` Also: ${r.potReasons[0].toLowerCase()}.`:"";
        return`Zone hit rate is 0% — entry zone has never been reached in practice.${extra}${overrideSuffix}`;
      }
      if(r.zoneHit===0) return`Zone hit rate is 0% — entry zone has never been reached in practice.${overrideSuffix}`;
      if(!r.eligible&&r.potReasons.length){
        const first=r.potReasons[0].toLowerCase();
        const more=r.potReasons.length>1?` (+${r.potReasons.length-1} more reason${r.potReasons.length>2?"s":""})`:""
        return`Does not pass the structural screen — ${first}.${more}${overrideSuffix}`;
      }
      return`Does not meet the structural potential threshold.${overrideSuffix}`;
    }
  };

  const sortFn=key=>{
    if(key==="zoneHit")return(a,b)=>(b.zoneHit??-1)-(a.zoneHit??-1);
    if(key==="winRate")return(a,b)=>(b.winRate??-1)-(a.winRate??-1);
    if(key==="alpha")  return(a,b)=>(a.stockName||a.ticker).localeCompare(b.stockName||b.ticker);
    return(a,b)=>(b.potScore??-999)-(a.potScore??-999);
  };
  const sortBar=(col,current)=>["score","zoneHit","winRate","alpha"].map(s=>{
    const active=current===s;
    const label=s==="score"?"Score":s==="zoneHit"?"Zone":s==="winRate"?"WR":"A→Z";
    return`<button class="rev-sort-btn${active?" active":""}" data-col="${col}" data-sort="${s}">${label}</button>`;
  }).join("");
  const revSort=state.reviewSort||{};
  const revQ=(state.reviewSearch||"").toLowerCase().trim();
  const matchSearch=r=>!revQ||(r.ticker||"").toLowerCase().includes(revQ)||(r.stockName||"").toLowerCase().includes(revQ);
  const keepTotal=rows.filter(r=>getAssign(r)==="keep").length;
  const watchTotal=rows.filter(r=>getAssign(r)==="watch").length;
  const removeTotal=rows.filter(r=>getAssign(r)==="remove").length;
  const keepList=rows.filter(r=>getAssign(r)==="keep"&&matchSearch(r)).sort(sortFn(revSort.keep||"score"));
  const watchList=rows.filter(r=>getAssign(r)==="watch"&&matchSearch(r)).sort(sortFn(revSort.watch||"zoneHit"));
  const removeList=rows.filter(r=>getAssign(r)==="remove"&&matchSearch(r)).sort(sortFn(revSort.remove||"score"));

  const renderCard=r=>{
    const assigned=getAssign(r);
    const reason=getReason(r);
    const chips=[];
    if(r.potScore!=null) chips.push(`<span class="chip ${r.potScore>=75?"good":r.potScore>=60?"warn":""}">Score ${n(r.potScore,0)}</span>`);
    else chips.push(`<span class="chip muted">No score</span>`);
    if(r.winRate!=null) chips.push(`<span class="chip ${r.winRate>=70?"good":r.winRate>=50?"warn":"bad"}">WR ${pctRaw(r.winRate,0)}</span>`);
    if(r.zoneHit!=null) chips.push(`<span class="chip ${r.zoneHit>=60?"good":r.zoneHit>=30?"warn":"bad"}">Zone ${pctRaw(r.zoneHit,0)}</span>`);
    if(r.stability==="DEGRADING") chips.push(`<span class="chip bad">Degrading</span>`);
    else if(r.stability==="IMPROVING") chips.push(`<span class="chip good">Improving</span>`);
    if(r.frequencyDisplay) chips.push(`<span class="chip ${{QUARTERLY:"good",MONTHLY:"good",SEMI_ANNUAL:""}[r.frequency]||"muted"}">${esc(r.frequencyDisplay)}</span>`);
    const moveButtons=assigned==="keep"
      ?`<button class="rev-move-btn" data-key="${esc(r.key)}" data-target="watch">→ Watch</button><button class="rev-move-btn" data-key="${esc(r.key)}" data-target="remove">→ Remove</button>`
      :assigned==="watch"
      ?`<button class="rev-move-btn" data-key="${esc(r.key)}" data-target="keep">← Keep</button><button class="rev-move-btn" data-key="${esc(r.key)}" data-target="remove">→ Remove</button>`
      :`<button class="rev-move-btn" data-key="${esc(r.key)}" data-target="keep">← Keep</button><button class="rev-move-btn" data-key="${esc(r.key)}" data-target="watch">← Watch</button>`;
    const canRemove=assigned==="remove"&&!BACKEND_CONFIG.staticJsonBase;
    const removeBtn=canRemove?`<button class="rev-watchlist-btn" data-key="${esc(r.key)}" onclick="event.stopPropagation();revConfirmRemove(this)" style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid #6b3a3a;background:var(--bg);color:#c47a7a;cursor:pointer;white-space:nowrap">Remove from watchlist</button>`:"";
    return`<div class="rev-card" data-key="${esc(r.key)}" style="border:1px solid var(--bd);border-radius:8px;padding:10px 12px;margin-bottom:8px;cursor:pointer;transition:background .12s">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="min-width:0;flex:1">
          <div style="font-family:var(--mono);font-weight:700;font-size:13px">${esc(r.ticker)} <span style="font-weight:400;font-size:11px;color:var(--mu)">${esc(r.stockName)}</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin:5px 0">${chips.join("")}</div>
          <div style="font-size:11px;color:var(--mu);line-height:1.5">${esc(reason)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          ${moveButtons}
          ${removeBtn}
        </div>
      </div>
    </div>`;
  };

  const overrideCount=Object.keys(overrides).length;
  const resetBtn=overrideCount?`<button id="reviewResetOverrides" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid var(--bd);background:var(--bg);color:var(--mu);cursor:pointer">Reset ${overrideCount} manual override${overrideCount!==1?"s":""}</button>`:"";

  const keepHtml=keepList.length?keepList.map(renderCard).join(""):`<div class="empty" style="font-size:12px;padding:14px">No stocks assigned here.</div>`;
  const watchHtml=watchList.length?watchList.map(renderCard).join(""):`<div class="empty" style="font-size:12px;padding:14px">No stocks assigned here.</div>`;
  const removeHtml=removeList.length?removeList.map(renderCard).join(""):`<div class="empty" style="font-size:12px;padding:14px">No stocks assigned here.</div>`;

  const helpModal=`<div id="reviewHelpModal" class="rev-help-overlay" style="display:none">
    <div class="rev-help-modal">
      <button id="reviewHelpClose" style="position:absolute;top:14px;right:16px;background:none;border:none;color:var(--mu);font-size:18px;cursor:pointer;line-height:1;padding:2px 6px" title="Close">&times;</button>
      <div style="font-size:16px;font-weight:700;margin-bottom:14px">How Scores &amp; Metrics Work</div>
      <div class="rev-help-tabs">
        <button class="rev-help-tab active" data-tab="score">Score</button>
        <button class="rev-help-tab" data-tab="winrate">Win Rate</button>
        <button class="rev-help-tab" data-tab="zonehit">Zone Hit</button>
        <button class="rev-help-tab" data-tab="stability">Stability</button>
        <button class="rev-help-tab" data-tab="calendar">Calendar</button>
        <button class="rev-help-tab" data-tab="logic">Logic</button>
      </div>

      <div class="rev-help-panel active" data-tab="score">
        <h4>Potential Score <span style="font-weight:400;font-size:11px;color:var(--mu)">(0&ndash;100)</span></h4>
        <p>A composite quality score that combines eight weighted factors measured from the stock's historical dividend cycles. A higher score means the setup has historically been more reliable and consistent.</p>
        <ul>
          <li><strong>Win Rate</strong> &mdash; how often the cycle low was at least 3% below the ex-div closing price (the rebound hurdle)</li>
          <li><strong>Clean Cycles</strong> &mdash; number of usable historical setups (degenerate cycles excluded)</li>
          <li><strong>Years of Data</strong> &mdash; longer track record = higher confidence</li>
          <li><strong>Dividend Frequency</strong> &mdash; quarterly or monthly cycles provide more data points</li>
          <li><strong>Timing Reliability</strong> &mdash; how consistently the seasonal window falls in the same period</li>
          <li><strong>Tail Risk</strong> &mdash; penalty for stocks with a history of extreme drawdowns near ex-div</li>
          <li><strong>Dividend Trend</strong> &mdash; whether dividends have been growing, flat, or declining</li>
          <li><strong>Zone Width</strong> &mdash; tighter entry zones are rewarded; very wide zones are less precise</li>
        </ul>
        <div class="rev-help-rule">
          <span class="chip good">Score 75+</span>&nbsp;High confidence &nbsp;&nbsp;
          <span class="chip warn">Score 60+</span>&nbsp;Moderate &nbsp;&nbsp;
          <span class="chip muted">No score</span>&nbsp;Didn't pass minimum criteria (e.g. &lt;3 cycles or WR &lt;50%)
        </div>
        <p style="margin-top:10px"><strong>Eligibility:</strong> A stock is <em>eligible</em> when it passes all minimum criteria: &ge;3 clean cycles, win rate &ge;50%, &ge;2 years of data, and a dividend frequency of Quarterly, Semi-Annual, or Monthly (Annual and Irregular are excluded by default). Tail risk SEVERE also blocks eligibility. Stocks failing any gate have no potential score and cannot be assigned To Keep, though they may still appear in Worth Watching if their zone hit rate or growth signal is strong enough.</p>
        <p style="margin-top:8px"><strong>Data depth matters as much as win rate:</strong> A stock with 90% WR across 3 cycles scores lower than one with 70% WR across 15 cycles, because a small sample can simply be lucky. The Clean Cycles and Years of Data factors penalise thin histories so that confidence reflects how much evidence is actually behind the number.</p>
        <hr class="rev-help-divider">
        <h4>How it&rsquo;s calculated</h4>
        <p>The score is a <strong>weighted average</strong> of 8 sub-scores. Each factor is independently normalised to 0&ndash;100, then combined using these weights:</p>
        <div class="rev-help-rule" style="font-family:monospace;font-size:11px;line-height:2">Win Rate          &nbsp;28%&nbsp; &mdash; foundation of the signal<br>Clean Cycles      &nbsp;18%&nbsp; &mdash; data volume; more cycles = tighter zone<br>Timing            &nbsp;14%&nbsp; &mdash; RELIABLE=100, BIMODAL=72, UNRELIABLE=20<br>Years of Data     &nbsp;10%&nbsp; &mdash; track record length<br>Tail Risk         &nbsp;10%&nbsp; &mdash; inverted; LOW=100, MODERATE=82, CAUTION=60, HIGH=30, SEVERE=0<br>Frequency         &nbsp;10%&nbsp; &mdash; Quarterly=100, Semi-Annual=95, Monthly=82, Annual=60&dagger;, Irregular=20&dagger;<br>Dividend Trend    &nbsp; 5%&nbsp; &mdash; Rising=100, Stable=80, Declining=30<br>Zone Width        &nbsp; 5%&nbsp; &mdash; &le;3%&rarr;100 / &le;5%&rarr;88 / &le;8%&rarr;68 / &le;12%&rarr;45 / &gt;12%&rarr;20<br><span style="color:var(--mu)">&dagger; Annual and Irregular stocks are excluded from eligibility by the default frequency gate &mdash; these sub-score values do not appear in practice for eligible stocks.</span></div>
        <p style="margin-top:8px">Continuous factors are normalised on fixed ranges:</p>
        <div class="rev-help-rule" style="font-family:monospace;font-size:11px;line-height:2">Win Rate:      35% &rarr; sub-score 0 &nbsp;&nbsp;|&nbsp;&nbsp; 80% &rarr; sub-score 100<br>Clean Cycles:   2  &rarr; sub-score 0 &nbsp;&nbsp;|&nbsp;&nbsp; 10  &rarr; sub-score 100<br>Years of Data:  1y &rarr; sub-score 0 &nbsp;&nbsp;|&nbsp;&nbsp;  8y &rarr; sub-score 100</div>
        <p style="margin-top:8px">Because each factor is capped at 100, a perfect win rate can&rsquo;t compensate for a thin history &mdash; every factor must be reasonably strong to push the total into the 75+ range.</p>
      </div>

      <div class="rev-help-panel" data-tab="winrate">
        <h4>Win Rate (WR)</h4>
        <p>The percentage of clean historical cycles where the cycle had a meaningful dip and recovery &mdash; specifically, where the closing price just before ex-dividend was at least 3% above the cycle low. Only non-degenerate cycles are counted so outlier setups don&rsquo;t skew the rate.</p>
        <div class="rev-help-rule">
          <span class="chip good">70%+</span>&nbsp;Strong &nbsp;&nbsp;
          <span class="chip warn">50&ndash;69%</span>&nbsp;Moderate &nbsp;&nbsp;
          <span class="chip bad">&lt;50%</span>&nbsp;Below threshold (not eligible)
        </div>
        <p style="margin-top:10px"><strong>How a cycle is counted as a win:</strong> The cycle low must be at least 3% below the closing price just before ex-dividend. This is the <em>3% rebound hurdle</em> &mdash; formula: <code>(prev_dp &minus; low_px) / low_px &times; 100 &gt; 3.0</code>. It confirms a genuine dip-and-recovery occurred, and that buying near the cycle low would have yielded a return of at least 3% before the ex-dividend date. Cycles where price barely moved score as losses. <strong>Zone Hit Rate</strong> separately tracks whether price fell <em>into</em> the projected entry zone &mdash; that is a different question from whether the cycle's rebound was large enough to meet the 3% hurdle.</p>
        <p style="margin-top:8px"><strong>What a &ldquo;clean cycle&rdquo; is:</strong> A cycle is excluded (marked degenerate) when it shows extreme outlier behaviour &mdash; for example, a drawdown so severe it dwarfs every other cycle, or an anomalous dividend payout that distorts the pattern. Degenerate cycles are still visible in the drill-down view but are excluded from win rate and score calculations so that one crisis event doesn&rsquo;t permanently distort the signal.</p>
        <p style="margin-top:8px"><strong>Hard gate:</strong> A win rate below 50% makes a stock ineligible regardless of all other factors. A setup that historically loses more than it wins is not a buy signal at any score level.</p>
      </div>

      <div class="rev-help-panel" data-tab="zonehit">
        <h4>Zone Hit Rate</h4>
        <p>The percentage of historical cycles where price actually fell <em>into</em> the projected entry zone at some point before ex-dividend. A 0% zone hit means the entry zone exists on paper but price has never reached it in practice &mdash; so there is rarely a chance to buy at the target price even if the pattern looks strong.</p>
        <div class="rev-help-rule">
          <span class="chip good">60%+</span>&nbsp;Frequently reachable &nbsp;&nbsp;
          <span class="chip warn">30&ndash;59%</span>&nbsp;Occasionally reachable &nbsp;&nbsp;
          <span class="chip bad">1&ndash;15%</span>&nbsp;Rarely reachable &rarr; Worth Watching <em>only if</em> quality signal present (score &ge;65, Improving, or avg gain &ge;6%) &nbsp;&nbsp;
          <span class="chip bad">0%</span>&nbsp;Worth Watching if score &ge;70, Improving, growth &ge;15% with score &ge;65, or currently Inside; otherwise To Remove
        </div>
        <p style="margin-top:8px">The 15% boundary is the practical execution floor: below this, the entry zone is visited in roughly 1-in-7 cycles or fewer &mdash; so even a strong win rate has limited trading value because entries are too rare to act on systematically.</p>
        <p style="margin-top:8px"><strong>Steady climbers:</strong> When a stock trends upward consistently, its current price sits above the historical entry zone &mdash; the pre-dividend dip still occurs but is no longer deep enough to reach a zone calibrated on older, lower prices. A 0% zone hit combined with 15%&plus; 5yr price growth is more likely a sign of strength (rising price left the zone behind) than a broken pattern. These stocks go to Worth Watching rather than Remove. The 15% floor is intentional: over 5 years, 15% total price appreciation equals ~2.85% per year &mdash; meaningfully above Singapore&rsquo;s average CPI of ~2&ndash;3%, confirming real upward momentum rather than inflation drift. A growth gate without a quality floor would catch rising stocks regardless of their dividend fundamentals; the score &ge;65 requirement ensures you are monitoring a stock with <em>both</em> upward price momentum <em>and</em> a decent dividend cycle &mdash; a candidate worth waiting for a pullback on.</p>
        <hr class="rev-help-divider">
        <h4>How it&rsquo;s calculated</h4>
        <p>The rate is computed as a <strong>walk-forward replay</strong>, not a hindsight calculation. The script iterates through all clean cycles in chronological order and, for each cycle, rebuilds the entry zone using <em>only the cycles that came before it</em> &mdash; exactly the information available at that point in real time.</p>
        <p style="margin-top:8px">The first 3 clean cycles are always skipped because at least 3 preceding data points are needed to form a meaningful zone. From cycle 4 onward:</p>
        <ul>
          <li>Collect the dip depths from the last 5 preceding clean cycles</li>
          <li>Winsorise at the 5th/95th percentile to blunt one-off crashes</li>
          <li>Take percentile bounds scaled to sample size: 10/90 for &ge;8 cycles, 20/80 for &ge;5, 30/70 for &ge;3</li>
          <li>Anchor the zone from the ex-dividend adjusted price of the most recent prior ex-div event</li>
          <li>Test: did the actual cycle low land inside the zone?</li>
        </ul>
        <div class="rev-help-rule" style="font-family:monospace;font-size:11px;line-height:2">Cycle 1 &rarr; skip (not enough history)<br>Cycle 2 &rarr; skip<br>Cycle 3 &rarr; skip<br>Cycle 4 &rarr; zone from cycles 1&ndash;3 &rarr; did low hit? &#10003;/&#10007;<br>Cycle 5 &rarr; zone from cycles 1&ndash;4 &rarr; did low hit? &#10003;/&#10007;<br>Cycle 6 &rarr; zone from cycles 2&ndash;5 &rarr; did low hit? &#10003;/&#10007;<br><span style="color:var(--mu)">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(capped at last 5 once enough history exists)</span></div>
        <p style="margin-top:8px"><strong>Zone Hit Rate = hits &divide; total tested cycles</strong></p>
        <p style="margin-top:8px">This answers the practical question: <em>if you had been running this system in real time, how often would you have actually gotten a valid entry?</em> A mathematically neat zone that history never touched is not actionable.</p>
      </div>

      <div class="rev-help-panel" data-tab="stability">
        <h4>Pattern Stability</h4>
        <p>Measures whether the dividend cycle behaviour is becoming more or less consistent over time. Each cycle gets a consistency score based on how closely its timing, dip depth, and rebound match the stock's historical median. The trend of those scores over time produces the verdict.</p>
        <ul>
          <li><strong style="color:var(--gn)">Improving</strong> &mdash; recent cycles are more consistent; pattern is strengthening</li>
          <li><strong>Stable</strong> &mdash; cycles conform to historical norms; no significant drift</li>
          <li><strong style="color:var(--rd)">Degrading</strong> &mdash; recent cycles show shifting timing or dip depth; the predictable pattern is weakening. Eligible stocks with a degrading verdict go to <em>Worth Watching</em> rather than To Keep</li>
        </ul>
        <p style="margin-top:10px"><strong>How the consistency score works:</strong> Each cycle is scored on three dimensions &mdash; how closely its timing matches the historical median window, how close its dip depth is to the median dip, and how closely its recovery matches the median rebound. A cycle that dips in the expected month, to roughly the expected depth, and recovers by the expected amount scores well. One that dips three months early, overshoots dramatically, and barely recovers scores poorly.</p>
        <p style="margin-top:8px"><strong>The verdict comes from the trend</strong>, not any single cycle. Improving means recent cycles are conforming more closely than older ones &mdash; the pattern is sharpening. Degrading means recent cycles are drifting away from historical norms.</p>
        <p style="margin-top:8px"><strong>Why Degrading goes to Watch, not Remove:</strong> A degrading pattern doesn&rsquo;t mean the stock is broken. It means the predictable behaviour is weakening. The stock stays monitored so you can see if it stabilises or the zone recalibrates after a few more cycles. It&rsquo;s a caution flag, not a disqualification.</p>
        <hr class="rev-help-divider">
        <h4>How it&rsquo;s calculated</h4>
        <p><strong>Step 1 &mdash; per-cycle consistency score (0&ndash;100):</strong> every cycle from position 4 onward receives a score on three proximity dimensions, using medians derived from clean cycles as the reference. Both clean and non-clean cycles are scored (non-clean scores appear in the drill-down table), but only <em>clean</em> cycle scores feed the verdict regression in Step 2.</p>
        <p style="margin-top:4px">Each proximity dimension is 1.0 when the cycle matched the clean-series median exactly and 0.0 when it deviated by the full size of the median:</p>
        <div class="rev-help-rule" style="font-family:monospace;font-size:11px;line-height:2">Timing proximity    &nbsp;(40%)&nbsp; &mdash; weeks before ex-div vs series median<br>Dip depth proximity &nbsp;(40%)&nbsp; &mdash; % dip vs series median dip<br>Rebound proximity   &nbsp;(20%)&nbsp; &mdash; recovery magnitude vs series median<br><br>Score = (timing&times;0.4 + dip&times;0.4 + rebound&times;0.2) &times; 100<br><span style="color:var(--mu)">First 3 cycles always skipped (too few preceding cycles to form a median)</span></div>
        <p style="margin-top:8px"><strong>Step 2 &mdash; verdict from the score sequence:</strong> a linear regression is run over the sequence of per-cycle scores. The verdict requires <em>both</em> conditions to be met simultaneously:</p>
        <div class="rev-help-rule" style="line-height:2">
          <strong style="color:var(--rd)">Degrading</strong> &nbsp;&mdash;&nbsp; regression slope &lt; &minus;5 <em>AND</em> recent 3-cycle avg &lt; 60<br>
          <strong style="color:var(--gn)">Improving</strong> &nbsp;&mdash;&nbsp; regression slope &gt; +5 <em>AND</em> recent 3-cycle avg &gt; 70<br>
          <strong>Stable</strong> &nbsp;&mdash;&nbsp; everything else
        </div>
        <p style="margin-top:8px">Requiring both a slope threshold and a recent-average threshold prevents one unusual cycle from flipping the verdict. A falling slope with a still-strong recent average is not yet Degrading; a rising slope with a still-weak recent average is not yet Improving.</p>
      </div>

      <div class="rev-help-panel" data-tab="calendar">
        <h4>Calendar</h4>
        <p>How consistently the stock's seasonal entry window falls in the same months each year. A tight calendar is more predictable; a wide or inconsistent one is harder to time.</p>
        <ul>
          <li><strong>Consistent</strong> &mdash; entry window falls in a narrow seasonal band every year</li>
          <li><strong>Moderate</strong> &mdash; some spread across the year, but still has a seasonal lean</li>
          <li><strong>Wide</strong> &mdash; entry window shifts significantly year to year; harder to anticipate</li>
        </ul>
        <p style="margin-top:10px"><strong>What the entry window is:</strong> The calendar months when price historically dips before ex-dividend. Consistent means the same 1&ndash;2 month window repeats each year &mdash; you can plan in advance when to watch. Wide means the dip might arrive in January one year and July the next &mdash; the pattern exists, but you can&rsquo;t block out a specific watching period.</p>
        <hr class="rev-help-divider">
        <h4>How it&rsquo;s calculated</h4>
        <p>The rating is based on the <strong>day-of-year spread</strong> across all historical cycle lows. Each cycle low is mapped to its calendar day of year (1&ndash;365), then the <em>smallest circular window</em> covering all the lows is measured. The calendar is treated like a clock face &mdash; December 31 and January 1 are neighbours, not opposites. Without this, a stock with a tight Dec/Jan window would be severely misrated:</p>
        <div class="rev-help-rule" style="font-family:monospace;font-size:11px;line-height:2">Dec 28 &rarr; day 362 &nbsp;&nbsp; Jan 5 &rarr; day 5<br>Simple max&minus;min: 362 &minus; 5 = <strong>357 days &rarr; Wide</strong> &nbsp;(wrong)<br>Circular window: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<strong>&nbsp;~8 days &rarr; Consistent</strong> &nbsp;(correct)</div>
        <p style="margin-top:8px">For the typical case where all lows fall within the same half of the year, both methods give the same result. Example:</p>
        <div class="rev-help-rule" style="font-family:monospace;font-size:11px;line-height:2">Cycle 1 low: 15 Mar &rarr; day 74<br>Cycle 2 low: &nbsp;5 Apr &rarr; day 95<br>Cycle 3 low: 22 Mar &rarr; day 81<br>Cycle 4 low: 30 Mar &rarr; day 89<br><br>Spread: 21 days &rarr; <strong>Consistent</strong></div>
        <div class="rev-help-rule" style="line-height:2;margin-top:8px">Spread &le;&nbsp; 60 days &nbsp;(&asymp; 2 months) &rarr; <strong>Consistent</strong><br>Spread &le; 120 days &nbsp;(&asymp; 4 months) &rarr; <strong>Moderate</strong><br>Spread &gt; 120 days &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&rarr; <strong>Wide</strong></div>
        <p style="margin-top:8px">The modal window label (e.g. &ldquo;Sep/Oct window&rdquo;) is derived separately &mdash; it is the shortest set of months that covers at least 60% of historical cycle lows, giving you a practical watching period even for Moderate-rated stocks.</p>
        <hr class="rev-help-divider">
        <h4>Frequency</h4>
        <p>How often the company pays dividends. More frequent dividends mean more historical cycles to analyze, which makes the potential score more statistically reliable.</p>
        <ul>
          <li><strong style="color:var(--gn)">Quarterly / Monthly</strong> &mdash; 4&ndash;12 cycles per year; most data</li>
          <li><strong>Semi-Annual</strong> &mdash; 2 cycles per year</li>
          <li><strong style="color:var(--mu)">Annual / Irregular</strong> &mdash; 1 or fewer predictable cycles per year; fewer data points</li>
        </ul>
        <p style="margin-top:10px"><strong>Why it matters for reliability:</strong> More dividends per year means more clean cycles over the same number of years. A quarterly payer accumulates roughly 40 cycles in 10 years; an annual payer accumulates only 10. Percentile bounds and winsorisation are more stable with 40 data points &mdash; the zone is tighter and less influenced by any single unusual year. By default, only Quarterly, Semi-Annual, and Monthly payers are eligible &mdash; Annual and Irregular frequencies are excluded from the eligibility gate because the thin cycle history makes the zone statistically unreliable.</p>
        <p style="margin-top:8px"><strong>Why Monthly scores below Quarterly in the potential score:</strong> Monthly payers distribute their annual dividend yield across 12 payments instead of 4, so each individual dividend is smaller. A smaller dividend per event means a shallower pre-ex-div dip &mdash; the price barely moves before each payment, making individual cycles harder to enter and exit for a meaningful return. Monthly payers still score above Semi-Annual because they generate more data points, but the reduced trade amplitude per cycle is penalised relative to Quarterly, where each payment is large enough to produce a clear, actionable dip.</p>
      </div>

      <div class="rev-help-panel" data-tab="logic">
        <h4>Auto-Assignment Logic</h4>
        <p style="margin-bottom:8px"><strong>Eligible</strong> means the stock passed all minimum criteria: &ge;3 clean cycles, win rate &ge;50%, &ge;2 years of data, dividend frequency is Quarterly/Semi-Annual/Monthly (Annual and Irregular excluded by default), and tail risk is not SEVERE. Failing any gate removes the potential score. An ineligible stock can still appear in Worth Watching if its zone hit rate or growth signal is strong enough, but it cannot be assigned To Keep.</p>
        <div class="rev-help-rule">
          <strong>To Keep</strong> &mdash; eligible + zone hit &gt; 15% + pattern not Degrading<br>
          <strong style="color:#c9a227">Worth Watching</strong> &mdash; any of:<br>
          <span style="padding-left:12px;display:block">· Eligible + zone hit &gt; 15% + Degrading (good entry access, weakening pattern)</span>
          <span style="padding-left:12px;display:block">· Eligible + zone hit 1&ndash;15% + quality signal (score &ge;65, Improving, or avg gain &ge;6%)</span>
          <span style="padding-left:12px;display:block">· Eligible + zone hit 0% + strong signal (score &ge;70, Improving, growth &ge;15% with score &ge;65, or currently Inside)</span>
          <span style="padding-left:12px;display:block">· Not eligible + zone hit &ge; 50% + win rate &ge; 65% (strong execution, structural gap)</span>
          <span style="padding-left:12px;display:block">· Not eligible + 5yr growth &ge; 25% with some zone activity (healthy business, monitor)</span>
          <span style="display:block;margin-top:4px;margin-bottom:4px;font-style:italic;color:var(--mu)">Quality floors (score &ge;65 / &ge;70) are set above the eligibility pass mark because a monitoring slot has a cost &mdash; a weak setup that never provides entry is noise, not a genuine candidate.</span>
          <strong>To Remove</strong> &mdash; everything else<br>
          <span style="display:block;margin-top:6px">Use the buttons on each card to override. Overrides are saved and shown as <em>(manually moved)</em>.</span>
        </div>
      </div>
    </div>
  </div>`;

  return`<div class="panel">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
      <h2 style="margin:0">Review &mdash; Keep or Remove?</h2>
      <button id="reviewHelpBtn" style="font-size:11px;padding:3px 9px;border-radius:5px;border:1px solid var(--bd);background:var(--sf);color:var(--mu);cursor:pointer;white-space:nowrap;flex-shrink:0">About these metrics</button>
    </div>
    <p class="small muted" style="margin:0 0 8px">Auto-assigned by potential score, zone hit rate, pattern stability, and 5yr price growth. Click any stock to drill in. Use the buttons on each card to override. Finalise removals via "Edit stock list".</p>
    ${resetBtn?`<div style="margin-bottom:8px">${resetBtn}</div>`:`<div style="margin-bottom:8px"></div>`}
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <input id="revSearch" type="text" placeholder="Filter by ticker or name…" value="${(state.reviewSearch||'').replace(/"/g,'&quot;')}" style="padding:4px 10px;border:1px solid var(--bd);border-radius:4px;background:var(--sf);color:var(--tx);font-size:12px">
      ${revQ?`<span style="font-size:11px;color:var(--mu)">${keepList.length+watchList.length+removeList.length} of ${keepTotal+watchTotal+removeTotal} shown</span>`:""}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;align-items:start">
      <div class="rev-col">
        <h3 style="font-size:13px;font-weight:700;margin:0 0 6px;color:var(--gn)">To Keep <span style="font-weight:400;font-size:11px;color:var(--mu)">${revQ&&keepList.length!==keepTotal?`${keepList.length} / ${keepTotal}`:keepList.length} stock${keepList.length!==1?"s":""}</span></h3>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${sortBar("keep",revSort.keep||"score")}</div>
        <div class="rev-list" style="max-height:65vh;overflow-y:auto;padding-right:4px">${keepHtml}</div>
      </div>
      <div class="rev-col">
        <h3 style="font-size:13px;font-weight:700;margin:0 0 6px;color:#c9a227">Worth Watching <span style="font-weight:400;font-size:11px;color:var(--mu)">${revQ&&watchList.length!==watchTotal?`${watchList.length} / ${watchTotal}`:watchList.length} stock${watchList.length!==1?"s":""}</span></h3>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${sortBar("watch",revSort.watch||"zoneHit")}</div>
        <div class="rev-list" style="max-height:65vh;overflow-y:auto;padding-right:4px">${watchHtml}</div>
      </div>
      <div class="rev-col">
        <h3 style="font-size:13px;font-weight:700;margin:0 0 6px;color:var(--rd)">To Remove <span style="font-weight:400;font-size:11px;color:var(--mu)">${revQ&&removeList.length!==removeTotal?`${removeList.length} / ${removeTotal}`:removeList.length} stock${removeList.length!==1?"s":""}</span></h3>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${sortBar("remove",revSort.remove||"score")}</div>
        <div class="rev-list" style="max-height:65vh;overflow-y:auto;padding-right:4px">${removeHtml}</div>
      </div>
    </div>
    ${helpModal}
  </div>`;
}

/* ?? COMPARISON PANEL ???????????????????????????????????????????????????
 */
function panelComparison(){
  let stocks=activeStockList();
  if(!stocks.length)return`<div class="panel"><div class="empty" style="padding:32px 0">No stocks match the current filters.</div></div>`;

  // sector + entry status filters
  const allSectors=[...new Set(stocks.map(s=>sectorLabelForTicker(s.data.meta?.ticker||s.key)).filter(Boolean))].sort();
  if(state.cmpFilterSector&&state.cmpFilterSector!=="all")
    stocks=stocks.filter(s=>sectorLabelForTicker(s.data.meta?.ticker||s.key)===state.cmpFilterSector);
  if(state.cmpFilterEntryStatus&&state.cmpFilterEntryStatus!=="all")
    stocks=stocks.filter(s=>upcomingSeries(s.data)?.proj.entry_status===state.cmpFilterEntryStatus);

  const rowGroups=[
    {label:"Setup now",rows:[
      {key:"current_price",label:"Current Price",tip:"Latest price from the loaded Dividend Cycle Analysis JSON for each stock.",fn:(s)=>{const m=s.data.meta||{};return ccy(s.data.current_price,m.currency)},sort:(s)=>Number(s.data.current_price)||0},
      {key:"frequency",label:"Frequency",tip:"Dividend frequency detected from the stock's historical dividend pattern.",fn:(s)=>s.data.meta?.frequency_display || "-",sort:(s)=>s.data.meta?.frequency||""},
      {key:"next_exdiv",label:"Next Ex-Div",tip:"Nearest projected ex-dividend series/date from the stock's forward projection.",fn:(s)=>{const up=upcomingSeries(s.data);return up?`${esc(up.id)} ${dt(up.proj.proj_exdiv_date)}`:"-"},sort:(s)=>{const up=upcomingSeries(s.data);return up?new Date(up.proj.proj_exdiv_date).getTime():Infinity}},
      {key:"days_to_exdiv",label:"Days to Ex-Div",tip:"Calendar days remaining until the next projected ex-dividend date.",fn:(s)=>{const up=upcomingSeries(s.data);const d=up?daysFrom(up.proj.proj_exdiv_date):null;return d!==null?`<span class="${d<=30?"warn":""}">${d}d</span>`:"-"},raw:true,sort:(s)=>{const up=upcomingSeries(s.data);return up?daysFrom(up.proj.proj_exdiv_date)??Infinity:Infinity}},
      {key:"entry_status",label:"Entry Status",tip:"Where current price sits relative to the projected entry zone: above, inside, or below.",fn:(s)=>{const up=upcomingSeries(s.data);const st=up?.proj.entry_status;const display=up?.proj.entry_status_display;return st?`<span class="${tagClass(st)}">${esc(display||"-")}</span>`:"-"},raw:true,sort:(s)=>{const order={INSIDE:0,BELOW:1,ABOVE:2};const st=(upcomingSeries(s.data)?.proj.entry_status||"");return order[st]??9}},
      {key:"entry_zone",label:"Entry Zone",tip:"Projected buy range where historical dips tended to occur before ex-dividend.",fn:(s)=>{const up=upcomingSeries(s.data);const m=s.data.meta||{};return up?zoneInline(up.proj.zone_bot,up.proj.zone_top,m.currency):"-"},raw:true,sort:(s)=>{const up=upcomingSeries(s.data);return Number(up?.proj.zone_bot)||0}},
    ]},
    {label:"Historical edge",rows:[
      {key:"win_rate",label:"Win Rate (next)",tip:"Clean win rate / all-cycles rate. Clean = only non-degen tradeable setups in denominator. All = every cycle attempt. A large gap between the two means many degen cycles.",fn:(s)=>{const hf=upcomingSeries(s.data)?.proj.historical_frequencies;const wr=hf?.win_rate;const wra=hf?.win_rate_all;return wr!=null?`<span class="${Number(wr)>=70?"good":Number(wr)>=50?"warn":"bad"}">${pctRaw(wr,0)}</span>${wra!=null?`<span class="muted" style="font-size:10px"> / ${pctRaw(wra,0)}</span>`:""}`:"-"},raw:true,sort:(s)=>Number(upcomingSeries(s.data)?.proj.historical_frequencies?.win_rate)||0},
      {key:"cgc_top",label:"CGC Top Series",tip:"Highest-ranked series by CGC score for that stock.",fn:(s)=>{const c=(s.data.cgc_ranking||[])[0];return c?`${esc(c.series_id)} (${n(c.score,1)})`:"-"},sort:(s)=>Number((s.data.cgc_ranking||[])[0]?.score)||0},
      {key:"cgc_win_rate",label:"CGC Win Rate #1",tip:"Historical win rate of the stock's top-ranked CGC series.",fn:(s)=>{const c=(s.data.cgc_ranking||[])[0];return c?`<span class="${Number(c.win_rate)>=70?"good":Number(c.win_rate)>=50?"warn":"bad"}">${pctRaw(c.win_rate,0)}</span>`:"-"},raw:true,sort:(s)=>Number((s.data.cgc_ranking||[])[0]?.win_rate)||0},
      {key:"clean_cycles",label:"Clean Cycles",tip:"Count of non-macro, non-outlier, non-degenerate, complete cycles used in the analysis.",fn:(s)=>String((s.data.series_meta||[]).reduce((a,sm)=>a+(s.data.ss_series?.[sm.id]?.clean?.n_clean||0),0)),sort:(s)=>(s.data.series_meta||[]).reduce((a,sm)=>a+(s.data.ss_series?.[sm.id]?.clean?.n_clean||0),0)},
      {key:"years_data",label:"Years Data",tip:"Approximate number of historical years covered by the loaded dataset.",fn:(s)=>n(s.data.years_covered,1)+"y",sort:(s)=>Number(s.data.years_covered)||0},
      {key:"timing",label:"Timing (next)",tip:"How consistently the cycle low timing has appeared historically for the next projected series.",fn:(s)=>{const up=upcomingSeries(s.data);const t=up?.proj.timing_rating;const display=up?.proj.timing_rating_display;return t?`<span class="${tagClass(t)}">${esc(display||"-")}</span>`:"-"},raw:true,sort:(s)=>{const order={RELIABLE:0,BIMODAL:1,UNRELIABLE:2};return order[upcomingSeries(s.data)?.proj.timing_rating||""]??9}},
    ]},
    {label:"Exit profile",rows:[
      {key:"exit_mode",label:"Exit Mode",tip:"Historical exit preference for the next projected series, comparing the pre-exdiv peak exit versus the ex-div date exit reference.",fn:(s)=>{const up=upcomingSeries(s.data);const ep=up?s.data.ss_series?.[up.id]?.exit_profile:null;return ep?.exit_mode_verdict?esc(ep.exit_mode_verdict_display||"-"):"-"},sort:(s)=>{const up=upcomingSeries(s.data);const verdict=s.data.ss_series?.[up?.id||""]?.exit_profile?.exit_mode_verdict;const order={PRE_EXDIV_PREFERRED:0,POST_EXDIV_PREFERRED:1,INDETERMINATE:2,INSUFFICIENT_DATA:3};return order[verdict]??9}},
      {key:"gain_pre_exdiv",label:"Avg Gain (Pre-Exdiv Peak Exit)",tip:"Historical average gain from cycle low to the highest close reached before ex-dividend for the next projected series.",fn:(s)=>{const up=upcomingSeries(s.data);const v=s.data.ss_series?.[up?.id||""]?.exit_profile?.avg_gain_pre_exdiv;return v!=null?pctRaw(v,2):"-"},sort:(s)=>{const up=upcomingSeries(s.data);const v=Number(s.data.ss_series?.[up?.id||""]?.exit_profile?.avg_gain_pre_exdiv);return Number.isFinite(v)?v:-Infinity}},
      {key:"pre_exdiv_timing",label:"Usual Pre-Exdiv Peak Window",tip:"Historical interquartile range (25th to 75th percentile) for how many days before ex-dividend the pre-exdiv peak exit typically occurred for the next projected series.",fn:(s)=>{const up=upcomingSeries(s.data);const ep=s.data.ss_series?.[up?.id||""]?.exit_profile;const p25=ep?.pre_exdiv_peak_window_days_p25;const p75=ep?.pre_exdiv_peak_window_days_p75;return p25!=null&&p75!=null?`${n(p25,1)}d - ${n(p75,1)}d`:"-"},sort:(s)=>{const up=upcomingSeries(s.data);const ep=s.data.ss_series?.[up?.id||""]?.exit_profile;const p25=Number(ep?.pre_exdiv_peak_window_days_p25);return Number.isFinite(p25)?p25:Infinity}},
      {key:"gain_post_exdiv_exit",label:"Avg Gain (Ex-Div Date Exit)",tip:"Historical average gain from cycle low to the first available close on or after the ex-dividend date for the next projected series.",fn:(s)=>{const up=upcomingSeries(s.data);const v=s.data.ss_series?.[up?.id||""]?.exit_profile?.avg_gain_post_exdiv_exit;return v!=null?pctRaw(v,2):"-"},sort:(s)=>{const up=upcomingSeries(s.data);const v=Number(s.data.ss_series?.[up?.id||""]?.exit_profile?.avg_gain_post_exdiv_exit);return Number.isFinite(v)?v:-Infinity}},
      {key:"pre_exdiv_win_rate",label:"Pre-Exdiv Peak Win Rate",tip:"Historical share of complete cycles where the pre-exdiv peak exit cleared the gain threshold for the next projected series.",fn:(s)=>{const up=upcomingSeries(s.data);const v=s.data.ss_series?.[up?.id||""]?.exit_profile?.pre_exdiv_win_rate;return v!=null?`<span class="${Number(v)>=70?"good":Number(v)>=50?"warn":"bad"}">${pctRaw(v,1)}</span>`:"-"},raw:true,sort:(s)=>{const up=upcomingSeries(s.data);const v=Number(s.data.ss_series?.[up?.id||""]?.exit_profile?.pre_exdiv_win_rate);return Number.isFinite(v)?v:-Infinity}},
    ]},
    {label:"Risk and coverage",rows:[
      {key:"tail_risk",label:"Tail Risk",tip:"Shows whether bad historical cycles fell much deeper than the expected buy zone. In plain terms: even after entering inside the zone, price may still drop more than the zone estimate.",fn:(s)=>{const tail=upcomingSeries(s.data)?.proj.tail_risk;const level=normalizeTailRiskLevel(tail);const display=tail?.tail_level_display;return level&&level!=="UNKNOWN"?`<span class="${tagClass(level)}">${esc(display||"-")}</span>`:"-"},raw:true,sort:(s)=>TAIL_RISK_ORDER[normalizeTailRiskLevel(upcomingSeries(s.data)?.proj.tail_risk)]??TAIL_RISK_ORDER.UNKNOWN},
      {key:"div_trend",label:"Div Trend",tip:"Direction of projected dividend amounts based on recent historical pattern: rising, stable, or falling.",fn:(s)=>{const up=upcomingSeries(s.data);const t=up?.proj.div_trend;const display=up?.proj.div_trend_display;return t?`<span class="${t==="RISING"?"good":t==="FALLING"||t==="DECLINING"?"bad":""}">${esc(display||"-")}</span>`:"-"},raw:true,sort:(s)=>{const order={RISING:0,STABLE:1,FALLING:2,DECLINING:2};return order[upcomingSeries(s.data)?.proj.div_trend||""]??9}},
      {key:"yield_range",label:"Yield Range",tip:"Projected dividend yield range for the next series based on low/high dividend assumptions.",fn:(s)=>{const up=upcomingSeries(s.data);return up?`${pctRaw(up.proj.div_yield_lo,2)} &ndash; ${pctRaw(up.proj.div_yield_hi,2)}`:"-"},sort:(s)=>Number(upcomingSeries(s.data)?.proj.div_yield_lo)||0},
      {key:"liquidity",label:"Avg Volume (30d)",tip:"30-day average traded volume for the next projected series. Adequacy % shows what share of historical cycle weeks had volume above the minimum threshold.",fn:(s)=>{const liq=s.data.ss_series?.[upcomingSeries(s.data)?.id||""]?.liquidity||{};const vol=Number(liq.avg_volume_30d);const adq=Number(liq.adequacy_pct);if(!Number.isFinite(vol))return"-";const volFmt=vol>=1e6?`${(vol/1e6).toFixed(1)}M`:vol>=1e3?`${(vol/1e3).toFixed(0)}K`:String(vol);const adqClass=adq>=80?"good":adq>=50?"warn":"bad";return`${volFmt}${Number.isFinite(adq)?` <span class="${adqClass}">${adq.toFixed(0)}%</span>`:""}`;},raw:true,sort:(s)=>Number(s.data.ss_series?.[upcomingSeries(s.data)?.id||""]?.liquidity?.avg_volume_30d)||0},
    ]},
  ];
  const rows=rowGroups.flatMap(group=>group.rows);

  const sortOptions=[{key:"none",label:"Manual order"},...rows.map(r=>({key:r.key,label:r.label}))];
  const selectedSort=rows.find(r=>r.key===state.cmpSortKey);
  if(selectedSort){
    stocks=[...stocks].sort((a,b)=>{
      const av=selectedSort.sort(a), bv=selectedSort.sort(b);
      if(typeof av==="string"||typeof bv==="string"){
        return String(av).localeCompare(String(bv))* (state.cmpSortDir==="desc"?-1:1);
      }
      return ((av>bv)-(av<bv)) * (state.cmpSortDir==="desc"?-1:1);
    });
  }

  const colHeaders=stocks.map((s,i)=>`<th class="cmp-stock-head" data-key="${esc(s.key)}" data-col-index="${i+1}" style="cursor:pointer;user-select:none" title="Open ${esc(s.data.meta?.ticker||s.key)}"><div style="font-family:var(--mono);font-weight:700;font-size:12px;color:var(--tx)">${esc(s.data.meta?.ticker||s.key)}</div><div style="font-size:10px;color:var(--mu);font-weight:400;text-transform:none;letter-spacing:0">${esc(s.data.meta?.stock_name||"")}</div></th>`).join("");
  const tableRows=rowGroups.map(group=>{
    const sectionRow=`<tr class="cmp-section-row"><td colspan="${stocks.length+1}">${esc(group.label)}</td></tr>`;
    const metricRows=group.rows.map(r=>`<tr><td class="metric-label no-drag">${tipLabel(r.label,r.tip||"")}</td>${stocks.map((s,i)=>`<td data-col-index="${i+1}">${r.raw?r.fn(s):esc(r.fn(s))}</td>`).join("")}</tr>`).join("");
    return sectionRow+metricRows;
  }).join("");
  const metricColHeaders=`<th class="metric-label no-drag">Metric</th>`;
  const sectorOptions=`<option value="all">All sectors</option>${allSectors.map(sec=>`<option value="${esc(sec)}" ${state.cmpFilterSector===sec?"selected":""}>${esc(sec)}</option>`).join("")}`;
  const entryStatusOptions=`<option value="all">All</option><option value="INSIDE" ${state.cmpFilterEntryStatus==="INSIDE"?"selected":""}>Inside zone</option><option value="BELOW" ${state.cmpFilterEntryStatus==="BELOW"?"selected":""}>Below zone</option><option value="ABOVE" ${state.cmpFilterEntryStatus==="ABOVE"?"selected":""}>Above zone</option>`;
  const sortUI=`<div class="stock-selector" style="margin-bottom:8px"><span class="small muted">Sort by</span><select id="cmpSortKey">${sortOptions.map(opt=>`<option value="${opt.key}" ${state.cmpSortKey===opt.key?"selected":""}>${opt.label}</option>`).join("")}</select><select id="cmpSortDir" ${state.cmpSortKey==='none'?'disabled':''}><option value="asc" ${state.cmpSortDir==='asc'?'selected':''}>Ascending</option><option value="desc" ${state.cmpSortDir==='desc'?'selected':''}>Descending</option></select><span class="small muted" style="margin-left:10px">Sector</span><select id="cmpFilterSector">${sectorOptions}</select><span class="small muted" style="margin-left:10px">Entry status</span><select id="cmpFilterEntryStatus">${entryStatusOptions}</select></div><input id="cmpSearch" type="text" placeholder="Search by ticker or name…" autocomplete="off" value="${(state.cmpSearch||'').replace(/"/g,'&quot;')}">`;

  return`<div class="panel"><h2>Comparison &mdash; All Loaded Stocks</h2><p class="small muted" style="margin:0 0 12px">Rows show next projected ex-div series. Use the sort controls for ordering. Drag to scroll horizontally from the stock columns area. Click any stock header or stock chip to drill in.</p>${sortUI}<div class="cmp-table-wrap drag-scroll"><table><thead><tr>${metricColHeaders}${colHeaders}</tr></thead><tbody>${tableRows}</tbody></table></div></div>`
}

/* ?? MINI CARDS GRID ??????????????????????????????????????????????????? */
function panelMiniCards(){
  const stocks=activeStockList().slice().sort((a,b)=>{
    const aTicker=(a?.data?.meta?.ticker||a?.key||"").toUpperCase();
    const bTicker=(b?.data?.meta?.ticker||b?.key||"").toUpperCase();
    return aTicker.localeCompare(bTicker);
  });
  if(!stocks.length)return"";
  return`<div class="panel">
    <h2>Portfolio Overview — Mini Cards</h2>
    <div class="mini-search-row">
      <input type="search" id="miniCardSearch" placeholder="Search by ticker or name…" autocomplete="off" spellcheck="false">
      <span class="mini-search-count" id="miniCardCount">${stocks.length} stock${stocks.length!==1?"s":""}</span>
    </div>
    <div class="mini-grid" id="miniGrid">
      ${stocks.map(s=>renderMiniCard(s)).join("")}
    </div>
  </div>`
}

function panelTradePlanner(){
  if(!plannerKeys().length){
    return `<div class="panel"><h2>Trade Planner</h2><p class="small muted" style="margin:0 0 12px">Add stocks from the cards into the planner to build a live schedule for the nearest next cycle.</p><div class="empty">No planned stocks yet. Use <strong>Add to Planner</strong> on a mini card or grouped card to start building a trading schedule.</div></div>`;
  }
  const activeKey=ensurePlannerActive();
  const plannerItems=buildPlannerItems();
  if(!plannerItems.length){
    return `<div class="panel"><h2>Trade Planner</h2><div class="empty">Planner items were selected, but no nearest next-cycle projections are available yet.</div></div>`;
  }
  const activeItem=plannerItems.find(item=>item.key===activeKey)||plannerItems[0];
  const activePlan=activeItem.plan;
  const activeOverride=activeItem.overrides;
  const nextWatchDate=plannerItems
    .map(item=>plannerTimelineModel(item.plan)?.watchDate)
    .filter(Boolean)
    .map(v=>({raw:v,ts:isoDateParts(v)?.getTime()}))
    .filter(v=>Number.isFinite(v.ts))
    .sort((a,b)=>a.ts-b.ts)[0]?.raw;
  const nextExDivDate=plannerItems
    .map(item=>item.plan?.effectiveExDiv)
    .filter(Boolean)
    .map(v=>({raw:v,ts:isoDateParts(v)?.getTime()}))
    .filter(v=>Number.isFinite(v.ts))
    .sort((a,b)=>a.ts-b.ts)[0]?.raw;
  const overrideCount=plannerItems.filter(item=>item.plan?.hasOverride).length;
  const statusChip=activePlan.hasOverride
    ? `<span class="chip warn">${esc(activePlan.overrideStatus)}</span>`
    : ``;
  return `<div class="panel">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <h2>Trade Planner</h2>
      </div>
      <button class="btn btn-compact" type="button" id="plannerExportCsv">Export Planner to CSV</button>
    </div>
    <p class="small muted" style="margin:0 0 12px">This planner only uses the nearest next cycle for each stock. Stocks are sorted by the earliest buy-watch timing, then by ticker. Milestones are estimated until official inputs are added. Official dates and dividend amounts update the planning schedule, while historical ratings stay unchanged. Current Verdict is a broader action guide, not a hard block, so you may still act with your own judgment and caution.</p>
    <div class="planner-summary-grid">
      <div class="planner-summary-card"><div class="label">Planned stocks</div><div class="value">${plannerItems.length}</div><div class="small muted">Nearest next-cycle setups currently tracked.</div></div>
      <div class="planner-summary-card"><div class="label">Next watch date</div><div class="value">${nextWatchDate?dt(nextWatchDate):"-"}</div><div class="small muted">${nextWatchDate&&daysFrom(nextWatchDate)!=null?`${daysFrom(nextWatchDate)}d from today`:"Waiting for usable watch timing."}</div></div>
      <div class="planner-summary-card"><div class="label">Next effective ex-div</div><div class="value">${nextExDivDate?dt(nextExDivDate):"-"}</div><div class="small muted">${nextExDivDate&&daysFrom(nextExDivDate)!=null?`${daysFrom(nextExDivDate)}d away`:"No active ex-div date available."}</div></div>
      <div class="planner-summary-card"><div class="label">Overrides active</div><div class="value">${overrideCount}</div><div class="small muted">${overrideCount?`${overrideCount} planner item${overrideCount>1?"s have":" has"} updated inputs.`:"No overrides applied yet."}</div></div>
    </div>
    ${renderPlannerBoardTimeline(plannerItems)}
    <div class="planner-grid">
      ${plannerItems.map(item=>{
        const plan=item.plan;
        const entityMeta=entityMetaInline(item.ticker);
        return `<div class="planner-card${item.key===activeItem.key?" active":""}" data-planner-card="${esc(item.key)}">
          <div class="planner-card-head">
            <div>
              <div class="planner-card-title">${esc(item.ticker)}</div>
              <div class="planner-card-sub">${esc(item.stockName)}${entityMeta?` · ${entityMeta}`:""}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
              ${verdictPill(item.metrics.finalVerdict,item.metrics.finalVerdictTone)}
            </div>
          </div>
          <div class="planner-status-row">
            <span class="chip">${esc(plan.id)}</span>
            ${item.metrics.tailRiskLevel?`<span class="chip ${tagClass(item.metrics.tailRiskLevel)}">Tail: ${esc(item.metrics.tailRiskDisplay||"-")}</span>`:""}
            <span class="chip">${esc(plannerExitModeChipLabel(item.metrics.exitModeDisplay||"-"))}</span>
          </div>
          <div class="planner-card-section">
            <div class="planner-card-section-title"><span>Core setup</span><span>${esc(plan.overrideStatus)}</span></div>
            <div class="planner-card-grid">
              <div class="mini-stat"><span class="ms-label">Current price: </span>${ccy(item.currentPrice,item.currency)}</div>
              <div class="mini-stat"><span class="ms-label">Entry zone: </span>${zoneInline(plan.proj.zone_bot,plan.proj.zone_top,item.currency)}</div>
              <div class="mini-stat"><span class="ms-label">Effective ex-div: </span>${dt(plan.effectiveExDiv)}</div>
              <div class="mini-stat"><span class="ms-label">Days away: </span>${daysFrom(plan.effectiveExDiv)!=null?`${daysFrom(plan.effectiveExDiv)}d`:"-"}</div>
            </div>
          </div>
          <div class="planner-card-section">
            <div class="planner-card-section-title"><span>Plan</span><span>${plan.hasOverride?"Updated":"Estimated"}</span></div>
            <div class="planner-card-grid">
              <div class="mini-stat${plannerChangedClass(plan.baseEntryPrice,plan.effectiveEntryPrice)}"><span class="ms-label">Planned entry: </span>${ccy(plan.effectiveEntryPrice,item.currency)}${plan.baseEntryPrice!==plan.effectiveEntryPrice?`<span class="delta-note">Base ${ccy(plan.baseEntryPrice,item.currency)}</span>`:""}</div>
              <div class="mini-stat${plannerChangedClass(plan.baseExpectedGainPct,plan.expectedGainPct,0.009)}"><span class="ms-label">Expected gain: </span>${plan.expectedGainPct!=null?pctRaw(plan.expectedGainPct,2):"-"}${plan.baseExpectedGainPct!==plan.expectedGainPct?`<span class="delta-note">Base ${plan.baseExpectedGainPct!=null?pctRaw(plan.baseExpectedGainPct,2):"-"}</span>`:""}</div>
              <div class="mini-stat"><span class="ms-label">Buy watch: </span>${esc(plan.buyWatchLabel)}</div>
              <div class="mini-stat"><span class="ms-label">Sell plan: </span>${esc(plan.sellPlan)}</div>
            </div>
            ${renderPlannerTimeline(plan,true)}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="planner-action" type="button" data-planner-open="${esc(item.key)}">Open Stock</button>
            <button class="planner-action" type="button" data-planner-toggle="${esc(item.key)}">Remove from Planner</button>
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="planner-detail">
      <div class="planner-card-head" style="margin-bottom:14px">
        <div>
          <div class="planner-card-title">${esc(activeItem.ticker)} Planner Detail</div>
          <div class="planner-card-sub">${esc(activeItem.stockName)}${entityMetaInline(activeItem.ticker)?` · ${entityMetaInline(activeItem.ticker)}`:""} · nearest next cycle ${esc(activePlan.id)}</div>
        </div>
        ${statusChip}
      </div>
      ${renderPlannerSetupSummary(activeItem)}
      <div class="planner-detail-grid">
        <div class="planner-field">
          <div class="label">Overrides</div>
          <div class="small muted" style="margin-bottom:8px">Leave blank to use the projected date. When an official date is announced, set it here and the planner schedule will shift accordingly.</div>
          <div class="small muted" style="margin:0 0 8px">Official ex-div date</div>
          <input type="date" data-planner-date="${esc(activeItem.key)}" value="${esc(activeOverride.officialExDivDate||"")}">
          <div class="small muted" style="margin:12px 0 8px">Official dividend amount override</div>
          <input type="number" step="0.0001" min="0" data-planner-div="${esc(activeItem.key)}" value="${esc(activeOverride.officialDivAmount||"")}" placeholder="e.g. 0.0120">
          <div class="small muted" style="margin:12px 0 8px">Planned entry price</div>
          <input type="number" step="0.0001" min="0" data-planner-entry="${esc(activeItem.key)}" value="${esc(activeOverride.plannedEntryPrice||"")}" placeholder="Use zone bottom if left blank">
          <div class="planner-field-actions">
            <button class="planner-small-btn" type="button" data-planner-reset="${esc(activeItem.key)}">Clear all overrides</button>
          </div>
        </div>
        <div class="planner-detail-stack">
          <div class="planner-field">
            <div class="label">Updated schedule and plan</div>
            <div class="small muted" style="margin-bottom:8px">Planner timing updates around the effective ex-div date. Official dividend and planned entry change the live planning outputs below.</div>
            ${activePlan.timingReevaluationNote?`<div class="section-note" style="margin-bottom:10px">${esc(activePlan.timingReevaluationNote)}</div>`:""}
            ${renderPlannerDiffSummary(activePlan,activeItem.currency)}
            ${renderPlannerTimeline(activePlan,false)}
          </div>
          <div class="planner-field">
            <div class="label">Updated outputs</div>
            <div class="small muted" style="margin-bottom:8px">Changed values are highlighted so it is easier to see what moved after an override.</div>
            <div class="planner-card-grid">
              <div class="mini-stat${plannerChangedClass(activePlan.baseExDiv,activePlan.effectiveExDiv)}"><span class="ms-label">Projected ex-div: </span>${dt(activePlan.baseExDiv)}</div>
              <div class="mini-stat${plannerChangedClass(activePlan.baseExDiv,activePlan.effectiveExDiv)}"><span class="ms-label">Effective ex-div: </span>${dt(activePlan.effectiveExDiv)}${activePlan.baseExDiv!==activePlan.effectiveExDiv?`<span class="delta-note">Updated from projected date</span>`:""}</div>
              <div class="mini-stat${activePlan.proj?.est_low_date && dt(activePlan.proj.est_low_date)!==activePlan.buyWatchLabel ? " changed" : ""}"><span class="ms-label">Buy watch: </span>${esc(activePlan.buyWatchLabel)}${activePlan.hasOverride?`<span class="delta-note">Planning window shifts around the effective ex-div date</span>`:""}</div>
              <div class="mini-stat"><span class="ms-label">Sell plan: </span>${esc(activePlan.sellPlan)}</div>
              <div class="mini-stat"><span class="ms-label">Entry zone: </span>${zoneInline(activePlan.proj.zone_bot,activePlan.proj.zone_top,activeItem.currency)}</div>
              <div class="mini-stat${plannerChangedClass(activePlan.baseEntryPrice,activePlan.effectiveEntryPrice)}"><span class="ms-label">Planned entry: </span>${ccy(activePlan.effectiveEntryPrice,activeItem.currency)}${activePlan.baseEntryPrice!==activePlan.effectiveEntryPrice?`<span class="delta-note">Base zone bottom ${ccy(activePlan.baseEntryPrice,activeItem.currency)}</span>`:""}</div>
              <div class="mini-stat"><span class="ms-label">Target exit px: </span>${ccy(activePlan.targetExitPx,activeItem.currency)}</div>
              <div class="mini-stat${plannerChangedClass(activePlan.baseExpectedGainPct,activePlan.expectedGainPct,0.009)}"><span class="ms-label">Expected gain: </span>${activePlan.expectedGainPct!=null?pctRaw(activePlan.expectedGainPct,2):"-"}${activePlan.baseExpectedGainPct!==activePlan.expectedGainPct?`<span class="delta-note">Base ${activePlan.baseExpectedGainPct!=null?pctRaw(activePlan.baseExpectedGainPct,2):"-"}</span>`:""}</div>
              <div class="mini-stat${plannerChangedClass(activePlan.baseDivAmount,activePlan.effectiveDivAmount)}"><span class="ms-label">Dividend amount: </span>${activePlan.effectiveDivAmount!=null?ccy(activePlan.effectiveDivAmount,activeItem.currency):"-"}${activePlan.baseDivAmount!==activePlan.effectiveDivAmount?`<span class="delta-note">Base ${activePlan.baseDivAmount!=null?ccy(activePlan.baseDivAmount,activeItem.currency):"-"}</span>`:""}</div>
              <div class="mini-stat${plannerChangedClass(activePlan.baseYieldOnCostPct,activePlan.yieldOnCostPct,0.009)}"><span class="ms-label">Yield on cost: </span>${activePlan.yieldOnCostPct!=null?pctRaw(activePlan.yieldOnCostPct,2):"-"}${activePlan.baseYieldOnCostPct!==activePlan.yieldOnCostPct?`<span class="delta-note">Base ${activePlan.baseYieldOnCostPct!=null?pctRaw(activePlan.baseYieldOnCostPct,2):"-"}</span>`:""}</div>
              <div class="mini-stat"><span class="ms-label">Tail risk: </span>${activeItem.metrics.tailRiskLevel?`<span class="${tagClass(activeItem.metrics.tailRiskLevel)}">${esc(activeItem.metrics.tailRiskDisplay||"-")}</span>`:"-"}</div>
              <div class="mini-stat"><span class="ms-label">Timing: </span>${activePlan.proj?.timing_rating?`<span class="${tagClass(activePlan.proj.timing_rating)}">${esc(activePlan.proj.timing_rating_display||activePlan.proj.timing_rating)}</span>`:"-"}</div>
              <div class="mini-stat"><span class="ms-label">Current verdict: </span>${activeItem.metrics.finalVerdict?`<span class="${activeItem.metrics.finalVerdictTone==="good"?"good":activeItem.metrics.finalVerdictTone==="warn"?"warn":activeItem.metrics.finalVerdictTone==="bad"?"bad":activeItem.metrics.finalVerdictTone==="muted"?"muted":""}">${esc(activeItem.metrics.finalVerdict)}</span>`:"-"}</div>
              <div class="mini-stat"><span class="ms-label">Override status: </span>${esc(activePlan.overrideStatus)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function stockEntryForTicker(ticker){
  return state.stocks[ticker]||stockList().find(s=>s.data?.meta?.ticker===ticker)||null;
}
function pfCcy(v,c=""){
  if(v==null||!Number.isFinite(Number(v)))return"-";
  return`${c?c+" ":""}${Number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
// Shared across every Portfolio-tab panel that colors a P&L figure --
// previously redeclared identically in each panel function.
function pnlTone(v){return v==null?"":v>0?"good":v<0?"bad":"";}
// Shared Weekly/Monthly/Yearly toggle -- identical markup on the Holdings
// tab's "Value Over Time" chart and the History & P&L tab's "Account Value
// Over Time" chart (safe to share ids across both: panelPortfolio() renders
// exactly one sub-tab per call, so only one copy is ever in the DOM).
function portfolioGranularityToggleHtml(granularity){
  return`<div class="tabs" style="margin:0 0 12px">
    <button class="tab ${granularity==="weekly"?"active":""}" id="pfGranWeekly">Weekly</button>
    <button class="tab ${granularity==="monthly"?"active":""}" id="pfGranMonthly">Monthly</button>
    <button class="tab ${granularity==="yearly"?"active":""}" id="pfGranYearly">Yearly</button>
  </div>`;
}
function portfolioRows(){
  return(state.portfolio||[]).map(h=>{
    const entry=stockEntryForTicker(h.ticker);
    const data=entry?.data;
    const currentPrice=data?.current_price;
    const currency=data?.meta?.currency||"";
    const totalCost=h.quantity*h.avgCostPrice;
    const currentValue=currentPrice!=null?h.quantity*currentPrice:null;
    const pnl=currentValue!=null?currentValue-totalCost:null;
    const pnlPct=currentValue!=null&&totalCost>0?(pnl/totalCost)*100:null;
    return{...h,loaded:!!data,stockName:data?.meta?.stock_name||"",currency,currentPrice,totalCost,currentValue,pnl,pnlPct};
  });
}
// Reconstructs what today's holdings would have been worth at each week
// since purchase, using the same weekly price_data every stock already
// loads for its Price History chart -- pure derived data, nothing new
// fetched or persisted. Assumes the current quantity was held constant
// since purchaseDate; holdings without a purchaseDate are excluded (the
// caller surfaces that as a note, not silently).
function computeReconstructedSeries(){
  const holdingsWithDate=(state.portfolio||[]).filter(h=>h.purchaseDate);
  const perHolding=holdingsWithDate.map(h=>{
    const entry=stockEntryForTicker(h.ticker);
    const priceData=(entry?.data?.price_data||[])
      .filter(p=>p.d&&Number.isFinite(Number(p.c)))
      .slice()
      .sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:0);
    return{ticker:h.ticker,quantity:h.quantity,purchaseDate:h.purchaseDate,priceData};
  }).filter(h=>h.priceData.length);
  if(!perHolding.length)return[];

  const todayStr=new Date().toISOString().slice(0,10);
  const allDates=new Set();
  perHolding.forEach(h=>h.priceData.forEach(p=>{if(p.d>=h.purchaseDate&&p.d<=todayStr)allDates.add(p.d)}));
  const timeline=[...allDates].sort();
  if(!timeline.length)return[];

  return timeline.map(d=>{
    let value=0;
    perHolding.forEach(h=>{
      if(d<h.purchaseDate)return;
      let px=null;
      for(let i=h.priceData.length-1;i>=0;i--){
        if(h.priceData[i].d<=d){px=Number(h.priceData[i].c);break;}
      }
      if(px!=null)value+=h.quantity*px;
    });
    return{d,value};
  });
}
function portfolioPeriodKey(dateStr,granularity){
  if(granularity==="yearly")return dateStr.slice(0,4);
  if(granularity==="monthly")return dateStr.slice(0,7);
  return dateStr;
}
// Buckets a date-ordered points array to one point per period, keeping the
// LAST point in each bucket (end-of-period value) -- same convention
// monthly/yearly stock charts already use. Weekly is a no-op: price_data is
// already weekly, and the snapshot log is already at most one per day.
function bucketSeries(points,granularity,dateKey){
  if(granularity==="weekly"||!points.length)return points;
  const byPeriod=new Map();
  points.forEach(p=>{
    const period=portfolioPeriodKey(p[dateKey],granularity);
    const existing=byPeriod.get(period);
    if(!existing||p[dateKey]>existing[dateKey])byPeriod.set(period,p);
  });
  return[...byPeriod.values()].sort((a,b)=>a[dateKey]<b[dateKey]?-1:a[dateKey]>b[dateKey]?1:0);
}
// Holdings live only in this browser's localStorage (PORTFOLIO_STORAGE_KEY) --
// never committed to the repo or sent anywhere -- so this works unmodified on
// a public GitHub Pages deploy without exposing real holdings, and download
// backup/load backup is the only way to move them to another browser/device.
function portfolioRealizedTotal(){return(state.portfolioRealized||[]).reduce((a,r)=>a+r.realizedPnl,0);}
function portfolioDividendsTotal(){return(state.portfolioDividends||[]).reduce((a,r)=>a+r.amount,0);}
function portfolioFeesTotal(){return(state.portfolioFees||[]).reduce((a,r)=>a+r.amount,0);}
function portfolioNetDepositsTotal(){return(state.portfolioNetDeposits||[]).reduce((a,r)=>a+r.amount,0);}
function portfolioRebatesTotal(){return(state.portfolioRebates||[]).reduce((a,r)=>a+r.amount,0);}
function portfolioWithdrawalsTotal(){return(state.portfolioWithdrawals||[]).reduce((a,r)=>a+r.amount,0);}
// Per-ticker rollup: unrealized P&L (only if still held) + realized P&L
// across every closed round-trip for that ticker + every dividend it's ever
// paid -- the full return per stock, not just trading gains. Cost basis for
// closed lots is backed out the same way as portfolioRealizedTotal's callers
// (quantity*sellPrice - realizedPnl), summed across however many round-trips
// that ticker had.
function portfolioReturnByStock(){
  const holdings=portfolioRows();
  const realized=state.portfolioRealized||[];
  const dividends=state.portfolioDividends||[];
  const tickers=new Set([...holdings.map(r=>r.ticker),...realized.map(r=>r.ticker),...dividends.map(r=>r.ticker)]);

  return[...tickers].map(ticker=>{
    const holding=holdings.find(r=>r.ticker===ticker);
    const tickerRealized=realized.filter(r=>r.ticker===ticker);
    const tickerDividends=dividends.filter(r=>r.ticker===ticker);

    const realizedPnl=tickerRealized.reduce((a,r)=>a+r.realizedPnl,0);
    const realizedCostBasis=tickerRealized.reduce((a,r)=>{
      const cb=r.quantity*r.sellPrice-r.realizedPnl;
      return a+(cb>0?cb:0);
    },0);
    const dividendsTotal=tickerDividends.reduce((a,r)=>a+r.amount,0);
    const unrealizedPnl=(holding&&holding.currentValue!=null)?holding.pnl:null;
    const heldCostBasis=(holding&&holding.currentValue!=null)?holding.totalCost:0;

    const hasAnyFigure=unrealizedPnl!=null||tickerRealized.length||tickerDividends.length;
    const totalReturn=(unrealizedPnl||0)+realizedPnl+dividendsTotal;
    const combinedBase=heldCostBasis+realizedCostBasis;
    const lastClosedDate=tickerRealized.length?tickerRealized.map(r=>r.sellDate).filter(Boolean).sort().slice(-1)[0]:"";
    // investedAmount (quantity*avgCostPrice) is available the moment a
    // holding exists -- unlike heldCostBasis above, it doesn't need the
    // current price to have loaded, so it shouldn't show as $0 while a
    // stock's live price is still loading in the background.
    const investedAmount=holding?holding.totalCost:null;
    return{
      ticker,
      stockName:holding?.stockName||"",
      isHeld:!!holding,
      closedLotCount:tickerRealized.length,
      lastClosedDate,
      investedAmount,
      realizedCostBasis:tickerRealized.length?realizedCostBasis:null,
      realizedPnl:tickerRealized.length?realizedPnl:null,
      dividends:tickerDividends.length?dividendsTotal:null,
      unrealizedPnl,
      totalReturn:hasAnyFigure?totalReturn:null,
      totalReturnPct:combinedBase>0?(totalReturn/combinedBase)*100:null,
    };
  });
}
// Shared sort for the Held Stocks / Closed Positions tables -- nulls always
// sort last regardless of direction (a stock with no figure for this column
// yet shouldn't jump to the top just because "asc" was clicked).
function sortPortfolioReturnRows(rows,field,dir){
  return[...rows].sort((a,b)=>{
    const av=a[field],bv=b[field];
    if(av==null&&bv==null)return 0;
    if(av==null)return 1;
    if(bv==null)return -1;
    if(typeof av==="string")return dir==="asc"?av.localeCompare(bv):bv.localeCompare(av);
    return dir==="asc"?av-bv:bv-av;
  });
}
function portfolioSortTh(label,field,table,currentSort,isNum){
  const active=currentSort.field===field;
  const arrow=active?(currentSort.dir==="asc"?" ↑":" ↓"):" ↕";
  // .no-drag opts this th out of bindDragScroll()'s "cancel the click if the
  // pointer moved >3px between mousedown and mouseup" logic (that logic
  // exists so dragging the wrap to scroll horizontally doesn't also trigger
  // a row click) -- without it, almost any real click (which rarely has zero
  // pixel movement) gets silently swallowed before it reaches this element.
  return`<th${isNum?` class="num no-drag"`:` class="no-drag"`} data-sort-table="${table}" data-sort-field="${field}" style="cursor:pointer;user-select:none${active?";color:var(--tx)":""}" title="Sort by ${esc(label)}">${esc(label)}<span class="small muted">${arrow}</span></th>`;
}
function panelPortfolio(){
  const rows=portfolioRows();
  const loadedRows=rows.filter(r=>r.loaded&&r.currentValue!=null);
  const unloadedCount=rows.length-loadedRows.length;
  const totalCost=loadedRows.reduce((a,r)=>a+r.totalCost,0);
  const totalValue=loadedRows.reduce((a,r)=>a+r.currentValue,0);
  const totalPnl=totalValue-totalCost;
  const totalPnlPct=totalCost>0?(totalPnl/totalCost)*100:null;

  if(rows.length)recordPortfolioSnapshot(totalValue,totalCost);

  const subTab=["holdings","history","reconcile"].includes(state.portfolioSubTab)?state.portfolioSubTab:"holdings";
  const header=`<div class="panel">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div><h2>Portfolio</h2></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-compact" type="button" id="pfDownloadBtn">Download backup</button>
        <button class="btn btn-compact" type="button" id="pfUploadBtn">Load backup</button>
        <input type="file" id="pfUploadInput" accept="application/json" style="display:none">
      </div>
    </div>
    <p class="small muted" style="margin:0 0 12px">What you actually hold — quantity and average cost price, matched against each stock's current price to show live value and unrealized gain/loss. Stored only in this browser's local storage, never committed to the repo or sent to any server, so this works the same on a static GitHub Pages deploy. Because it's per-browser, use Download/Load backup to move everything on this tab to another device.</p>
    <div class="tabs" style="margin:0">
      <button class="tab ${subTab==="holdings"?"active":""}" id="pfSubHoldings">Holdings</button>
      <button class="tab ${subTab==="history"?"active":""}" id="pfSubHistory">History &amp; P&amp;L</button>
      <button class="tab ${subTab==="reconcile"?"active":""}" id="pfSubReconcile">Reconcile</button>
    </div>
  </div>`;

  if(subTab==="history")return header+panelPortfolioHistory({totalPnl,totalCost});
  if(subTab==="reconcile")return header+panelPortfolioReconcile();

  const tickerOptions=activeStockList()
    .slice()
    .sort((a,b)=>(a.data?.meta?.ticker||"").localeCompare(b.data?.meta?.ticker||""))
    .map(s=>`<option value="${esc(s.data?.meta?.ticker||s.key)}">${esc(s.data?.meta?.ticker||s.key)} — ${esc(s.data?.meta?.stock_name||"")}</option>`)
    .join("");

  const summary=`<div class="planner-summary-grid">
    <div class="planner-summary-card"><div class="label">Total cost</div><div class="value">${pfCcy(totalCost,"SGD")}</div><div class="small muted">${loadedRows.length} holding${loadedRows.length===1?"":"s"} with a live price</div></div>
    <div class="planner-summary-card"><div class="label">Current value</div><div class="value">${pfCcy(totalValue,"SGD")}</div><div class="small muted">${unloadedCount?`${unloadedCount} holding${unloadedCount===1?"":"s"} excluded — not loaded`:"All holdings priced"}</div></div>
    <div class="planner-summary-card"><div class="label">Unrealized P&amp;L</div><div class="value ${pnlTone(totalPnl)}">${totalCost>0?pfCcy(totalPnl,"SGD"):"-"}${totalPnlPct!=null?`<span style="font-size:12px;font-weight:400;margin-left:8px;opacity:.75">· ${pct(totalPnlPct)}</span>`:""}</div></div>
    <div class="planner-summary-card"><div class="label">Holdings tracked</div><div class="value">${rows.length}</div><div class="small muted">Stored only in this browser</div></div>
  </div>`;

  const datedHoldingCount=(state.portfolio||[]).filter(h=>h.purchaseDate).length;
  const undatedHoldingCount=rows.length-datedHoldingCount;
  const granularity=["weekly","monthly","yearly"].includes(state.portfolioChartGranularity)?state.portfolioChartGranularity:"monthly";
  const granularityToggle=portfolioGranularityToggleHtml(granularity);
  const chartSection=`<div class="panel chart-shell" style="margin-bottom:14px">
    <h2>Value Over Time</h2>
    <p class="small muted" style="margin:0 0 10px">
      <strong>Reconstructed</strong> (solid) — today's holdings priced at each past date since purchase, using each stock's weekly price history; assumes the current quantity was held constant since the purchase date.
      <strong>Recorded</strong> (dashed) — a real snapshot taken each time you open this tab, so it reflects actual changes to your holdings over time. The two can diverge — that's expected, not a bug.
      ${undatedHoldingCount?`${undatedHoldingCount} holding${undatedHoldingCount===1?"":"s"} ${undatedHoldingCount===1?"has":"have"} no purchase date set, so ${undatedHoldingCount===1?"it's":"they're"} excluded from the reconstructed line.`:""}
    </p>
    ${granularityToggle}
    <svg class="spark" id="pfHistorySvg" viewBox="0 0 1200 320" preserveAspectRatio="none"></svg>
    <div class="tooltip" id="pfHistoryTip"></div>
  </div>`;

  const tableRows=rows.map(r=>`<tr>
    <td>${esc(r.ticker)}<div class="small muted">${esc(r.stockName)}</div></td>
    <td class="num">${n(r.quantity,0)}</td>
    <td class="num">${pfCcy(r.avgCostPrice,r.currency)}</td>
    <td class="num">${pfCcy(r.totalCost,r.currency)}</td>
    <td class="num">${r.loaded?(r.currentPrice!=null?pfCcy(r.currentPrice,r.currency):"-"):`<span class="small muted">not loaded</span>`}</td>
    <td class="num">${r.currentValue!=null?pfCcy(r.currentValue,r.currency):"-"}</td>
    <td class="num ${pnlTone(r.pnl)}">${r.pnl!=null?pfCcy(r.pnl,r.currency):"-"}</td>
    <td class="num ${pnlTone(r.pnl)}">${r.pnlPct!=null?`${r.pnlPct>=0?"+":""}${n(r.pnlPct,1)}%`:"-"}</td>
    <td><button class="btn btn-compact" type="button" data-portfolio-edit="${esc(r.ticker)}">Edit</button> <button class="btn btn-compact" type="button" data-portfolio-delete="${esc(r.ticker)}">Delete</button></td>
  </tr>`).join("");

  return header+`${summary}
  ${chartSection}
  <div class="panel">
    <div class="portfolio-form">
      <label>Stock<select id="pfTicker">${tickerOptions}</select></label>
      <label>Quantity<input type="number" id="pfQuantity" min="0" step="1" placeholder="e.g. 500"></label>
      <label>Avg cost price<input type="number" id="pfAvgCost" min="0" step="0.001" placeholder="e.g. 1.250"></label>
      <label>Purchase date (optional)<input type="date" id="pfDate"></label>
      <button class="btn btn-compact" type="button" id="pfAddBtn">Add holding</button>
    </div>
    ${rows.length?`<div class="cmp-table-wrap drag-scroll">
      <table>
        <thead><tr>
          <th>Stock</th><th class="num">Qty</th><th class="num">Avg Cost</th><th class="num">Total Cost</th>
          <th class="num">Current Price</th><th class="num">Current Value</th><th class="num">P&amp;L</th><th class="num">P&amp;L %</th><th></th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`:`<div class="empty">No holdings yet. Add one above, or load a backup.</div>`}
  </div>`;
}
// The "History & P&L" sub-tab -- everything derived from statement imports
// rather than live prices: realized gains on positions you've since sold,
// dividends actually received, fees paid, and whole-account value over time.
// Fees are shown for information only and are NOT subtracted again in Total
// P&L -- they're already netted into Unrealized P&L (holdings cost price is
// fee-inclusive) and Realized P&L (the broker's own figure is net of fees on
// that trade), so subtracting them again here would double-count.
function panelPortfolioHistory({totalPnl,totalCost}){
  const realized=state.portfolioRealized||[];
  const dividends=state.portfolioDividends||[];
  const fees=state.portfolioFees||[];
  const realizedTotal=portfolioRealizedTotal();
  const dividendsTotal=portfolioDividendsTotal();
  const feesTotal=portfolioFeesTotal();
  const unrealizedTotal=totalCost>0?totalPnl:null;
  const grandTotal=(unrealizedTotal||0)+realizedTotal+dividendsTotal;

  // Cost basis isn't stored per closed-position row (only quantity/sellPrice/
  // realizedPnl are), so it's backed out from those: realizedPnl = proceeds -
  // cost, proceeds ~= quantity*sellPrice, so cost ~= quantity*sellPrice -
  // realizedPnl. Off by whatever fees were already netted into realizedPnl --
  // a few dollars on a few-hundred-dollar trade, fine for a rounded percent.
  const realizedWithCost=realized.map(r=>({...r,costBasis:r.quantity*r.sellPrice-r.realizedPnl}));
  const realizedCostBasisSum=realizedWithCost.reduce((a,r)=>a+(r.costBasis>0?r.costBasis:0),0);
  const combinedBase=totalCost+realizedCostBasisSum;
  const unrealizedPct=(unrealizedTotal!=null&&totalCost>0)?(unrealizedTotal/totalCost)*100:null;
  const realizedPct=realizedCostBasisSum>0?(realizedTotal/realizedCostBasisSum)*100:null;
  const dividendsPct=combinedBase>0?(dividendsTotal/combinedBase)*100:null;
  const grandPct=combinedBase>0?(grandTotal/combinedBase)*100:null;
  const netDeposits=state.portfolioNetDeposits||[];
  const netDepositsTotal=portfolioNetDepositsTotal();
  const withdrawals=state.portfolioWithdrawals||[];
  const withdrawalsTotal=portfolioWithdrawalsTotal();
  const rebates=state.portfolioRebates||[];
  const rebatesTotal=portfolioRebatesTotal();
  // Cash sitting in the account, not currently tied up in any stock
  // position. Derived rather than tracked directly: every dollar that's
  // ever entered the account (net deposits, rebates, realized proceeds,
  // dividends) either bought stock you still hold (its cost basis, summed
  // here across ALL holdings regardless of whether their live price has
  // loaded -- avgCostPrice alone is enough, no price data needed) or is
  // still sitting as cash. Same "assumes full tracked history from $0"
  // caveat as Reconcile -- a partial history will throw this off.
  const allHeldCostBasis=portfolioRows().reduce((a,r)=>a+r.totalCost,0);
  const cashOnHand=netDepositsTotal+rebatesTotal+realizedTotal+dividendsTotal-allHeldCostBasis;

  const summary=`<div class="planner-summary-grid">
    <div class="planner-summary-card"><div class="label">Net Deposited</div><div class="value">${netDeposits.length?pfCcy(netDepositsTotal,"SGD"):"-"}</div><div class="small muted">${netDeposits.length?"Actual cash in, from outside the account":"No deposit records yet"}</div></div>
    <div class="planner-summary-card"><div class="label">Withdrawn</div><div class="value">${withdrawals.length?pfCcy(withdrawalsTotal,"SGD"):"-"}</div><div class="small muted">${withdrawals.length?"Already netted into Net Deposited above":"No withdrawal records yet"}</div></div>
    <div class="planner-summary-card"><div class="label">Rebates</div><div class="value ${rebatesTotal?"good":""}">${rebates.length?pfCcy(rebatesTotal,"SGD"):"-"}</div><div class="small muted">Broker cashback — not your money, not investment return</div></div>
    <div class="planner-summary-card"><div class="label">Cash on hand</div><div class="value ${cashOnHand<0?"bad":""}">${pfCcy(cashOnHand,"SGD")}</div><div class="small muted">Deposited/earned but not put into a stock — assumes full history tracked</div></div>
    <div class="planner-summary-card"><div class="label">Unrealized P&amp;L</div><div class="value ${pnlTone(unrealizedTotal)}">${unrealizedTotal!=null?pfCcy(unrealizedTotal,"SGD"):"-"}${unrealizedPct!=null?`<span style="font-size:12px;font-weight:400;margin-left:8px;opacity:.75">· ${pct(unrealizedPct)}</span>`:""}</div><div class="small muted">Current holdings only</div></div>
    <div class="planner-summary-card"><div class="label">Realized P&amp;L</div><div class="value ${pnlTone(realizedTotal)}">${realized.length?pfCcy(realizedTotal,"SGD"):"-"}${realizedPct!=null?`<span style="font-size:12px;font-weight:400;margin-left:8px;opacity:.75">· ${pct(realizedPct)}</span>`:""}</div><div class="small muted">${realized.length} closed position${realized.length===1?"":"s"}</div></div>
    <div class="planner-summary-card"><div class="label">Dividends received</div><div class="value ${dividendsTotal?"good":""}">${dividends.length?pfCcy(dividendsTotal,"SGD"):"-"}${dividendsPct!=null?`<span style="font-size:12px;font-weight:400;margin-left:8px;opacity:.75">· ${n(dividendsPct,1)}% yield</span>`:""}</div><div class="small muted">${dividends.length} payout${dividends.length===1?"":"s"}</div></div>
    <div class="planner-summary-card"><div class="label">Fees paid</div><div class="value">${fees.length?pfCcy(feesTotal,"SGD"):"-"}</div><div class="small muted">Informational — already netted in above</div></div>
    <div class="planner-summary-card"><div class="label">Total P&amp;L</div><div class="value ${pnlTone(grandTotal)}">${pfCcy(grandTotal,"SGD")}${grandPct!=null?`<span style="font-size:12px;font-weight:400;margin-left:8px;opacity:.75">· ${pct(grandPct)}</span>`:""}</div><div class="small muted">Unrealized + realized + dividends</div></div>
  </div>`;

  const returnByStock=portfolioReturnByStock();
  const returnSort=state.portfolioReturnSort||{held:{field:"totalReturn",dir:"desc"},closed:{field:"totalReturn",dir:"desc"}};
  const heldSort=returnSort.held||{field:"totalReturn",dir:"desc"};
  const closedSort=returnSort.closed||{field:"totalReturn",dir:"desc"};
  const heldStockRows=sortPortfolioReturnRows(returnByStock.filter(r=>r.isHeld),heldSort.field,heldSort.dir).map(r=>`<tr>
    <td>${esc(r.ticker)}${r.stockName?`<div class="small muted">${esc(r.stockName)}</div>`:""}${r.closedLotCount?`<div class="small muted">+ ${pfCcy(r.realizedPnl,"SGD")} realized from ${r.closedLotCount} prior closed lot${r.closedLotCount===1?"":"s"}</div>`:""}</td>
    <td class="num">${r.investedAmount!=null?pfCcy(r.investedAmount,"SGD"):"-"}</td>
    <td class="num ${pnlTone(r.totalReturn)}">${r.totalReturn!=null?pfCcy(r.totalReturn,"SGD"):"-"}</td>
    <td class="num ${pnlTone(r.totalReturn)}">${r.totalReturnPct!=null?pct(r.totalReturnPct):"-"}</td>
    <td class="num ${pnlTone(r.unrealizedPnl)}">${r.unrealizedPnl!=null?pfCcy(r.unrealizedPnl,"SGD"):"-"}</td>
    <td class="num ${r.dividends?"good":""}">${r.dividends!=null?pfCcy(r.dividends,"SGD"):"-"}</td>
  </tr>`).join("");
  const closedStockRows=sortPortfolioReturnRows(returnByStock.filter(r=>!r.isHeld),closedSort.field,closedSort.dir).map(r=>`<tr>
    <td>${esc(r.ticker)}${r.stockName?`<div class="small muted">${esc(r.stockName)}</div>`:""}</td>
    <td class="small muted">${r.lastClosedDate?dt(r.lastClosedDate):"-"}${r.closedLotCount>1?`<div class="small muted">${r.closedLotCount} round-trips</div>`:""}</td>
    <td class="num">${r.realizedCostBasis!=null?pfCcy(r.realizedCostBasis,"SGD"):"-"}</td>
    <td class="num ${pnlTone(r.totalReturn)}">${r.totalReturn!=null?pfCcy(r.totalReturn,"SGD"):"-"}</td>
    <td class="num ${pnlTone(r.totalReturn)}">${r.totalReturnPct!=null?pct(r.totalReturnPct):"-"}</td>
    <td class="num ${pnlTone(r.realizedPnl)}">${r.realizedPnl!=null?pfCcy(r.realizedPnl,"SGD"):"-"}</td>
    <td class="num ${r.dividends?"good":""}">${r.dividends!=null?pfCcy(r.dividends,"SGD"):"-"}</td>
  </tr>`).join("");
  const returnByStockTable=`<div class="panel" style="margin-bottom:14px">
    <h2>Held Stocks</h2>
    <p class="small muted" style="margin:0 0 10px">Total Return combines unrealized P&amp;L on what you hold now with every dividend it's ever paid you — plus any realized P&amp;L left over if you'd previously closed and rebought it. Click a column to sort by it.</p>
    ${heldStockRows?`<div class="cmp-table-wrap drag-scroll">
      <table>
        <thead><tr>${portfolioSortTh("Stock","ticker","held",heldSort)}${portfolioSortTh("Invested","investedAmount","held",heldSort,true)}${portfolioSortTh("Total Return","totalReturn","held",heldSort,true)}${portfolioSortTh("Return %","totalReturnPct","held",heldSort,true)}${portfolioSortTh("Unrealized","unrealizedPnl","held",heldSort,true)}${portfolioSortTh("Dividends","dividends","held",heldSort,true)}</tr></thead>
        <tbody>${heldStockRows}</tbody>
      </table>
    </div>`:`<div class="empty">No holdings yet.</div>`}
  </div>
  <div class="panel" style="margin-bottom:14px">
    <h2>Closed Positions</h2>
    <p class="small muted" style="margin:0 0 10px">Stocks you've fully exited — Total Return combines every round-trip's realized P&amp;L with every dividend earned while you held it. A stock bought and sold more than once (e.g. bought, sold, bought again, sold again) is summed into one row rather than shown per round-trip. Click a column to sort by it.</p>
    ${closedStockRows?`<div class="cmp-table-wrap drag-scroll">
      <table>
        <thead><tr>${portfolioSortTh("Stock","ticker","closed",closedSort)}${portfolioSortTh("Last Closed","lastClosedDate","closed",closedSort)}${portfolioSortTh("Invested","realizedCostBasis","closed",closedSort,true)}${portfolioSortTh("Total Return","totalReturn","closed",closedSort,true)}${portfolioSortTh("Return %","totalReturnPct","closed",closedSort,true)}${portfolioSortTh("Realized","realizedPnl","closed",closedSort,true)}${portfolioSortTh("Dividends","dividends","closed",closedSort,true)}</tr></thead>
        <tbody>${closedStockRows}</tbody>
      </table>
    </div>`:`<div class="empty">No closed positions yet.</div>`}
  </div>`;

  const granularity=["weekly","monthly","yearly"].includes(state.portfolioChartGranularity)?state.portfolioChartGranularity:"monthly";
  const granularityToggle=portfolioGranularityToggleHtml(granularity);
  const accountValueChart=`<div class="panel chart-shell" style="margin-bottom:14px">
    <h2>Account Value Over Time</h2>
    <p class="small muted" style="margin:0 0 10px">Whole-account value (cash + stock combined) at each point recorded from your own statement balances — broader than the holdings value on the Holdings tab, since it also reflects cash sitting uninvested and positions you've since sold.</p>
    ${granularityToggle}
    <svg class="spark" id="pfAccountValueSvg" viewBox="0 0 1200 320" preserveAspectRatio="none"></svg>
    <div class="tooltip" id="pfAccountValueTip"></div>
  </div>`;

  const dividendRows=dividends.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<tr>
    <td>${esc(r.ticker)}</td>
    <td>${dt(r.date)}</td>
    <td class="num good">${pfCcy(r.amount,"SGD")}</td>
    <td class="small muted">${esc(r.notes||"")}</td>
  </tr>`).join("");
  const feeRows=fees.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<tr>
    <td>${dt(r.date)}</td>
    <td class="num">${pfCcy(r.amount,"SGD")}</td>
    <td class="small muted">${esc(r.notes||"")}</td>
  </tr>`).join("");
  const netDepositRows=netDeposits.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<tr>
    <td>${dt(r.date)}</td>
    <td class="num ${r.amount<0?"bad":""}">${pfCcy(r.amount,"SGD")}</td>
    <td class="small muted">${esc(r.notes||"")}</td>
  </tr>`).join("");
  const withdrawalRows=withdrawals.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<tr>
    <td>${dt(r.date)}</td>
    <td class="num bad">${pfCcy(r.amount,"SGD")}</td>
    <td class="small muted">${esc(r.notes||"")}</td>
  </tr>`).join("");
  const rebateRows=rebates.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<tr>
    <td>${dt(r.date)}</td>
    <td class="num good">${pfCcy(r.amount,"SGD")}</td>
    <td class="small muted">${esc(r.notes||"")}</td>
  </tr>`).join("");

  return`${summary}
  ${returnByStockTable}
  ${accountValueChart}
  <div class="panel">
    <h2>Dividends</h2>
    ${dividendRows?`<div class="cmp-table-wrap drag-scroll">
      <table>
        <thead><tr><th>Stock</th><th>Date</th><th class="num">Amount</th><th>Notes</th></tr></thead>
        <tbody>${dividendRows}</tbody>
        <tfoot><tr style="font-weight:700;border-top:2px solid var(--bd)">
          <td colspan="2">Total</td>
          <td class="num good">${pfCcy(dividendsTotal,"SGD")}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>`:`<div class="empty">No dividends recorded yet.</div>`}
  </div>
  <div class="panel">
    <h2>Fees</h2>
    ${feeRows?`<div class="cmp-table-wrap drag-scroll">
      <table>
        <thead><tr><th>Period ending</th><th class="num">Amount</th><th>Notes</th></tr></thead>
        <tbody>${feeRows}</tbody>
        <tfoot><tr style="font-weight:700;border-top:2px solid var(--bd)">
          <td>Total</td>
          <td class="num">${pfCcy(feesTotal,"SGD")}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>`:`<div class="empty">No fee records yet.</div>`}
  </div>
  <div class="panel">
    <h2>Rebates</h2>
    <p class="small muted" style="margin:0 0 10px">Broker cashback and order rebates — real cash credited to the account, but not your own deposit and not investment return, so it's kept separate from both Net Deposited and Total P&amp;L.</p>
    ${rebateRows?`<div class="cmp-table-wrap drag-scroll">
      <table>
        <thead><tr><th>Period ending</th><th class="num">Amount</th><th>Notes</th></tr></thead>
        <tbody>${rebateRows}</tbody>
        <tfoot><tr style="font-weight:700;border-top:2px solid var(--bd)">
          <td>Total</td>
          <td class="num good">${pfCcy(rebatesTotal,"SGD")}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>`:`<div class="empty">No rebate records yet.</div>`}
  </div>
  <div class="panel">
    <h2>Net Deposits</h2>
    <p class="small muted" style="margin:0 0 10px">Actual cash moved into the account each period — deposits minus withdrawals. This is what backs the Net Deposited summary card above: it only counts money that came from outside the account, so reinvesting a closed position's proceeds into a new stock doesn't inflate it.</p>
    ${netDepositRows?`<div class="cmp-table-wrap drag-scroll">
      <table>
        <thead><tr><th>Period ending</th><th class="num">Net Amount</th><th>Notes</th></tr></thead>
        <tbody>${netDepositRows}</tbody>
        <tfoot><tr style="font-weight:700;border-top:2px solid var(--bd)">
          <td>Total</td>
          <td class="num ${netDepositsTotal<0?"bad":""}">${pfCcy(netDepositsTotal,"SGD")}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>`:`<div class="empty">No net deposit records yet.</div>`}
  </div>
  <div class="panel">
    <h2>Withdrawals</h2>
    <p class="small muted" style="margin:0 0 10px">Gross cash withdrawn from the account — already subtracted into Net Deposited above, shown here on its own so the withdrawn amount isn't only visible as a smaller net-deposit figure.</p>
    ${withdrawalRows?`<div class="cmp-table-wrap drag-scroll">
      <table>
        <thead><tr><th>Date</th><th class="num">Amount</th><th>Notes</th></tr></thead>
        <tbody>${withdrawalRows}</tbody>
        <tfoot><tr style="font-weight:700;border-top:2px solid var(--bd)">
          <td>Total</td>
          <td class="num bad">${pfCcy(withdrawalsTotal,"SGD")}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>`:`<div class="empty">No withdrawal records yet.</div>`}
  </div>`;
}
// The "Reconcile" sub-tab -- checks that everything entered actually adds
// up to the most recently recorded Account Value point, starting from a $0
// baseline (only right if the tracked history covers the account's full
// life; flagged in the note either way). Everything is anchored to that
// Account Value's OWN date, not today: Net Deposited/Rebates/Realized/
// Dividends only count entries dated on or before it, and Unrealized P&L
// prefers the statement's own reported figure for that date over live
// prices -- so the check stays accurate long after the fact instead of
// drifting further out every day, and only falls back to (drifting) live
// prices when no historical figure was given for that date.
function panelPortfolioReconcile(){
  const realized=state.portfolioRealized||[];
  const dividends=state.portfolioDividends||[];
  const netDeposits=state.portfolioNetDeposits||[];
  const rebates=state.portfolioRebates||[];

  const accountValues=(state.portfolioAccountValue||[]).slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const latestAV=accountValues[accountValues.length-1]||null;

  if(!latestAV){
    return`<div class="panel">
      <h2>Reconcile</h2>
      <div class="empty">Add at least one Account Value point (History &amp; P&amp;L tab) to check whether everything you've entered adds up to your account's actual balance.</div>
    </div>`;
  }

  const upTo=d=>!d||d<=latestAV.date;
  const netDepositsInRange=netDeposits.filter(r=>upTo(r.date));
  const rebatesInRange=rebates.filter(r=>upTo(r.date));
  const realizedInRange=realized.filter(r=>upTo(r.sellDate));
  const dividendsInRange=dividends.filter(r=>upTo(r.date));
  const netDepositsTotal=netDepositsInRange.reduce((a,r)=>a+r.amount,0);
  const rebatesTotal=rebatesInRange.reduce((a,r)=>a+r.amount,0);
  const realizedTotal=realizedInRange.reduce((a,r)=>a+r.realizedPnl,0);
  const dividendsTotal=dividendsInRange.reduce((a,r)=>a+r.amount,0);

  const hasHistoricalUnrealized=latestAV.unrealizedPnl!=null;
  let unrealizedTotal,unrealizedNote,unloadedCount=0;
  if(hasHistoricalUnrealized){
    unrealizedTotal=latestAV.unrealizedPnl;
    unrealizedNote=`As stated in your ${dt(latestAV.date)} statement`;
  }else{
    const rows=portfolioRows();
    const loadedRows=rows.filter(r=>r.loaded&&r.currentValue!=null);
    unloadedCount=rows.length-loadedRows.length;
    const totalCost=loadedRows.reduce((a,r)=>a+r.totalCost,0);
    const totalValue=loadedRows.reduce((a,r)=>a+r.currentValue,0);
    unrealizedTotal=totalCost>0?(totalValue-totalCost):null;
    unrealizedNote=unloadedCount?`${unloadedCount} holding${unloadedCount===1?"":"s"} not loaded — excluded, so this check will be incomplete until they load`:"No Unrealized P&L given for this date, so today's live prices stand in instead — expect drift";
  }

  const dividendAccruals=latestAV.dividendAccruals!=null?latestAV.dividendAccruals:null;
  const expected=(unrealizedTotal||0)+realizedTotal+dividendsTotal+netDepositsTotal+rebatesTotal+(dividendAccruals||0);

  const todayStr=new Date().toISOString().slice(0,10);
  const daysSinceAV=Math.round((new Date(todayStr)-new Date(latestAV.date))/86400000);

  const rowsHtml=[
    {label:"Net Deposited",value:netDepositsTotal,note:`${netDepositsInRange.length} period${netDepositsInRange.length===1?"":"s"} up to ${dt(latestAV.date)}`},
    {label:"Rebates",value:rebatesTotal,note:`${rebatesInRange.length} period${rebatesInRange.length===1?"":"s"} up to ${dt(latestAV.date)}`},
    {label:"Realized P&L",value:realizedTotal,note:`${realizedInRange.length} closed position${realizedInRange.length===1?"":"s"} up to ${dt(latestAV.date)}`},
    {label:"Dividends received",value:dividendsTotal,note:`${dividendsInRange.length} payout${dividendsInRange.length===1?"":"s"} up to ${dt(latestAV.date)}`},
    {label:"Unrealized P&L",value:unrealizedTotal,note:unrealizedNote},
    {label:"Pending dividends (accrued, not yet paid)",value:dividendAccruals,note:dividendAccruals!=null?`As stated in your ${dt(latestAV.date)} statement — not in Account Value's cash/stock yet`:"Not given for this date — omitted, so Expected may run a bit low vs. your broker's own Total Asset figure"},
  ].map(r=>`<tr>
    <td>${esc(r.label)}</td>
    <td class="num ${pnlTone(r.value)}">${r.value!=null?pfCcy(r.value,"SGD"):"-"}</td>
    <td class="small muted">${esc(r.note)}</td>
  </tr>`).join("");

  const headline=`<div class="panel" style="margin-bottom:14px">
    <h2>Reconcile</h2>
    <p class="small muted" style="margin:0 0 12px">Adds up everything entered ${hasHistoricalUnrealized?`as of ${dt(latestAV.date)}, using the Unrealized P&amp;L your statement itself reported for that date`:`— using today's live prices for Unrealized P&amp;L, since none was given for ${dt(latestAV.date)}`}.</p>
    <div class="planner-summary-grid">
      <div class="planner-summary-card"><div class="label">Expected (sum of everything below)</div><div class="value">${pfCcy(expected,"SGD")}</div><div class="small muted">Starting from $0, as of ${dt(latestAV.date)}</div></div>
    </div>
    ${!hasHistoricalUnrealized&&unloadedCount?`<p class="small muted" style="margin:12px 0 0">${unloadedCount} holding${unloadedCount===1?"":"s"} ${unloadedCount===1?"hasn't":"haven't"} finished loading a live price yet, so Unrealized P&amp;L above is incomplete.</p>`:""}
    ${!hasHistoricalUnrealized&&daysSinceAV>3?`<p class="small muted" style="margin:12px 0 0">No Unrealized P&amp;L was given for ${dt(latestAV.date)}, so today's live prices stand in instead — that date is ${daysSinceAV} days ago, so this total reflects today's prices, not that date's. Add the Unrealized P&amp;L your statement reported for that date for an exact figure.</p>`:""}
    <p class="small muted" style="margin:12px 0 0">This assumes the data on this tab covers your account's full history from a $0 start. If you've only entered a partial history (e.g. skipped early statements), this total won't reflect your true balance.</p>
  </div>`;

  return`${headline}
  <div class="panel">
    <h2>What adds up to "Expected"</h2>
    <div class="cmp-table-wrap drag-scroll">
      <table>
        <thead><tr><th>Component</th><th class="num">Amount</th><th>Notes</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr style="font-weight:700;border-top:2px solid var(--bd)">
          <td>Total (Expected)</td>
          <td class="num ${pnlTone(expected)}">${pfCcy(expected,"SGD")}</td>
          <td class="small muted" style="font-weight:400">Sum of the rows above</td>
        </tr></tfoot>
      </table>
    </div>
  </div>`;
}
// Same hand-rolled SVG pattern as renderPortfolioHistoryChart(), single line
// since Account Value has no "reconstructed vs recorded" split -- it's
// always a real, statement-sourced number.
// "Nice" round-number tick values covering [minV,maxV] -- e.g. 0/5000/10000
// rather than whatever four numbers happen to fall out of dividing the raw
// range, so the y-axis reads the way a hand-drawn chart would.
function niceTicks(minV,maxV,targetCount){
  if(!Number.isFinite(minV)||!Number.isFinite(maxV)||maxV<=minV)return[Number.isFinite(minV)?minV:0];
  const rawStep=(maxV-minV)/targetCount;
  const mag=Math.pow(10,Math.floor(Math.log10(rawStep)));
  const norm=rawStep/mag;
  const step=(norm>=5?10:norm>=2?5:norm>=1?2:1)*mag;
  const start=Math.ceil(minV/step)*step;
  const ticks=[];
  for(let v=start;v<=maxV+step*.001;v+=step)ticks.push(Math.round(v*1e6)/1e6);
  return ticks.length?ticks:[minV];
}
// Fixed 3-letter abbreviations rather than toLocaleDateString's locale-
// dependent short month names -- en-GB's own "short" format renders
// September as "Sept" (4 letters) while every other month is 3, which reads
// as a typo sitting next to "Feb"/"Apr"/"Aug" on the same axis.
const MONTH_ABBR=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function dtAxis(v){
  if(!v)return"";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return String(v);
  return`${MONTH_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}
// Linear (proportional-to-actual-elapsed-time) x-scale for the two
// portfolio time-series charts -- points space out by real date gap rather
// than by index, so a stretch with no data reads as a gap on the chart
// instead of being visually compressed to the same width as a one-week gap.
function portfolioDateXScale(dates,margin,plotW){
  const times=dates.map(d=>new Date(d).getTime()).filter(Number.isFinite);
  const minT=Math.min(...times),maxT=Math.max(...times),rangeT=Math.max(maxT-minT,1);
  return d=>margin.left+((new Date(d).getTime()-minT)/rangeT)*plotW;
}
// "Nice" calendar-aligned x-axis tick dates (1st of a month, every 1/2/3/6/
// 12/... months, whichever keeps the count near targetCount) -- chosen from
// the visible time range itself, independent of which exact dates have data,
// so labels land on clean, evenly-spaced calendar boundaries (e.g. every
// quarter) instead of whatever specific data-point dates happen to exist.
function niceDateTicks(minT,maxT,targetCount){
  if(!Number.isFinite(minT)||!Number.isFinite(maxT)||maxT<=minT)return[minT];
  const minD=new Date(minT),maxD=new Date(maxT);
  const spanMonths=(maxD.getFullYear()-minD.getFullYear())*12+(maxD.getMonth()-minD.getMonth())+1;
  const steps=[1,2,3,6,12,24,36,60,120];
  const stepMonths=steps.find(s=>Math.ceil(spanMonths/s)<=targetCount)||steps[steps.length-1];
  const startIndex=minD.getFullYear()*12+minD.getMonth();
  const alignedStart=Math.floor(startIndex/stepMonths)*stepMonths;
  const ticks=[];
  for(let mi=alignedStart;;mi+=stepMonths){
    // new Date(0,mi,1) would hit JS's legacy two-digit-year quirk (years
    // 0-99 silently become 1900-1999) -- reconstruct year/month explicitly
    // instead of relying on the Date constructor's month-overflow to carry
    // a year-0 origin forward.
    const y=Math.floor(mi/12),m=mi-y*12;
    const t=new Date(y,m,1).getTime();
    if(t>maxT)break;
    if(t>=minT)ticks.push(t);
  }
  return ticks.length?ticks:[minT];
}
// Shared y-axis gridlines/value labels + x-axis date labels for the two
// portfolio time-series charts below -- both are otherwise-identical
// margin-based money-over-time charts, so the axis drawing is factored out
// rather than duplicated.
function portfolioChartAxisSvg(margin,plotW,plotH,minV,maxV,yAt,dates,xAt){
  let html="";
  niceTicks(minV,maxV,5).forEach(v=>{
    const y=yAt(v);
    html+=`<line x1="${margin.left}" y1="${n(y,1)}" x2="${margin.left+plotW}" y2="${n(y,1)}" stroke="${Math.abs(v)<1e-9?"rgba(255,255,255,.16)":"rgba(255,255,255,.06)"}" ${Math.abs(v)<1e-9?"":`stroke-dasharray="4 6"`}/>`;
    html+=`<text class="setup-map-value-label" x="${margin.left-8}" y="${n(y+4,1)}" text-anchor="end">${compactCcy(v)}</text>`;
  });
  const minT=new Date(dates[0]).getTime(),maxT=new Date(dates[dates.length-1]).getTime();
  niceDateTicks(minT,maxT,6).forEach(t=>{
    html+=`<text class="setup-map-value-label" x="${n(xAt(t),1)}" y="${margin.top+plotH+20}" text-anchor="middle">${dtAxis(t)}</text>`;
  });
  html+=`<text class="setup-map-axis-label" x="${margin.left}" y="12">SGD</text>`;
  return html;
}
// Shared hover-tooltip wiring for the two Portfolio-tab SVG charts below --
// fixed-position tooltip + mouse/touch binding on every ".pf-hit" node,
// previously duplicated identically in both render functions. Follows the
// same convention renderPriceChart() uses for its own tooltip elsewhere in
// this file (kept separate there since that chart's hit-target classes and
// call sites differ).
function bindPortfolioChartTooltips(svg,tip){
  if(!tip)return;
  const showTip=(e,meta)=>{
    tip.innerHTML=`<strong>${esc(meta.kind)}</strong><span class="muted">${dt(meta.date)}</span><div style="margin-top:5px">${esc(meta.value||"-")}</div>${meta.extra?`<div class="muted">${esc(meta.extra)}</div>`:""}`;
    tip.style.display="block";
    const vw=window.innerWidth;
    const tipW=180;
    const cx=e.clientX??e.touches?.[0]?.clientX??0;
    const cy=e.clientY??e.touches?.[0]?.clientY??0;
    const left=cx+16+tipW>vw?cx-tipW-8:cx+16;
    tip.style.position="fixed";
    tip.style.left=`${left}px`;
    tip.style.top=`${Math.max(8,cy-10)}px`;
    tip.style.zIndex="9999";
  };
  svg.querySelectorAll(".pf-hit").forEach(node=>{
    const getMeta=()=>JSON.parse(node.dataset.meta);
    node.addEventListener("mousemove",e=>showTip(e,getMeta()));
    node.addEventListener("mouseleave",()=>tip.style.display="none");
    node.addEventListener("touchstart",e=>{e.preventDefault();showTip(e,getMeta())},{passive:false});
  });
}
function renderPortfolioAccountValueChart(){
  const svg=document.getElementById("pfAccountValueSvg");
  if(!svg)return;
  const tip=document.getElementById("pfAccountValueTip");
  const granularity=["weekly","monthly","yearly"].includes(state.portfolioChartGranularity)?state.portfolioChartGranularity:"monthly";
  const points=bucketSeries((state.portfolioAccountValue||[]).slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0),granularity,"date");
  const w=1200,h=320;
  const margin={top:18,right:20,bottom:30,left:64};
  const plotW=w-margin.left-margin.right,plotH=h-margin.top-margin.bottom;

  if(points.length<2){
    svg.innerHTML=`<text x="${w/2}" y="${h/2}" text-anchor="middle" fill="var(--mu)" font-size="13">Not enough data yet — add account value points from your statements to see this chart.</text>`;
    return;
  }

  const allValues=points.map(p=>p.totalValue).filter(Number.isFinite);
  const minV=Math.min(0,...allValues),maxV=Math.max(...allValues),rangeV=Math.max(maxV-minV,.0001);
  const dates=points.map(p=>p.date);
  const xAt=portfolioDateXScale(dates,margin,plotW);
  const yAt=v=>margin.top+plotH-((Number(v)-minV)/rangeV)*plotH;

  let html=portfolioChartAxisSvg(margin,plotW,plotH,minV,maxV,yAt,dates,xAt);
  html+=`<line x1="${margin.left}" y1="${margin.top+plotH}" x2="${margin.left+plotW}" y2="${margin.top+plotH}" stroke="#283550"/>`;
  const pts=points.map(p=>`${xAt(p.date).toFixed(2)},${yAt(p.totalValue).toFixed(2)}`).join(" ");
  html+=`<polyline fill="none" stroke="#4f8ef7" stroke-width="2.5" points="${pts}"/>`;
  html+=points.map(p=>`<circle cx="${xAt(p.date)}" cy="${yAt(p.totalValue)}" r="3.5" fill="#4f8ef7" stroke="var(--bg)" stroke-width="1.2"/>`).join("");
  html+=points.map(p=>`<circle class="pf-hit" cx="${xAt(p.date)}" cy="${yAt(p.totalValue)}" r="8" fill="transparent" data-meta="${esc(JSON.stringify({kind:"Account Value",date:p.date,value:pfCcy(p.totalValue,"SGD"),extra:p.notes||""}))}"></circle>`).join("");

  svg.innerHTML=html;
  bindPortfolioChartTooltips(svg,tip);
}
// Follows renderPriceChart()'s hand-rolled SVG pattern exactly (main/dashboard.html,
// Interactive Price History tab) -- same xAt/yAt linear-scale approach, same
// invisible-hit-circle + data-meta + fixed-position tooltip convention -- so
// this chart behaves consistently with every other chart in the app without
// pulling in a charting library.
function renderPortfolioHistoryChart(){
  const svg=document.getElementById("pfHistorySvg");
  if(!svg)return;
  const tip=document.getElementById("pfHistoryTip");
  const granularity=["weekly","monthly","yearly"].includes(state.portfolioChartGranularity)?state.portfolioChartGranularity:"monthly";

  const reconstructed=bucketSeries(computeReconstructedSeries(),granularity,"d");
  const recorded=bucketSeries(state.portfolioHistory||[],granularity,"date");
  const w=1200,h=320;
  const margin={top:18,right:20,bottom:30,left:64};
  const plotW=w-margin.left-margin.right,plotH=h-margin.top-margin.bottom;

  if(reconstructed.length<2&&recorded.length<2){
    svg.innerHTML=`<text x="${w/2}" y="${h/2}" text-anchor="middle" fill="var(--mu)" font-size="13">Not enough data yet — add a holding with a purchase date, or check back after visiting on a few different days.</text>`;
    return;
  }

  const allValues=[...reconstructed.map(p=>p.value),...recorded.flatMap(p=>[p.totalValue,p.totalCost])].filter(Number.isFinite);
  const minV=Math.min(0,...allValues),maxV=Math.max(...allValues),rangeV=Math.max(maxV-minV,.0001);
  const allDates=[...new Set([...reconstructed.map(p=>p.d),...recorded.map(p=>p.date)])].sort();
  const xAt=portfolioDateXScale(allDates,margin,plotW);
  const yAt=v=>margin.top+plotH-((Number(v)-minV)/rangeV)*plotH;

  let html=portfolioChartAxisSvg(margin,plotW,plotH,minV,maxV,yAt,allDates,xAt);
  html+=`<line x1="${margin.left}" y1="${margin.top+plotH}" x2="${margin.left+plotW}" y2="${margin.top+plotH}" stroke="#283550"/>`;

  if(reconstructed.length>=2){
    const pts=reconstructed.map(p=>`${xAt(p.d).toFixed(2)},${yAt(p.value).toFixed(2)}`).join(" ");
    html+=`<polyline fill="none" stroke="#4f8ef7" stroke-width="2.5" points="${pts}"/>`;
    html+=reconstructed.map(p=>`<circle cx="${xAt(p.d)}" cy="${yAt(p.value)}" r="3.5" fill="#4f8ef7" stroke="var(--bg)" stroke-width="1.2"/>`).join("");
    html+=reconstructed.map(p=>`<circle class="pf-hit" cx="${xAt(p.d)}" cy="${yAt(p.value)}" r="8" fill="transparent" data-meta="${esc(JSON.stringify({kind:"Reconstructed",date:p.d,value:pfCcy(p.value,"SGD")}))}"></circle>`).join("");
  }
  if(recorded.length>=2){
    const pts=recorded.map(p=>`${xAt(p.date).toFixed(2)},${yAt(p.totalValue).toFixed(2)}`).join(" ");
    html+=`<polyline fill="none" stroke="#00e5ff" stroke-width="2.5" stroke-dasharray="6,4" points="${pts}"/>`;
    html+=recorded.map(p=>`<circle cx="${xAt(p.date)}" cy="${yAt(p.totalValue)}" r="3.5" fill="#00e5ff" stroke="var(--bg)" stroke-width="1.2"/>`).join("");
    html+=recorded.map(p=>`<circle class="pf-hit" cx="${xAt(p.date)}" cy="${yAt(p.totalValue)}" r="8" fill="transparent" data-meta="${esc(JSON.stringify({kind:"Recorded",date:p.date,value:pfCcy(p.totalValue,"SGD"),extra:`Cost ${pfCcy(p.totalCost,"SGD")}`}))}"></circle>`).join("");
  }

  svg.innerHTML=html;
  bindPortfolioChartTooltips(svg,tip);
}

function renderMiniCard(s){
  const data=s.data,m=data.meta||{};
  const up=upcomingSeries(data);
  const cgcTop=(data.cgc_ranking||[])[0];
  const daysTo=up?daysFrom(up.proj.proj_exdiv_date):null;
  const entryStatus=up?.proj.entry_status;
  const winRate=up?.proj.historical_frequencies?.win_rate;
  const winRateAll=up?.proj.historical_frequencies?.win_rate_all;
  const divTrend=up?.proj.div_trend;
  const divTrendDisplay=up?.proj.div_trend_display;
  const isSelected=state.activeKey===s.key&&state.view==="drill";
  const normalized=(window.DividendGroupedStocks&&typeof window.DividendGroupedStocks.normalizeStock==="function")
    ? window.DividendGroupedStocks.normalizeStock(data,{})
    : null;
  // Use the same tail-risk-aware verdict as the drill-down view, not just the
  // raw zone-position chip -- otherwise a Severe-tail-risk stock sitting
  // inside its zone reads as a plain green "go" until you click in.
  const finalVerdict=normalized?getFinalVerdict(normalized):null;
  const metrics=normalized?buildMetricsSummary(normalized):null;
  const plan=plannerProjectionData(data,s.key);
  const executionSummary=(metrics&&plan)?compactExecutionSummary(metrics,plan):"";
  const entityMeta=entityMetaInline(m.ticker||s.key);
  const nameBits=[m.stock_name||"", m.exchange||"", m.frequency_display||"", entityMeta].filter(Boolean);
  const statusChip=finalVerdict
    ?verdictPill(finalVerdict.label,finalVerdict.tone)
    :`<span class="chip ${entryStatus==="INSIDE"?"good":entryStatus==="ABOVE"?"warn":""}" style="font-size:10px">${entryStatus?esc(up?.proj?.entry_status_display || "–"):"–"}</span>`;

  return`<div class="mini-card${isSelected?" selected":""}" data-key="${esc(s.key)}">
    <div class="mini-card-head">
      <div>
          <div class="mini-card-ticker">${esc(m.ticker||s.key)}</div>
          <div class="mini-card-meta">
            <div class="mini-card-name">${esc(nameBits.join(" · "))}</div>
          </div>
        </div>
      ${statusChip}
    </div>
    <div class="mini-card-price">${ccy(data.current_price,m.currency)}</div>
    <div class="mini-card-stats">
      <div class="mini-stat"><span class="ms-label">Next ex-div: </span>${up?dt(up.proj.proj_exdiv_date):"-"}</div>
      <div class="mini-stat"><span class="ms-label">Days away: </span><span class="${daysTo!==null&&daysTo<=30?"warn":""}">${daysTo!==null?daysTo+"d":"-"}</span></div>
      <div class="mini-stat"><span class="ms-label">Zone: </span>${up?zoneInline(up.proj.zone_bot,up.proj.zone_top,m.currency):"-"}</div>
      <div class="mini-stat"><span class="ms-label">Win rate: </span><span class="${Number(winRate)>=70?"good":Number(winRate)>=50?"warn":"bad"}">${winRate!=null?pctRaw(winRate,0):"-"}</span>${winRateAll!=null?`<span class="muted" style="font-size:10px"> / ${pctRaw(winRateAll,0)}</span>`:""}</div>
      <div class="mini-stat"><span class="ms-label">CGC #1: </span>${cgcTop?esc(cgcTop.series_id):"-"}</div>
      <div class="mini-stat"><span class="ms-label">Cycles: </span>${(data.cycles||[]).length}</div>
      <div class="mini-stat"><span class="ms-label">Div trend: </span>${divTrend?`<span class="${divTrend==="RISING"?"good":divTrend==="FALLING"||divTrend==="DECLINING"?"bad":""}">${esc(divTrendDisplay||divTrend)}</span>`:"-"}</div>
      <div class="mini-stat"><span class="ms-label">5yr growth: </span><span class="${growthCls(m.price_growth_5yr_pct)}">${growthFmt(m.price_growth_5yr_pct)}</span></div>
    </div>
    ${executionSummary?`<div class="small muted" style="margin-top:10px;line-height:1.55">${esc(executionSummary)}</div>`:""}
    <button class="planner-action" type="button" data-planner-toggle="${esc(s.key)}">${plannerHas(s.key)?"Remove from Planner":"Add to Planner"}</button>
  </div>`
}

/* -- DRILL VIEW (single stock tabs) ----------------------------------- */
function renderTabs(panels){
  return`<div class="tabs">${panels.map((p,i)=>`<button class="tab ${state.tab===i?"active":""}" data-tab="${i}">${p.name}</button>`).join("")}</div>`
}

function renderDrillView(stockEntry){
  const data=stockEntry.data,m=data.meta||{};
  const up=upcomingSeries(data);
  const normalizedForVerdict=(window.DividendGroupedStocks&&typeof window.DividendGroupedStocks.normalizeStock==="function")
    ? window.DividendGroupedStocks.normalizeStock(data,{})
    : null;
  const finalVerdict=normalizedForVerdict ? getFinalVerdict(normalizedForVerdict) : null;
  const daysTo=up?daysFrom(up.proj.proj_exdiv_date):null;
  const cgcTop=(data.cgc_ranking||[])[0];
  const cleanTotal=(data.series_meta||[]).reduce((a,s)=>a+(data.ss_series?.[s.id]?.clean?.n_clean||0),0);
  const assetTypeChip=assetTypeChipForTicker(m.ticker||stockEntry.key);
  const sectorLabel=sectorLabelForTicker(m.ticker||stockEntry.key);
  
  const desc=(state.stockDescriptions||{})[m.ticker||""]||"";
  const heroHTML=`<section class="hero" style="margin-bottom:18px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <h1 style="margin:0;font-size:24px;font-weight:700">${esc(m.stock_name||"Dashboard")}<span style="font-size:14px;color:var(--mu);font-family:var(--mono);margin-left:8px">${esc(m.ticker||"")}</span></h1>
    <p class="sub" style="margin:4px 0 0">${esc(m.exchange||"-")} · ${esc(m.currency||"-")} · ${esc(m.frequency_display||"-")}${sectorLabel?` · ${esc(sectorLabel)}`:""} · ${dt(data.data_window_start)} to ${dt(data.data_window_end)}</p>
        </div>
      ${stockList().length>1?`<button class="btn" id="backToOverview" style="font-size:12px;padding:7px 12px">&#8592; All stocks</button>`:""}
    </div>
    <div class="chips" style="margin-top:10px">
      ${assetTypeChip}
      <span class="chip">Price ${ccy(data.current_price,m.currency)}</span>
      <span class="chip ${up?.proj.entry_status==="INSIDE"?"good":up?.proj.entry_status==="ABOVE"?"warn":""}">${up?`Next: ${esc(up.id)} ${dt(up.proj.proj_exdiv_date)}`:"No future proj"}</span>
      ${daysTo!==null?`<span class="chip ${daysTo<=30?"warn":""}">${daysTo}d to ex-div</span>`:""}
      <span class="chip">${(data.series_meta||[]).length} series · ${(data.cycles||[]).length} cycles</span>
    </div>
    ${desc?`<p style="font-size:13px;color:var(--mu);line-height:1.65;margin:10px 0 0;padding:10px 12px;background:var(--sf);border-radius:8px;border:1px solid var(--bd)">${esc(desc)}</p>`:""}
      <div class="section-note" style="margin-top:12px">All outputs are rule-based from uploaded Dividend Cycle Analysis data. No LLM inference is used.</div>
    <div style="margin-top:14px">
      <div class="hero-grid hero-top">
        <div class="card"><div class="label">Current Price</div><div class="value">${ccy(data.current_price,m.currency)}</div><div class="small muted">Anchor ${ccy(data.anchor_price,m.currency)}</div></div>
        <div class="card"><div class="label">Next Ex-Div</div><div class="value" style="font-size:16px">${up?dt(up.proj.proj_exdiv_date):"-"}</div><div class="small muted">${up?esc(up.id):"-"} · ${daysTo!==null?daysTo+"d away":"-"}</div></div>
<div class="card"><div class="label">Frequency</div><div class="value" style="font-size:16px">${esc(m.frequency_display || "-")}</div><div class="small muted">${(data.series_meta||[]).length} series · ${n(m.mean_interval_days,0)}d mean</div></div>
        <div class="card"><div class="label">Clean Cycles / Total</div><div class="value">${cleanTotal}<span style="font-size:14px;color:var(--mu)"> / ${(data.cycles||[]).length}</span></div><div class="small muted">${n(data.years_covered,1)}y covered</div></div>
        <div class="card"><div class="label">CGC #1 Series</div><div class="value" style="font-size:16px">${cgcTop?esc(cgcTop.series_id):"-"}</div><div class="small muted">${cgcTop?`Score ${n(cgcTop.score,1)} · Win ${pctRaw(cgcTop.win_rate,0)}`:"-"}</div></div>
      </div>
      ${finalVerdict?`<div class="section-note" style="margin-top:12px"><strong>Current Verdict:</strong> <span class="${finalVerdict.tone==="good"?"good":finalVerdict.tone==="warn"?"warn":finalVerdict.tone==="bad"?"bad":finalVerdict.tone==="muted"?"muted":""}">${esc(finalVerdict.label)}</span>. ${esc(finalVerdict.reason)}${normalizedForVerdict?.sampleAdequacy?` <strong>Confidence:</strong> ${esc(String(normalizedForVerdict.sampleAdequacy).toLowerCase())}${normalizedForVerdict?.nEffective!=null?` (n_eff ${n(normalizedForVerdict.nEffective,2)})`:""}.`:""}</div>`:""}
      ${renderHeroDataset(data)}
      ${panelProgressStrip(data)}
    </div>
  </section>`;

  const panels=[
    {name:"Series & Risk",   fn:()=>panelSeries(data)},
    {name:"Projections",     fn:()=>panelProjections(data)},
    {name:"Series Ranking",  fn:()=>panelCGC(data)},
    {name:"Calendar Window", fn:()=>panelCalendar(data)},
    {name:"Dates & Drift",   fn:()=>panelDatesDrift(data)},
    {name:"Full Calendar",   fn:()=>panelFullCalendar(data)},
    {name:"Strategy",        fn:()=>panelStrategy(data)},
    {name:"Cycle Log",       fn:()=>panelCycles(data)},
    {name:"Dividends",       fn:()=>panelDividends(data)},
    {name:"Financials",      fn:()=>panelFinancials(data)},
    {name:"Price History",   fn:()=>panelPriceHTML()},
    {name:"Glossary",        fn:()=>panelGlossary()},
  ];
  state.tab=Math.min(state.tab,panels.length-1);
app.innerHTML=heroHTML+renderTabs(panels)+panels[state.tab].fn()+`<div class="foot">Dividend Cycle Analysis dashboard · No LLM required · All data from JSON</div>`;
  app.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{state.tab=Number(btn.dataset.tab);renderDrillView(stockEntry);if(panels[state.tab]?.name==="Price History")renderPriceChart(data);if(panels[state.tab]?.name==="Projections")initPositionCalculator(data)}));
  const backBtn=document.getElementById("backToOverview");
  if(backBtn)backBtn.addEventListener("click",()=>{state.view="overview";renderApp()});
document.title=`${m.stock_name||"Dividend Cycle Analysis"} (${m.ticker||""})`;
  if(panels[state.tab]?.name==="Price History")renderPriceChart(data);
  if(panels[state.tab]?.name==="Projections")initPositionCalculator(data);
  bindDragScroll(app);
}

/* -- OVERVIEW VIEW ----------------------------------------------------- */
function setOverviewDrillTarget(key){
  state.activeKey=key;
  state.view="drill";
  state.tab=0;
  renderApp();
}

function bindStateSelect(id,stateKey,afterChange){
  const el=document.getElementById(id);
  if(!el)return;
  el.addEventListener("change",e=>{
    state[stateKey]=e.target.value;
    if(typeof afterChange==="function") afterChange(e.target.value);
    renderApp();
  });
}

// Shared "How this works" modal for the 4 top-level tabs that don't have their
// own dedicated help surface (Review already has one, kept separate on purpose --
// see analysis-calculations.md discussion). One copy of this content, several
// entry points (see the helpBtn wiring in renderOverviewView below), so nothing
// can drift out of sync the way the Glossary's old Zone Fragility text did.
function dashboardHelpModalHtml(){
  return`<div id="dashboardHelpModal" class="rev-help-overlay" style="display:none">
    <div class="rev-help-modal">
      <button id="dashboardHelpClose" style="position:absolute;top:14px;right:16px;background:none;border:none;color:var(--mu);font-size:18px;cursor:pointer;line-height:1;padding:2px 6px" title="Close">&times;</button>
      <div style="font-size:16px;font-weight:700;margin-bottom:14px">How This Works</div>
      <div class="rev-help-tabs">
        <button class="rev-help-tab active" data-tab="overview">Overview</button>
        <button class="rev-help-tab" data-tab="potential">Potential &amp; Upcoming</button>
        <button class="rev-help-tab" data-tab="planner">Trade Planner</button>
        <button class="rev-help-tab" data-tab="comparison">Comparison</button>
      </div>

      <div class="rev-help-panel active" data-tab="overview">
        <h4>Current Verdict</h4>
        <p>The colored chip on each mini-card and the coloring of Setup Map points. It answers a different question from Potential Score &mdash; not &ldquo;how strong is the structural pattern&rdquo; but &ldquo;what should I do with this stock right now.&rdquo; It's derived from price position vs. the projected zone, timing reliability, tail risk, and how close the next ex-div is.</p>
        <div class="rev-help-rule">
          <strong style="color:var(--rd)">Too Risky</strong> &mdash; tail risk is Severe, regardless of anything else<br>
          <strong>Wait</strong> &mdash; price is too far above the zone (&gt;3%), or near it but the next ex-div is more than 90 days out<br>
          <strong style="color:#c9a227">Small Trades Advised</strong> &mdash; price is inside (or just slightly below) the zone, but tail risk is High or timing is Unreliable<br>
          <strong style="color:var(--gn)">Actionable Now</strong> &mdash; price is inside the zone (or slightly below it with Low/Moderate tail risk) and the caution rule above didn't trigger<br>
          <strong>Watch Closely</strong> &mdash; price is within ~3% above the zone and the next ex-div is within 90 days<br>
          <strong>Watch Only</strong> &mdash; next ex-div is within 90 days, but price isn't in position yet<br>
          <strong>On Radar</strong> &mdash; structurally interesting, not yet close to action
        </div>
        <p style="margin-top:8px">Rules are checked in this order and the first match wins &mdash; a stock can be structurally strong (high Potential Score) and still show &ldquo;Wait&rdquo; or &ldquo;On Radar&rdquo; if price simply isn't in the right place today. See Review's help (Score tab) for what Potential Score itself measures.</p>
        <hr class="rev-help-divider">
        <h4>Setup Map</h4>
        <p>Every loaded stock plotted at once, colored by Current Verdict.</p>
        <ul>
          <li><strong>Map mode</strong> &mdash; x-axis is price position relative to the projected zone (left = below, shaded middle = inside, right = above); y-axis is possible gain if the next cycle plays out. Hover any point for full detail, click to drill in.</li>
          <li><strong>List mode</strong> &mdash; the same stocks split into three sortable columns (Below / Inside / Above zone). Click a column's Ticker/Name/5yr/Gain header to sort by it; the 5yr column is colored green &ge;15%, amber &ge;0%, red below that.</li>
        </ul>
        <p style="margin-top:8px">If a stock doesn't appear, it usually means it isn't currently loaded, or is marked inactive/monitoring-only &mdash; check &ldquo;Edit stock list.&rdquo;</p>
        <hr class="rev-help-divider">
        <h4>Reading combinations</h4>
        <div class="rev-help-rule">
          <strong>Small Trades Advised, not Too Risky</strong> &mdash; the ladder checks tail risk first, and Severe always exits straight to Too Risky before any other rule runs. So Small Trades Advised tells you tail risk topped out at High, never Severe &mdash; a similarly cautious-sounding label that's actually ruling the worse case out, not staying silent on it.
        </div>
        <div class="rev-help-rule">
          <strong>Inside the zone on Setup Map, but the verdict isn't Actionable Now</strong> &mdash; entry position is only one input to Current Verdict. If tail risk is High or timing is Unreliable, an inside-zone stock is downgraded to Small Trades Advised instead. Hover the point for its tail risk, or check the Potential &amp; Upcoming tab where both pills sit right next to the verdict.
        </div>
      </div>

      <div class="rev-help-panel" data-tab="potential">
        <h4>Potential Stocks &amp; Upcoming Stocks to Watch</h4>
        <p>A simpler, threshold-only grouping by raw Potential Score &mdash; not the same classification as the Review tab, which weighs zone hit rate, pattern stability, and 5yr growth together through six explicit rules.</p>
        <div class="rev-help-rule">
          <strong style="color:var(--gn)">Strong Potential</strong> &mdash; score &ge; 75<br>
          <strong style="color:#c9a227">Watchlist</strong> &mdash; score &ge; 60<br>
          <strong>Borderline</strong> &mdash; score &ge; 50<br>
          <span style="display:block;margin-top:4px;color:var(--mu)">Below n_effective = 3, the raw score still shows but the label is withheld &mdash; too little history to give a confident shortlist tag.</span>
        </div>
        <p style="margin-top:8px"><strong>Why a stock can look different here than in Review:</strong> this tab only asks &ldquo;how strong is the structural score.&rdquo; Review additionally asks &ldquo;does the zone actually get touched, and is the pattern holding up or degrading&rdquo; &mdash; a stock can be Strong Potential here (high score) but land in Review's Worth Watching or even To Remove column if its zone hit rate is thin or the pattern is Degrading. Treat this tab as a first-pass scan and Review as the more disciplined second pass before acting.</p>
        <hr class="rev-help-divider">
        <h4>Reading combinations</h4>
        <div class="rev-help-rule">
          <strong>Timing: Unreliable</strong> &mdash; pair this with the calendar-window spread on Review's Calendar tab. They're two measurements of the same thing: how consistently the dip lands, judged by weeks-before-ex-div in one case and by calendar month in the other, over the same clean-cycle history. If both read poorly, the dip genuinely doesn't follow a dependable pattern by either clock &mdash; don't expect the Trade Planner's watch/dip dates to be precise here.
        </div>
        <div class="rev-help-rule">
          <strong>Tail Risk: High/Severe and Timing: Unreliable together</strong> &mdash; this exact pairing is what pushes Current Verdict to Small Trades Advised (or Too Risky once tail risk is Severe). It isn't two unrelated warnings sitting side by side on the card; the verdict ladder reacts to precisely this combination.
        </div>
        <div class="rev-help-rule">
          <strong>Strong Potential Score but a cautious verdict pill</strong> &mdash; the score grades the structural pattern; the verdict grades today's price position. A high score paired with Wait or On Radar just means the pattern looks fine but price hasn't pulled back into the zone yet &mdash; check the Entry pill on the same card to see which side it's sitting on.
        </div>
        <div class="rev-help-rule">
          <strong>Missing from either list entirely (not just missing its label)</strong> &mdash; check the stock's edge-case flags in its drill-in. Irregular Schedule stocks are structurally barred from a Potential Score label, not merely penalized. Short History (under 2 years of price data) uses the exact same 2-year cutoff as this tab's own eligibility gate, and a thin Clean Cycles count is the same shortfall that limits confidence everywhere else on the stock.
        </div>
      </div>

      <div class="rev-help-panel" data-tab="planner">
        <h4>Setup Summary</h4>
        <p>A compressed execution read for the live plan, built from the nearest next cycle only &mdash; it doesn't create a new forecast, just reframes what's already calculated.</p>
        <ul>
          <li><strong>Execution state</strong> &mdash; a narrower version of Current Verdict for planning purposes: Actionable Now&rarr;Ready, Small Trades Advised&rarr;Caution, Watch Closely/Watch Only&rarr;Watch, Too Risky&rarr;Too risky.</li>
          <li><strong>Timing window</strong> &mdash; Upcoming (before the watch date), Open (between watch and ex-div), or Past (after ex-div).</li>
          <li><strong>Exit bias</strong> &mdash; a short version of the exit-mode verdict (pre-exdiv vs. ex-div-date preferred).</li>
        </ul>
        <div class="rev-help-rule">
          <strong>Confidence</strong> combines sample adequacy, timing reliability, and tail risk &mdash; not n_effective alone:<br>
          <strong style="color:var(--rd)">Low</strong> &mdash; sample is Insufficient, or timing is Unreliable, or tail risk is Severe<br>
          <strong style="color:var(--gn)">High</strong> &mdash; sample Adequate, n_effective &ge; 6, timing Reliable, and tail risk Low or Moderate<br>
          <strong>Moderate</strong> &mdash; everything else
        </div>
        <hr class="rev-help-divider">
        <h4>Overrides</h4>
        <p>Official ex-div date, official dividend amount, and planned entry price can each be set without touching the underlying historical model.</p>
        <div class="rev-help-rule">
          <strong>Changes:</strong> effective ex-div date, days-away, watch/dip/exit milestone dates, planner ordering, planner yield outputs, expected gain<br>
          <strong>Does not change:</strong> timing rating, tail risk, fragility, exit-mode verdict, Potential Score, or Current Verdict outside the planner
        </div>
        <p style="margin-top:8px">The historical dip-timing offsets are preserved and re-anchored to whatever ex-div date you set &mdash; overriding the date shifts the whole schedule forward or back, it doesn't recalculate the pattern itself.</p>
        <hr class="rev-help-divider">
        <h4>Reading combinations</h4>
        <div class="rev-help-rule">
          <strong>Confidence: Low, with nothing else obviously wrong</strong> &mdash; Confidence isn't a separate signal; it's a deterministic roll-up of sample adequacy, timing rating, and tail risk, each already shown elsewhere on the stock. If it reads Low, at least one of those three is already failing on its own &mdash; sample adequacy or timing alone is enough to force it, independent of tail risk.
        </div>
      </div>

      <div class="rev-help-panel" data-tab="comparison">
        <h4>Reading the table</h4>
        <p>One row per stock's nearest upcoming series. Click any column header to sort by it, drag horizontally to see every metric, click a stock's name or chip to drill in. Every column header has its own hover tooltip with the exact definition.</p>
        <hr class="rev-help-divider">
        <h4>Zone Outcome Map</h4>
        <p>Tests the zone idea directly against real outcomes, rather than just showing the projection.</p>
        <ul>
          <li><strong>Current cycle</strong> &mdash; shown once the nearest projected series' estimated low window has already started. X-axis: where the observed low actually landed relative to the zone (0% = zone bottom, 100% = zone top; below 0 = undershot, above 100 = never got there). Y-axis: realized rebound vs. the model's expected gain.</li>
          <li><strong>Recent completed cycles</strong> &mdash; the same idea, replayed over recent completed cycles of that same series, so you can see the zone's track record rather than just today's single setup.</li>
        </ul>
        <p style="margin-top:8px">If no point is plotted, there simply isn't a comparable cycle yet for that stock &mdash; the chart doesn't force a misleading point when there's nothing to show.</p>
        <hr class="rev-help-divider">
        <h4>Reading combinations</h4>
        <div class="rev-help-rule">
          <strong>CGC Top Series / CGC Win Rate #1 both show &ldquo;-&rdquo;</strong> &mdash; not missing data. A stock with only one dividend series (no separate months/quarters to rank against each other) is left out of CGC ranking on purpose, rather than ranked against itself.
        </div>
        <div class="rev-help-rule">
          <strong>Low Clean Cycles alongside an Unreliable/Bimodal Timing rating</strong> &mdash; both come from the same clean-cycle history for that series. A stock light on clean cycles hasn't just scored fewer cycles; there's also less data behind its timing rating &mdash; treat a low count as a reason to trust the timing rating less, not just an unrelated metric to note in passing.
        </div>
        <div class="rev-help-rule">
          <strong>Wide scatter on Zone Outcome Map</strong> &mdash; the same walk-forward zone-miss history behind that scatter is what a stock's own drill-in page reports as its zone fragility. Points scattered far outside the shaded band across recent cycles and a poor fragility reading on that same stock's page are one underlying pattern, not two independent checks that happen to agree.
        </div>
      </div>
    </div>
  </div>`;
}

function renderOverviewView(){
  const stocks=activeStockList();
  document.title="Dividend Cycle Dashboard";
  const mode=state.overviewMode||"overview"; // "overview" | "grouped" | "compare" | "planner" | "review" | "portfolio"

  const modeToggle=`
    <div class="tabs" style="margin-bottom:0">
      <button class="tab ${mode==="overview"?"active":""}" id="ovModeOverview">Overview</button>
      <button class="tab ${mode==="grouped"?"active":""}" id="ovModeGrouped">Potential &amp; Upcoming</button>
      <button class="tab ${mode==="planner"?"active":""}" id="ovModePlanner">Trade Planner</button>
      <button class="tab ${mode==="review"?"active":""}" id="ovModeReview">Review</button>
      <button class="tab ${mode==="compare"?"active":""}" id="ovModeCompare">Comparison</button>
      <button class="tab ${mode==="portfolio"?"active":""}" id="ovModePortfolio">Portfolio</button>
    </div>`;

  // Review already has its own dedicated help button/modal, so this shared one
  // only needs an entry point for the other 4 modes.
  const helpTabForMode={overview:"overview",grouped:"potential",planner:"planner",compare:"comparison"}[mode];
  const helpBtn=helpTabForMode?`<button data-dash-help-open="${helpTabForMode}" style="font-size:11px;padding:3px 9px;border-radius:5px;border:1px solid var(--bd);background:var(--sf);color:var(--mu);cursor:pointer;white-space:nowrap;flex-shrink:0">About this view</button>`:"";

  let body="";
  if(mode==="grouped"){
    body=panelGroupedStocks();
  }else if(mode==="planner"){
    body=panelTradePlanner();
  }else if(mode==="compare"){
    body=panelZoneOutcomeMap()+panelComparison();
  }else if(mode==="review"){
    body=panelReview();
  }else if(mode==="portfolio"){
    body=panelPortfolio();
  }else{
    body=panelSetupMap()+panelMiniCards();
  }

  app.innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px">
    <h1 style="margin:0;font-size:22px;font-weight:700">Portfolio Overview <span style="font-size:14px;color:var(--mu);font-weight:400">${stocks.length} stock${stocks.length!==1?"s":""}</span></h1>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${modeToggle}${helpBtn}</div>
  </div>
  <div class="section-note" style="margin:-4px 0 14px">All outputs are rule-based from uploaded Dividend Cycle Analysis data. No LLM inference is used.</div>
  ${body}
  ${dashboardHelpModalHtml()}
  <div class="foot">Dividend Cycle Analysis dashboard · No LLM required · Click any stock to drill in</div>`;

  app.querySelectorAll(".mini-card[data-key]").forEach(el=>{
    el.addEventListener("click",()=>setOverviewDrillTarget(el.dataset.key));
  });
  app.querySelectorAll(".setup-list-row[data-key]").forEach(el=>{
    el.addEventListener("click",()=>setOverviewDrillTarget(el.dataset.key));
  });
  const setupMapTip=document.getElementById("setupMapTip");
  app.querySelectorAll(".setup-map-point[data-key]").forEach(el=>{
    el.addEventListener("click",()=>setOverviewDrillTarget(el.dataset.key));
    if(setupMapTip){
      const showSetupTip=e=>{
        let meta={};
        try{meta=JSON.parse(el.dataset.meta||"{}")}catch(_){}
        setupMapTip.innerHTML=`<strong>${esc(meta.ticker||"-")}</strong>${meta.stockName?`<span class="muted">${esc(meta.stockName)}</span>`:""}<div style="margin-top:5px">Verdict: ${esc(meta.verdict||"-")}</div><div class="muted">Tail risk: ${esc(meta.tailRisk||"-")}</div><div class="muted">Possible gain: ${esc(meta.possibleGain||"-")}</div><div class="muted">Zone: ${esc(meta.zone||"-")}</div>`;
        setupMapTip.style.display="block";
        const vw=window.innerWidth;
        const tipW=220;
        const cx=e.clientX??e.touches?.[0]?.clientX??0;
        const cy=e.clientY??e.touches?.[0]?.clientY??0;
        const left=cx+16+tipW>vw ? cx-tipW-8 : cx+16;
        setupMapTip.style.position="fixed";
        setupMapTip.style.left=`${left}px`;
        setupMapTip.style.top=`${Math.max(8,cy-10)}px`;
        setupMapTip.style.zIndex="9999";
      };
      el.addEventListener("mousemove",showSetupTip);
      el.addEventListener("mouseleave",()=>setupMapTip.style.display="none");
      el.addEventListener("touchstart",e=>{e.preventDefault();showSetupTip(e)},{passive:false});
    }
  });
  if(setupMapTip){
    document.addEventListener("touchstart",e=>{
      if(!e.target.closest(".setup-map-stage")) setupMapTip.style.display="none";
    });
  }
  const setupFilterBtn=document.getElementById("setupMapFilterBtn");
  const setupFilterMenu=document.getElementById("setupMapFilterMenu");
  if(setupFilterBtn&&setupFilterMenu){
    setupFilterBtn.addEventListener("click",e=>{
      e.stopPropagation();
      setupFilterMenu.style.display=setupFilterMenu.style.display==="none"?"block":"none";
    });
    setupFilterMenu.addEventListener("click",e=>e.stopPropagation());
    setupFilterMenu.addEventListener("input",e=>{
      const inp=e.target.closest(".cfm-search");
      if(!inp)return;
      const q=inp.value.trim().toLowerCase();
      setupFilterMenu.querySelectorAll(".check-filter-item").forEach(el=>{
        el.classList.toggle("cfm-hidden",!(!q||el.textContent.toLowerCase().includes(q)));
      });
    });
    const syncSetupFilterChecks=(mode)=>{
      const allBox=setupFilterMenu.querySelector("[data-setupfilter-all]");
      const itemBoxes=Array.from(setupFilterMenu.querySelectorAll("[data-setupfilter-item]"));
      if(mode==="all"){
        if(allBox) allBox.checked=true;
        itemBoxes.forEach(el=>{el.checked=true;});
        return;
      }
      if(mode==="none"){
        if(allBox) allBox.checked=false;
        itemBoxes.forEach(el=>{el.checked=false;});
        return;
      }
      const checkedCount=itemBoxes.filter(el=>el.checked).length;
      if(allBox) allBox.checked=checkedCount===itemBoxes.length&&itemBoxes.length>0;
    };
    app.querySelectorAll("[data-setupfilter-action]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        syncSetupFilterChecks(btn.dataset.setupfilterAction);
      });
    });
    setupFilterMenu.querySelector("[data-setupfilter-all]")?.addEventListener("change",e=>{
      syncSetupFilterChecks(e.target.checked?"all":"none");
    });
    app.querySelectorAll("[data-setupfilter-item]").forEach(input=>{
      input.addEventListener("change",()=>{
        syncSetupFilterChecks();
      });
    });
    document.getElementById("setupMapFilterApply")?.addEventListener("click",()=>{
      const picked=Array.from(setupFilterMenu.querySelectorAll("[data-setupfilter-item]"))
        .filter(el=>el.checked)
        .map(el=>el.dataset.setupfilterItem);
      state.setupMapFilterKeys=picked.length===stockList().length?["all"]:(picked.length?picked:[]);
      persistPlannerState();
      setupFilterMenu.style.display="none";
      renderApp();
    });
    if(setupFilterMenu.style.display!=="none"){
      syncSetupFilterChecks();
    }
    document.addEventListener("click",()=>{
      const liveMenu=document.getElementById("setupMapFilterMenu");
      if(liveMenu) liveMenu.style.display="none";
    },{once:true});
  }
  const zoneOutcomeTip=document.getElementById("zoneOutcomeTip");
  app.querySelectorAll(".zone-outcome-point[data-key]").forEach(el=>{
    el.addEventListener("click",()=>setOverviewDrillTarget(el.dataset.key));
    if(zoneOutcomeTip){
      const showZoneTip=e=>{
        let meta={};
        try{meta=JSON.parse(el.dataset.meta||"{}")}catch(_){}
        zoneOutcomeTip.innerHTML=`<strong>${esc(meta.ticker||"-")}</strong>${meta.stockName?`<span class="muted">${esc(meta.stockName)}</span>`:""}<div style="margin-top:5px">${esc(meta.series||"-")}${meta.cycleId?` · ${esc(meta.cycleId)}`:""}${meta.exdiv?` · ${esc(meta.exdiv)}`:""} · ${esc(meta.zoneOutcome||"-")}</div><div class="muted">${esc(meta.actualMinLabel||"Cycle low")}: ${esc(meta.actualMin||"-")}</div><div class="muted">Zone: ${esc(meta.zone||"-")}</div><div class="muted">Actual rebound: ${esc(meta.rebound||"-")}</div><div class="muted">Expected gain: ${esc(meta.expected||"-")}</div><div class="muted">Delta: ${esc(meta.delta||"-")} · ${esc(meta.performance||"-")}</div>`;
        zoneOutcomeTip.style.display="block";
        const vw=window.innerWidth;
        const tipW=240;
        const cx=e.clientX??e.touches?.[0]?.clientX??0;
        const cy=e.clientY??e.touches?.[0]?.clientY??0;
        const left=cx+16+tipW>vw ? cx-tipW-8 : cx+16;
        zoneOutcomeTip.style.position="fixed";
        zoneOutcomeTip.style.left=`${left}px`;
        zoneOutcomeTip.style.top=`${Math.max(8,cy-10)}px`;
        zoneOutcomeTip.style.zIndex="9999";
      };
      el.addEventListener("mousemove",showZoneTip);
      el.addEventListener("mouseleave",()=>zoneOutcomeTip.style.display="none");
      el.addEventListener("touchstart",e=>{e.preventDefault();showZoneTip(e)},{passive:false});
    }
  });
  if(zoneOutcomeTip){
    document.addEventListener("touchstart",e=>{
      if(!e.target.closest(".setup-map-stage")) zoneOutcomeTip.style.display="none";
    });
  }
  document.getElementById("zoneOutcomeCurrent")?.addEventListener("click",()=>{state.zoneOutcomeMode="current";persistPlannerState();renderApp()});
  document.getElementById("zoneOutcomeRecent")?.addEventListener("click",()=>{state.zoneOutcomeMode="recent";persistPlannerState();renderApp()});
  document.getElementById("setupMapViewMap")?.addEventListener("click",()=>{state.setupMapViewMode="map";persistPlannerState();renderApp()});
  document.getElementById("setupMapViewList")?.addEventListener("click",()=>{state.setupMapViewMode="list";persistPlannerState();renderApp()});
  app.querySelectorAll(".setup-list-col-subhead .sh-sort[data-sort-field]").forEach(el=>{
    el.addEventListener("click",()=>{
      const f=el.dataset.sortField;
      const zone=el.dataset.sortZone;
      if(!zone)return;
      const map=state.setupListSort||{};
      const cur=map[zone]||{field:"gain",dir:"desc"};
      state.setupListSort={...map,[zone]:{field:f,dir:cur.field===f&&cur.dir==="desc"?"asc":"desc"}};
      renderApp();
    });
  });
  const zoneFilterBtn=document.getElementById("zoneOutcomeFilterBtn");
  const zoneFilterMenu=document.getElementById("zoneOutcomeFilterMenu");
  if(zoneFilterBtn&&zoneFilterMenu){
    zoneFilterBtn.addEventListener("click",e=>{
      e.stopPropagation();
      zoneFilterMenu.style.display=zoneFilterMenu.style.display==="none"?"block":"none";
    });
    zoneFilterMenu.addEventListener("click",e=>e.stopPropagation());
    const syncZoneFilterChecks=(mode)=>{
      const allBox=zoneFilterMenu.querySelector("[data-zonefilter-all]");
      const itemBoxes=Array.from(zoneFilterMenu.querySelectorAll("[data-zonefilter-item]"));
      if(mode==="all"){
        if(allBox) allBox.checked=true;
        itemBoxes.forEach(el=>{el.checked=true;});
        return;
      }
      if(mode==="none"){
        if(allBox) allBox.checked=false;
        itemBoxes.forEach(el=>{el.checked=false;});
        return;
      }
      const checkedCount=itemBoxes.filter(el=>el.checked).length;
      if(allBox) allBox.checked=checkedCount===itemBoxes.length&&itemBoxes.length>0;
    };
    app.querySelectorAll("[data-zonefilter-action]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        syncZoneFilterChecks(btn.dataset.zonefilterAction);
      });
    });
    zoneFilterMenu.querySelector("[data-zonefilter-all]")?.addEventListener("change",e=>{
      syncZoneFilterChecks(e.target.checked?"all":"none");
    });
    app.querySelectorAll("[data-zonefilter-item]").forEach(input=>{
      input.addEventListener("change",()=>{
        syncZoneFilterChecks();
      });
    });
    document.getElementById("zoneOutcomeFilterApply")?.addEventListener("click",()=>{
      const picked=Array.from(zoneFilterMenu.querySelectorAll("[data-zonefilter-item]"))
        .filter(el=>el.checked)
        .map(el=>el.dataset.zonefilterItem);
      state.zoneOutcomeFilterKeys=picked.length===stockList().length?["all"]:(picked.length?picked:[]);
      persistPlannerState();
      zoneFilterMenu.style.display="none";
      renderApp();
    });
    if(zoneFilterMenu.style.display!=="none"){
      syncZoneFilterChecks();
    }
    document.addEventListener("click",()=>{
      const liveMenu=document.getElementById("zoneOutcomeFilterMenu");
      if(liveMenu) liveMenu.style.display="none";
    },{once:true});
  }

  document.getElementById("ovModeOverview")?.addEventListener("click",()=>{state.overviewMode="overview";persistPlannerState();renderApp()});
  document.getElementById("ovModeGrouped")?.addEventListener("click",()=>{state.overviewMode="grouped";persistPlannerState();renderApp()});
  document.getElementById("ovModePlanner")?.addEventListener("click",()=>{state.overviewMode="planner";persistPlannerState();renderApp()});
  document.getElementById("ovModeCompare")?.addEventListener("click",()=>{state.overviewMode="compare";persistPlannerState();renderApp()});
  document.getElementById("ovModePortfolio")?.addEventListener("click",()=>{state.overviewMode="portfolio";persistPlannerState();renderApp()});
  document.getElementById("ovModeReview")?.addEventListener("click",()=>{state.overviewMode="review";persistPlannerState();renderApp()});
  if(mode==="portfolio"){
    renderPortfolioHistoryChart();
    renderPortfolioAccountValueChart();
    document.getElementById("pfSubHoldings")?.addEventListener("click",()=>{state.portfolioSubTab="holdings";persistPlannerState();renderApp()});
    document.getElementById("pfSubHistory")?.addEventListener("click",()=>{state.portfolioSubTab="history";persistPlannerState();renderApp()});
    document.getElementById("pfSubReconcile")?.addEventListener("click",()=>{state.portfolioSubTab="reconcile";persistPlannerState();renderApp()});
    app.querySelectorAll("th[data-sort-table]").forEach(th=>{
      th.addEventListener("click",()=>{
        const table=th.dataset.sortTable,field=th.dataset.sortField;
        const current=state.portfolioReturnSort?.[table]||{field:"totalReturn",dir:"desc"};
        // Clicking a new column starts ascending (lowest to highest, as asked
        // for); clicking the already-sorted column flips direction.
        const dir=current.field===field?(current.dir==="asc"?"desc":"asc"):"asc";
        state.portfolioReturnSort={...state.portfolioReturnSort,[table]:{field,dir}};
        persistPlannerState();
        renderApp();
      });
    });
    const setGranularity=g=>{state.portfolioChartGranularity=g;persistPlannerState();renderPortfolioHistoryChart();renderPortfolioAccountValueChart();
      document.querySelectorAll("#pfGranWeekly,#pfGranMonthly,#pfGranYearly").forEach(b=>b.classList.remove("active"));
      document.getElementById({weekly:"pfGranWeekly",monthly:"pfGranMonthly",yearly:"pfGranYearly"}[g])?.classList.add("active");
    };
    document.getElementById("pfGranWeekly")?.addEventListener("click",()=>setGranularity("weekly"));
    document.getElementById("pfGranMonthly")?.addEventListener("click",()=>setGranularity("monthly"));
    document.getElementById("pfGranYearly")?.addEventListener("click",()=>setGranularity("yearly"));
    const upsertHolding=entry=>{
      const validated=validatePortfolioEntry(entry);
      if(!validated)return false;
      const list=(state.portfolio||[]).filter(h=>h.ticker!==validated.ticker);
      list.push(validated);
      state.portfolio=list;
      savePortfolio();
      return true;
    };
    document.getElementById("pfAddBtn")?.addEventListener("click",()=>{
      const ticker=document.getElementById("pfTicker")?.value;
      const quantity=document.getElementById("pfQuantity")?.value;
      const avgCostPrice=document.getElementById("pfAvgCost")?.value;
      const purchaseDate=document.getElementById("pfDate")?.value;
      if(!ticker){alert("Choose a stock.");return;}
      if(!upsertHolding({ticker,quantity,avgCostPrice,purchaseDate})){
        alert("Enter a quantity and average cost price greater than 0.");
        return;
      }
      renderApp();
    });
    app.querySelectorAll("[data-portfolio-edit]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const h=(state.portfolio||[]).find(x=>x.ticker===btn.dataset.portfolioEdit);
        if(!h)return;
        const tickerSel=document.getElementById("pfTicker");
        if(tickerSel)tickerSel.value=h.ticker;
        const qtyEl=document.getElementById("pfQuantity");
        if(qtyEl)qtyEl.value=h.quantity;
        const costEl=document.getElementById("pfAvgCost");
        if(costEl)costEl.value=h.avgCostPrice;
        const dateEl=document.getElementById("pfDate");
        if(dateEl)dateEl.value=h.purchaseDate||"";
        tickerSel?.scrollIntoView({behavior:"smooth",block:"center"});
      });
    });
    app.querySelectorAll("[data-portfolio-delete]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const ticker=btn.dataset.portfolioDelete;
        if(!confirm(`Remove ${ticker} from your portfolio?`))return;
        state.portfolio=(state.portfolio||[]).filter(h=>h.ticker!==ticker);
        savePortfolio();
        renderApp();
      });
    });
    document.getElementById("pfDownloadBtn")?.addEventListener("click",()=>{
      const payload={
        holdings:state.portfolio||[],
        history:state.portfolioHistory||[],
        realized:state.portfolioRealized||[],
        dividends:state.portfolioDividends||[],
        fees:state.portfolioFees||[],
        rebates:state.portfolioRebates||[],
        netDeposits:state.portfolioNetDeposits||[],
        withdrawals:state.portfolioWithdrawals||[],
        accountValue:state.portfolioAccountValue||[],
      };
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=`portfolio-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    document.getElementById("pfUploadBtn")?.addEventListener("click",()=>{
      document.getElementById("pfUploadInput")?.click();
    });
    document.getElementById("pfUploadInput")?.addEventListener("change",e=>{
      const file=e.target.files?.[0];
      if(!file)return;
      const reader=new FileReader();
      reader.onload=()=>{
        try{
          const parsed=JSON.parse(String(reader.result||"[]"));
          const holdings=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.holdings)?parsed.holdings:null);
          if(!holdings)throw new Error("no holdings array found");
          let added=0;
          holdings.forEach(entry=>{if(upsertHolding(entry))added++;});
          // Load Backup only ever upserts by ticker above -- it never removes
          // one, so a stock fully sold and dropped from the Purchases table
          // (moved to Closed Positions instead) would otherwise sit in
          // Holdings forever, inflating Total Cost with a position that no
          // longer exists. Safe to drop here only when the ticker is BOTH
          // closed in this same backup AND absent from its holdings list --
          // that excludes the bought-sold-rebought case, where the ticker is
          // still a real current holding despite also having closed lots.
          let removedClosed=0;
          if(Array.isArray(parsed?.realized)){
            const stillHeldTickers=new Set(holdings.map(h=>String(h?.ticker||"").trim()).filter(Boolean));
            const closedTickers=new Set(parsed.realized.map(r=>String(r?.ticker||"").trim()).filter(Boolean));
            const before=(state.portfolio||[]).length;
            state.portfolio=(state.portfolio||[]).filter(h=>!(closedTickers.has(h.ticker)&&!stillHeldTickers.has(h.ticker)));
            removedClosed=before-state.portfolio.length;
            if(removedClosed)savePortfolio();
          }
          let historyAdded=0;
          if(Array.isArray(parsed?.history)){
            const merged=new Map((state.portfolioHistory||[]).map(h=>[h.date,h]));
            parsed.history.map(validatePortfolioHistoryEntry).filter(Boolean).forEach(h=>{
              if(!merged.has(h.date))historyAdded++;
              merged.set(h.date,h);
            });
            state.portfolioHistory=[...merged.values()].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
            savePortfolioHistory();
          }
          let realizedAdded=0;
          if(Array.isArray(parsed?.realized)){
            const seen=new Set((state.portfolioRealized||[]).map(r=>`${r.ticker}|${r.sellDate}|${r.quantity}|${r.sellPrice}`));
            const merged=(state.portfolioRealized||[]).slice();
            parsed.realized.map(validatePortfolioRealizedEntry).filter(Boolean).forEach(r=>{
              const key=`${r.ticker}|${r.sellDate}|${r.quantity}|${r.sellPrice}`;
              if(seen.has(key))return;
              seen.add(key);merged.push(r);realizedAdded++;
            });
            state.portfolioRealized=merged;
            savePortfolioRealized();
          }
          let dividendsAdded=0;
          if(Array.isArray(parsed?.dividends)){
            const seen=new Set((state.portfolioDividends||[]).map(d=>`${d.ticker}|${d.date}|${d.amount}`));
            const merged=(state.portfolioDividends||[]).slice();
            parsed.dividends.map(validatePortfolioDividendEntry).filter(Boolean).forEach(d=>{
              const key=`${d.ticker}|${d.date}|${d.amount}`;
              if(seen.has(key))return;
              seen.add(key);merged.push(d);dividendsAdded++;
            });
            state.portfolioDividends=merged;
            savePortfolioDividends();
          }
          let feesAdded=0;
          if(Array.isArray(parsed?.fees)){
            const merged=new Map((state.portfolioFees||[]).map(f=>[f.date,f]));
            parsed.fees.map(validatePortfolioFeeEntry).filter(Boolean).forEach(f=>{
              if(!merged.has(f.date))feesAdded++;
              merged.set(f.date,f);
            });
            state.portfolioFees=[...merged.values()].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
            savePortfolioFees();
          }
          let rebatesAdded=0;
          if(Array.isArray(parsed?.rebates)){
            const merged=new Map((state.portfolioRebates||[]).map(f=>[f.date,f]));
            parsed.rebates.map(validatePortfolioRebateEntry).filter(Boolean).forEach(f=>{
              if(!merged.has(f.date))rebatesAdded++;
              merged.set(f.date,f);
            });
            state.portfolioRebates=[...merged.values()].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
            savePortfolioRebates();
          }
          let netDepositsAdded=0;
          if(Array.isArray(parsed?.netDeposits)){
            const merged=new Map((state.portfolioNetDeposits||[]).map(f=>[f.date,f]));
            parsed.netDeposits.map(validatePortfolioNetDepositEntry).filter(Boolean).forEach(f=>{
              if(!merged.has(f.date))netDepositsAdded++;
              merged.set(f.date,f);
            });
            state.portfolioNetDeposits=[...merged.values()].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
            savePortfolioNetDeposits();
          }
          let withdrawalsAdded=0;
          if(Array.isArray(parsed?.withdrawals)){
            const merged=new Map((state.portfolioWithdrawals||[]).map(f=>[f.date,f]));
            parsed.withdrawals.map(validatePortfolioWithdrawalEntry).filter(Boolean).forEach(f=>{
              if(!merged.has(f.date))withdrawalsAdded++;
              merged.set(f.date,f);
            });
            state.portfolioWithdrawals=[...merged.values()].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
            savePortfolioWithdrawals();
          }
          let accountValueAdded=0;
          if(Array.isArray(parsed?.accountValue)){
            const merged=new Map((state.portfolioAccountValue||[]).map(v=>[v.date,v]));
            parsed.accountValue.map(validatePortfolioAccountValueEntry).filter(Boolean).forEach(v=>{
              if(!merged.has(v.date))accountValueAdded++;
              merged.set(v.date,v);
            });
            state.portfolioAccountValue=[...merged.values()].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
            savePortfolioAccountValue();
          }
          alert(`Loaded ${added} of ${holdings.length} holding(s)${removedClosed?` (removed ${removedClosed} that are now fully closed)`:""}, ${historyAdded} new history point(s), ${realizedAdded} closed position(s), ${dividendsAdded} dividend(s), ${feesAdded} fee period(s), ${rebatesAdded} rebate period(s), ${netDepositsAdded} net deposit period(s), ${withdrawalsAdded} withdrawal(s), and ${accountValueAdded} account value point(s) from backup.`);
          renderApp();
        }catch(err){
          alert("Could not read that file as a portfolio backup.");
        }
      };
      reader.readAsText(file);
      e.target.value="";
    });
  }
  app.querySelectorAll(".rev-move-btn[data-key]").forEach(btn=>{
    btn.addEventListener("click",e=>{
      e.stopPropagation();
      const key=btn.dataset.key;
      const target=btn.dataset.target;
      if(!state.reviewOverrides)state.reviewOverrides={};
      state.reviewOverrides[key]=target;
      persistPlannerState();renderApp();
    });
  });
  app.querySelectorAll(".rev-sort-btn[data-col]").forEach(btn=>{
    btn.addEventListener("click",e=>{
      e.stopPropagation();
      if(!state.reviewSort)state.reviewSort={};
      state.reviewSort[btn.dataset.col]=btn.dataset.sort;
      persistPlannerState();renderApp();
    });
  });
  const revSearchEl=document.getElementById("revSearch");
  if(revSearchEl){
    revSearchEl.addEventListener("input",e=>{
      state.reviewSearch=e.target.value;
      renderApp();
      const el=document.getElementById("revSearch");
      if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}
    });
  }
  app.querySelectorAll(".rev-card[data-key]").forEach(card=>{
    card.addEventListener("click",e=>{
      if(e.target.closest(".rev-move-btn"))return;
      setOverviewDrillTarget(card.dataset.key);
    });
  });
  document.getElementById("reviewResetOverrides")?.addEventListener("click",()=>{
    state.reviewOverrides={};
    persistPlannerState();renderApp();
  });
  document.getElementById("reviewHelpBtn")?.addEventListener("click",()=>{
    const m=document.getElementById("reviewHelpModal");
    if(m)m.style.display="flex";
  });
  document.getElementById("reviewHelpClose")?.addEventListener("click",()=>{
    const m=document.getElementById("reviewHelpModal");
    if(m)m.style.display="none";
  });
  document.getElementById("reviewHelpModal")?.addEventListener("click",e=>{
    if(e.target===e.currentTarget)e.currentTarget.style.display="none";
  });
  document.querySelectorAll("#reviewHelpModal .rev-help-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      document.querySelectorAll("#reviewHelpModal .rev-help-tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll("#reviewHelpModal .rev-help-panel").forEach(p=>p.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`#reviewHelpModal .rev-help-panel[data-tab="${tab.dataset.tab}"]`).classList.add("active");
    });
  });
  // Shared "How this works" modal -- one modal, several entry points (the
  // "About this view" button on Overview/Potential & Upcoming/Trade
  // Planner/Comparison each open it pre-selected to their own tab).
  document.querySelectorAll("[data-dash-help-open]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const m=document.getElementById("dashboardHelpModal");
      if(!m)return;
      const tabKey=btn.dataset.dashHelpOpen;
      m.querySelectorAll(".rev-help-tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===tabKey));
      m.querySelectorAll(".rev-help-panel").forEach(p=>p.classList.toggle("active",p.dataset.tab===tabKey));
      m.style.display="flex";
    });
  });
  document.getElementById("dashboardHelpClose")?.addEventListener("click",()=>{
    const m=document.getElementById("dashboardHelpModal");
    if(m)m.style.display="none";
  });
  document.getElementById("dashboardHelpModal")?.addEventListener("click",e=>{
    if(e.target===e.currentTarget)e.currentTarget.style.display="none";
  });
  document.querySelectorAll("#dashboardHelpModal .rev-help-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      document.querySelectorAll("#dashboardHelpModal .rev-help-tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll("#dashboardHelpModal .rev-help-panel").forEach(p=>p.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`#dashboardHelpModal .rev-help-panel[data-tab="${tab.dataset.tab}"]`).classList.add("active");
    });
  });
  document.getElementById("plannerExportCsv")?.addEventListener("click",e=>{
    e.preventDefault();
    exportPlannerCsv();
  });

  app.querySelectorAll("[data-planner-toggle]").forEach(btn=>{
    btn.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      togglePlanner(btn.dataset.plannerToggle);
    });
  });
  app.querySelectorAll("[data-planner-open]").forEach(btn=>{
    btn.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      setOverviewDrillTarget(btn.dataset.plannerOpen);
    });
  });
  app.querySelectorAll("[data-planner-card]").forEach(card=>{
    card.addEventListener("click",()=>{
      state.plannerActiveKey=card.dataset.plannerCard;
      persistPlannerState();
      renderApp();
    });
  });
  app.querySelectorAll("[data-planner-date]").forEach(input=>{
    input.addEventListener("change",e=>{
      updatePlannerOverride(input.dataset.plannerDate,{officialExDivDate:e.target.value||""});
      state.plannerActiveKey=input.dataset.plannerDate;
      persistPlannerState();
      renderApp();
    });
  });
  app.querySelectorAll("[data-planner-div]").forEach(input=>{
    input.addEventListener("change",e=>{
      updatePlannerOverride(input.dataset.plannerDiv,{officialDivAmount:e.target.value||""});
      state.plannerActiveKey=input.dataset.plannerDiv;
      persistPlannerState();
      renderApp();
    });
  });
  app.querySelectorAll("[data-planner-entry]").forEach(input=>{
    input.addEventListener("change",e=>{
      updatePlannerOverride(input.dataset.plannerEntry,{plannedEntryPrice:e.target.value||""});
      state.plannerActiveKey=input.dataset.plannerEntry;
      persistPlannerState();
      renderApp();
    });
  });
  app.querySelectorAll("[data-planner-reset]").forEach(btn=>{
    btn.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      updatePlannerOverride(btn.dataset.plannerReset,{officialExDivDate:"",officialDivAmount:"",plannedEntryPrice:""});
      state.plannerActiveKey=btn.dataset.plannerReset;
      persistPlannerState();
      renderApp();
    });
  });

  app.querySelectorAll(".cmp-stock-head[data-key]").forEach(th=>{
    th.addEventListener("click",()=>setOverviewDrillTarget(th.dataset.key));
  });

  bindStateSelect("cmpSortKey","cmpSortKey",value=>{
    if(value==="none") state.cmpSortDir="asc";
  });
  bindStateSelect("cmpSortDir","cmpSortDir");
  bindStateSelect("cmpFilterSector","cmpFilterSector");
  bindStateSelect("cmpFilterEntryStatus","cmpFilterEntryStatus");
  document.getElementById("cmpSearch")?.addEventListener("input",e=>{
    state.cmpSearch=e.target.value;
    const q=e.target.value.trim().toLowerCase();
    document.querySelectorAll(".cmp-stock-head[data-col-index]").forEach(th=>{
      const show=!q||th.textContent.toLowerCase().includes(q);
      const idx=th.dataset.colIndex;
      th.style.display=show?"":"none";
      document.querySelectorAll(`[data-col-index="${idx}"]`).forEach(el=>el.style.display=show?"":"none");
    });
  });
  document.getElementById("groupedSubTabPotential")?.addEventListener("click",()=>{state.groupedSubTab="potential";renderApp()});
  document.getElementById("groupedSubTabUpcoming")?.addEventListener("click",()=>{state.groupedSubTab="upcoming";renderApp()});
  document.getElementById("groupedPotentialSearch")?.addEventListener("input",e=>{
    state.groupedPotentialSearch=e.target.value;
    const q=e.target.value.trim().toLowerCase();
    document.querySelectorAll("#groupedGrid-potential .grouped-stock-card").forEach(card=>{
      card.style.display=(!q||card.textContent.toLowerCase().includes(q))?"":"none";
    });
  });
  document.getElementById("groupedUpcomingSearch")?.addEventListener("input",e=>{
    state.groupedUpcomingSearch=e.target.value;
    const q=e.target.value.trim().toLowerCase();
    document.querySelectorAll("#groupedGrid-upcoming .grouped-stock-card").forEach(card=>{
      card.style.display=(!q||card.textContent.toLowerCase().includes(q))?"":"none";
    });
  });
  bindStateSelect("groupedPotentialSort","groupedPotentialSort");
  bindStateSelect("groupedPotentialFilterFrequency","groupedPotentialFilterFrequency");
  bindStateSelect("groupedPotentialFilterTiming","groupedPotentialFilterTiming");
  bindStateSelect("groupedPotentialFilterTail","groupedPotentialFilterTail");
  bindStateSelect("groupedPotentialFilterExitMode","groupedPotentialFilterExitMode");
  bindStateSelect("groupedPotentialFilterScore","groupedPotentialFilterScore");
bindStateSelect("groupedUpcomingSort","groupedUpcomingSort");
bindStateSelect("groupedUpcomingFilterFrequency","groupedUpcomingFilterFrequency");
bindStateSelect("groupedUpcomingFilterEntry","groupedUpcomingFilterEntry");
bindStateSelect("groupedUpcomingFilterTail","groupedUpcomingFilterTail");
bindStateSelect("groupedUpcomingFilterExitMode","groupedUpcomingFilterExitMode");
bindStateSelect("groupedUpcomingFilterDays","groupedUpcomingFilterDays");
bindStateSelect("groupedUpcomingFilterGain","groupedUpcomingFilterGain");
  bindDragScroll(app);
}

function bindDragScroll(scope=document){
  scope.querySelectorAll(".table-wrap,.cmp-table-wrap,.prog-strip,.cal-strip,.drift-strip").forEach(wrap=>{
    if(wrap.dataset.dragBound==="1")return;
    wrap.dataset.dragBound="1";
    let pointerId=null,startX=0,startLeft=0,moved=false;
    wrap.addEventListener("pointerdown",e=>{
      if(e.pointerType==="touch")return;
      if(e.pointerType==="mouse"&&e.button!==0)return;
      if(e.target.closest("button,input,label,a,.tab,select,.no-drag,.metric-label"))return;
      pointerId=e.pointerId;
      startX=e.clientX;
      startLeft=wrap.scrollLeft;
      moved=false;
      wrap.classList.add("dragging");
      if(wrap.setPointerCapture){
        try{wrap.setPointerCapture(pointerId);}catch(_){ }
      }
    });
    wrap.addEventListener("pointermove",e=>{
      if(pointerId===null||e.pointerId!==pointerId)return;
      const dx=e.clientX-startX;
      if(Math.abs(dx)>3){
        moved=true;
        e.preventDefault();
      }
      wrap.scrollLeft=startLeft-dx;
    });
    wrap.addEventListener("click",e=>{
      if(moved){
        e.preventDefault();
        e.stopPropagation();
        moved=false;
      }
    },true);
    const stop=e=>{
      if(e&&pointerId!==null&&e.pointerId!==pointerId)return;
      if(pointerId!==null&&wrap.releasePointerCapture){
        try{wrap.releasePointerCapture(pointerId);}catch(_){ }
      }
      pointerId=null;
      wrap.classList.remove("dragging");
      setTimeout(()=>{moved=false;},0);
    };
    wrap.addEventListener("pointerup",stop);
    wrap.addEventListener("pointercancel",stop);
    wrap.addEventListener("lostpointercapture",stop);
    wrap.addEventListener("mouseleave",()=>{ if(pointerId===null)wrap.classList.remove("dragging"); });
  });
}

/* ?? MASTER RENDER ????????????????????????????????????????????????????? */
function renderApp(){
  updateStockBar();
  const stocks=stockList();
  if(!stocks.length){
    const flaskActions=BACKEND_CONFIG.enabled && backendAvailable
      ? `<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px">
        <button class="btn btn-compact" id="emptyManageRegistryBtn" type="button">Edit stock list</button>
        <button class="btn btn-compact" id="emptyRunPipelineBtn" type="button">Update stock data</button>
        <button class="btn btn-compact" id="emptyLoadServerStocksBtn" type="button">Load existing stock data</button>
      </div>`
      : `<p style="font-size:12px;margin:10px 0 0;color:var(--mu)">Open this dashboard through the local Flask app to edit the stock list, update stock data, and load existing outputs.</p>`;
    app.innerHTML=`<div class="multi-empty">
      <div class="me-icon"></div>
      <h2>Set up stock data to begin</h2>
      <p style="font-size:13px;margin:4px 0 0">Use the Flask workflow to prepare tracked stocks, refresh analysis outputs, and load them into the dashboard.</p>
      <div class="start-steps">
        <div class="start-step">
          <div class="start-step-num">1</div>
          <h3>Edit stock list</h3>
          <p>Choose the stocks you want to track.</p>
        </div>
        <div class="start-step">
          <div class="start-step-num">2</div>
          <h3>Update stock data</h3>
          <p>Refresh the latest analysis outputs.</p>
        </div>
        <div class="start-step">
          <div class="start-step-num">3</div>
          <h3>Load existing stock data</h3>
          <p>Open the generated stock data in the dashboard.</p>
        </div>
      </div>
      ${flaskActions}
    </div>`;
    document.getElementById("emptyManageRegistryBtn")?.addEventListener("click",()=>document.getElementById("manageRegistryBtn")?.click());
    document.getElementById("emptyRunPipelineBtn")?.addEventListener("click",()=>document.getElementById("runPipelineBtn")?.click());
    document.getElementById("emptyLoadServerStocksBtn")?.addEventListener("click",()=>document.getElementById("loadServerStocksBtn")?.click());
    return
  }
  if(state.view==="drill"&&state.activeKey&&state.stocks[state.activeKey]){
    renderDrillView(state.stocks[state.activeKey]);
  } else {
    state.view="overview";
    renderOverviewView();
  }
}

/* ?? LOAD FUNCTIONS ???????????????????????????????????????????????????? */
function addStock(data,label){
  validateData(data);
  const key=stockKey(data,label);
  const isUpdate=key in state.stocks;
  state.rememberLoadedStocks=true;
  state.stocks[key]={data,label,key};
  if(!state.activeKey)state.activeKey=key;
  if(isUpdate){
    document.getElementById("loadStatus").textContent=`Refreshed: ${data.meta?.ticker||label}`;
  }
  ensurePlannerActive();
  persistPlannerState();
  // If only 1 stock, auto-drill; if multiple stay in overview
  state.view=Object.keys(state.stocks).length===1?"drill":"overview";
  state.tab=0;
  renderApp();
}
document.getElementById("loadServerStocksBtn")?.addEventListener("click",async()=>{
  try{
    await loadRegistryServerStocks();
    renderApp();
  }catch(err){
    document.getElementById("loadStatus").textContent=`Existing stock data load failed: ${err.message}`;
  }
});
document.getElementById("quickGuideBtn")?.addEventListener("click",()=>openQuickGuideOverlay());
document.getElementById("mobileActionsToggle")?.addEventListener("click",()=>{
  const actions=document.querySelector(".topbar-actions");
  const toggle=document.getElementById("mobileActionsToggle");
  if(!actions||!toggle)return;
  const expanded=actions.classList.contains("expanded");
  actions.classList.toggle("expanded",!expanded);
  actions.classList.toggle("collapsed",expanded);
  toggle.setAttribute("aria-expanded",expanded?"false":"true");
});
document.getElementById("closeQuickGuideBtn")?.addEventListener("click",()=>closeQuickGuideOverlay());
document.getElementById("quickGuideOverlay")?.addEventListener("click",e=>{
  if(e.target.id==="quickGuideOverlay")closeQuickGuideOverlay();
});
document.getElementById("manageRegistryBtn")?.addEventListener("click",async()=>{
  openRegistryOverlay();
  registryStatus("Loading registry and master stock list...");
  try{
    await Promise.all([fetchRegistryEntries(),fetchMasterStocks()]);
  }catch(err){
    registryStatus(`Registry load failed: ${err.message}`);
  }
});
document.getElementById("runPipelineBtn")?.addEventListener("click",async()=>{
  try{
    await runPipelineFromDashboard();
  }catch(err){
    document.getElementById("loadStatus").textContent=`Stock data update failed: ${err.message}`;
  }
});
document.getElementById("closeRegistryBtn")?.addEventListener("click",()=>closeRegistryOverlay());
document.getElementById("registryOverlay")?.addEventListener("click",e=>{
  if(e.target.id==="registryOverlay")closeRegistryOverlay();
});
document.getElementById("refreshRegistryBtn")?.addEventListener("click",async()=>{
  registryStatus("Reloading registry and master stock list...");
  try{
    await Promise.all([fetchRegistryEntries(),fetchMasterStocks()]);
    resetRegistryForm();
  }catch(err){
    registryStatus(`Registry load failed: ${err.message}`);
  }
});
document.getElementById("saveRegistryEntryBtn")?.addEventListener("click",()=>upsertRegistryEntry());
document.getElementById("saveRegistryBtn")?.addEventListener("click",async()=>{
  registryStatus("Saving registry...");
  try{
    await saveRegistryEntries();
    await fetchRegistryEntries();
    resetRegistryForm();
  }catch(err){
    registryStatus(`Registry save failed: ${err.message}`);
  }
});
document.getElementById("registryIsIndex")?.addEventListener("change",e=>{
  if(e.target.checked){
    const runAnalysis=document.getElementById("registryRunAnalysis");
    if(runAnalysis)runAnalysis.checked=false;
  }
});
document.getElementById("registryMasterStock")?.addEventListener("focus",e=>{
  e.target.select();
});
document.getElementById("registryMasterStock")?.addEventListener("input",e=>{
  state.registryMasterPage=1;
  renderMasterStockOptions(e.target.value||"");
});
document.getElementById("registryMasterStock")?.addEventListener("focus",e=>{
  renderMasterStockOptions(e.target.value||"");
});
document.getElementById("registryMasterStock")?.addEventListener("click",e=>{
  renderMasterStockOptions(e.target.value||"");
});
document.getElementById("masterStockMenu")?.addEventListener("click",e=>{
  e.stopPropagation();
  const pageAction=e.target.closest("[data-master-page]")?.dataset.masterPage;
  if(pageAction){
    const input=document.getElementById("registryMasterStock");
    const totalPages=Math.max(1,Math.ceil(filteredMasterStocksFull(input?.value||"").length/40));
    if(pageAction==="prev") state.registryMasterPage=Math.max(1,(Number(state.registryMasterPage)||1)-1);
    if(pageAction==="next") state.registryMasterPage=Math.min(totalPages,(Number(state.registryMasterPage)||1)+1);
    renderMasterStockOptions(input?.value||"");
    return;
  }
  const action=e.target.closest("[data-master-action]")?.dataset.masterAction;
  if(action){
    const input=document.getElementById("registryMasterStock");
    if(action==="all"){
      const visible=visibleMasterStockTickers(input?.value||"");
      setRegistrySelectedMasterTickers(visible);
      renderMasterStockOptions(input?.value||"");
      registryStatus(`${visible.length} visible stock${visible.length===1?"":"s"} selected.`);
      return;
    }
    if(action==="none"){
      state.registrySelectedMasterTickers=[];
      updateRegistryMultiSelectUI();
      renderMasterStockOptions(input?.value||"");
      registryStatus("Master stock selection cleared.");
      return;
    }
  }
  const ticker=e.target.closest("[data-master-stock]")?.dataset.masterStock;
  if(!ticker)return;
  selectMasterStockByTicker(ticker);
});
document.getElementById("registryMasterFilter")?.addEventListener("change",()=>{
  const input=document.getElementById("registryMasterStock");
  state.registryMasterPage=1;
  renderMasterStockOptions(input?.value||"");
});
document.getElementById("registrySectorFilter")?.addEventListener("change",()=>{
  const input=document.getElementById("registryMasterStock");
  state.registryMasterPage=1;
  renderMasterStockOptions(input?.value||"");
});
document.getElementById("registryTableSearch")?.addEventListener("input",()=>renderRegistryTable());
document.querySelector(".registry-tabs")?.addEventListener("click",e=>{
  const tab=e.target.closest("[data-reg-tab]")?.dataset.regTab;
  if(tab)setRegistryTab(tab);
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&document.getElementById("registryOverlay")?.classList.contains("open")){
    closeRegistryOverlay();
  }
});
document.getElementById("forgetSavedStocksBtn")?.addEventListener("click",()=>{
  state.rememberLoadedStocks=false;
  state.serverLoadedFiles=[];
  persistPlannerState();
  document.getElementById("loadStatus").textContent=stockList().length
    ? "Saved stock cache cleared for future refreshes"
    : "Saved stock cache cleared";
});
syncMobileTopbarActions();
window.addEventListener("resize",syncMobileTopbarActions);
bindDragScroll(document);

// Delegated handler for dynamically-rendered buttons
document.addEventListener("click",e=>{
  const id=e.target.id||e.target.closest("[id]")?.id;
  const editIndex=e.target.closest("[data-registry-edit]")?.dataset.registryEdit;
  if(editIndex!==undefined){
    editRegistryEntry(Number(editIndex));
    return;
  }
  const deleteIndex=e.target.closest("[data-registry-delete]")?.dataset.registryDelete;
  if(deleteIndex!==undefined){
    removeRegistryEntry(Number(deleteIndex));
    return;
  }
  const toggleIndex=e.target.closest("[data-registry-toggle]")?.dataset.registryToggle;
  if(toggleIndex!==undefined){
    toggleRegistryActive(Number(toggleIndex));
    return;
  }
  if(id==="clearAllBtn"){
    const n=Object.keys(state.stocks).length;
    if(!n)return;
    const label=n===1
      ?`Remove ${stockList()[0]?.data?.meta?.ticker||"this stock"}?`
      :`Remove all ${n} stocks?`;
    if(!confirm(label+" This cannot be undone."))return;
    state.stocks={};state.planner={};state.plannerActiveKey=null;state.activeKey=null;state.view="overview";state.tab=0;state.serverLoadedFiles=[];
    persistPlannerState();
    renderApp();
  }
});
hydratePlannerState();
hydratePortfolio();
hydratePortfolioHistory();
hydratePortfolioRealized();
hydratePortfolioDividends();
hydratePortfolioFees();
hydratePortfolioRebates();
hydratePortfolioNetDeposits();
hydratePortfolioWithdrawals();
hydratePortfolioAccountValue();
renderApp();
initBackendMode();

document.addEventListener("input",function(e){
  if(e.target.id!=="miniCardSearch")return;
  const q=e.target.value.trim().toLowerCase();
  const cards=document.querySelectorAll("#miniGrid .mini-card");
  let visible=0;
  cards.forEach(card=>{
    const key=(card.dataset.key||"").toLowerCase();
    const name=(card.querySelector(".mini-card-name")?.textContent||"").toLowerCase();
    const show=!q||key.includes(q)||name.includes(q);
    card.style.display=show?"":"none";
    if(show)visible++;
  });
  const countEl=document.getElementById("miniCardCount");
  if(countEl)countEl.textContent=q?`${visible} of ${cards.length} stock${cards.length!==1?"s":""}`:
    `${cards.length} stock${cards.length!==1?"s":""}`;
});
