// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – Backtesting Engine
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle, SMCSignal, AppSettings } from '../types';
import { runEntryEngine } from '../strategy/smc/entry-engine';
import { buildHigherTimeframe } from '../data/timeframe-builder';

export interface BacktestConfig {
  htfCandles: Candle[];
  ltfCandles: Candle[];
  settings: AppSettings;
  startDate?: number;
  endDate?: number;
}

export interface BacktestTrade {
  entryIndex: number;
  entryPrice: number;
  exitPrice: number;
  exitReason: 'SL' | 'TP' | 'END_OF_DATA';
  quantity: number;
  pnl: number;
  rMultiple: number;
  holdingCandles: number;
  signal: SMCSignal;
}

export interface SplitStats {
  totalSignals: number;
  tradesTaken: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  netPnl: number;
  trades: BacktestTrade[];
  equityCurve: { index: number; equity: number }[];
}

export interface BacktestResult {
  id: string;
  config: BacktestConfig;
  totalSignals: number;
  tradesTaken: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  netPnl: number;
  trades: BacktestTrade[];
  equityCurve: { index: number; equity: number }[];
  developmentStats: SplitStats;
  validationStats: SplitStats;
  oosStats: SplitStats;
  runAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal SMCSignal suitable for embedding in a BacktestTrade.
 * All structural fields are set to sensible defaults; only price-level data
 * from the detected setup is populated.
 */
function buildSimulatedSignal(
  candle: Candle,
  entryPrice: number,
  sl: number,
  tp: number,
  settings: AppSettings,
): SMCSignal {
  return {
    id: crypto.randomUUID(),
    timestamp: candle.timestamp,
    symbol: 'BACKTEST',
    market: settings.market,
    exchange: settings.defaultExchange,
    timeframe: '5m',
    htfBias: 'NEUTRAL',
    bosDetected: false,
    bosLevel: null,
    bosTimestamp: null,
    chochDetected: false,
    chochLevel: null,
    chochTimestamp: null,
    liquiditySweep: null,
    fvg: null,
    orderBlock: null,
    entryZone: { top: tp, bottom: sl },
    signalStatus: 'VALID_SIGNAL',
    conditions: {
      htfBullish: false,
      liquidityIdentified: false,
      sweepConfirmed: false,
      chochBosConfirmed: false,
      displacementConfirmed: true,
      fvgDetected: false,
      fvgRetest: false,
      entryConfirmed: true,
      rrQualified: true,
    },
  };
}

/**
 * Detect qualified SMC signals using the authentic deterministic Entry Engine.
 * Evaluates HTF 1H directional bias, LTF 5M liquidity sweep, BOS/CHoCH, and FVG retest.
 */
function detectSignal(
  candles: Candle[],
  currentIndex: number,
  minRR: number,
  settings: AppSettings,
  htfCandles?: Candle[]
): { entry: number; sl: number; tp: number; signal: SMCSignal } | null {
  const LOOKBACK = 35;
  if (currentIndex < 12) return null;

  const current = candles[currentIndex];
  const ltfSlice = candles.slice(Math.max(0, currentIndex - LOOKBACK), currentIndex + 1);

  // Derive or filter 1H HTF candles up to current candle timestamp
  let htfSlice: Candle[] = [];
  if (htfCandles && htfCandles.length > 0) {
    htfSlice = htfCandles.filter((c) => c.timestamp <= current.timestamp);
  }
  if (htfSlice.length < 5) {
    htfSlice = buildHigherTimeframe(candles.slice(0, currentIndex + 1), '1h', '5m', settings.market);
  }

  const smcSignal = runEntryEngine(
    {
      htfCandles: htfSlice,
      ltfCandles: ltfSlice,
    },
    settings,
    'BACKTEST'
  );

  // Qualify setup
  if (smcSignal.signalStatus === 'VALID_SIGNAL' || (smcSignal.conditions.sweepConfirmed && smcSignal.conditions.chochBosConfirmed && smcSignal.conditions.fvgDetected)) {
    const entry = smcSignal.fvg?.midpoint || current.close;
    const sl = smcSignal.liquiditySweep ? smcSignal.liquiditySweep.sweepLow * 0.998 : entry * 0.985;
    const risk = entry - sl;
    if (risk <= 0) return null;

    const tp = entry + risk * Math.max(3.0, minRR);
    const costPerShare = settings.market === 'INDIA' ? entry * 0.0005 : 0.01;
    const netRisk = risk + costPerShare;
    const netReward = Math.max(0, (tp - entry) - costPerShare);
    const netRR = netRisk > 0 ? netReward / netRisk : 0;

    if (netRR >= minRR - 1e-4) {
      return { entry, sl, tp, signal: smcSignal };
    }
  }

  return null;
}

/**
 * Simulate trades on a slice of candles and return the resulting trade list.
 *
 * @param candles   The candle slice to simulate over.
 * @param offset    The global index offset of this slice (for equityCurve labelling).
 * @param minRR     Minimum reward:risk ratio required to take a signal.
 * @param settings  Full app settings (used to build the embedded SMCSignal).
 * @param htfCandles Optional 1H candles.
 */
function simulateSlice(
  candles: Candle[],
  offset: number,
  minRR: number,
  settings: AppSettings,
  htfCandles?: Candle[]
): { trades: BacktestTrade[]; totalSignals: number } {
  const trades: BacktestTrade[] = [];
  let totalSignals = 0;
  let inTrade = false;
  let tradeEntryIndex = -1;
  let tradeEntryPrice = 0;
  let tradeSL = 0;
  let tradeTP = 0;
  let tradeSignal: SMCSignal | null = null;

  for (let i = 0; i < candles.length; i++) {
    // ── Manage open trade ───────────────────────────────────────────────────
    if (inTrade && tradeSignal !== null) {
      const c = candles[i];
      let exitPrice: number | null = null;
      let exitReason: BacktestTrade['exitReason'] | null = null;

      // Conservative rule: if both SL and TP are touched in the same candle,
      // assume SL was hit first.
      if (c.low <= tradeSL && c.high >= tradeTP) {
        exitPrice = tradeSL;
        exitReason = 'SL';
      } else if (c.low <= tradeSL) {
        exitPrice = tradeSL;
        exitReason = 'SL';
      } else if (c.high >= tradeTP) {
        exitPrice = tradeTP;
        exitReason = 'TP';
      } else if (i === candles.length - 1) {
        // End of data – exit at last close
        exitPrice = c.close;
        exitReason = 'END_OF_DATA';
      }

      if (exitPrice !== null && exitReason !== null) {
        const risk = tradeEntryPrice - tradeSL;
        const pnl = exitPrice - tradeEntryPrice;
        const rMultiple = risk > 0 ? pnl / risk : 0;

        trades.push({
          entryIndex: offset + tradeEntryIndex,
          entryPrice: tradeEntryPrice,
          exitPrice,
          exitReason,
          quantity: 1,
          pnl,
          rMultiple,
          holdingCandles: i - tradeEntryIndex,
          signal: tradeSignal,
        });

        inTrade = false;
        tradeSignal = null;
      }

      continue; // do not detect new signals while in a trade
    }

    // ── Signal detection via actual SMC Engine ──────────────────────────────
    const detected = detectSignal(candles, i, minRR, settings, htfCandles);
    if (detected === null) continue;

    totalSignals++;

    // Entry on NEXT candle open (realistic fill) – need i+1 to exist
    const entryCandle = candles[i + 1];
    if (!entryCandle) continue;

    inTrade = true;
    tradeEntryIndex = i + 1;
    tradeEntryPrice = entryCandle.open;
    tradeSL = detected.sl;
    tradeTP = detected.tp;
    tradeSignal = detected.signal;

    i++; // consume entry candle index
  }

  return { trades, totalSignals };
}

/**
 * Calculate summary statistics for a list of trades.
 */
function calcStats(
  trades: BacktestTrade[],
  totalSignals: number,
  startingEquity: number,
): Omit<SplitStats, 'trades' | 'equityCurve'> {
  if (trades.length === 0) {
    return {
      totalSignals,
      tradesTaken: 0,
      winRate: 0,
      profitFactor: 0,
      expectancy: 0,
      maxDrawdown: 0,
      netPnl: 0,
    };
  }

  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl <= 0);

