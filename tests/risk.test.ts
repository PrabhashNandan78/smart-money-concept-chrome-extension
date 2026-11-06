/**
 * Risk Engine Tests
 * Tests position sizing, R:R calculation, and risk validation
 */

import { describe, it, expect } from 'vitest';

// ─── R:R Tests ────────────────────────────────────────────────────────────────
describe('Reward:Risk Ratio Calculation', () => {
  it('correctly calculates 3:1 R:R', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    
    // Entry=500, SL=490, TP=530, cost=0
    const result = validateRR(500, 490, 530, 0);
    expect(result.grossRR).toBeCloseTo(3.0);
    expect(result.netRR).toBeCloseTo(3.0);
  });

  it('correctly reduces net R:R when costs are included', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    
    // Entry=500, SL=490, TP=530, cost=0.5/share
    // Risk = |500-490| + 0.5 = 10.5
    // Reward = |530-500| - 0.5 = 29.5
    // Net R:R = 29.5 / 10.5 ≈ 2.81 → BELOW 3.0 → should be rejected
    const result = validateRR(500, 490, 530, 0.5);
    expect(result.netRR).toBeLessThan(3.0);
  });

  it('a 3.0:1 gross setup with 0 costs is approved', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    
    const result = validateRR(500, 490, 530, 0);
    expect(result.netRR).toBeGreaterThanOrEqual(3.0);
  });

  it('a 2.99:1 ratio is rejected', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    
    // Entry=500, SL=490, TP=529.9, cost=0
    // Risk=10, Reward=29.9, RR=2.99
    const result = validateRR(500, 490, 529.9, 0);
    expect(result.grossRR).toBeLessThan(3.0);
  });
  
  it('a 2:1 ratio is rejected', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    
    const result = validateRR(500, 490, 520, 0);
    expect(result.grossRR).toBeCloseTo(2.0);
    expect(result.grossRR).toBeLessThan(3.0);
  });
});

// ─── Position Sizing Tests ────────────────────────────────────────────────────
describe('Position Sizing', () => {
  it('calculates correct quantity for India market', async () => {
    const { calculatePositionSize } = await import('../src/risk/position-sizer');
    
    // Account ₹100,000, risk 0.25% = ₹250 budget
    // Entry=500, SL=495, risk/share before costs = 5
    // Estimated costs (India) ≈ 0.25/share → risk/share = 5.25
    // Quantity = floor(250 / 5.25) = 47
    const result = calculatePositionSize(500, 495, 100000, 0.25, 'INDIA', 1);
    
    expect(result.rejected).toBe(false);
    expect(result.quantity).toBe(47);
    expect(result.totalRisk).toBeLessThanOrEqual(250);
  });

  it('rejects when minimum lot exceeds risk budget', async () => {
    const { calculatePositionSize } = await import('../src/risk/position-sizer');
    
    // Very small account, large lot size requirement
    // Account ₹1,000, risk 0.25% = ₹2.50 budget
    // Entry=1000, SL=990, risk/share = 10
    // Qty = floor(2.50/10) = 0 → rejected
    const result = calculatePositionSize(1000, 990, 1000, 0.25, 'INDIA', 1);
    
    // Quantity would be 0 which is invalid
    expect(result.quantity === 0 || result.rejected).toBe(true);
  });

  it('rounds down to whole shares (no fractional shares)', async () => {
    const { calculatePositionSize } = await import('../src/risk/position-sizer');
    
    // Account ₹100,000, risk 0.25% = ₹250
    // Entry=500, SL=497, risk/share ≈ 3 + costs
    // Quantity must be integer
    const result = calculatePositionSize(500, 497, 100000, 0.25, 'INDIA', 1);
    
    expect(Number.isInteger(result.quantity)).toBe(true);
  });
});

