// ─────────────────────────────────────────────────────────────────────────────
// SMC Strategy – BOS (Break of Structure) & CHoCH (Change of Character)
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle, Direction, MarketStructure } from '../../types';

export interface BOSEvent {
  type: 'BOS' | 'CHoCH';
  direction: 'BULLISH' | 'BEARISH';
  level: number;
  timestamp: number;
  confirmingCandleIndex: number;
  confirmingCandleTimestamp: number;
}

/**
 * Detect BOS and CHoCH events by evaluating candle closes against confirmed
 * swing highs and swing lows.
 *
 * Bullish BOS: Candle close > most recent confirmed swing high
 * Bearish BOS: Candle close < most recent confirmed swing low
 *
 * CHoCH is triggered when the break reverses the prior structural trend.
 */
export function detectBOSandCHoCH(
  candles: Candle[],
  structure: MarketStructure
): BOSEvent[] {
  const events: BOSEvent[] = [];
  const confirmedHighs = structure.swingHighs.filter((h) => h.confirmed);
  const confirmedLows = structure.swingLows.filter((l) => l.confirmed);

  if (candles.length === 0 || (confirmedHighs.length === 0 && confirmedLows.length === 0)) {
    return events;
  }

  let previousTrend: Direction = structure.trend;
  const brokenHighIndices = new Set<number>();
  const brokenLowIndices = new Set<number>();

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // Find confirmed highs that formed before this candle and haven't been broken yet
    const activeHighs = confirmedHighs.filter(
      (h) => h.index < i && !brokenHighIndices.has(h.index)
    );

    if (activeHighs.length > 0) {
      const mostRecentHigh = activeHighs[activeHighs.length - 1];
      if (candle.close > mostRecentHigh.price) {
        brokenHighIndices.add(mostRecentHigh.index);
        const isChoch = previousTrend === 'BEARISH';

        events.push({
          type: isChoch ? 'CHoCH' : 'BOS',
          direction: 'BULLISH',
          level: mostRecentHigh.price,
          timestamp: candle.timestamp,
          confirmingCandleIndex: i,
          confirmingCandleTimestamp: candle.timestamp,
        });

        previousTrend = 'BULLISH';
      }
    }

    // Find confirmed lows that formed before this candle and haven't been broken yet
    const activeLows = confirmedLows.filter(
      (l) => l.index < i && !brokenLowIndices.has(l.index)
    );

    if (activeLows.length > 0) {
      const mostRecentLow = activeLows[activeLows.length - 1];
      if (candle.close < mostRecentLow.price) {
        brokenLowIndices.add(mostRecentLow.index);
        const isChoch = previousTrend === 'BULLISH';

        events.push({
          type: isChoch ? 'CHoCH' : 'BOS',
          direction: 'BEARISH',
          level: mostRecentLow.price,
          timestamp: candle.timestamp,
          confirmingCandleIndex: i,
          confirmingCandleTimestamp: candle.timestamp,
        });

        previousTrend = 'BEARISH';
      }
    }
  }

  return events;
}

