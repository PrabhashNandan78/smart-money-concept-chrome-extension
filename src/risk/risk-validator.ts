// ─────────────────────────────────────────────────────────────────────────────
// SMC Risk Engine – Risk Validator & Reward-to-Risk Enforcement
// ─────────────────────────────────────────────────────────────────────────────

import type { Market, RiskSettings, Trade } from '../types';

export interface RiskValidationResult {
  approved: boolean;
  netRR: number;
  grossRR: number;
  failures: string[];
  warnings: string[];
}

/**
 * Calculate Gross and Net Reward-to-Risk ratio with transaction costs.
 * Strictly enforces minimum 3:1 net R:R.
 */
export function validateRR(
  entry: number,
  stopLoss: number,
  takeProfit: number,
  costPerShare: number = 0
): { grossRR: number; netRR: number } {
  const grossRisk = Math.abs(entry - stopLoss);
  const grossReward = Math.abs(takeProfit - entry);

  if (grossRisk === 0) {
    return { grossRR: 0, netRR: 0 };
  }

  const grossRR = grossReward / grossRisk;

  const netRisk = grossRisk + costPerShare;
  const netReward = Math.max(0, grossReward - costPerShare);
  const netRR = netRisk > 0 ? netReward / netRisk : 0;

  return { grossRR, netRR };
}

/**
 * Calculate the exact Take Profit price required for a target net R:R.
 */
export function calculateTakeProfit(
  entry: number,
  stopLoss: number,
  targetRR: number = 3.0,
  costPerShare: number = 0
): number {
  const risk = Math.abs(entry - stopLoss) + costPerShare;
  const netRewardNeeded = targetRR * risk;
  const grossRewardNeeded = netRewardNeeded + costPerShare;

  return entry > stopLoss ? entry + grossRewardNeeded : entry - grossRewardNeeded;
}

/**
 * Validate all risk rules before approving a proposed trade setup.
 */
export function validateTradeRisk(
  setup: {
    entry: number;
    stopLoss: number;
    takeProfit: number;
    quantity: number;
    symbol: string;
    market: Market;
  },
  riskSettings: RiskSettings,
  currentEquity: number,
  openTrades: Trade[] = [],
  dailyPnl: number = 0,
  weeklyPnl: number = 0,
  currentDrawdown: number = 0
): RiskValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  const { entry, stopLoss, takeProfit, quantity, symbol } = setup;

  // 1. Basic price sanity
  if (entry <= 0 || stopLoss <= 0 || takeProfit <= 0 || quantity <= 0) {
    failures.push('Invalid price parameters: entry, stop loss, take profit, and quantity must be positive.');
  }

  // 2. Stop loss position for Long trade
  if (stopLoss >= entry) {
    failures.push(`Invalid stop loss: for LONG trade, Stop Loss (${stopLoss}) must be below Entry (${entry}).`);
  }

  if (takeProfit <= entry) {
    failures.push(`Invalid take profit: for LONG trade, Take Profit (${takeProfit}) must be above Entry (${entry}).`);
  }

  // 3. Strict 3:1 Net Reward-to-Risk check (accounting for statutory fees & slippage)
  const costPerShare = setup.market === 'INDIA' ? entry * 0.0005 : 0.01;
  const { grossRR, netRR } = validateRR(entry, stopLoss, takeProfit, costPerShare);

  if (netRR < riskSettings.minRR) {
    failures.push(
      `Net Reward:Risk ratio (${netRR.toFixed(2)}:1 after estimated costs) fails mandatory minimum ${riskSettings.minRR.toFixed(2)}:1 requirement. (Gross R:R: ${grossRR.toFixed(2)}:1)`
    );
  }

  // 4. Daily Loss Limit
  const maxDailyLossAmount = currentEquity * (riskSettings.maxDailyLoss / 100);
  if (dailyPnl <= -maxDailyLossAmount) {
    failures.push(
      `Daily loss limit reached: Current daily loss (${Math.abs(dailyPnl).toFixed(2)}) exceeds max permitted (${maxDailyLossAmount.toFixed(2)} / ${riskSettings.maxDailyLoss}%).`
    );
  }

  // 5. Weekly Loss Limit
  const maxWeeklyLossAmount = currentEquity * (riskSettings.maxWeeklyLoss / 100);
  if (weeklyPnl <= -maxWeeklyLossAmount) {
    failures.push(
      `Weekly loss limit reached: Current weekly loss (${Math.abs(weeklyPnl).toFixed(2)}) exceeds max permitted (${maxWeeklyLossAmount.toFixed(2)} / ${riskSettings.maxWeeklyLoss}%).`
    );
  }

  // 6. Drawdown Pause Check
  if (currentDrawdown >= riskSettings.drawdownPause) {
    failures.push(
      `Drawdown pause triggered: Current drawdown (${currentDrawdown.toFixed(1)}%) exceeds limit (${riskSettings.drawdownPause}%). Trading paused.`
    );
  }

  // 7. Max Concurrent Trades
  const activeOpenTrades = openTrades.filter((t) => t.status === 'OPEN' || t.status === 'WAITING_ENTRY');
  if (activeOpenTrades.length >= riskSettings.maxConcurrentTrades) {
    failures.push(
      `Maximum concurrent positions reached: Already have ${activeOpenTrades.length} open/waiting trades (limit: ${riskSettings.maxConcurrentTrades}).`
    );
  }

  // 8. Trades per symbol per session
  const symbolTradesThisSession = activeOpenTrades.filter((t) => t.symbol === symbol);
  if (symbolTradesThisSession.length >= riskSettings.tradesPerSymbolPerSession) {
    failures.push(
      `Symbol trade limit reached: A trade for ${symbol} is already active in this session (limit: ${riskSettings.tradesPerSymbolPerSession}).`
    );
  }

  // 9. Capital check
  const notionalValue = entry * quantity;
  if (notionalValue > currentEquity) {
    failures.push(
      `Insufficient capital: Required trade capital (${notionalValue.toFixed(2)}) exceeds account equity (${currentEquity.toFixed(2)}).`
    );
  }

  return {
    approved: failures.length === 0,
    netRR,
    grossRR,
    failures,
    warnings,
  };
}

