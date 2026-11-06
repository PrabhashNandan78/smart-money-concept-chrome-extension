// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – Price Monitor
// Drives paper positions either by candle replay or manual price input.
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle } from '@/types';
import type { PaperExecutor, PaperPosition } from './paper-executor';

export type PriceMonitorMode = 'CANDLE_REPLAY' | 'MANUAL_UPDATE' | 'UNAVAILABLE';

export class PriceMonitor {
  mode: PriceMonitorMode;
  currentPrice: number | null;
  lastUpdated: number | null;

  private replayInterval: ReturnType<typeof setInterval> | null;
  private replayIndex: number;
  private replayCandles: Candle[];
  private replaySpeed: number; // ms between candles

  constructor() {
    this.mode = 'UNAVAILABLE';
    this.currentPrice = null;
    this.lastUpdated = null;
    this.replayInterval = null;
    this.replayIndex = 0;
    this.replayCandles = [];
    this.replaySpeed = 500;
  }

  // ── Candle Replay ─────────────────────────────────────────────────────────
  /**
   * Start replaying a historical candle array through the executor.
   * @param candles    Ordered array of candles to replay (oldest → newest).
   * @param executor   The PaperExecutor whose open positions will be updated.
   * @param onUpdate   Callback fired after each candle with current open positions.
   * @param speedMs    Milliseconds between candles (default 500 ms).
   */
  startReplay(
    candles: Candle[],
    executor: PaperExecutor,
    onUpdate: (pos: PaperPosition[]) => void,
    speedMs: number = 500,
  ): void {
    // Ensure any prior replay is stopped cleanly
    this.stopReplay();

    this.replayCandles = candles;
    this.replayIndex = 0;
    this.replaySpeed = speedMs;
    this.mode = 'CANDLE_REPLAY';

    this.replayInterval = setInterval(() => {
      if (this.replayIndex >= this.replayCandles.length) {
        // Replay complete
        this.stopReplay();
        return;
      }

      const candle = this.replayCandles[this.replayIndex];
      this.currentPrice = candle.close;
      this.lastUpdated = Date.now();
      this.replayIndex++;

      // Feed this candle to every open position in the executor
      const openPositions = executor.getOpenPositions();
      for (const pos of openPositions) {
        try {
          executor.updateWithCandle(pos.tradeId, candle);
        } catch {
          // Position may have been closed by a previous candle in this batch
        }
      }

      onUpdate(executor.getOpenPositions());
    }, this.replaySpeed);
  }

  // ── Stop Replay ───────────────────────────────────────────────────────────

  stopReplay(): void {
    if (this.replayInterval !== null) {
      clearInterval(this.replayInterval);
      this.replayInterval = null;
    }
    // Only reset mode if we were actually replaying
    if (this.mode === 'CANDLE_REPLAY') {
      this.mode = 'UNAVAILABLE';
    }
  }

  // ── Manual Price Update ───────────────────────────────────────────────────
  /**
   * Push a single live price to the monitor.  Does NOT feed candles to the
   * executor – call executor.updateManualPrice() separately if needed.
   */
  setManualPrice(price: number): void {
    this.currentPrice = price;
    this.lastUpdated = Date.now();
    if (this.mode !== 'MANUAL_UPDATE') {
      this.mode = 'MANUAL_UPDATE';
    }
  }

  // ── Mode ──────────────────────────────────────────────────────────────────

  setMode(mode: PriceMonitorMode): void {
    if (mode !== 'CANDLE_REPLAY') {
      // If switching away from replay, stop the interval
      this.stopReplay();
    }
    this.mode = mode;
  }

  // ── Replay progress ───────────────────────────────────────────────────────

  getReplayProgress(): { current: number; total: number; percent: number } {
    const total = this.replayCandles.length;
    const current = this.replayIndex;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    return { current, total, percent };
  }

  isReplaying(): boolean {
    return this.replayInterval !== null;
  }
}
