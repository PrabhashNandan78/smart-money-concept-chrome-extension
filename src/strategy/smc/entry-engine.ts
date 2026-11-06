// ─────────────────────────────────────────────────────────────────────────────
// SMC Strategy – Multi-Timeframe Entry Engine (V1 Bullish Long Only)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AppSettings,
  Candle,
  Direction,
  FVG,
  SMCConditions,
  SMCSignal,
  SignalStatus,
} from '../../types';
import { analyzeMarketStructure } from './market-structure';
import { detectBOSandCHoCH, BOSEvent } from './bos-choch';
import { calculateATR, detectLiquiditySweeps, identifyLiquidityLevels } from './liquidity';
import { detectFVGs, findRetestingFVGs, updateFVGMitigation } from './fvg';
import { identifyOrderBlocks } from './order-blocks';

export interface EntryAnalysis {
  htfCandles: Candle[]; // 1H candles (bias)
  ltfCandles: Candle[]; // 5M candles (execution)
}

/**
 * Check if displacement occurred on or around the BOS event.
 * Displacement: strong candle body > displacementThreshold * ATR.
 */
export function checkDisplacement(
  candles: Candle[],
  bosEvent: BOSEvent,
  thresholdMultiplier: number = 1.5
): boolean {
  const atrs = calculateATR(candles);
  const idx = bosEvent.confirmingCandleIndex;
  const start = Math.max(0, idx - 2);
  const end = Math.min(candles.length - 1, idx + 1);

  for (let i = start; i <= end; i++) {
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const atr = atrs[i] || 1;
    if (c.close > c.open && body >= atr * thresholdMultiplier) {
      return true;
    }
  }
  return false;
}

/**
 * Execute the deterministic SMC Entry Engine.
 * Evaluates all 10 mandatory conditions for a Bullish Long setup.
 */
