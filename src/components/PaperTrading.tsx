// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Paper Trading Terminal
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Play, Pause, FastForward, AlertCircle, CheckCircle2, XCircle, DollarSign, RefreshCw, Monitor, Activity } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { Trade, Candle } from '../types';
import { db } from '../db';
import { TVPaperPanel } from './TVPaperPanel';

export function PaperTrading() {
  const { trades, updateTrade, datasets, settings } = useAppStore();
  const [subTab, setSubTab] = useState<'NATIVE_TV' | 'LOCAL_REPLAY'>('NATIVE_TV');

  const paperTrades = trades.filter((t) => t.tradeType === 'PAPER' || t.tradeType === 'TV_NATIVE_PAPER');
  const openPaperTrades = paperTrades.filter((t) => t.status === 'OPEN' || t.status === 'WAITING_ENTRY');
  const closedPaperTrades = paperTrades.filter((t) => t.status !== 'OPEN' && t.status !== 'WAITING_ENTRY');

  // Manual price update state
  const [manualPrice, setManualPrice] = useState<string>('');

  // Historical replay state
  const [replayDatasetId, setReplayDatasetId] = useState<string>('');
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [isReplaying, setIsReplaying] = useState(false);

  const selectedDataset = datasets.find((d) => d.id === replayDatasetId);

  // Manual price evaluation
  const handleApplyManualPrice = async () => {
    const price = parseFloat(manualPrice);
    if (isNaN(price) || price <= 0) return;

    for (const trade of openPaperTrades) {
      if (price >= trade.takeProfit) {
        // TP Hit
        const grossPnl = trade.quantity * (trade.takeProfit - trade.plannedEntry);
        const netPnl = grossPnl - trade.estimatedCosts;
        const rMultiple = (trade.takeProfit - trade.plannedEntry) / Math.abs(trade.plannedEntry - trade.stopLoss);

        const updates: Partial<Trade> = {
          status: 'TAKE_PROFIT_HIT',
          actualExit: trade.takeProfit,
          exitAt: Date.now(),
          grossPnl,
          actualCosts: trade.estimatedCosts,
          netPnl,
          rMultiple,
          exitReasoning: `Take profit hit at simulated price ${price}`,
        };
        await db.updateTrade(trade.id, updates);
        updateTrade(trade.id, updates);
      } else if (price <= trade.stopLoss) {
        // SL Hit
        const grossPnl = -trade.quantity * Math.abs(trade.plannedEntry - trade.stopLoss);
        const netPnl = grossPnl - trade.estimatedCosts;

        const updates: Partial<Trade> = {
          status: 'STOP_LOSS_HIT',
          actualExit: trade.stopLoss,
          exitAt: Date.now(),
          grossPnl,
          actualCosts: trade.estimatedCosts,
          netPnl,
          rMultiple: -1.0,
          exitReasoning: `Stop loss hit at simulated price ${price}`,
        };
        await db.updateTrade(trade.id, updates);
        updateTrade(trade.id, updates);
      }
    }

    setManualPrice('');
  };

  // Step candle replay forward
  const handleStepReplay = async () => {
    if (!selectedDataset || replayIndex >= selectedDataset.candles.length) return;

    const candle = selectedDataset.candles[replayIndex];
    setReplayIndex((prev) => prev + 1);

    for (const trade of openPaperTrades) {
      // Conservative rule: Check SL before TP if candle touches both
      const slHit = candle.low <= trade.stopLoss;
      const tpHit = candle.high >= trade.takeProfit;

      if (slHit) {
        const grossPnl = -trade.quantity * Math.abs(trade.plannedEntry - trade.stopLoss);
        const netPnl = grossPnl - trade.estimatedCosts;
        const updates: Partial<Trade> = {
          status: 'STOP_LOSS_HIT',
          actualExit: trade.stopLoss,
          exitAt: candle.timestamp,
          grossPnl,
          netPnl,
          rMultiple: -1.0,
          exitReasoning: `Stop loss touched in candle (conservative execution rule applied)`,
        };
        await db.updateTrade(trade.id, updates);
        updateTrade(trade.id, updates);
      } else if (tpHit) {
        const grossPnl = trade.quantity * (trade.takeProfit - trade.plannedEntry);
        const netPnl = grossPnl - trade.estimatedCosts;
        const rMultiple = (trade.takeProfit - trade.plannedEntry) / Math.abs(trade.plannedEntry - trade.stopLoss);
        const updates: Partial<Trade> = {
          status: 'TAKE_PROFIT_HIT',
          actualExit: trade.takeProfit,
          exitAt: candle.timestamp,
          grossPnl,
          netPnl,
          rMultiple,
          exitReasoning: `Take profit hit in candle`,
        };
        await db.updateTrade(trade.id, updates);
        updateTrade(trade.id, updates);
      }
    }
  };

  const handleCloseManually = async (trade: Trade) => {
    const exitPrice = prompt('Enter manual exit price:', String(trade.plannedEntry));
    if (!exitPrice) return;
    const px = parseFloat(exitPrice);
    if (isNaN(px)) return;

    const grossPnl = trade.quantity * (px - trade.plannedEntry);
    const netPnl = grossPnl - trade.estimatedCosts;
    const rMultiple = (px - trade.plannedEntry) / Math.abs(trade.plannedEntry - trade.stopLoss);

    const updates: Partial<Trade> = {
      status: 'CLOSED_MANUALLY',
      actualExit: px,
      exitAt: Date.now(),
      grossPnl,
      netPnl,
      rMultiple,
      exitReasoning: 'Trader closed paper position manually',
    };
    await db.updateTrade(trade.id, updates);
    updateTrade(trade.id, updates);
  };

  const sym = settings.currency === 'INR' ? '₹' : '$';

  return (
    <div className="space-y-4 text-xs font-mono">
      {/* Subtab Navigation */}
      <div className="flex border-b border-slate-800 pb-2 space-x-2">
        <button
          onClick={() => setSubTab('NATIVE_TV')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-bold text-xs transition ${
            subTab === 'NATIVE_TV'
              ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>TradingView Native Paper Trading</span>
        </button>
        <button
          onClick={() => setSubTab('LOCAL_REPLAY')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-bold text-xs transition ${
            subTab === 'LOCAL_REPLAY'
              ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Local Candle Simulation & Replay</span>
        </button>
      </div>

      {subTab === 'NATIVE_TV' ? (
        <TVPaperPanel />
      ) : (
        <>
          {/* Price Monitor Status Bar */}
          <div className="p-3 bg-gray-900 rounded-lg border border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-yellow" />
            <span className="font-bold text-gray-200">PRICE MONITOR: MANUAL / REPLAY</span>
          </div>
          <span className="text-[10px] text-gray-500 font-sans">No external API feeds used</span>
        </div>
        <p className="text-[11px] text-gray-400 font-sans leading-relaxed">
          Trading terminal works purely locally. Enter live/chart prices manually or replay historical CSV candles to simulate TP/SL exits.
        </p>
      </div>

      {/* Manual Price Input */}
      <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700 flex gap-2 items-center">
        <input
          type="number"
          placeholder="Enter current price to test SL/TP..."
          value={manualPrice}
          onChange={(e) => setManualPrice(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-gray-200"
        />
        <button
          onClick={handleApplyManualPrice}
          disabled={!manualPrice}
          className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 text-white font-bold rounded"
        >
          Update Price
        </button>
      </div>

      {/* Historical Candle Replay Controller */}
      <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700 space-y-2">
        <div className="font-bold text-gray-300">HISTORICAL CANDLE REPLAY</div>
        <div className="flex gap-2">
          <select
            value={replayDatasetId}
            onChange={(e) => {
              setReplayDatasetId(e.target.value);
              setReplayIndex(0);
            }}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
          >
            <option value="">-- Select Dataset for Replay --</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.symbol} ({d.timeframe}) - {d.totalCandles} candles
              </option>
            ))}
          </select>
          <button
            onClick={handleStepReplay}
            disabled={!selectedDataset}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 font-bold rounded flex items-center gap-1"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>Step Candle</span>
          </button>
        </div>
        {selectedDataset && (
          <div className="text-[10px] text-gray-500">
            Replaying candle {replayIndex} of {selectedDataset.candles.length}
          </div>
        )}
      </div>

      {/* Conservative Execution Notice */}
      <div className="p-2.5 bg-yellow-950/20 border border-yellow-800/40 rounded text-yellow-400 text-[10px] font-sans">
        <strong>Conservative Execution Assumption:</strong> When historical candle data shows both TP and SL touched within the same candle, the simulation always records a stop-loss first to avoid optimistic over-reporting.
      </div>

      {/* Open Paper Positions */}
      <div>
        <div className="font-bold text-gray-300 pb-2 flex justify-between items-center">
          <span>OPEN PAPER POSITIONS ({openPaperTrades.length})</span>
        </div>

        {openPaperTrades.length === 0 ? (
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 text-center text-gray-500">
            No active paper trades. Prepare and simulate a trade in Trade Setup.
          </div>
        ) : (
          <div className="space-y-2">
            {openPaperTrades.map((t) => (
              <div
                key={t.id}
                className="p-3 bg-gray-900 rounded-lg border border-gray-800 space-y-2"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-accent-green">{t.symbol}</span>
                    <span className="bg-gray-800 px-1.5 py-0.5 rounded text-[10px] text-gray-300">
                      {t.direction}
                    </span>
                    <span className="text-gray-500 text-[10px]">{t.market}</span>
                  </div>
                  <button
                    onClick={() => handleCloseManually(t)}
                    className="px-2 py-0.5 bg-red-900/60 hover:bg-red-800 text-red-300 rounded text-[10px]"
                  >
                    Close Manually
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2 text-[10px] text-gray-400 pt-1 border-t border-gray-800/60">
                  <div>
                    <span className="text-gray-600 block">Entry</span>
                    <span className="text-gray-200">{sym}{t.plannedEntry.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Stop Loss</span>
                    <span className="text-accent-red">{sym}{t.stopLoss.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Take Profit</span>
                    <span className="text-accent-green">{sym}{t.takeProfit.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Quantity</span>
                    <span className="text-gray-200">{t.quantity}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Closed Paper Trades History */}
      {closedPaperTrades.length > 0 && (
        <div className="pt-2">
          <div className="font-bold text-gray-300 pb-2">
            CLOSED PAPER TRADES ({closedPaperTrades.length})
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {closedPaperTrades.map((t) => (
              <div
                key={t.id}
                className="p-2 bg-gray-800/40 rounded border border-gray-700/60 flex justify-between items-center text-[10px]"
              >
                <div>
                  <span className="font-bold text-gray-200 mr-2">{t.symbol}</span>
                  <span className={t.status === 'TAKE_PROFIT_HIT' ? 'text-accent-green' : 'text-accent-red'}>
                    {t.status}
                  </span>
                </div>
                <div className="font-bold">
                  {t.netPnl !== null ? (
                    <span className={t.netPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                      {t.netPnl >= 0 ? '+' : ''}{sym}{t.netPnl.toFixed(2)} ({t.rMultiple?.toFixed(1)}R)
                    </span>
                  ) : (
                    'N/A'
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

