// ─────────────────────────────────────────────────────────────────────────────
// SMC Strategy – Market Structure Detection
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle, Direction, MarketStructure, SwingPoint } from '../../types';

/**
 * Detect swing highs and swing lows using confirmed pivots.
 * Default: 3 bars to the left, 3 bars to the right.
 * A pivot at index `i` is confirmed only when all `rightBars` have closed
 * (i.e., `i + rightBars < candles.length`).
 */
export function detectSwingPoints(
  candles: Candle[],
  leftBars: number = 3,
  rightBars: number = 3
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  if (candles.length < 3) {
    return { highs, lows };
  }

  const minRequiredLeft = Math.min(2, leftBars);

  for (let i = minRequiredLeft; i < candles.length; i++) {
    const current = candles[i];
    const isConfirmed = i + rightBars < candles.length;
    const checkLeft = Math.min(i, leftBars);

    // Check swing high candidate
    let isSwingHigh = true;
    for (let j = 1; j <= checkLeft; j++) {
      if (candles[i - j].high >= current.high) {
        isSwingHigh = false;
        break;
      }
    }

    if (isSwingHigh) {
      const rightLimit = Math.min(candles.length - 1, i + rightBars);
      for (let j = i + 1; j <= rightLimit; j++) {
        if (candles[j].high > current.high) {
          isSwingHigh = false;
          break;
        }
      }
    }

    if (isSwingHigh) {
      highs.push({
        index: i,
        timestamp: current.timestamp,
        price: current.high,
        type: 'HIGH',
        confirmed: isConfirmed,
      });
    }

    // Check swing low candidate
    let isSwingLow = true;
    for (let j = 1; j <= checkLeft; j++) {
      if (candles[i - j].low <= current.low) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingLow) {
      const rightLimit = Math.min(candles.length - 1, i + rightBars);
      for (let j = i + 1; j <= rightLimit; j++) {
        if (candles[j].low < current.low) {
          isSwingLow = false;
          break;
        }
      }
    }

    if (isSwingLow) {
      lows.push({
        index: i,
        timestamp: current.timestamp,
        price: current.low,
        type: 'LOW',
        confirmed: isConfirmed,
      });
    }
  }

  return { highs, lows };
}

/**
 * Classify market structure based on sequence of confirmed swing highs and lows.
 * HH + HL = Bullish, LH + LL = Bearish.
 */
export function classifyMarketStructure(
  highs: SwingPoint[],
  lows: SwingPoint[]
): {
  trend: Direction;
  hhCount: number;
  hlCount: number;
  lhCount: number;
  llCount: number;
} {
  const confirmedHighs = highs.filter((h) => h.confirmed);
  const confirmedLows = lows.filter((l) => l.confirmed);

  let hhCount = 0;
  let hlCount = 0;
  let lhCount = 0;
  let llCount = 0;

  for (let i = 1; i < confirmedHighs.length; i++) {
    if (confirmedHighs[i].price > confirmedHighs[i - 1].price) {
      hhCount++;
    } else if (confirmedHighs[i].price < confirmedHighs[i - 1].price) {
      lhCount++;
    }
  }

  for (let i = 1; i < confirmedLows.length; i++) {
    if (confirmedLows[i].price > confirmedLows[i - 1].price) {
      hlCount++;
    } else if (confirmedLows[i].price < confirmedLows[i - 1].price) {
      llCount++;
    }
  }

  let trend: Direction = 'NEUTRAL';
  if (hhCount >= lhCount && hlCount >= llCount && (hhCount > 0 || hlCount > 0)) {
    trend = 'BULLISH';
  } else if (lhCount >= hhCount && llCount >= hlCount && (lhCount > 0 || llCount > 0)) {
    trend = 'BEARISH';
  }

  return { trend, hhCount, hlCount, lhCount, llCount };
}

/**
 * Run full market structure analysis for a candle series.
 */
export function analyzeMarketStructure(
  candles: Candle[],
  pivotLength: number = 3
): MarketStructure {
  const { highs, lows } = detectSwingPoints(candles, pivotLength, pivotLength);
  const { trend } = classifyMarketStructure(highs, lows);

  return {
    swingHighs: highs,
    swingLows: lows,
    trend,
    lastBOS: null,
    lastCHoCH: null,
  };
}