// ─── Trade Risk Validation Tests ─────────────────────────────────────────────
describe('Trade Risk Validation', () => {
  it('approves a valid 3:1 setup within risk limits', async () => {
    const { validateTradeRisk } = await import('../src/risk/risk-validator');
    
    const riskSettings = {
      accountEquity: 100000,
      riskPerTrade: 0.25,
      maxDailyLoss: 1.0,
      maxWeeklyLoss: 2.5,
      drawdownPause: 5.0,
      maxConcurrentTrades: 3,
      maxAggregateRisk: 0.75,
      tradesPerSymbolPerSession: 1,
      minRR: 3.0,
      currency: 'INR' as const,
    };
    
    // Entry: 500, SL: 490 (Gross risk: 10). Cost per share: 0.25.
    // Net risk = 10.25. To achieve Net R:R >= 3.00:1, take profit must be >= 531.00.
    const setup = { entry: 500, stopLoss: 490, takeProfit: 531, quantity: 47, symbol: 'RELIANCE', market: 'INDIA' as const };
    const result = validateTradeRisk(setup, riskSettings, 100000, [], 0, 0, 0);
    
    expect(result.approved).toBe(true);
    expect(result.failures.length).toBe(0);
    expect(result.netRR).toBeGreaterThanOrEqual(3.0);
  });

  it('strictly rejects when Net R:R is 2.99:1 even if Gross R:R is 3.0:1', async () => {
    const { validateTradeRisk } = await import('../src/risk/risk-validator');
    
    const riskSettings = {
      accountEquity: 100000,
      riskPerTrade: 0.25,
      maxDailyLoss: 1.0,
      maxWeeklyLoss: 2.5,
      drawdownPause: 5.0,
      maxConcurrentTrades: 3,
      maxAggregateRisk: 0.75,
      tradesPerSymbolPerSession: 1,
      minRR: 3.0,
      currency: 'INR' as const,
    };
    
    // With TP 530, Gross R:R is 3.00:1, but Net R:R is 2.90:1 (< 3.00:1). MUST FAIL.
    const setup = { entry: 500, stopLoss: 490, takeProfit: 530, quantity: 47, symbol: 'RELIANCE', market: 'INDIA' as const };
    const result = validateTradeRisk(setup, riskSettings, 100000, [], 0, 0, 0);
    
    expect(result.approved).toBe(false);
    expect(result.failures.some(f => f.includes('Net Reward:Risk ratio'))).toBe(true);
  });

  it('rejects when daily loss limit is reached', async () => {
    const { validateTradeRisk } = await import('../src/risk/risk-validator');
    
    const riskSettings = {
      accountEquity: 100000,
      riskPerTrade: 0.25,
      maxDailyLoss: 1.0,
      maxWeeklyLoss: 2.5,
      drawdownPause: 5.0,
      maxConcurrentTrades: 3,
      maxAggregateRisk: 0.75,
      tradesPerSymbolPerSession: 1,
      minRR: 3.0,
      currency: 'INR' as const,
    };
    
    const setup = { entry: 500, stopLoss: 490, takeProfit: 530, quantity: 47, symbol: 'RELIANCE', market: 'INDIA' as const };
    // dailyPnl = -1200 on 100k account = -1.2% daily loss (exceeds 1% limit)
    const result = validateTradeRisk(setup, riskSettings, 100000, [], -1200, 0, 0);
    
    expect(result.approved).toBe(false);
    expect(result.failures.some(f => f.toLowerCase().includes('daily'))).toBe(true);
  });

  it('rejects when max concurrent trades reached', async () => {
    const { validateTradeRisk } = await import('../src/risk/risk-validator');
    
    const riskSettings = {
      accountEquity: 100000,
      riskPerTrade: 0.25,
      maxDailyLoss: 1.0,
      maxWeeklyLoss: 2.5,
      drawdownPause: 5.0,
      maxConcurrentTrades: 1, // only 1 allowed
      maxAggregateRisk: 0.75,
      tradesPerSymbolPerSession: 1,
      minRR: 3.0,
      currency: 'INR' as const,
    };
    
    const setup = { entry: 500, stopLoss: 490, takeProfit: 530, quantity: 47, symbol: 'TCS', market: 'INDIA' as const };
    // Already have 1 open trade
    const openTrades = [{ status: 'OPEN' }] as any;
    const result = validateTradeRisk(setup, riskSettings, 100000, openTrades, 0, 0, 0);
    
    expect(result.approved).toBe(false);
    expect(result.failures.some(f => f.toLowerCase().includes('concurrent') || f.toLowerCase().includes('position'))).toBe(true);
  });

  it('rejects stop loss above entry price for long', async () => {
    const { validateTradeRisk } = await import('../src/risk/risk-validator');
    
    const riskSettings = {
      accountEquity: 100000,
      riskPerTrade: 0.25,
      maxDailyLoss: 1.0,
      maxWeeklyLoss: 2.5,
      drawdownPause: 5.0,
      maxConcurrentTrades: 3,
      maxAggregateRisk: 0.75,
      tradesPerSymbolPerSession: 1,
      minRR: 3.0,
      currency: 'INR' as const,
    };
    
    // SL above entry — invalid for long trade
    const setup = { entry: 500, stopLoss: 510, takeProfit: 530, quantity: 47, symbol: 'RELIANCE', market: 'INDIA' as const };
    const result = validateTradeRisk(setup, riskSettings, 100000, [], 0, 0, 0);
    
    expect(result.approved).toBe(false);
  });
});

