// ─────────────────────────────────────────────────────────────────────────────
// SMC Analytics – Drawdown Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface DrawdownResult {
  maxDrawdown: number;
  maxDrawdownPercent: number;
  curve: number[];
}

/**
 * Calculate drawdown curve and maximum drawdown from equity points.
 */
export function calculateDrawdown(equityCurve: { equity: number }[]): DrawdownResult {
  if (equityCurve.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPercent: 0, curve: [] };
  }

  let peak = equityCurve[0].equity;
  let maxDd = 0;
  let maxDdPercent = 0;
  const curve: number[] = [];

  for (const pt of equityCurve) {
    if (pt.equity > peak) {
      peak = pt.equity;
    }
    const dd = peak - pt.equity;
    const ddPercent = peak > 0 ? (dd / peak) * 100 : 0;
    curve.push(ddPercent);

    if (dd > maxDd) maxDd = dd;
    if (ddPercent > maxDdPercent) maxDdPercent = ddPercent;
  }

  return {
    maxDrawdown: maxDd,
    maxDrawdownPercent: maxDdPercent,
    curve,
  };
}

