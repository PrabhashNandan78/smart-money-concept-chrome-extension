// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – SMC Analysis Terminal
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Play, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Layers, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { runEntryEngine } from '../strategy/smc/entry-engine';
import { buildHigherTimeframe } from '../data/timeframe-builder';
import type { Candle, SMCSignal } from '../types';

export function SMCAnalysis() {
  const { datasets, settings, currentSignal, setCurrentSignal, setActiveTab, chartContext } = useAppStore();

  const [selected5mId, setSelected5mId] = useState<string>('');
  const [selected1hId, setSelected1hId] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);

  // Auto-select matching datasets
  React.useEffect(() => {
    if (datasets.length > 0) {
      // First try matching chart symbol
      const matching5m = chartContext.symbol 
        ? datasets.find((d) => d.symbol === chartContext.symbol && (d.timeframe === '5m' || d.timeframe === '1m'))
        : null;
      const fiveMin = matching5m || datasets.find((d) => d.timeframe === '5m');
      if (fiveMin) setSelected5mId(fiveMin.id);

      const matching1h = chartContext.symbol
        ? datasets.find((d) => d.symbol === chartContext.symbol && (d.timeframe === '1h' || d.timeframe === '1d'))
        : null;
      const oneHour = matching1h || datasets.find((d) => d.timeframe === '1h');
      if (oneHour) setSelected1hId(oneHour.id);
    }
  }, [datasets, chartContext.symbol]);

  const selected5mDataset = datasets.find((d) => d.id === selected5mId);
  const isSymbolMismatch = chartContext.detected && selected5mDataset && chartContext.symbol && selected5mDataset.symbol !== chartContext.symbol;
  const isFutures = chartContext.detected && chartContext.instrumentType === 'FUTURES';

  const handleRunAnalysis = () => {
    if (isSymbolMismatch) {
      alert(`Cannot run analysis: Active chart is ${chartContext.symbol}, but selected dataset is ${selected5mDataset?.symbol}. Please select a dataset matching ${chartContext.symbol}.`);
      return;
    }
    const ltfDataset = datasets.find((d) => d.id === selected5mId);
    if (!ltfDataset || ltfDataset.candles.length === 0) {
      alert('Please select a 5M dataset with historical candles.');
      return;
    }

    setAnalyzing(true);

    let htfCandles: Candle[] = [];
    const htfDataset = datasets.find((d) => d.id === selected1hId);

    if (htfDataset && htfDataset.candles.length > 0) {
      htfCandles = htfDataset.candles;
    } else {
      // Aggregate 1H from 5M candles if 1H dataset not provided
      htfCandles = buildHigherTimeframe(ltfDataset.candles, '1h', '5m', ltfDataset.market);
    }

    const signal: SMCSignal = runEntryEngine(
      {
        htfCandles,
        ltfCandles: ltfDataset.candles,
      },
      {
        ...settings,
        market: ltfDataset.market,
        defaultExchange: ltfDataset.exchange,
      },
      ltfDataset.symbol
    );

    signal.symbol = ltfDataset.symbol;
    signal.exchange = ltfDataset.exchange;
    signal.market = ltfDataset.market;

    setCurrentSignal(signal);
    setAnalyzing(false);
  };

  const c = currentSignal?.conditions;

  return (
    <div className="space-y-4 text-xs">
      {/* Futures Not Configured Banner */}
      {isFutures && (
        <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <div className="font-bold text-xs uppercase tracking-wider">
              {chartContext.statusMessage} ({chartContext.symbol})
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed font-sans">
              Continuous futures contracts ({chartContext.symbol}) require dedicated futures margin profiles. SMC cash equity analysis and order execution are locked for futures.
            </p>
          </div>
        </div>
      )}

      {/* Symbol Mismatch Warning */}
      {isSymbolMismatch && (
        <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <div className="font-bold text-xs uppercase tracking-wider">
              INSTRUMENT MISMATCH DETECTED
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed font-sans">
              Active TradingView chart is <strong>{chartContext.symbol}</strong> ({chartContext.exchange}), but selected CSV dataset is <strong>{selected5mDataset?.symbol}</strong> ({selected5mDataset?.exchange}). Please import or select the CSV matching the chart.
            </p>
          </div>
        </div>
      )}

      {/* Dataset selectors */}
      <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700 space-y-2">
        <div className="font-semibold text-gray-300 flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-accent-blue" />
          <span>Select Datasets for Multi-Timeframe Analysis</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">5M Primary Data (Entry)</label>
            <select
              value={selected5mId}
              onChange={(e) => setSelected5mId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono text-xs"
            >
              <option value="">-- Choose 5M Data --</option>
              {datasets
                .filter((d) => d.timeframe === '5m' || d.timeframe === '1m')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.symbol} ({d.timeframe}) - {d.totalCandles}c
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">1H Higher TF (Directional Bias)</label>
            <select
              value={selected1hId}
              onChange={(e) => setSelected1hId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono text-xs"
            >
              <option value="">-- Auto-aggregate from 5M --</option>
              {datasets
                .filter((d) => d.timeframe === '1h' || d.timeframe === '1d')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.symbol} ({d.timeframe}) - {d.totalCandles}c
                  </option>
                ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleRunAnalysis}
          disabled={!selected5mId || analyzing || isFutures || Boolean(isSymbolMismatch)}
          className="w-full flex items-center justify-center gap-2 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 text-white font-bold rounded transition-colors mt-2"
        >
          <Play className="w-4 h-4" />
          <span>{analyzing ? 'Analyzing SMC Rules...' : 'Run SMC Strategy Analysis'}</span>
        </button>
      </div>

      {/* SMC Analysis Status Terminal */}
      {currentSignal && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 font-mono space-y-2">
          <div className="text-center font-bold text-gray-300 pb-2 border-b border-gray-800 text-[11px] tracking-wider">
            SMC ANALYSIS SUMMARY
          </div>

          <div className="flex justify-between py-1 border-b border-gray-800/40">
            <span className="text-gray-400">1H MARKET BIAS</span>
            <span
              className={`font-bold ${
                currentSignal.htfBias === 'BULLISH'
                  ? 'text-accent-green'
                  : currentSignal.htfBias === 'BEARISH'
                    ? 'text-accent-red'
                    : 'text-gray-400'
              }`}
            >
              {currentSignal.htfBias}
            </span>
          </div>

          <div className="flex justify-between py-1 border-b border-gray-800/40">
            <span className="text-gray-400">5M LIQUIDITY SWEEP</span>
            <span className={c?.sweepConfirmed ? 'text-accent-green font-bold' : 'text-gray-500'}>
              {c?.sweepConfirmed ? 'CONFIRMED' : 'WAITING'}
              {currentSignal.liquiditySweep && ` @ ${currentSignal.liquiditySweep.sweptLevel.toFixed(2)}`}
            </span>
          </div>

          <div className="flex justify-between py-1 border-b border-gray-800/40">
            <span className="text-gray-400">CHoCH / BOS</span>
            <span className={c?.chochBosConfirmed ? 'text-accent-green font-bold' : 'text-gray-500'}>
              {currentSignal.chochDetected
                ? `CHoCH @ ${currentSignal.chochLevel?.toFixed(2)}`
                : currentSignal.bosDetected
                  ? `BOS @ ${currentSignal.bosLevel?.toFixed(2)}`
                  : 'WAITING'}
            </span>
          </div>

          <div className="flex justify-between py-1 border-b border-gray-800/40">
            <span className="text-gray-400">DISPLACEMENT</span>
            <span className={c?.displacementConfirmed ? 'text-accent-green font-bold' : 'text-gray-500'}>
              {c?.displacementConfirmed ? 'CONFIRMED (>1.5 ATR)' : 'WAITING'}
            </span>
          </div>

          <div className="flex justify-between py-1 border-b border-gray-800/40">
            <span className="text-gray-400">FAIR VALUE GAP (FVG)</span>
            <span className={c?.fvgDetected ? 'text-accent-green font-bold' : 'text-gray-500'}>
              {currentSignal.fvg
                ? `${currentSignal.fvg.type} [${currentSignal.fvg.bottom.toFixed(2)} - ${currentSignal.fvg.top.toFixed(2)}]`
                : 'WAITING'}
            </span>
          </div>

          <div className="flex justify-between py-1 border-b border-gray-800/40">
            <span className="text-gray-400">FVG RETEST</span>
            <span className={c?.fvgRetest ? 'text-accent-green font-bold' : 'text-accent-yellow font-bold'}>
              {c?.fvgRetest ? 'TESTED' : 'WAITING'}
            </span>
          </div>

          <div className="flex justify-between py-1 border-b border-gray-800/40">
            <span className="text-gray-400">ENTRY CONFIRMATION</span>
            <span className={c?.entryConfirmed ? 'text-accent-green font-bold' : 'text-gray-500'}>
              {c?.entryConfirmed ? 'BULLISH CANDLE CONFIRMED' : 'PENDING'}
            </span>
          </div>

          <div className="flex justify-between py-2 pt-3 border-t border-gray-700">
            <span className="text-gray-300 font-bold">FINAL SIGNAL</span>
            <span
              className={`font-black text-sm px-2 py-0.5 rounded ${
                currentSignal.signalStatus === 'VALID_SIGNAL'
                  ? 'bg-green-900/60 text-green-300 border border-green-600'
                  : currentSignal.signalStatus === 'WAITING_RETEST'
                    ? 'bg-yellow-900/60 text-yellow-300 border border-yellow-600'
                    : 'bg-gray-800 text-gray-400'
              }`}
            >
              {currentSignal.signalStatus}
            </span>
          </div>
        </div>
      )}

      {/* Button to proceed to Trade Setup if signal exists */}
      {currentSignal && (
        <button
          onClick={() => setActiveTab('TradeSetup')}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-green hover:bg-accent-green/80 text-gray-900 font-bold rounded-lg transition-colors"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Prepare Trade Ticket & Risk Calculation</span>
        </button>
      )}
    </div>
  );
}

