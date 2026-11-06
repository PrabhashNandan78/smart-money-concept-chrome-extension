// ─────────────────────────────────────────────────────────────────────────────
// SMC Analytics – Text Report Generator
// ─────────────────────────────────────────────────────────────────────────────

import type { PerformanceStats, Trade } from '../types';
import { calculatePerformanceStats } from './performance';

/**
 * Generate formatted text report of performance.
 */
export function generateTextReport(
  trades: Trade[],
  title: string = 'SMC Trading Performance Report'
): string {
  const stats: PerformanceStats = calculatePerformanceStats(trades);
  const now = new Date().toISOString();

  return `===============================================================
       SMC TRADING ASSISTANT – PERFORMANCE REPORT
===============================================================
Generated At: ${now}
Report Scope: ${title}

SUMMARY METRICS
---------------------------------------------------------------
Total Trades Recorded:    ${stats.totalTrades}
Winning Trades:           ${stats.winningTrades}
Losing Trades:            ${stats.losingTrades}
Win Rate:                 ${stats.winRate.toFixed(2)}%
Total Net P&L:            ${stats.totalNetPnl >= 0 ? '+' : ''}${stats.totalNetPnl.toFixed(2)}
Profit Factor:            ${stats.profitFactor.toFixed(2)}
Average R-Multiple:       ${stats.avgR.toFixed(2)}R
Maximum Drawdown:         ${stats.maxDrawdown.toFixed(2)}%
Average Winner:           ${stats.avgWinner.toFixed(2)}
Average Loser:            ${stats.avgLoser.toFixed(2)}
Estimated Fees/Costs:     ${stats.totalFees.toFixed(2)}
Rule Compliance Rate:     ${stats.ruleComplianceRate.toFixed(1)}%

TRADE BREAKDOWN
---------------------------------------------------------------
${trades.length === 0 ? 'No trades recorded in this period.' : ''}
${trades
  .map(
    (t, idx) =>
      `#${idx + 1} | ${new Date(t.createdAt).toLocaleDateString()} | ${t.symbol} | ${t.direction} | Entry: ${t.actualEntry ?? t.plannedEntry} | Exit: ${t.actualExit ?? 'OPEN'} | PnL: ${t.netPnl !== null ? (t.netPnl >= 0 ? '+' : '') + t.netPnl.toFixed(2) : 'N/A'} | R: ${t.rMultiple !== null ? t.rMultiple.toFixed(2) + 'R' : 'N/A'}`
  )
  .join('\n')}

===============================================================
Notice: Generated locally by SMC Trading Terminal.
No broker or market APIs were queried.
===============================================================`;
}

