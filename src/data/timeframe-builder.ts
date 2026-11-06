// ─────────────────────────────────────────────────────────────────────────────
// SMC Data – Higher Timeframe Candle Builder
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle, Market, Timeframe } from '../types';

/**
 * Aggregate lower timeframe candles (e.g. 5m) into higher timeframe candles (e.g. 1h)
 * respecting session boundaries.
 */
export function buildHigherTimeframe(
  ltfCandles: Candle[],
  targetTF: Timeframe,
  _sourceTF: Timeframe = '5m',
  _market: Market = 'INDIA'
): Candle[] {
  if (ltfCandles.length === 0 || targetTF === '5m' || targetTF === '1m') {
    return ltfCandles;
  }

  const targetDurationMs = targetTF === '1h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const groups: Map<number, Candle[]> = new Map();

  for (const c of ltfCandles) {
    const bucket = Math.floor(c.timestamp / targetDurationMs) * targetDurationMs;
    const bucketCandles = groups.get(bucket) || [];
    bucketCandles.push(c);
    groups.set(bucket, bucketCandles);
  }

  const htfCandles: Candle[] = [];
  const sortedBuckets = Array.from(groups.keys()).sort((a, b) => a - b);

  for (const bucket of sortedBuckets) {
    const list = groups.get(bucket)!;
    list.sort((a, b) => a.timestamp - b.timestamp);

    const open = list[0].open;
    const close = list[list.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const item of list) {
      if (item.high > high) high = item.high;
      if (item.low < low) low = item.low;
      volume += item.volume;
    }

    htfCandles.push({
      timestamp: bucket,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return htfCandles;
}

