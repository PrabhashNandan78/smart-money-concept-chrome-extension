// ─────────────────────────────────────────────────────────────────────────────
// SMC Execution – Trade Ticket Generator
// ─────────────────────────────────────────────────────────────────────────────

import type { SMCSignal, TradeSetup } from '../types';

export interface TradeTicket {
  market: string;
  exchange: string;
  symbol: string;
  direction: string;
  timeframe: string;
  strategy: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  risk: number;
  reward: number;
  rr: string;
  currency: string;
  status: 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  generatedAt: number;
}

/**
 * Generate a complete manual execution Trade Ticket from an approved TradeSetup.
 */
export function generateTradeTicket(setup: TradeSetup, signal: SMCSignal): TradeTicket {
  const sym = setup.currency === 'INR' ? '₹' : '$';

  return {
    market: signal.market,
    exchange: signal.exchange,
    symbol: signal.symbol,
    direction: 'BUY',
    timeframe: signal.timeframe,
    strategy: 'SMC V1',
    entry: setup.entry,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    quantity: setup.quantity,
    risk: setup.totalRisk,
    reward: setup.estimatedProfit,
    rr: `${setup.netRR.toFixed(2)} : 1`,
    currency: sym,
    status: setup.status,
    rejectionReason: setup.rejectionReason,
    generatedAt: Date.now(),
  };
}

/**
 * Format Trade Ticket into clean monospace clipboard text.
 */
export function formatTicketText(ticket: TradeTicket): string {
  const c = ticket.currency;
  return `┌────────────────────────────────────┐
│          TRADE EXECUTION           │
├────────────────────────────────────┤
│ Market       ${ticket.market.padEnd(22)}│
│ Exchange     ${ticket.exchange.padEnd(22)}│
│ Symbol       ${ticket.symbol.padEnd(22)}│
│ Direction    ${ticket.direction.padEnd(22)}│
│ Timeframe    ${ticket.timeframe.padEnd(22)}│
│ Strategy     ${ticket.strategy.padEnd(22)}│
│                                    │
│ Entry        ${(c + ticket.entry.toFixed(2)).padEnd(22)}│
│ Stop Loss    ${(c + ticket.stopLoss.toFixed(2)).padEnd(22)}│
│ Take Profit  ${(c + ticket.takeProfit.toFixed(2)).padEnd(22)}│
│ Quantity     ${String(ticket.quantity).padEnd(22)}│
│ Risk         ${(c + ticket.risk.toFixed(2)).padEnd(22)}│
│ Reward       ${(c + ticket.reward.toFixed(2)).padEnd(22)}│
│ R:R          ${ticket.rr.padEnd(22)}│
│                                    │
│ Status       ${ticket.status.padEnd(22)}│
└────────────────────────────────────┘`;
}

/**
 * Format order details for fast broker copy/paste.
 */
export function formatBrokerOrderText(ticket: TradeTicket): string {
  return `BUY ${ticket.quantity} ${ticket.symbol} @ LIMIT ${ticket.entry.toFixed(2)} | SL: ${ticket.stopLoss.toFixed(2)} | TP: ${ticket.takeProfit.toFixed(2)}`;
}

export function formatSLText(ticket: TradeTicket): string {
  return ticket.stopLoss.toFixed(2);
}

export function formatTPText(ticket: TradeTicket): string {
  return ticket.takeProfit.toFixed(2);
}

