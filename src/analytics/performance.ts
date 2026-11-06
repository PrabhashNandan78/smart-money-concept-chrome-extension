// ─────────────────────────────────────────────────────────────────────────────
// SMC Analytics – Performance Analytics Engine
// ─────────────────────────────────────────────────────────────────────────────

import type { PerformanceStats, Trade } from '../types';
import { calculateDrawdown } from './drawdown';

export { calculateDrawdown };

export interface MonthlyReport {
  year: number;
  month: number;
  trades: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
  profitFactor: number;
  avgR: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
}

/**
 * Calculate comprehensive performance statistics strictly from recorded trades.
 * Never inserts mock or synthetic numbers.
 */
export function calculatePerformanceStats(trades: Trade[]): PerformanceStats {
  const closedTrades = trades.filter((t) => t.netPnl !== null && t.netPnl !== undefined);

  if (closedTrades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalNetPnl: 0,
      profitFactor: 0,
      avgR: 0,
      maxDrawdown: 0,
      avgWinner: 0,
      avgLoser: 0,
      totalFees: 0,
      ruleComplianceRate: 100,
    };
  }

  const winners = closedTrades.filter((t) => (t.netPnl ?? 0) > 0);
  const losers = closedTrades.filter((t) => (t.netPnl ?? 0) < 0);

  const totalNetPnl = closedTrades.reduce((acc, t) => acc + (t.netPnl ?? 0), 0);
  const grossProfit = winners.reduce((acc, t) => acc + (t.netPnl ?? 0), 0);
  const grossLoss = Math.abs(losers.reduce((acc, t) => acc + (t.netPnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const winRate = (winners.length / closedTrades.length) * 100;
  const avgWinner = winners.length > 0 ? grossProfit / winners.length : 0;
  const avgLoser = losers.length > 0 ? grossLoss / losers.length : 0;

  const validR = closedTrades.filter((t) => t.rMultiple !== null).map((t) => t.rMultiple!);
  const avgR = validR.length > 0 ? validR.reduce((a, b) => a + b, 0) / validR.length : 0;

  const totalFees = closedTrades.reduce(
    (acc, t) => acc + (t.actualCosts ?? t.estimatedCosts ?? 0),
    0
  );

  const compliant = closedTrades.filter((t) => t.ruleCompliant).length;
  const ruleComplianceRate = (compliant / closedTrades.length) * 100;

  // Drawdown
  const equityCurve = calculateEquityCurve(closedTrades, 100000);
  const dd = calculateDrawdown(equityCurve);

  return {
    totalTrades: closedTrades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate,
    totalNetPnl,
    profitFactor: isFinite(profitFactor) ? profitFactor : 999,
    avgR,
    maxDrawdown: dd.maxDrawdownPercent,
    avgWinner,
    avgLoser,
    totalFees,
    ruleComplianceRate,
  };
}

/**
 * Generate sequential equity curve from trades.
 */
export function calculateEquityCurve(
  trades: Trade[],
  startingEquity: number = 100000
): { timestamp: number; equity: number }[] {
  const closed = trades
    .filter((t) => t.netPnl !== null)
    .sort((a, b) => (a.exitAt || a.createdAt) - (b.exitAt || b.createdAt));

  const curve = [{ timestamp: closed.length > 0 ? closed[0].createdAt - 60000 : Date.now(), equity: startingEquity }];
  let running = startingEquity;

  for (const t of closed) {
    running += t.netPnl || 0;
    curve.push({
      timestamp: t.exitAt || t.createdAt,
      equity: running,
    });
  }

  return curve;
}

/**
 * Calculate Expectancy: (WinRate × AvgWin) - (LossRate × AvgLoss)
 */
export function calculateExpectancy(trades: Trade[]): number {
  const stats = calculatePerformanceStats(trades);
  if (stats.totalTrades === 0) return 0;
  const wr = stats.winRate / 100;
  const lr = 1 - wr;
  return wr * stats.avgWinner - lr * stats.avgLoser;
}

/**
 * Group performance by stock symbol.
 */
export function groupBySymbol(trades: Trade[]): Record<string, PerformanceStats> {
  const groups: Record<string, Trade[]> = {};
  for (const t of trades) {
    if (!groups[t.symbol]) groups[t.symbol] = [];
    groups[t.symbol].push(t);
  }

  const result: Record<string, PerformanceStats> = {};
  for (const [sym, list] of Object.entries(groups)) {
    result[sym] = calculatePerformanceStats(list);
  }
  return result;
}

/**
 * Group trades by hour of day.
 */
export function groupByTimeOfDay(
  trades: Trade[]
): Record<string, { count: number; avgPnl: number }> {
  const result: Record<string, { count: number; totalPnl: number; avgPnl: number }> = {};

  for (const t of trades) {
    const d = new Date(t.createdAt);
    const hour = `${String(d.getHours()).padStart(2, '0')}:00`;
    if (!result[hour]) {
      result[hour] = { count: 0, totalPnl: 0, avgPnl: 0 };
    }
    result[hour].count++;
    result[hour].totalPnl += t.netPnl || 0;
  }

  const formatted: Record<string, { count: number; avgPnl: number }> = {};
  for (const [hour, data] of Object.entries(result)) {
    formatted[hour] = {
      count: data.count,
      avgPnl: data.count > 0 ? data.totalPnl / data.count : 0,
    };
  }

  return formatted;
}

/**
 * Group performance by SMC setup conditions.
 */
export function groupBySMCSetup(trades: Trade[]): Record<string, PerformanceStats> {
  const fvgTrades = trades.filter((t) => t.fvgDetected);
  const sweepTrades = trades.filter((t) => t.liquiditySweepDetected);
  const obTrades = trades.filter((t) => t.orderBlockDetected);

  return {
    'FVG Retest': calculatePerformanceStats(fvgTrades),
    'Liquidity Sweep': calculatePerformanceStats(sweepTrades),
    'Order Block': calculatePerformanceStats(obTrades),
  };
}

/**
 * Generate a monthly performance report summary.
 */
export function generateMonthlyReport(
  trades: Trade[],
  year: number,
  month: number
): MonthlyReport {
  const monthlyTrades = trades.filter((t) => {
    const d = new Date(t.createdAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const stats = calculatePerformanceStats(monthlyTrades);

  let best: Trade | null = null;
  let worst: Trade | null = null;

  for (const t of monthlyTrades) {
    if (t.netPnl !== null) {
      if (!best || t.netPnl > (best.netPnl ?? -Infinity)) best = t;
      if (!worst || t.netPnl < (worst.netPnl ?? Infinity)) worst = t;
    }
  }

  return {
    year,
    month,
    trades: stats.totalTrades,
    winRate: stats.winRate,
    netPnl: stats.totalNetPnl,
    maxDrawdown: stats.maxDrawdown,
    profitFactor: stats.profitFactor,
    avgR: stats.avgR,
    bestTrade: best,
    worstTrade: worst,
  };
}

