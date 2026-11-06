// ─────────────────────────────────────────────────────────────────────────────
// SMC Risk Engine – Stop Loss & Take Profit Utilities
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle, LiquiditySweep } from '../types';

/**
 * Calculate structural stop loss below liquidity sweep low with small buffer.
 */
export function calculateStructuralStopLoss(
  sweep: LiquiditySweep,
  bufferAtr: number = 0.1,
  atr: number = 1.0
): number {
  const buffer = bufferAtr * atr;
  return sweep.sweepLow - buffer;
}

/**
 * Find nearest opposing liquidity high to verify it does not prevent 3R target.
 */
export function findOpposingTarget(
  candles: Candle[],
  entry: number,
  minTarget: number
): { viable: boolean; opposingLevel: number | null } {
  // Check if there is a major swing high between entry and minTarget
  for (const c of candles) {
    if (c.high > entry && c.high < minTarget) {
      // Possible opposing liquidity barrier
      return { viable: true, opposingLevel: c.high };
    }
  }
  return { viable: true, opposingLevel: null };
}

