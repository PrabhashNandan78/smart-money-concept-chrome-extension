// ─────────────────────────────────────────────────────────────────────────────
// SMC Strategy – Fair Value Gap (FVG) Detection
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle, FVG } from '../../types';

/**
 * Detect Fair Value Gaps across a sequence of closed candles.
 *
 * Bullish FVG: candle[i].low > candle[i-2].high
 * Bearish FVG: candle[i].high < candle[i-2].low
 *
 * All 3 candles must be closed to avoid look-ahead bias.
 * Gap size must meet or exceed minSizeMultiplier * ATR.
 */
export function detectFVGs(
  candles: Candle[],
  atrValues: number[],
  minSizeMultiplier: number = 0.3
): FVG[] {
  const fvgs: FVG[] = [];

  if (candles.length < 3) {
    return fvgs;
  }

  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];
    const atr = atrValues[i] || 0;
    const minThreshold = atr * minSizeMultiplier;

    // Bullish FVG: candle 3 low > candle 1 high
    if (c3.low > c1.high) {
      const size = c3.low - c1.high;
      if (size >= minThreshold) {
        fvgs.push({
          id: `fvg_bull_${c3.timestamp}_${i}`,
          type: 'BULLISH',
          bottom: c1.high,
          top: c3.low,
          midpoint: (c1.high + c3.low) / 2,
          size,
          createdAt: c3.timestamp,
          candle1Index: i - 2,
          candle3Index: i,
          mitigated: false,
          mitigatedAt: null,
          invalidated: false,
        });
      }
    }

    // Bearish FVG: candle 3 high < candle 1 low
    if (c3.high < c1.low) {
      const size = c1.low - c3.high;
      if (size >= minThreshold) {
        fvgs.push({
          id: `fvg_bear_${c3.timestamp}_${i}`,
          type: 'BEARISH',
          bottom: c3.high,
          top: c1.low,
          midpoint: (c1.low + c3.high) / 2,
          size,
          createdAt: c3.timestamp,
          candle1Index: i - 2,
          candle3Index: i,
          mitigated: false,
          mitigatedAt: null,
          invalidated: false,
        });
      }
    }
  }

  return fvgs;
}

/**
 * Update mitigation and invalidation status of detected FVGs.
 * Bullish FVG mitigated: price low touches FVG top.
 * Bullish FVG invalidated: price closes below FVG bottom.
 */
export function updateFVGMitigation(fvgs: FVG[], candles: Candle[]): FVG[] {
  return fvgs.map((fvg) => {
    const updated = { ...fvg };
    const subsequentCandles = candles.filter((c) => c.timestamp > fvg.createdAt);

    for (const c of subsequentCandles) {
      if (updated.type === 'BULLISH') {
        // Retest / mitigation
        if (c.low <= updated.top && !updated.mitigated) {
          updated.mitigated = true;
          updated.mitigatedAt = c.timestamp;
        }
        // Invalidation if candle closes below bottom
        if (c.close < updated.bottom) {
          updated.invalidated = true;
        }
      } else {
        // Bearish
        if (c.high >= updated.bottom && !updated.mitigated) {
          updated.mitigated = true;
          updated.mitigatedAt = c.timestamp;
        }
        if (c.close > updated.top) {
          updated.invalidated = true;
        }
      }
    }

    return updated;
  });
}

/**
 * Find active FVGs that the current candle is retesting (within the entry zone).
 */
export function findRetestingFVGs(fvgs: FVG[], currentCandle: Candle): FVG[] {
  return fvgs.filter((fvg) => {
    if (fvg.invalidated) return false;
    if (fvg.type === 'BULLISH') {
      // In bullish FVG, retest means price enters between bottom and midpoint/top
      return currentCandle.low <= fvg.top && currentCandle.close >= fvg.bottom;
    } else {
      return currentCandle.high >= fvg.bottom && currentCandle.close <= fvg.top;
    }
  });
}