  const grossWins = winners.reduce((s, t) => s + t.pnl, 0);
  const grossLosses = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));

  const winRate = trades.length > 0 ? winners.length / trades.length : 0;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const expectancy = trades.length > 0 ? netPnl / trades.length : 0;

  // Max drawdown (on equity curve)
  let equity = startingEquity;
  let peak = equity;
  let maxDD = 0;

  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalSignals,
    tradesTaken: trades.length,
    winRate,
    profitFactor,
    expectancy,
    maxDrawdown: maxDD,
    netPnl,
  };
}

/**
 * Build an equity curve array from a list of trades, starting at `startingEquity`.
 */
function buildEquityCurve(
  trades: BacktestTrade[],
  startingEquity: number,
): { index: number; equity: number }[] {
  const curve: { index: number; equity: number }[] = [{ index: 0, equity: startingEquity }];
  let equity = startingEquity;

  for (let i = 0; i < trades.length; i++) {
    equity += trades[i].pnl;
    curve.push({ index: i + 1, equity });
  }

  return curve;
}

/**
 * Assemble a SplitStats object from a simulated slice.
 */
function buildSplitStats(
  trades: BacktestTrade[],
  totalSignals: number,
  startingEquity: number,
): SplitStats {
  const stats = calcStats(trades, totalSignals, startingEquity);
  const equityCurve = buildEquityCurve(trades, startingEquity);
  return { ...stats, trades, equityCurve };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function runBacktest(config: BacktestConfig): BacktestResult {
  const STARTING_EQUITY = 100_000;

  // ── 1. Filter candles by date range ────────────────────────────────────────
  let ltf = config.ltfCandles.slice(); // copy to avoid mutating caller's array

  if (config.startDate !== undefined) {
    ltf = ltf.filter((c) => c.timestamp >= config.startDate!);
  }
  if (config.endDate !== undefined) {
    ltf = ltf.filter((c) => c.timestamp <= config.endDate!);
  }

  // Sort ascending by timestamp (guard against unsorted input)
  ltf.sort((a, b) => a.timestamp - b.timestamp);

  // ── 2. Split into development / validation / OOS ───────────────────────────
  const total = ltf.length;
  const devEnd = Math.floor(total * 0.6);
  const valEnd = Math.floor(total * 0.8);

  const devCandles = ltf.slice(0, devEnd);
  const valCandles = ltf.slice(devEnd, valEnd);
  const oosCandles = ltf.slice(valEnd);

  // ── 3. Resolve minRR from settings (hard floor of 3.0) ────────────────────
  const minRR = config.settings.risk.minRR ?? 3.0;

  // ── 4. Simulate each split independently ──────────────────────────────────
  const devResult = simulateSlice(devCandles, 0, minRR, config.settings, config.htfCandles);
  const valResult = simulateSlice(valCandles, devEnd, minRR, config.settings, config.htfCandles);
  const oosResult = simulateSlice(oosCandles, valEnd, minRR, config.settings, config.htfCandles);

  // ── 5. Build per-split stats ───────────────────────────────────────────────
  const developmentStats = buildSplitStats(devResult.trades, devResult.totalSignals, STARTING_EQUITY);
  const validationStats = buildSplitStats(valResult.trades, valResult.totalSignals, STARTING_EQUITY);
  const oosStats = buildSplitStats(oosResult.trades, oosResult.totalSignals, STARTING_EQUITY);

  // ── 6. Combine all splits for the top-level result ────────────────────────
  const allTrades = [...devResult.trades, ...valResult.trades, ...oosResult.trades];
  const allTotalSignals = devResult.totalSignals + valResult.totalSignals + oosResult.totalSignals;
  const combinedStats = calcStats(allTrades, allTotalSignals, STARTING_EQUITY);
  const combinedEquityCurve = buildEquityCurve(allTrades, STARTING_EQUITY);

  return {
    id: crypto.randomUUID(),
    config,
    ...combinedStats,
    trades: allTrades,
    equityCurve: combinedEquityCurve,
    developmentStats,
    validationStats,
    oosStats,
    runAt: Date.now(),
  };
}
