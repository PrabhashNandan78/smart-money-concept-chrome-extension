// ─────────────────────────────────────────────────────────────────────────────
// Tests: Authentic Multi-Timeframe SMC Backtesting Engine
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { runBacktest } from '../src/analytics/backtester';
import type { Candle, AppSettings } from '../src/types';

describe('SMC Backtesting Engine', () => {
  const baseSettings: AppSettings = {
    market: 'INDIA',
    defaultExchange: 'NSE',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    tradingSession: { open: '09:15', close: '15:30' },
    strategyVersion: '1.0.0',
    pivotLength: 3,
    atrLength: 14,
    liquidityTolerance: 0.001,
    fvgMinSize: 0.001,
    displacementThreshold: 1.2,
    htfBiasRequired: false,
    ltfConfirmationRequired: true,
    risk: {
      accountEquity: 500000,
      riskPerTrade: 0.25,
      maxDailyLoss: 1.0,
      maxWeeklyLoss: 2.5,
      drawdownPause: 5.0,
      maxConcurrentTrades: 3,
      maxAggregateRisk: 0.75,
      tradesPerSymbolPerSession: 1,
      minRR: 3.0,
      currency: 'INR',
    },
  };

  it('runs backtest on generated candle series without errors', () => {
    // Generate synthetic 5M series
    const candles: Candle[] = [];
    let price = 500;
    const startTime = new Date('2026-01-01T09:15:00Z').getTime();

    for (let i = 0; i < 150; i++) {
      const open = price;
      // create a dip and recovery
      const delta = Math.sin(i / 10) * 3 + (i > 80 ? 0.5 : -0.2);
      const close = open + delta;
      const high = Math.max(open, close) + 1.0;
      const low = Math.min(open, close) - 1.0;
      price = close;

      candles.push({
        timestamp: startTime + i * 5 * 60 * 1000,
        open,
        high,
        low,
        close,
        volume: 10000,
      });
    }

    const result = runBacktest({
      htfCandles: [],
      ltfCandles: candles,
      settings: baseSettings,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.developmentStats).toBeDefined();
    expect(result.validationStats).toBeDefined();
    expect(result.oosStats).toBeDefined();
    expect(result.equityCurve.length).toBeGreaterThanOrEqual(1);
  });

  it('strictly enforces minimum 3.0:1 net R:R on any simulated trade', () => {
    const candles: Candle[] = [];
    let price = 1000;
    const startTime = new Date('2026-01-01T09:15:00Z').getTime();

    // Create a textbook bullish sweep and FVG setup
    for (let i = 0; i < 60; i++) {
      let open = price;
      let close = open + 0.1;
      let high = open + 0.5;
      let low = open - 0.5;

      if (i === 20) {
        // Swing Low at 990
        low = 990;
        close = 991;
      } else if (i === 25) {
        // Sweep below 990 to 988 and close above 992
        low = 988;
        close = 993;
        high = 994;
      } else if (i === 26) {
        // Strong bullish displacement with FVG
        open = 993;
        close = 1005;
        high = 1006;
        low = 992;
      } else if (i === 27) {
        open = 1005;
        close = 1010;
        high = 1012;
        low = 1004;
      } else if (i === 28) {
        // Retest into FVG
        open = 1010;
        close = 1004;
        high = 1011;
        low = 998;
      }

      price = close;
      candles.push({
        timestamp: startTime + i * 5 * 60 * 1000,
        open,
        high,
        low,
        close,
        volume: 50000,
      });
    }

    const result = runBacktest({
      htfCandles: [],
      ltfCandles: candles,
      settings: baseSettings,
    });

    for (const trade of result.trades) {
      const risk = trade.entryPrice - trade.signal.entryZone!.bottom;
      const reward = trade.signal.entryZone!.top - trade.entryPrice;
      if (risk > 0) {
        expect(reward / risk).toBeGreaterThanOrEqual(2.99);
      }
    }
  });
});
