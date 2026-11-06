// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Trade Journal
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Download, Upload, Filter, Trash2, Edit3, CheckCircle2, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { Market, Trade, TradeType, TradeStatus } from '../types';
import { db } from '../db';

export function TradeJournal() {
  const { trades, removeTrade, updateTrade, settings } = useAppStore();

  // Filters
  const [filterMarket, setFilterMarket] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterSymbol, setFilterSymbol] = useState<string>('');
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);

  // Filtered trades
  const filteredTrades = trades.filter((t) => {
    if (filterMarket !== 'ALL' && t.market !== filterMarket) return false;
    if (filterType !== 'ALL' && t.tradeType !== filterType) return false;
    if (filterSymbol && !t.symbol.toLowerCase().includes(filterSymbol.toLowerCase())) return false;
    return true;
  });

  const handleDeleteTrade = async (id: string) => {
    if (confirm('Delete this trade record from journal?')) {
      await db.deleteTrade(id);
      removeTrade(id);
    }
  };

  const handleUpdateReview = async (id: string, updates: Partial<Trade>) => {
    await db.updateTrade(id, updates);
    updateTrade(id, updates);
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Date', 'Symbol', 'Market', 'Type', 'Direction', 'Entry', 'Exit', 'Net PnL', 'R-Multiple', 'Status', 'Compliant', 'Mistakes'];
    const rows = trades.map((t) => [
      t.id,
      new Date(t.createdAt).toISOString(),
      t.symbol,
      t.market,
      t.tradeType,
      t.direction,
      t.actualEntry ?? t.plannedEntry,
      t.actualExit ?? '',
      t.netPnl ?? '',
      t.rMultiple ?? '',
      t.status,
      t.ruleCompliant ? 'YES' : 'NO',
      `"${(t.mistakes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smc_trading_journal_${Date.now()}.csv`;
    a.click();
  };

  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(trades, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smc_trading_journal_backup_${Date.now()}.json`;
    a.click();
  };

  const sym = settings.currency === 'INR' ? '₹' : '$';

  return (
    <div className="space-y-4 text-xs font-mono">
      {/* Action Header */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-800">
        <span className="font-bold text-gray-200">TRADE JOURNAL ({trades.length})</span>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 text-[10px]"
          >
            <Download className="w-3 h-3" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 text-[10px]"
          >
            <Download className="w-3 h-3" />
            <span>Backup JSON</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-3 gap-2 bg-gray-800/40 p-2.5 rounded-lg border border-gray-700">
        <div>
          <label className="text-[10px] text-gray-500 block">Market</label>
          <select
            value={filterMarket}
            onChange={(e) => setFilterMarket(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 text-[11px]"
          >
            <option value="ALL">All Markets</option>
            <option value="INDIA">India</option>
            <option value="US">US</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 block">Type</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 text-[11px]"
          >
            <option value="ALL">All Types</option>
            <option value="PAPER">Paper</option>
            <option value="MANUAL_LIVE">Manual Live</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 block">Symbol Search</label>
          <input
            type="text"
            placeholder="e.g. RELIANCE"
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 text-[11px]"
          />
        </div>
      </div>

      {/* Trades List */}
      {filteredTrades.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-gray-900 rounded-lg border border-gray-800">
          No trade records match current filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTrades.map((t) => {
            const isExpanded = expandedTradeId === t.id;
            const isWin = (t.netPnl || 0) > 0;
            const isLoss = (t.netPnl || 0) < 0;

            return (
              <div
                key={t.id}
                className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden"
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedTradeId(isExpanded ? null : t.id)}
                  className="p-3 cursor-pointer hover:bg-gray-800/40 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-200">{t.symbol}</span>
                    <span className="text-[10px] text-gray-500">{t.market}</span>
                    <span className="bg-gray-800 px-1.5 py-0.5 rounded text-[10px] text-teal-400 font-semibold border border-gray-700">
                      {t.tradeType === 'TV_NATIVE_PAPER' ? 'TV Native Paper' : t.tradeType}
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        t.status === 'TAKE_PROFIT_HIT'
                          ? 'text-accent-green'
                          : t.status === 'STOP_LOSS_HIT'
                            ? 'text-accent-red'
                            : 'text-gray-400'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div
                        className={`font-bold ${
                          isWin ? 'text-accent-green' : isLoss ? 'text-accent-red' : 'text-gray-400'
                        }`}
                      >
                        {t.netPnl !== null
                          ? `${t.netPnl >= 0 ? '+' : ''}${sym}${t.netPnl.toFixed(2)}`
                          : 'OPEN'}
                      </div>
                      {t.rMultiple !== null && (
                        <div className="text-[10px] text-gray-500">{t.rMultiple.toFixed(2)}R</div>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-3 pt-0 border-t border-gray-800/60 bg-gray-950/40 space-y-3 font-sans text-xs">
                    {/* Trade Levels */}
                    <div className="grid grid-cols-4 gap-2 font-mono text-[11px] pt-3">
                      <div>
                        <span className="text-gray-500 block">Entry</span>
                        <span className="text-gray-200 font-bold">{sym}{t.actualEntry ?? t.plannedEntry}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Stop Loss</span>
                        <span className="text-accent-red font-bold">{sym}{t.stopLoss}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Take Profit</span>
                        <span className="text-accent-green font-bold">{sym}{t.takeProfit}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Exit</span>
                        <span className="text-gray-200 font-bold">{t.actualExit ? `${sym}${t.actualExit}` : 'OPEN'}</span>
                      </div>
                    </div>

                    {/* SMC Signature */}
                    <div className="p-2.5 bg-gray-900 rounded border border-gray-800 font-mono text-[10px] space-y-1">
                      <div className="text-gray-400 font-bold mb-1">SMC SETUP SPECIFICATION</div>
                      <div className="text-gray-500">1H Bias: <span className="text-gray-300">{t.htfBias}</span></div>
                      <div className="text-gray-500">Liquidity Sweep: <span className="text-gray-300">{t.liquiditySweepDetected ? 'CONFIRMED' : 'NO'}</span></div>
                      <div className="text-gray-500">BOS / CHoCH: <span className="text-gray-300">{t.bosDetected ? 'BOS' : t.chochDetected ? 'CHoCH' : 'NONE'}</span></div>
                      <div className="text-gray-500">Fair Value Gap: <span className="text-gray-300">{t.fvgDetected ? 'DETECTED' : 'NONE'}</span></div>
                    </div>

                    {/* Review Notes Form */}
                    <div className="space-y-2">
                      <div>
                        <label className="text-gray-400 text-[10px] block mb-0.5">Entry Reasoning</label>
                        <input
                          type="text"
                          defaultValue={t.entryReasoning}
                          onBlur={(e) => handleUpdateReview(t.id, { entryReasoning: e.target.value })}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-gray-400 text-[10px] block mb-0.5">Mistakes & Rule Execution</label>
                        <input
                          type="text"
                          defaultValue={t.mistakes}
                          placeholder="e.g. Followed all rules / Slipped entry"
                          onBlur={(e) => handleUpdateReview(t.id, { mistakes: e.target.value })}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-gray-400 text-[10px] block mb-0.5">Lessons Learned</label>
                        <input
                          type="text"
                          defaultValue={t.lessonsLearned}
                          placeholder="e.g. Wait for candle close before entering"
                          onBlur={(e) => handleUpdateReview(t.id, { lessonsLearned: e.target.value })}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
                        />
                      </div>

                      <div className="flex justify-between items-center pt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            defaultChecked={t.ruleCompliant}
                            onChange={(e) => handleUpdateReview(t.id, { ruleCompliant: e.target.checked })}
                            className="rounded bg-gray-900 border-gray-700"
                          />
                          <span className="text-[11px] text-gray-300 font-medium">100% Rule Compliant</span>
                        </label>

                        <button
                          onClick={() => handleDeleteTrade(t.id)}
                          className="flex items-center gap-1 text-red-400 hover:text-red-300 text-[11px]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Trade</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

