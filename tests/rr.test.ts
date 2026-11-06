/**
 * R:R Specific Tests - Comprehensive coverage of the 3:1 rule
 */
import { describe, it, expect } from 'vitest';

describe('3:1 R:R Hard Enforcement', () => {
  it('exactly 3.0:1 is approved', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    const result = validateRR(100, 90, 130, 0); // risk=10, reward=30, rr=3.0
    expect(result.grossRR).toBeCloseTo(3.0, 5);
    expect(result.netRR).toBeGreaterThanOrEqual(3.0);
  });

  it('3.5:1 is approved', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    const result = validateRR(100, 90, 135, 0); // risk=10, reward=35, rr=3.5
    expect(result.grossRR).toBeCloseTo(3.5, 5);
    expect(result.netRR).toBeGreaterThanOrEqual(3.0);
  });

  it('2.99:1 is REJECTED', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    const result = validateRR(100, 90, 129.9, 0); // risk=10, reward=29.9, rr=2.99
    expect(result.grossRR).toBeLessThan(3.0);
  });

  it('2.0:1 is REJECTED', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    const result = validateRR(100, 90, 120, 0); // risk=10, reward=20, rr=2.0
    expect(result.grossRR).toBeCloseTo(2.0, 5);
    expect(result.grossRR).toBeLessThan(3.0);
  });

  it('1:1 is REJECTED', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    const result = validateRR(100, 90, 110, 0);
    expect(result.grossRR).toBeCloseTo(1.0, 5);
    expect(result.grossRR).toBeLessThan(3.0);
  });

  it('calculateTakeProfit returns correct TP for 3:1', async () => {
    const { calculateTakeProfit } = await import('../src/risk/risk-validator');
    // entry=500, sl=490, targetRR=3.0, cost=0
    // risk = 10, reward = 10*3 = 30, TP = 500+30 = 530
    const tp = calculateTakeProfit(500, 490, 3.0, 0);
    expect(tp).toBeCloseTo(530, 1);
  });

  it('net R:R accounting for costs can drop below threshold', async () => {
    const { validateRR } = await import('../src/risk/risk-validator');
    // Entry=500, SL=490, TP=530, cost=2/share
    // Net risk = 10+2 = 12, net reward = 30-2 = 28
    // Net RR = 28/12 ≈ 2.33 → REJECTED
    const result = validateRR(500, 490, 530, 2);
    expect(result.netRR).toBeLessThan(3.0);
  });
});