export function runEntryEngine(
  analysis: EntryAnalysis,
  settings: AppSettings,
  targetSymbol: string = 'UNKNOWN'
): SMCSignal {
  const { htfCandles, ltfCandles } = analysis;

  const defaultConditions: SMCConditions = {
    htfBullish: false,
    liquidityIdentified: false,
    sweepConfirmed: false,
    chochBosConfirmed: false,
    displacementConfirmed: false,
    fvgDetected: false,
    fvgRetest: false,
    entryConfirmed: false,
    rrQualified: false,
  };

  const signalId = `smc_sig_${Date.now()}`;
  const latestCandle = ltfCandles.length > 0 ? ltfCandles[ltfCandles.length - 1] : null;
  const timestamp = latestCandle ? latestCandle.timestamp : Date.now();

  const emptySignal: SMCSignal = {
    id: signalId,
    timestamp,
    symbol: targetSymbol,
    market: settings.market,
    exchange: settings.defaultExchange,
    timeframe: '5m',
    htfBias: 'NEUTRAL',
    bosDetected: false,
    bosLevel: null,
    bosTimestamp: null,
    chochDetected: false,
    chochLevel: null,
    chochTimestamp: null,
    liquiditySweep: null,
    fvg: null,
    orderBlock: null,
    entryZone: null,
    signalStatus: 'NO_SETUP',
    conditions: { ...defaultConditions },
  };

  if (htfCandles.length < 5 || ltfCandles.length < 10) {
    return emptySignal;
  }

  // 1. Higher Timeframe (1H) Analysis
  const htfStructure = analyzeMarketStructure(htfCandles, settings.pivotLength);
  const htfBias: Direction = htfStructure.trend;
  const htfBullish = htfBias === 'BULLISH';
  defaultConditions.htfBullish = htfBullish;

  if (settings.htfBiasRequired && !htfBullish) {
    return {
      ...emptySignal,
      htfBias,
      signalStatus: 'NO_SETUP',
      conditions: defaultConditions,
    };
  }

  // 2. LTF (5M) Structure & Liquidity
  const ltfStructure = analyzeMarketStructure(ltfCandles, settings.pivotLength);
  const ltfATR = calculateATR(ltfCandles, settings.atrLength);
  const liquidityLevels = identifyLiquidityLevels(
    ltfCandles,
    { highs: ltfStructure.swingHighs, lows: ltfStructure.swingLows },
    settings.liquidityTolerance
  );

  const sellSideLiquidity = liquidityLevels.filter(
    (l) => l.type === 'SWING_LOW' || l.type === 'EQUAL_LOW' || l.type === 'PREV_DAY_LOW'
  );
  defaultConditions.liquidityIdentified = sellSideLiquidity.length > 0;

  // 3. Bullish Liquidity Sweep
  const sweeps = detectLiquiditySweeps(ltfCandles, sellSideLiquidity, 3);
  const bullishSweeps = sweeps.filter((s) => s.direction === 'BULLISH');
  const latestSweep = bullishSweeps.length > 0 ? bullishSweeps[bullishSweeps.length - 1] : null;
  defaultConditions.sweepConfirmed = !!latestSweep;

  if (!latestSweep) {
    return {
      ...emptySignal,
      htfBias,
      signalStatus: 'WAITING_SWEEP',
      conditions: defaultConditions,
    };
  }

  // 4. Bullish BOS / CHoCH after the sweep
  const bosEvents = detectBOSandCHoCH(ltfCandles, ltfStructure);
  const postSweepBOS = bosEvents.filter(
    (b) => b.direction === 'BULLISH' && b.timestamp >= latestSweep.sweepTimestamp
  );
  const latestBOS = postSweepBOS.length > 0 ? postSweepBOS[postSweepBOS.length - 1] : null;
  defaultConditions.chochBosConfirmed = !!latestBOS;

  if (!latestBOS) {
    return {
      ...emptySignal,
      htfBias,
      liquiditySweep: latestSweep,
      signalStatus: 'WAITING_CHOCH',
      conditions: defaultConditions,
    };
  }

  // 5. Displacement check
  const displacement = checkDisplacement(ltfCandles, latestBOS, settings.displacementThreshold);
  defaultConditions.displacementConfirmed = displacement;

  // 6. Bullish FVG detection
  let fvgs = detectFVGs(ltfCandles, ltfATR, settings.fvgMinSize);
  fvgs = updateFVGMitigation(fvgs, ltfCandles);
  const postSweepFVGs = fvgs.filter(
    (f) => f.type === 'BULLISH' && f.createdAt >= latestSweep.sweepTimestamp && !f.invalidated
  );
  const primaryFVG = postSweepFVGs.length > 0 ? postSweepFVGs[postSweepFVGs.length - 1] : null;
  defaultConditions.fvgDetected = !!primaryFVG;

  if (!primaryFVG) {
    return {
      ...emptySignal,
      htfBias,
      bosDetected: latestBOS.type === 'BOS',
      bosLevel: latestBOS.level,
      bosTimestamp: latestBOS.timestamp,
      chochDetected: latestBOS.type === 'CHoCH',
      chochLevel: latestBOS.level,
      chochTimestamp: latestBOS.timestamp,
      liquiditySweep: latestSweep,
      signalStatus: 'WAITING_FVG',
      conditions: defaultConditions,
    };
  }

  // 7. FVG Retest check
  const lastCandle = ltfCandles[ltfCandles.length - 1];
  const retestingFVGs = findRetestingFVGs([primaryFVG], lastCandle);
  defaultConditions.fvgRetest = retestingFVGs.length > 0 || primaryFVG.mitigated;

  // 8. Completed Bullish confirmation candle in the entry zone
  const isBullishCandle = lastCandle.close > lastCandle.open;
  defaultConditions.entryConfirmed = defaultConditions.fvgRetest && isBullishCandle;

  // 9. Order block info
  const obs = identifyOrderBlocks(ltfCandles, bosEvents, settings.displacementThreshold);
  const activeOB = obs.find((ob) => ob.type === 'BULLISH' && ob.valid) || null;

  // Determine final status
  let finalStatus: SignalStatus = 'SCANNING';
  if (defaultConditions.entryConfirmed && displacement) {
    finalStatus = 'VALID_SIGNAL';
  } else if (defaultConditions.fvgDetected) {
    finalStatus = 'WAITING_RETEST';
  }

  return {
    id: signalId,
    timestamp: lastCandle.timestamp,
    symbol: targetSymbol !== 'UNKNOWN' ? targetSymbol : 'CHART_SYMBOL',
    market: settings.market,
    exchange: settings.defaultExchange,
    timeframe: '5m',
    htfBias,
    bosDetected: latestBOS.type === 'BOS',
    bosLevel: latestBOS.level,
    bosTimestamp: latestBOS.timestamp,
    chochDetected: latestBOS.type === 'CHoCH',
    chochLevel: latestBOS.level,
    chochTimestamp: latestBOS.timestamp,
    liquiditySweep: latestSweep,
    fvg: primaryFVG,
    orderBlock: activeOB,
    entryZone: { top: primaryFVG.top, bottom: primaryFVG.bottom },
    signalStatus: finalStatus,
    conditions: defaultConditions,
  };
}

