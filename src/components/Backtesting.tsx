// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Backtesting Engine & Results
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Play, TrendingUp, BarChart2, ShieldCheck, ArrowRight, Layers, Award } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useAppStore } from '../store/appStore';
import { runBacktest, BacktestResult } from '../analytics/backtester';
import { buildHigherTimeframe } from '../data/timeframe-builder';
import type { Candle } from '../types';

export function Backtesting() {
  const { datasets, settings } = useAppStore();

  const [selected5mId, setSelected5mId] = useState<string>('');
  const [selected1hId, setSelected1hId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);

  React.useEffect(() => {
    if (datasets.length > 0) {
      const fiveMin = datasets.find((d) => d.timeframe === '5m');
      if (fiveMin) setSelected5mId(fiveMin.id);

      const oneHour = datasets.find((d) => d.timeframe === '1h');
      if (oneHour) setSelected1hId(oneHour.id);
    }
  }, [datasets]);

  const handleRunBacktest = () => {
    const ltfDataset = datasets.find((d) => d.id === selected5mId);
    if (!ltfDataset || ltfDataset.candles.length < 20) {
      alert('Please select a 5M dataset with at least 20 historical candles.');
      return;
    }

    setRunning(true);

    let htfCandles: Candle[] = [];
    const htfDataset = datasets.find((d) => d.id === selected1hId);
    if (htfDataset && htfDataset.candles.length > 0) {
      htfCandles = htfDataset.candles;
    } else {
      htfCandles = buildHigherTimeframe(ltfDataset.candles, '1h', '5m', ltfDataset.market);
    }

    try {
      const res = runBacktest({
        htfCandles,
        ltfCandles: ltfDataset.candles,
        settings: {
          ...settings,
          market: ltfDataset.market,
          defaultExchange: ltfDataset.exchange,
        },
      });
      setResult(res);
    } catch (err) {
      alert(`Backtest error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const sym = settings.currency === 'INR' ? '₹' : '$';

  return (
    <div className="space-y-4 text-xs font-mono">
      {/* Config Section */}
      <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700 space-y-2">
        <div className="font-bold text-gray-200 flex items-center gap-1.5 font-sans">
          <Layers className="w-4 h-4 text-accent-blue" />
          <span>SMC Strategy Backtest (60/20/20 Chronological Split)</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">5M Dataset</label>
            <select
              value={selected5mId}
              onChange={(e) => setSelected5mId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
            >
              <option value="">-- Choose 5M Data --</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.symbol} ({d.timeframe}) - {d.totalCandles}c
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">1H Dataset (Bias)</label>
            <select
              value={selected1hId}
              onChange={(e) => setSelected1hId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
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
          onClick={handleRunBacktest}
          disabled={!selected5mId || running}
          className="w-full flex items-center justify-center gap-2 py-2 bg-accent-green hover:bg-accent-green/80 disabled:opacity-40 text-gray-900 font-bold rounded transition-colors mt-2"
        >
          <Play className="w-4 h-4" />
          <span>{running ? 'Running Walk-Forward Simulation...' : 'Run SMC Strategy Backtest'}</span>
        </button>
      </div>

      {/* Results View */}
      {result && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Total Trades</span>
              <span className="text-base font-bold text-gray-200">{result.tradesTaken}</span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Win Rate</span>
              <span className="text-base font-bold text-accent-green">
                {result.winRate.toFixed(1)}%
              </span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Net P&L</span>
              <span
                className={`text-base font-bold ${
                  result.netPnl >= 0 ? 'text-accent-green' : 'text-accent-red'
                }`}
              >
                {result.netPnl >= 0 ? '+' : ''}{sym}{result.netPnl.toFixed(2)}
              </span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Profit Factor</span>
              <span className="text-base font-bold text-gray-200">
                {result.profitFactor.toFixed(2)}
              </span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Expectancy</span>
              <span className="text-base font-bold text-gray-200">
                {result.expectancy.toFixed(2)}
              </span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Max Drawdown</span>
              <span className="text-base font-bold text-accent-red">
                {result.maxDrawdown.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Chronological Split Breakdown */}
          <div className="bg-gray-900 p-3 rounded-lg border border-gray-800 space-y-2">
            <div className="text-gray-300 font-bold text-[11px] pb-1 border-b border-gray-800 flex items-center gap-1.5 font-sans">
              <Award className="w-3.5 h-3.5 text-accent-yellow" />
              <span>CHRONOLOGICAL SPLIT VALIDATION</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="p-2 bg-gray-800/50 rounded border border-gray-700/60">
                <div className="text-gray-400 font-bold mb-1">Development (60%)</div>
                <div>Trades: {result.developmentStats?.tradesTaken ?? 0}</div>
                <div>Win Rate: {(result.developmentStats?.winRate ?? 0).toFixed(1)}%</div>
                <div>PnL: {sym}{(result.developmentStats?.netPnl ?? 0).toFixed(2)}</div>
              </div>

              <div className="p-2 bg-gray-800/50 rounded border border-gray-700/60">
                <div className="text-gray-400 font-bold mb-1">Validation (20%)</div>
                <div>Trades: {result.validationStats?.tradesTaken ?? 0}</div>
                <div>Win Rate: {(result.validationStats?.winRate ?? 0).toFixed(1)}%</div>
                <div>PnL: {sym}{(result.validationStats?.netPnl ?? 0).toFixed(2)}</div>
              </div>

              <div className="p-2 bg-gray-800/50 rounded border border-green-800/60">
                <div className="text-accent-green font-bold mb-1">Out-Of-Sample (20%)</div>
                <div>Trades: {result.oosStats?.tradesTaken ?? 0}</div>
                <div>Win Rate: {(result.oosStats?.winRate ?? 0).toFixed(1)}%</div>
                <div>PnL: {sym}{(result.oosStats?.netPnl ?? 0).toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Equity Curve Chart */}
          {result.equityCurve.length > 0 && (
            <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
              <span className="text-gray-400 font-bold text-[11px] block mb-2 font-sans">
                SIMULATED EQUITY CURVE
              </span>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                    <XAxis dataKey="index" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="equity"
                      stroke="#00d4aa"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Simulated Trades Table */}
          {result.trades.length > 0 && (
            <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
              <div className="text-gray-300 font-bold text-[11px] mb-2 font-sans">
                SIMULATED TRADES ({result.trades.length})
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {result.trades.map((t, idx) => (
                  <div
                    key={idx}
                    className="p-1.5 bg-gray-800/50 rounded flex justify-between items-center text-[10px]"
                  >
                    <div>
                      <span className="font-bold text-gray-300 mr-2">#{idx + 1}</span>
                      <span className="text-gray-400 mr-2">Entry: {t.entryPrice.toFixed(2)}</span>
                      <span className="text-gray-400 mr-2">Exit: {t.exitPrice.toFixed(2)}</span>
                      <span className="text-gray-500">[{t.exitReason}]</span>
                    </div>
                    <span className={t.pnl >= 0 ? 'text-accent-green font-bold' : 'text-accent-red font-bold'}>
                      {t.pnl >= 0 ? '+' : ''}{sym}{t.pnl.toFixed(2)} ({t.rMultiple.toFixed(1)}R)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

