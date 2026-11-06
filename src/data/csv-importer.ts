// ─────────────────────────────────────────────────────────────────────────────
// SMC Data – CSV Importer & Parser
// ─────────────────────────────────────────────────────────────────────────────

import Papa from 'papaparse';
import type { Candle, Exchange, Market, Timeframe } from '../types';
import { validateCandle } from './candle-validator';
import { buildHigherTimeframe } from './timeframe-builder';

export { validateCandle, buildHigherTimeframe };

export interface CSVImportOptions {
  symbol: string;
  market: Market;
  exchange: Exchange;
  timeframe: Timeframe;
  timezone: string;
  columnMapping: {
    timestamp: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  };
}

export interface CSVImportResult {
  success: boolean;
  candles: Candle[];
  totalRows: number;
  validRows: number;
  duplicates: number;
  invalidRows: number;
  missingCount: number;
  dateRange: { start: number; end: number } | null;
  errors: string[];
  warnings: string[];
  dataQuality: 'GOOD' | 'WARNING' | 'POOR';
}

/**
 * Detect missing candles between consecutive candles based on timeframe interval.
 */
export function detectMissingCandles(
  candles: Candle[],
  timeframe: Timeframe,
  _market: Market = 'INDIA'
): number {
  if (candles.length < 2) return 0;

  const intervalMap: Record<Timeframe, number> = {
    '1m': 60 * 1000,
    '3m': 3 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '45m': 45 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
  };

  const expectedInterval = intervalMap[timeframe] || 5 * 60 * 1000;
  let missing = 0;

  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].timestamp - candles[i - 1].timestamp;
    // Allow up to 1.5x interval before counting gaps; skip weekend/overnight (> 8 hours)
    if (diff > expectedInterval * 1.5 && diff < 8 * 60 * 60 * 1000) {
      const estimatedGaps = Math.floor(diff / expectedInterval) - 1;
      missing += Math.max(0, estimatedGaps);
    }
  }

  return missing;
}

/**
 * Parse a timestamp string or number to epoch ms.
 */
function parseTimestamp(raw: string | number, _timezone: string): number {
  if (typeof raw === 'number') {
    return raw > 1e11 ? raw : raw * 1000;
  }

  const str = String(raw).trim();
  const num = Number(str);
  if (!isNaN(num) && num > 1e8) {
    return num > 1e11 ? num : num * 1000;
  }

  // Handle "YYYY-MM-DD HH:mm:ss"
  const parsed = new Date(str).getTime();
  if (!isNaN(parsed) && parsed > 0) {
    return parsed;
  }

  // Fallback for custom formats
  const clean = str.replace('T', ' ').replace('Z', '');
  const fallback = new Date(clean).getTime();
  return isNaN(fallback) ? 0 : fallback;
}

/**
 * Parse a CSV file or text into validated OHLCV Candle objects.
 */
export function parseCSVFile(
  fileOrText: File | string,
  options: CSVImportOptions
): Promise<CSVImportResult> {
  return new Promise((resolve) => {
    const { columnMapping, timezone, timeframe, market } = options;
    const errors: string[] = [];
    const warnings: string[] = [];

    const handleData = (rows: Record<string, unknown>[]) => {
      const candles: Candle[] = [];
      const seenTimestamps = new Set<number>();
      let duplicates = 0;
      let invalidRows = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rawTs = row[columnMapping.timestamp] as string | number;
        const ts = parseTimestamp(rawTs, timezone);

        if (!ts) {
          invalidRows++;
          continue;
        }

        if (seenTimestamps.has(ts)) {
          duplicates++;
          continue;
        }

        const open = parseFloat(String(row[columnMapping.open]));
        const high = parseFloat(String(row[columnMapping.high]));
        const low = parseFloat(String(row[columnMapping.low]));
        const close = parseFloat(String(row[columnMapping.close]));
        const volume = parseFloat(String(row[columnMapping.volume] || '0'));

        const validation = validateCandle({ timestamp: ts, open, high, low, close, volume });
        if (!validation.valid) {
          invalidRows++;
          if (invalidRows <= 3) {
            errors.push(`Row ${i + 1}: ${validation.errors.join(', ')}`);
          }
          continue;
        }

        seenTimestamps.add(ts);
        candles.push({ timestamp: ts, open, high, low, close, volume });
      }

      // Sort chronologically
      candles.sort((a, b) => a.timestamp - b.timestamp);

      const missingCount = detectMissingCandles(candles, timeframe, market);
      const totalRows = rows.length;
      const validRows = candles.length;

      let dataQuality: 'GOOD' | 'WARNING' | 'POOR' = 'GOOD';
      if (invalidRows > totalRows * 0.1 || missingCount > validRows * 0.2) {
        dataQuality = 'POOR';
      } else if (duplicates > 0 || missingCount > 0 || invalidRows > 0) {
        dataQuality = 'WARNING';
      }

      const dateRange =
        candles.length > 0
          ? { start: candles[0].timestamp, end: candles[candles.length - 1].timestamp }
          : null;

      resolve({
        success: validRows > 0,
        candles,
        totalRows,
        validRows,
        duplicates,
        invalidRows,
        missingCount,
        dateRange,
        errors,
        warnings,
        dataQuality,
      });
    };

    if (typeof fileOrText === 'string') {
      const parsed = Papa.parse<Record<string, unknown>>(fileOrText, {
        header: true,
        skipEmptyLines: true,
      });
      handleData(parsed.data);
    } else {
      Papa.parse<Record<string, unknown>>(fileOrText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => handleData(results.data),
        error: (err) => {
          resolve({
            success: false,
            candles: [],
            totalRows: 0,
            validRows: 0,
            duplicates: 0,
            invalidRows: 0,
            missingCount: 0,
            dateRange: null,
            errors: [err.message],
            warnings: [],
            dataQuality: 'POOR',
          });
        },
      });
    }
  });
}

