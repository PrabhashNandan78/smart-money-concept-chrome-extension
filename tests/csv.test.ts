/**
 * CSV Import Tests
 */
import { describe, it, expect } from 'vitest';
import { parseCSVFile, validateCandle, detectMissingCandles } from '../src/data/csv-importer';

describe('OHLCV Candle Validation', () => {
  it('accepts a valid candle', () => {
    const result = validateCandle({ timestamp: 1000, open: 100, high: 105, low: 98, close: 103, volume: 1000 });
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('rejects when high < low', () => {
    const result = validateCandle({ timestamp: 1000, open: 100, high: 95, low: 98, close: 103, volume: 1000 });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects when high < close', () => {
    const result = validateCandle({ timestamp: 1000, open: 100, high: 100, low: 98, close: 105, volume: 1000 });
    expect(result.valid).toBe(false);
  });

  it('rejects when low > open', () => {
    const result = validateCandle({ timestamp: 1000, open: 100, high: 110, low: 102, close: 105, volume: 1000 });
    // low > open is invalid
    expect(result.valid).toBe(false);
  });

  it('rejects negative volume', () => {
    const result = validateCandle({ timestamp: 1000, open: 100, high: 105, low: 98, close: 103, volume: -1 });
    expect(result.valid).toBe(false);
  });

  it('rejects NaN prices', () => {
    const result = validateCandle({ timestamp: 1000, open: NaN, high: 105, low: 98, close: 103, volume: 1000 });
    expect(result.valid).toBe(false);
  });
});

describe('Missing Candle Detection', () => {
  it('detects gap in 5-minute data during market hours', () => {
    // Create 5M candles with a gap at 09:25 (missing one candle)
    const candles = [
      { timestamp: new Date('2026-10-01T09:15:00+05:30').getTime(), open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { timestamp: new Date('2026-10-01T09:20:00+05:30').getTime(), open: 100, high: 102, low: 99, close: 101, volume: 1000 },
      // 09:25 is missing
      { timestamp: new Date('2026-10-01T09:30:00+05:30').getTime(), open: 101, high: 103, low: 100, close: 102, volume: 1000 },
    ];
    
    const missing = detectMissingCandles(candles, '5m', 'INDIA');
    expect(missing).toBeGreaterThan(0); // At least 1 gap detected
  });
});

