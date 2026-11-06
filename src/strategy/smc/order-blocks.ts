// ─────────────────────────────────────────────────────────────────────────────
// SMC Strategy – Order Block Identification
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle, OrderBlock } from '../../types';
import type { BOSEvent } from './bos-choch';

/**
 * Identify Order Blocks (OB).
 *
 * Bullish Order Block: The last bearish candle prior to a displacement move
 * that created a bullish BOS / CHoCH.
 *
 * Bearish Order Block: The last bullish candle prior to a displacement move
 * that created a bearish BOS / CHoCH.
 */
export function identifyOrderBlocks(
  candles: Candle[],
  bosEvents: BOSEvent[],
  _displacementThreshold: number = 1.5
): OrderBlock[] {
  const obs: OrderBlock[] = [];

  for (const event of bosEvents) {
    const eventIndex = event.confirmingCandleIndex;
    if (eventIndex <= 1) continue;

    if (event.direction === 'BULLISH') {
      // Look backward from event to find the last bearish candle before displacement
      for (let j = eventIndex - 1; j >= Math.max(0, eventIndex - 10); j--) {
        const c = candles[j];
        if (c.close < c.open) {
          // Bearish candle found
          obs.push({
            id: `ob_bull_${c.timestamp}_${j}`,
            type: 'BULLISH',
            top: Math.max(c.open, c.close),
            bottom: c.low,
            midpoint: (c.high + c.low) / 2,
            createdAt: c.timestamp,
            candleIndex: j,
            valid: true,
            mitigated: false,
          });
          break;
        }
      }
    } else {
      // Look backward for last bullish candle before displacement
      for (let j = eventIndex - 1; j >= Math.max(0, eventIndex - 10); j--) {
        const c = candles[j];
        if (c.close > c.open) {
          obs.push({
            id: `ob_bear_${c.timestamp}_${j}`,
            type: 'BEARISH',
            top: c.high,
            bottom: Math.min(c.open, c.close),
            midpoint: (c.high + c.low) / 2,
            createdAt: c.timestamp,
            candleIndex: j,
            valid: true,
            mitigated: false,
          });
          break;
        }
      }
    }
  }

  return obs;
}

/**
 * Update validity and mitigation of order blocks.
 */
export function updateOrderBlockValidity(obs: OrderBlock[], candles: Candle[]): OrderBlock[] {
  return obs.map((ob) => {
    const updated = { ...ob };
    const subsequent = candles.filter((c) => c.timestamp > ob.createdAt);

    for (const c of subsequent) {
      if (updated.type === 'BULLISH') {
        if (c.low <= updated.top && !updated.mitigated) {
          updated.mitigated = true;
        }
        if (c.close < updated.bottom) {
          updated.valid = false;
        }
      } else {
        if (c.high >= updated.bottom && !updated.mitigated) {
          updated.mitigated = true;
        }
        if (c.close > updated.top) {
          updated.valid = false;
        }
      }
    }

    return updated;
  });
}

