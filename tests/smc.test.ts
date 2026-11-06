/**
 * SMC Strategy Tests
 * Tests market structure, BOS/CHoCH, FVG, and liquidity detection
 */

import { describe, it, expect } from 'vitest';

// We'll import from the built modules — these tests validate correctness
// of the SMC engine with known datasets

// Helper to create a candle
function candle(ts: number, o: number, h: number, l: number, c: number, v = 10000) {
  return { timestamp: ts * 60000, open: o, high: h, low: l, close: c, volume: v };
}

// ─── Market Structure Tests ───────────────────────────────────────────────────
describe('Market Structure Detection', () => {
  it('detects a confirmed swing high with 3-3 pivot', async () => {
    const { detectSwingPoints } = await import('../src/strategy/smc/market-structure');
    
    // Candle sequence: low, low, HIGH, low, low → confirmed swing high at index 4 after 3 right bars close
    const candles = [
      candle(1, 100, 102, 99, 101),
      candle(2, 101, 103, 100, 102),
      candle(3, 102, 104, 101, 103),
      candle(4, 103, 110, 102, 109), // swing high candidate
      candle(5, 109, 110, 105, 106),
      candle(6, 106, 107, 103, 104),
      candle(7, 104, 105, 101, 102), // 3 right bars closed
    ];
    
    const result = detectSwingPoints(candles, 3, 3);
    expect(result.highs.length).toBeGreaterThan(0);
    const sh = result.highs.find(h => h.price === 110);
    expect(sh).toBeDefined();
    expect(sh?.confirmed).toBe(true);
    expect(sh?.index).toBe(3);
  });

  it('does NOT confirm a pivot without enough right bars', async () => {
    const { detectSwingPoints } = await import('../src/strategy/smc/market-structure');
    
    const candles = [
      candle(1, 100, 102, 99, 101),
      candle(2, 101, 103, 100, 102),
      candle(3, 102, 104, 101, 103),
      candle(4, 103, 110, 102, 109), // swing high candidate
      candle(5, 109, 110, 105, 106), // only 1 right bar
    ];
    
    // With 3 right bars required, index 3 cannot be confirmed (only 1 bar to the right)
    const result = detectSwingPoints(candles, 3, 3);
    const sh = result.highs.find(h => h.price === 110);
    expect(sh?.confirmed ?? false).toBe(false);
  });

  it('identifies bullish trend from HH+HL sequence', async () => {
    const { analyzeMarketStructure } = await import('../src/strategy/smc/market-structure');
    
    // Uptrend: HL → HH → HL → HH pattern
    const candles = [
      candle(1,  95, 100,  93,  99),
      candle(2, 100, 105,  98, 104),
      candle(3, 104, 106, 103, 105),
      candle(4, 105, 108, 104, 107), // HH
      candle(5, 107, 108, 105, 106),
      candle(6, 106, 107, 104, 105),
      candle(7, 105, 106, 104, 105), // HL
      candle(8, 105, 110, 105, 109), // HH
      candle(9, 109, 110, 107, 108),
      candle(10, 108, 109, 107, 108),
      candle(11, 108, 109, 107, 108),
    ];
    
    const ms = analyzeMarketStructure(candles, 2);
    expect(ms.trend).toBe('BULLISH');
  });
});

// ─── BOS / CHoCH Tests ────────────────────────────────────────────────────────
describe('BOS and CHoCH Detection', () => {
  it('detects bullish BOS when close exceeds swing high', async () => {
    const { detectSwingPoints, analyzeMarketStructure } = await import('../src/strategy/smc/market-structure');
    const { detectBOSandCHoCH } = await import('../src/strategy/smc/bos-choch');

    // Build candles where we have a swing high at 110, then a candle that closes above it
    const candles = [
      candle(1, 100, 105, 99, 104),
      candle(2, 104, 108, 103, 107),
      candle(3, 107, 110, 106, 109), // swing high = 110
      candle(4, 109, 110, 106, 107),
      candle(5, 107, 108, 105, 106),
      candle(6, 106, 107, 104, 105), // 3 right bars done
      candle(7, 105, 115, 104, 114), // BOS: closes above 110
    ];
    
    const ms = analyzeMarketStructure(candles, 3);
    const events = detectBOSandCHoCH(candles, ms);
    
    const bos = events.find(e => e.type === 'BOS' && e.direction === 'BULLISH');
    expect(bos).toBeDefined();
    expect(bos!.level).toBe(110);
  });
});

// ─── FVG Tests ────────────────────────────────────────────────────────────────
describe('Fair Value Gap Detection', () => {
  it('detects a bullish FVG when candle3.low > candle1.high', async () => {
    const { detectFVGs } = await import('../src/strategy/smc/fvg');

    const candles = [
      candle(1, 100, 102, 99, 101),  // candle1: high=102
      candle(2, 102, 108, 101, 107), // displacement candle
      candle(3, 107, 112, 103, 111), // candle3: low=103 > candle1.high=102 → BULLISH FVG
    ];
    
    // ATR doesn't matter for this test — use mock [0,0,0]
    const atr = [0, 0, 0];
    const fvgs = detectFVGs(candles, atr, 0); // minSize=0 to detect all
    
    expect(fvgs.length).toBeGreaterThan(0);
    const bullFvg = fvgs.find(f => f.type === 'BULLISH');
    expect(bullFvg).toBeDefined();
    expect(bullFvg!.bottom).toBe(102); // candle1.high
    expect(bullFvg!.top).toBe(103);    // candle3.low
  });

  it('detects a bearish FVG when candle3.high < candle1.low', async () => {
    const { detectFVGs } = await import('../src/strategy/smc/fvg');

    const candles = [
      candle(1, 110, 112, 108, 109), // candle1: low=108
      candle(2, 109, 109, 103, 104), // displacement candle
      candle(3, 104, 107, 100, 101), // candle3: high=107 < candle1.low=108 → BEARISH FVG
    ];
    
    const atr = [0, 0, 0];
    const fvgs = detectFVGs(candles, atr, 0);
    
    const bearFvg = fvgs.find(f => f.type === 'BEARISH');
    expect(bearFvg).toBeDefined();
    expect(bearFvg!.top).toBe(108);    // candle1.low
    expect(bearFvg!.bottom).toBe(107); // candle3.high
  });

  it('rejects FVG smaller than ATR threshold', async () => {
    const { detectFVGs } = await import('../src/strategy/smc/fvg');

    const candles = [
      candle(1, 100, 102, 99, 101),  // high=102
      candle(2, 102, 104, 101, 103),
      candle(3, 103, 106, 102.1, 105), // gap only 0.1 — very small
    ];
    
    const atr = [0, 0, 10]; // ATR=10, minSize=0.3 → min gap = 3
    const fvgs = detectFVGs(candles, atr, 0.3); // requires gap >= 3
    
    expect(fvgs.length).toBe(0); // 0.1 gap rejected
  });
});

