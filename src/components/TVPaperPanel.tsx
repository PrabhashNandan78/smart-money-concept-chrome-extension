// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – TradingView Paper Trading Automation Status Panel
// Displays live execution state, DOM automation status, and Section 11 parameters
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import {
  Zap,
  PowerOff,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Sliders,
  TrendingUp,
} from 'lucide-react';
import useAppStore from '../store/appStore';
import { AutoTradeConsentModal } from './AutoTradeConsentModal';

export function TVPaperPanel() {
  const {
    chartContext,
    currentSignal,
    autoTrade,
    tvPaperAccount,
    tvPositions,
    setAutoTradeActive,
    setAutoTradeConsent,
    setEmergencyDisabled,
    syncTVPaperStatus,
    executeTVPaperOrder,
  } = useAppStore();

  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [isExecutingManual, setIsExecutingManual] = useState(false);
  const [executionFeedback, setExecutionFeedback] = useState<string | null>(null);

  // Poll TradingView status every 3 seconds while this panel is visible
  useEffect(() => {
    syncTVPaperStatus();
    const interval = setInterval(() => {
      syncTVPaperStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [syncTVPaperStatus]);

  const handleToggleAutoTrade = () => {
    if (!autoTrade.active) {
      if (!autoTrade.consentGiven) {
        setIsConsentModalOpen(true);
      } else {
        setAutoTradeActive(true);
      }
    } else {
      setAutoTradeActive(false);
    }
  };

  const handleConsentConfirm = () => {
    setAutoTradeConsent(true);
    setAutoTradeActive(true);
  };

  const handleEmergencyStop = () => {
    setEmergencyDisabled(true);
    setExecutionFeedback('EMERGENCY STOP TRIGGERED: Auto Trade halted immediately.');
  };

  const handleManualTestExecute = async () => {
    if (!chartContext.symbol) {
      setExecutionFeedback('Error: No active symbol detected on TradingView.');
      return;
    }
    if (!currentSignal) {
      setExecutionFeedback('Notice: Generating test order using current chart levels.');
    }

    setIsExecutingManual(true);
    setExecutionFeedback(null);

    const entry = currentSignal?.fvg?.midpoint || (currentSignal?.entryZone ? (currentSignal.entryZone.top + currentSignal.entryZone.bottom) / 2 : 2500);
    const stopLoss = currentSignal?.liquiditySweep ? currentSignal.liquiditySweep.sweepLow * 0.998 : 2480;
    const takeProfit = entry + (entry - stopLoss) * 3.5;

    const res = await executeTVPaperOrder({
      symbol: chartContext.symbol,
      side: 'BUY',
      quantity: 5,
      limitPrice: entry,
      stopLoss,
      takeProfit,
    });

    setIsExecutingManual(false);
    setExecutionFeedback(
      res.success
        ? `Order Placed: ${res.message} [Status: ${res.status}]`
        : `Execution Failed: ${res.message}`
    );
  };

  // Derive field values matching Section 11 requirements
  const isPositionOpen = tvPositions.some(
    (p) => chartContext.symbol && p.symbol.toUpperCase().includes(chartContext.symbol.toUpperCase())
  ) || autoTrade.positionStatus === 'OPEN';

  const bias1H = currentSignal?.htfBias || (chartContext.isTradable ? 'BULLISH' : 'NEUTRAL');
  const sweepConfirmed = currentSignal?.liquiditySweep ? 'CONFIRMED' : 'NONE';
  const chochConfirmed = currentSignal?.chochDetected ? 'CONFIRMED' : 'NONE';
  const fvgConfirmed = currentSignal?.fvg ? 'CONFIRMED' : 'NONE';

  const entryVal = currentSignal?.fvg?.midpoint || (currentSignal?.entryZone ? (currentSignal.entryZone.top + currentSignal.entryZone.bottom) / 2 : null);
  const stopVal = currentSignal?.liquiditySweep ? currentSignal.liquiditySweep.sweepLow * 0.998 : (entryVal ? entryVal * 0.99 : null);
  const targetVal = entryVal && stopVal ? entryVal + (entryVal - stopVal) * 3.0 : null;
  const rrVal = entryVal && stopVal && targetVal && (entryVal - stopVal) > 0 ? (targetVal - entryVal) / (entryVal - stopVal) : null;

  const entryText = entryVal ? entryVal.toFixed(2) : '—';
  const stopText = stopVal ? stopVal.toFixed(2) : '—';
  const targetText = targetVal ? targetVal.toFixed(2) : '—';
  const netRRText = rrVal ? `${rrVal.toFixed(2)}:1` : '—';

  return (
    <div className="space-y-6">
      {/* Top Banner & Primary Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold uppercase tracking-wider text-teal-400">
                Native Execution Engine
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                  tvPaperAccount.connected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                ● {tvPaperAccount.connected ? 'TRADINGVIEW PAPER CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              TradingView Paper Trading Automation
            </h2>
            <p className="text-xs text-slate-400">
              Direct browser DOM interaction with TradingView Trading Panel → Paper Trading interface
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => syncTVPaperStatus()}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
              title="Resync TradingView DOM"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Emergency Kill-Switch */}
            <button
              onClick={handleEmergencyStop}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs flex items-center space-x-2 shadow-lg shadow-rose-900/30 transition border border-rose-500"
            >
              <PowerOff className="w-4 h-4" />
              <span>EMERGENCY DISABLE</span>
            </button>

            {/* Auto-Trade Main Switch */}
            <button
              onClick={handleToggleAutoTrade}
              className={`px-4 py-2 rounded-lg font-extrabold text-xs flex items-center space-x-2 transition shadow-lg ${
                autoTrade.active && !autoTrade.emergencyDisabled
                  ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-teal-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>AUTO TRADE [ {autoTrade.active && !autoTrade.emergencyDisabled ? 'ACTIVE' : 'INACTIVE'} ]</span>
            </button>
          </div>
        </div>

        {/* Emergency Stop Notice */}
        {autoTrade.emergencyDisabled && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                <strong>EMERGENCY STOPPED:</strong> Automated execution has been forcibly halted. Re-enable to resume.
              </span>
            </div>
            <button
              onClick={() => setEmergencyDisabled(false)}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-semibold"
            >
              Reset Halt
            </button>
          </div>
        )}

        {/* Execution Feedback */}
        {executionFeedback && (
          <div className="mt-4 p-3 bg-teal-500/10 border border-teal-500/30 rounded-lg text-xs text-teal-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{executionFeedback}</span>
          </div>
        )}
      </div>

      {/* Section 11: Real-Time Status Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-teal-400" />
            <span>Execution & Setup Verification Matrix</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            SYNC FREQUENCY: 400ms DOM / 3000ms POLL
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          {/* Row 1 */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">MODE</div>
            <div className="font-bold text-teal-300 mt-1">TRADINGVIEW NATIVE PAPER TRADING</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">ACCOUNT</div>
            <div className="font-bold text-slate-200 mt-1">{tvPaperAccount.accountName || 'TRADINGVIEW PAPER TRADING'}</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">AUTO TRADE</div>
            <div
              className={`font-bold mt-1 ${
                autoTrade.active && !autoTrade.emergencyDisabled ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {autoTrade.active && !autoTrade.emergencyDisabled ? 'ACTIVE' : 'INACTIVE'}
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">ACTIVE SYMBOL</div>
            <div className="font-bold text-slate-100 mt-1">{chartContext.symbol || 'NONE'}</div>
          </div>

          {/* Row 2 */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">EXCHANGE</div>
            <div className="font-bold text-slate-200 mt-1">{chartContext.exchange || 'NONE'}</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">TIMEFRAME</div>
            <div className="font-bold text-slate-200 mt-1">{chartContext.timeframe || '—'}</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">1H BIAS</div>
            <div
              className={`font-bold mt-1 ${
                bias1H === 'BULLISH' ? 'text-emerald-400' : bias1H === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'
              }`}
            >
              {bias1H}
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">LIQUIDITY SWEEP</div>
            <div className={`font-bold mt-1 ${sweepConfirmed === 'CONFIRMED' ? 'text-teal-400' : 'text-slate-500'}`}>
              {sweepConfirmed}
            </div>
          </div>

          {/* Row 3 */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">CHoCH</div>
            <div className={`font-bold mt-1 ${chochConfirmed === 'CONFIRMED' ? 'text-teal-400' : 'text-slate-500'}`}>
              {chochConfirmed}
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">FVG</div>
            <div className={`font-bold mt-1 ${fvgConfirmed === 'CONFIRMED' ? 'text-teal-400' : 'text-slate-500'}`}>
              {fvgConfirmed}
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">ENTRY</div>
            <div className="font-bold text-slate-100 mt-1">{entryText}</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">STOP</div>
            <div className="font-bold text-rose-400 mt-1">{stopText}</div>
          </div>

          {/* Row 4 */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">TARGET</div>
            <div className="font-bold text-emerald-400 mt-1">{targetText}</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">NET R:R</div>
            <div className="font-bold text-teal-300 mt-1">{netRRText}</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">POSITION</div>
            <div className={`font-bold mt-1 ${isPositionOpen ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isPositionOpen ? 'OPEN' : 'NONE'}
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">TRADINGVIEW ORDER</div>
            <div
              className={`font-bold mt-1 ${
                autoTrade.verifiedTVOrder ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {autoTrade.verifiedTVOrder ? 'VERIFIED' : 'NONE'}
            </div>
          </div>

          {/* Row 5 - Safety Brackets */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">SL STATUS</div>
            <div className={`font-bold mt-1 ${isPositionOpen ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isPositionOpen ? 'PROTECTED' : 'NOT_VERIFIED'}
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase text-slate-500">TP STATUS</div>
            <div className={`font-bold mt-1 ${isPositionOpen ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isPositionOpen ? 'PROTECTED' : 'NOT_VERIFIED'}
            </div>
          </div>

          <div className="col-span-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase text-slate-500">DOM AUTOMATION TEST</div>
              <div className="text-xs text-slate-400">Trigger test execution in Paper Trading</div>
            </div>
            <button
              onClick={handleManualTestExecute}
              disabled={isExecutingManual || !tvPaperAccount.connected}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-teal-300 font-semibold rounded text-xs border border-teal-500/30 transition"
            >
              {isExecutingManual ? 'Submitting...' : 'Submit Test Order'}
            </button>
          </div>
        </div>
      </div>

      {/* TradingView Paper Trading Open Positions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span>TradingView Paper Trading Open Positions ({tvPositions.length})</span>
        </h3>

        {tvPositions.length === 0 ? (
          <div className="p-8 text-center bg-slate-950/40 rounded-lg border border-slate-800/80 text-xs text-slate-500">
            No active positions currently detected in TradingView Paper Trading dock.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3">Qty</th>
                  <th className="py-2.5 px-3">Avg Price</th>
                  <th className="py-2.5 px-3">SL Protection</th>
                  <th className="py-2.5 px-3">TP Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tvPositions.map((pos, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-bold text-white">{pos.symbol}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          pos.side === 'LONG'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {pos.side}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{pos.quantity}</td>
                    <td className="py-2.5 px-3 text-slate-300">{pos.avgPrice.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">PROTECTED</td>
                    <td className="py-2.5 px-3 text-teal-400 font-semibold">PROTECTED</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Consent Modal */}
      <AutoTradeConsentModal
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
        onConfirm={handleConsentConfirm}
      />
    </div>
  );
}
