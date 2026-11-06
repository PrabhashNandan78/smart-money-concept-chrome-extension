// ─────────────────────────────────────────────────────────────────────────────
// SMC Risk Engine – Position Sizer
// ─────────────────────────────────────────────────────────────────────────────

import type { Market } from '../types';

export interface PositionSizeResult {
  quantity: number;
  riskPerShare: number;
  totalRisk: number;
  estimatedCostPerShare: number;
  estimatedTotalCost: number;
  notionalValue: number;
  rejected: boolean;
  rejectionReason: string | null;
}

/**
 * Calculate accurate position size enforcing strict risk budget and transaction costs.
 *
 * Risk Budget = Account Equity × (Risk% / 100)
 * Risk Per Share = |Entry - Stop Loss| + Estimated Costs Per Share
 * Quantity = Floor(Risk Budget / Risk Per Share)
 */
export function calculatePositionSize(
  entry: number,
  stopLoss: number,
  accountEquity: number,
  riskPercent: number,
  market: Market,
  minLotSize: number = 1
): PositionSizeResult {
  if (entry <= 0 || stopLoss <= 0 || accountEquity <= 0 || riskPercent <= 0) {
    return {
      quantity: 0,
      riskPerShare: 0,
      totalRisk: 0,
      estimatedCostPerShare: 0,
      estimatedTotalCost: 0,
      notionalValue: 0,
      rejected: true,
      rejectionReason: 'Invalid input parameters (must be greater than 0)',
    };
  }

  const priceDistance = Math.abs(entry - stopLoss);
  if (priceDistance === 0) {
    return {
      quantity: 0,
      riskPerShare: 0,
      totalRisk: 0,
      estimatedCostPerShare: 0,
      estimatedTotalCost: 0,
      notionalValue: 0,
      rejected: true,
      rejectionReason: 'Stop loss equals entry price',
    };
  }

  // Estimated transaction costs per share
  // India: STT, exchange turnover, SEBI, GST, stamp duty approx 0.05% of price (~0.25 on 500)
  // US: SEC, FINRA, exchange fees approx $0.01 per share
  const estimatedCostPerShare = market === 'INDIA' ? entry * 0.0005 : 0.01;

  const riskPerShare = priceDistance + estimatedCostPerShare;
  const riskBudget = accountEquity * (riskPercent / 100);

  const rawQty = Math.floor(riskBudget / riskPerShare);
  // Round to nearest lot size
  const quantity = Math.floor(rawQty / minLotSize) * minLotSize;

  if (quantity < minLotSize || quantity === 0) {
    return {
      quantity: 0,
      riskPerShare,
      totalRisk: 0,
      estimatedCostPerShare,
      estimatedTotalCost: 0,
      notionalValue: 0,
      rejected: true,
      rejectionReason: `Calculated quantity (${rawQty}) is below minimum tradable lot size (${minLotSize}) for risk budget`,
    };
  }

  const notionalValue = quantity * entry;
  if (notionalValue > accountEquity) {
    return {
      quantity,
      riskPerShare,
      totalRisk: quantity * riskPerShare,
      estimatedCostPerShare,
      estimatedTotalCost: quantity * estimatedCostPerShare,
      notionalValue,
      rejected: true,
      rejectionReason: `Trade notional value exceeds available account equity`,
    };
  }

  return {
    quantity,
    riskPerShare,
    totalRisk: quantity * riskPerShare,
    estimatedCostPerShare,
    estimatedTotalCost: quantity * estimatedCostPerShare,
    notionalValue,
    rejected: false,
    rejectionReason: null,
  };
}

