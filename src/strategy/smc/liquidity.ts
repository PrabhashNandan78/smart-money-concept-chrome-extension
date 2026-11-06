// ─────────────────────────────────────────────────────────────────────────────
// SMC Strategy – Liquidity Levels & Sweep Detection
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle, LiquiditySweep, SwingPoint } from '../../types';

export interface LiquidityLevel {
  id: string;
  type: 'EQUAL_HIGH' | 'EQUAL_LOW' | 'PREV_DAY_HIGH' | 'PREV_DAY_LOW' | 'SWING_HIGH' | 'SWING_LOW';
  price: number;
  timestamp: number;
  swept: boolean;
  sweptAt: number | null;
}

/**
 * Calculate Average True Range (ATR).
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  if (candles.length === 0) return [];
  const atr: number[] = new Array(candles.length).fill(0);

  const trs: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }

  // Initial simple moving average
  let sum = 0;
  for (let i = 0; i < Math.min(period, trs.length); i++) {
    sum += trs[i];
    atr[i] = sum / (i + 1);
  }

  // RMA smoothing
  for (let i = period; i < trs.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period;
  }

  return atr;
}

/**
 * Identify liquidity pools:
 * - Equal highs (EQH within ATR tolerance)
 * - Equal lows (EQL within ATR tolerance)
 * - Major swing highs & lows
 */
export function identifyLiquidityLevels(
  candles: Candle[],
  swingPoints: { highs: SwingPoint[]; lows: SwingPoint[] },
  atrTolerance: number = 0.1
): LiquidityLevel[] {
  const levels: LiquidityLevel[] = [];
  const atrs = calculateATR(candles);
  const avgAtr = atrs.length > 0 ? atrs[atrs.length - 1] : 1;
  const tolerance = Math.max(avgAtr * atrTolerance, 0.05);

  // Swing highs as liquidity
  for (const sh of swingPoints.highs.filter((h) => h.confirmed)) {
    levels.push({
      id: `liq_sh_${sh.timestamp}_${sh.price}`,
      type: 'SWING_HIGH',
      price: sh.price,
      timestamp: sh.timestamp,
      swept: false,
      sweptAt: null,
    });
  }

  // Swing lows as liquidity
  for (const sl of swingPoints.lows.filter((l) => l.confirmed)) {
    levels.push({
      id: `liq_sl_${sl.timestamp}_${sl.price}`,
      type: 'SWING_LOW',
      price: sl.price,
      timestamp: sl.timestamp,
      swept: false,
      sweptAt: null,
    });
  }

  // Equal highs (within tolerance)
  const confirmedHighs = swingPoints.highs.filter((h) => h.confirmed);
  for (let i = 0; i < confirmedHighs.length; i++) {
    for (let j = i + 1; j < confirmedHighs.length; j++) {
      if (Math.abs(confirmedHighs[i].price - confirmedHighs[j].price) <= tolerance) {
        levels.push({
          id: `liq_eqh_${confirmedHighs[i].timestamp}_${confirmedHighs[j].timestamp}`,
          type: 'EQUAL_HIGH',
          price: Math.max(confirmedHighs[i].price, confirmedHighs[j].price),
          timestamp: confirmedHighs[j].timestamp,
          swept: false,
          sweptAt: null,
        });
      }
    }
  }

  // Equal lows (within tolerance)
  const confirmedLows = swingPoints.lows.filter((l) => l.confirmed);
  for (let i = 0; i < confirmedLows.length; i++) {
    for (let j = i + 1; j < confirmedLows.length; j++) {
      if (Math.abs(confirmedLows[i].price - confirmedLows[j].price) <= tolerance) {
        levels.push({
          id: `liq_eql_${confirmedLows[i].timestamp}_${confirmedLows[j].timestamp}`,
          type: 'EQUAL_LOW',
          price: Math.min(confirmedLows[i].price, confirmedLows[j].price),
          timestamp: confirmedLows[j].timestamp,
          swept: false,
          sweptAt: null,
        });
      }
    }
  }

  return levels;
}

/**
 * Detect confirmed liquidity sweeps.
 *
 * Bullish sweep: Price pierces BELOW a liquidity low, and within confirmationWindow
 * closes BACK ABOVE the level.
 *
 * Bearish sweep: Price pierces ABOVE a liquidity high, and closes BACK BELOW it.
 */
export function detectLiquiditySweeps(
  candles: Candle[],
  levels: LiquidityLevel[],
  confirmationWindow: number = 3
): LiquiditySweep[] {
  const sweeps: LiquiditySweep[] = [];

  for (const level of levels) {
    const isLowLevel = level.type === 'SWING_LOW' || level.type === 'EQUAL_LOW' || level.type === 'PREV_DAY_LOW';
    const isHighLevel = level.type === 'SWING_HIGH' || level.type === 'EQUAL_HIGH' || level.type === 'PREV_DAY_HIGH';

    const candlesAfterLevel = candles.filter((c) => c.timestamp > level.timestamp);

    for (let i = 0; i < candlesAfterLevel.length; i++) {
      const candle = candlesAfterLevel[i];

      if (isLowLevel) {
        // Bullish sweep candidate: pierced below
        if (candle.low < level.price) {
          // Check if it closes back above the level within confirmationWindow
          let confirmed = false;
          let confirmCandle = candle;
          let lowestLow = candle.low;

          for (let j = i; j < Math.min(candlesAfterLevel.length, i + confirmationWindow); j++) {
            const checkCandle = candlesAfterLevel[j];
            lowestLow = Math.min(lowestLow, checkCandle.low);
            if (checkCandle.close > level.price) {
              confirmed = true;
              confirmCandle = checkCandle;
              break;
            }
          }

          if (confirmed) {
            level.swept = true;
            level.sweptAt = confirmCandle.timestamp;
            sweeps.push({
              id: `sweep_bull_${level.id}_${confirmCandle.timestamp}`,
              direction: 'BULLISH',
              sweptLevel: level.price,
              sweepLow: lowestLow,
              sweepHigh: confirmCandle.high,
              sweepTimestamp: candle.timestamp,
              confirmationTimestamp: confirmCandle.timestamp,
              confirmationClose: confirmCandle.close,
            });
            break;
          }
        }
      } else if (isHighLevel) {
        // Bearish sweep candidate: pierced above
        if (candle.high > level.price) {
          let confirmed = false;
          let confirmCandle = candle;
          let highestHigh = candle.high;

          for (let j = i; j < Math.min(candlesAfterLevel.length, i + confirmationWindow); j++) {
            const checkCandle = candlesAfterLevel[j];
            highestHigh = Math.max(highestHigh, checkCandle.high);
            if (checkCandle.close < level.price) {
              confirmed = true;
              confirmCandle = checkCandle;
              break;
            }
          }

          if (confirmed) {
            level.swept = true;
            level.sweptAt = confirmCandle.timestamp;
            sweeps.push({
              id: `sweep_bear_${level.id}_${confirmCandle.timestamp}`,
              direction: 'BEARISH',
              sweptLevel: level.price,
              sweepLow: confirmCandle.low,
              sweepHigh: highestHigh,
              sweepTimestamp: candle.timestamp,
              confirmationTimestamp: confirmCandle.timestamp,
              confirmationClose: confirmCandle.close,
            });
            break;
          }
        }
      }
    }
  }

  return sweeps;
}

