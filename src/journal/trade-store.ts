// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – High-Level Trade Journal Store
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Trade,
  TradeSetup,
  SMCSignal,
  TradeFilters,
  TradeStatus,
} from '@/types';
import { db } from '@/db';

// ── Supporting interfaces ─────────────────────────────────────────────────────

export interface ManualFill {
  actualEntry: number;
  actualQuantity: number;
  brokerOrderRef: string;
  slOrderConfirmed: boolean;
  tpOrderConfirmed: boolean;
  executionTimestamp: number;
}

export interface TradeReview {
  screenshot: string | null;
  entryReasoning: string;
  exitReasoning: string;
  ruleCompliant: boolean;
  mistakes: string;
  lessonsLearned: string;
}

// ── Current strategy version ──────────────────────────────────────────────────
const STRATEGY_VERSION = '1.0.0';

// ── CSV column headers ────────────────────────────────────────────────────────
const CSV_HEADERS = [
  'Date',
  'Symbol',
  'Market',
  'Direction',
  'Entry',
  'Exit',
  'PnL',
  'RMultiple',
  'Status',
  'Type',
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Escape a CSV cell value (wrap in quotes if it contains comma/quote/newline). */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Determine exit status from exit reason string. */
function exitStatusFromReason(reason: string): TradeStatus {
  const lower = reason.toLowerCase();
  if (lower.includes('stop') || lower.includes('sl')) return 'STOP_LOSS_HIT';
  if (lower.includes('target') || lower.includes('tp') || lower.includes('profit'))
    return 'TAKE_PROFIT_HIT';
  return 'CLOSED_MANUALLY';
}

// ─────────────────────────────────────────────────────────────────────────────
// TradeJournalStore
// ─────────────────────────────────────────────────────────────────────────────

export class TradeJournalStore {
  // ── Ensure DB is open before any operation ──────────────────────────────────
  private async ensureOpen(): Promise<void> {
    await db.open();
  }

  // ── Build a base Trade object from setup + signal ──────────────────────────
  private buildBaseTradeFromSetup(
    setup: TradeSetup,
    signal: SMCSignal,
  ): Omit<Trade, 'tradeType' | 'status'> {
    const now = Date.now();

    return {
      id: crypto.randomUUID(),
      market: signal.market,
      exchange: signal.exchange,
      symbol: signal.symbol,
      strategyVersion: STRATEGY_VERSION,
      direction: 'LONG',

      // SMC data from signal
      htfBias: signal.htfBias,
      marketStructure: signal.htfBias, // store bias direction as structure label
      bosDetected: signal.bosDetected,
      chochDetected: signal.chochDetected,
      liquiditySweepDetected: signal.liquiditySweep !== null,
      fvgDetected: signal.fvg !== null,
      orderBlockDetected: signal.orderBlock !== null,
      entryConfirmation: signal.conditions.entryConfirmed
        ? 'CONFIRMED'
        : 'PENDING',

      // Planned trade levels from setup
      plannedEntry: setup.entry,
      stopLoss: setup.stopLoss,
      takeProfit: setup.takeProfit,
      quantity: setup.quantity,
      riskAmount: setup.totalRisk,
      estimatedCosts: setup.estimatedCosts,

      // Actuals – not yet filled
      actualEntry: null,
      actualExit: null,
      grossPnl: null,
      actualCosts: null,
      netPnl: null,
      rMultiple: null,

      // Timestamps
      createdAt: now,
      entryAt: null,
      exitAt: null,

      // Review fields – empty at creation
      screenshot: null,
      entryReasoning: '',
      exitReasoning: '',
      ruleCompliant: false,
      mistakes: '',
      lessonsLearned: '',

      // Manual live fields – not set yet
      brokerOrderRef: null,
      actualEntryPrice: null,
      actualQuantity: null,
      slOrderConfirmed: false,
      tpOrderConfirmed: false,
    };
  }

  // ── Fetch a trade or throw ─────────────────────────────────────────────────
  private async fetchOrThrow(tradeId: string): Promise<Trade> {
    const trade = await db.getTrade(tradeId);
    if (!trade) throw new Error(`Trade not found: ${tradeId}`);
    return trade;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a paper trade (simulated, no real money).
   * Status starts at WAITING_ENTRY.
   */
  async createPaperTrade(setup: TradeSetup, signal: SMCSignal): Promise<Trade> {
    await this.ensureOpen();

    const trade: Trade = {
      ...this.buildBaseTradeFromSetup(setup, signal),
      tradeType: 'PAPER',
      status: 'WAITING_ENTRY',
    };

    await db.putTrade(trade);
    return trade;
  }

  /**
   * Create a manual live trade (real money, manual broker execution).
   * Status starts at SETUP_DETECTED.
   */
  async createManualTrade(
    setup: TradeSetup,
    signal: SMCSignal,
  ): Promise<Trade> {
    await this.ensureOpen();

    const trade: Trade = {
      ...this.buildBaseTradeFromSetup(setup, signal),
      tradeType: 'MANUAL_LIVE',
      status: 'SETUP_DETECTED',
    };

    await db.putTrade(trade);
    return trade;
  }

  /**
   * Record that a trade entry has been executed.
   * Moves status → OPEN.
   */
  async recordEntry(
    tradeId: string,
    actualEntry: number,
    quantity: number,
    timestamp: number,
  ): Promise<Trade> {
    await this.ensureOpen();

    const trade = await this.fetchOrThrow(tradeId);

    const updated: Trade = {
      ...trade,
      actualEntry,
      actualEntryPrice: actualEntry,
      actualQuantity: quantity,
      quantity,
      entryAt: timestamp,
      status: 'OPEN',
    };

    await db.putTrade(updated);
    return updated;
  }

  /**
   * Record a trade exit.
   * Calculates netPnl and rMultiple, then moves status to the appropriate
   * terminal state based on the exit reason.
   */
  async recordExit(
    tradeId: string,
    exitPrice: number,
    exitTimestamp: number,
    reason: string,
  ): Promise<Trade> {
    await this.ensureOpen();

    const trade = await this.fetchOrThrow(tradeId);

    const entryPrice = trade.actualEntry ?? trade.plannedEntry;
    const qty = trade.actualQuantity ?? trade.quantity;
    const costs = trade.actualCosts ?? trade.estimatedCosts;

    const grossPnl = (exitPrice - entryPrice) * qty;
    const netPnl = grossPnl - costs;
    const rMultiple =
      trade.riskAmount && trade.riskAmount !== 0
        ? netPnl / trade.riskAmount
        : null;

    const updated: Trade = {
      ...trade,
      actualExit: exitPrice,
      exitAt: exitTimestamp,
      grossPnl,
      actualCosts: costs,
      netPnl,
      rMultiple,
      exitReasoning: reason,
      status: exitStatusFromReason(reason),
    };

    await db.putTrade(updated);
    return updated;
  }

  /**
   * Record broker fill details for a manual live trade.
   */
  async recordManualFill(
    tradeId: string,
    fill: ManualFill,
  ): Promise<Trade> {
    await this.ensureOpen();

    const trade = await this.fetchOrThrow(tradeId);

    const updated: Trade = {
      ...trade,
      actualEntry: fill.actualEntry,
      actualEntryPrice: fill.actualEntry,
      actualQuantity: fill.actualQuantity,
      quantity: fill.actualQuantity,
      brokerOrderRef: fill.brokerOrderRef,
      slOrderConfirmed: fill.slOrderConfirmed,
      tpOrderConfirmed: fill.tpOrderConfirmed,
      entryAt: fill.executionTimestamp,
      status: 'OPEN',
    };

    await db.putTrade(updated);
    return updated;
  }

  /**
   * Add or update the post-trade review fields.
   */
  async updateReview(
    tradeId: string,
    review: TradeReview,
  ): Promise<Trade> {
    await this.ensureOpen();

    const trade = await this.fetchOrThrow(tradeId);

    const updated: Trade = {
      ...trade,
      screenshot: review.screenshot,
      entryReasoning: review.entryReasoning,
      exitReasoning: review.exitReasoning,
      ruleCompliant: review.ruleCompliant,
      mistakes: review.mistakes,
      lessonsLearned: review.lessonsLearned,
    };

    await db.putTrade(updated);
    return updated;
  }

  /**
   * Get all trades, optionally filtered.
   */
  async getTrades(filters?: TradeFilters): Promise<Trade[]> {
    await this.ensureOpen();
    return db.getAllTrades(filters);
  }

  /**
   * Get a single trade by ID.
   */
  async getTradeById(id: string): Promise<Trade | null> {
    await this.ensureOpen();
    return db.getTrade(id);
  }

  /**
   * Delete a trade by ID.
   */
  async deleteTrade(id: string): Promise<void> {
    await this.ensureOpen();
    return db.deleteTrade(id);
  }

  // ── Import / Export ─────────────────────────────────────────────────────────

  /**
   * Export all trades as a JSON string.
   */
  async exportJSON(): Promise<string> {
    await this.ensureOpen();
    const trades = await db.getAllTrades();
    return JSON.stringify(trades, null, 2);
  }

  /**
   * Import trades from a JSON string (array of Trade objects).
   * Each valid trade is upserted into the DB.
   */
  async importJSON(json: string): Promise<void> {
    await this.ensureOpen();

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('importJSON: invalid JSON string');
    }

    if (!Array.isArray(parsed)) {
      throw new Error('importJSON: expected a JSON array of trades');
    }

    // Validate minimally and upsert each trade
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null || !('id' in item)) {
        throw new Error(
          `importJSON: each trade must be an object with an "id" field`,
        );
      }
      await db.putTrade(item as Trade);
    }
  }

  /**
   * Export all trades as a CSV string.
   * Columns: Date, Symbol, Market, Direction, Entry, Exit, PnL, RMultiple, Status, Type
   */
  async exportCSV(): Promise<string> {
    await this.ensureOpen();
    const trades = await db.getAllTrades();

    const header = CSV_HEADERS.join(',');

    const rows = trades.map((trade) => {
      const date = new Date(trade.createdAt).toISOString().split('T')[0];
      const entry = trade.actualEntry ?? trade.plannedEntry;

      return [
        csvCell(date),
        csvCell(trade.symbol),
        csvCell(trade.market),
        csvCell(trade.direction),
        csvCell(entry),
        csvCell(trade.actualExit),
        csvCell(trade.netPnl),
        csvCell(trade.rMultiple),
        csvCell(trade.status),
        csvCell(trade.tradeType),
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────
export const tradeStore = new TradeJournalStore();
