// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – Paper Trading Execution Engine
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle, TradeSetup, TradeStatus, Market } from '@/types';

// ─── Position ────────────────────────────────────────────────────────────────

export interface PaperPosition {
  tradeId: string;
  symbol: string;
  market: Market;
  direction: 'LONG';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  status: TradeStatus;
  entryTime: number | null;
  exitTime: number | null;
  exitPrice: number | null;
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | null;
  unrealizedPnl: number;
  realizedPnl: number | null;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class PaperExecutor {
  private positions: Map<string, PaperPosition>;
  private closedPositions: PaperPosition[];
  private equityCurve: { timestamp: number; equity: number }[];
  private startingEquity: number;
  private currentEquity: number;

  constructor(startingEquity: number = 100_000) {
    this.startingEquity = startingEquity;
    this.currentEquity = startingEquity;
    this.positions = new Map();
    this.closedPositions = [];
    this.equityCurve = [{ timestamp: Date.now(), equity: startingEquity }];
  }

  // ── Open ───────────────────────────────────────────────────────────────────

  openPosition(setup: TradeSetup): PaperPosition {
    const position: PaperPosition = {
      tradeId: setup.id,
      symbol: setup.signal.symbol,
      market: setup.signal.market,
      direction: 'LONG',
      entry: setup.entry,
      stopLoss: setup.stopLoss,
      takeProfit: setup.takeProfit,
      quantity: setup.quantity,
      status: 'WAITING_ENTRY',
      entryTime: null,
      exitTime: null,
      exitPrice: null,
      exitReason: null,
      unrealizedPnl: 0,
      realizedPnl: null,
    };

    this.positions.set(setup.id, position);
    return { ...position };
  }

  // ── Candle Update ──────────────────────────────────────────────────────────
  /**
   * Feed a new candle into a position and advance its state machine.
   *
   * State transitions:
   *   WAITING_ENTRY  → ENTRY_SIMULATED (limit hit)   → OPEN (same candle)
   *   OPEN           → STOP_LOSS_HIT  (SL hit first – conservative rule)
   *   OPEN           → TAKE_PROFIT_HIT
   */
  updateWithCandle(tradeId: string, candle: Candle): PaperPosition {
    const pos = this.positions.get(tradeId);
    if (!pos) {
      throw new Error(`PaperExecutor: position not found for tradeId=${tradeId}`);
    }

    // ── Simulate limit-order entry ─────────────────────────────────────────
    if (pos.status === 'WAITING_ENTRY') {
      if (candle.low <= pos.entry) {
        // Step 1: mark as simulated
        pos.status = 'ENTRY_SIMULATED';
        pos.entryTime = candle.timestamp;

        // Step 2: immediately transition to OPEN within the same candle tick
        pos.status = 'OPEN';
        pos.unrealizedPnl = (candle.close - pos.entry) * pos.quantity;
      }
      // Entry not yet triggered – nothing else to do
      return { ...pos };
    }

    // ── Mark-to-market for OPEN positions ─────────────────────────────────
    if (pos.status === 'OPEN') {
      const slHit = candle.low <= pos.stopLoss;
      const tpHit = candle.high >= pos.takeProfit;

      if (slHit && tpHit) {
        // Conservative rule: assume SL hit first (worst case for the trader)
        this._closePosition(pos, pos.stopLoss, candle.timestamp, 'STOP_LOSS');
      } else if (slHit) {
        this._closePosition(pos, pos.stopLoss, candle.timestamp, 'STOP_LOSS');
      } else if (tpHit) {
        this._closePosition(pos, pos.takeProfit, candle.timestamp, 'TAKE_PROFIT');
      } else {
        // Still open – update unrealized P&L with candle close price
        pos.unrealizedPnl = (candle.close - pos.entry) * pos.quantity;
      }
    }

    return { ...pos };
  }

  // ── Manual Close ───────────────────────────────────────────────────────────

  closeManually(tradeId: string, exitPrice: number, _reason: string): PaperPosition {
    const pos = this.positions.get(tradeId);
    if (!pos) {
      throw new Error(`PaperExecutor: position not found for tradeId=${tradeId}`);
    }

    if (pos.status !== 'OPEN' && pos.status !== 'WAITING_ENTRY' && pos.status !== 'ENTRY_SIMULATED') {
      throw new Error(`PaperExecutor: cannot manually close position in status=${pos.status}`);
    }

    this._closePosition(pos, exitPrice, Date.now(), 'MANUAL');
    return { ...pos };
  }

  // ── Live price update (no candle) ─────────────────────────────────────────
  /**
   * Update unrealised P&L for all OPEN positions using a spot price.
   * Used by PriceMonitor in MANUAL_UPDATE mode.
   */
  updateManualPrice(price: number): void {
    this.positions.forEach((pos) => {
      if (pos.status === 'OPEN') {
        pos.unrealizedPnl = (price - pos.entry) * pos.quantity;
      }
    });
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  getOpenPositions(): PaperPosition[] {
    return Array.from(this.positions.values()).map((p) => ({ ...p }));
  }

  getClosedPositions(): PaperPosition[] {
    return this.closedPositions.map((p) => ({ ...p }));
  }

  getEquityCurve(): { timestamp: number; equity: number }[] {
    return [...this.equityCurve];
  }

  getCurrentEquity(): number {
    return this.currentEquity;
  }

  getStats(): { totalTrades: number; winRate: number; netPnl: number; openCount: number } {
    const closed = this.closedPositions;
    const winners = closed.filter(
      (p) => p.realizedPnl !== null && p.realizedPnl > 0,
    ).length;

    return {
      totalTrades: closed.length,
      winRate: closed.length > 0 ? winners / closed.length : 0,
      netPnl: this.currentEquity - this.startingEquity,
      openCount: this.positions.size,
    };
  }

  reset(): void {
    this.positions = new Map();
    this.closedPositions = [];
    this.currentEquity = this.startingEquity;
    this.equityCurve = [{ timestamp: Date.now(), equity: this.startingEquity }];
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _closePosition(
    pos: PaperPosition,
    exitPrice: number,
    exitTime: number,
    reason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL',
  ): void {
    const pnl = (exitPrice - pos.entry) * pos.quantity;

    pos.exitPrice = exitPrice;
    pos.exitTime = exitTime;
    pos.exitReason = reason;
    pos.realizedPnl = pnl;
    pos.unrealizedPnl = 0;

    switch (reason) {
      case 'STOP_LOSS':
        pos.status = 'STOP_LOSS_HIT';
        break;
      case 'TAKE_PROFIT':
        pos.status = 'TAKE_PROFIT_HIT';
        break;
      case 'MANUAL':
        pos.status = 'CLOSED_MANUALLY';
        break;
    }

    // Move from open map to closed list
    this.positions.delete(pos.tradeId);
    this.closedPositions.push(pos);

    // Update equity
    this.currentEquity += pnl;
    this.equityCurve.push({ timestamp: exitTime, equity: this.currentEquity });
  }
}
