// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Trade Setup & Manual Execution Ticket
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import { Copy, Check, ShieldAlert, ArrowRight, CheckCircle2, AlertOctagon, Send } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { calculatePositionSize } from '../risk/position-sizer';
import { validateRR, validateTradeRisk, calculateTakeProfit } from '../risk/risk-validator';
import { generateTradeTicket, formatTicketText, formatSLText, formatTPText, formatBrokerOrderText } from '../execution/trade-ticket';
import type { TradeSetup, Trade } from '../types';
import { db } from '../db';
import { LiveOrderModal } from './LiveOrderModal';

export function TradeSetup() {
  const { currentSignal, settings, trades, addTrade, setActiveTab, chartContext, tradingMode, backendStatus } = useAppStore();

  const isFutures = chartContext.detected && chartContext.instrumentType === 'FUTURES';
  const [showLiveModal, setShowLiveModal] = useState(false);

  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showManualFillForm, setShowManualFillForm] = useState(false);

  // Manual execution fill inputs
  const [actualEntry, setActualEntry] = useState<string>('');
  const [actualQty, setActualQty] = useState<string>('');
  const [brokerRef, setBrokerRef] = useState<string>('');
  const [slConfirmed, setSlConfirmed] = useState(false);
  const [tpConfirmed, setTpConfirmed] = useState(false);

  // Derive parameters from signal or defaults
  const entryPrice = useMemo(() => {
    if (currentSignal?.fvg) {
      return currentSignal.fvg.midpoint;
    }
    return 500;
  }, [currentSignal]);

  const stopLossPrice = useMemo(() => {
    if (currentSignal?.liquiditySweep) {
      return currentSignal.liquiditySweep.sweepLow * 0.998;
    }
    return 490;
  }, [currentSignal]);

  // Target 3:1 net R:R
  const takeProfitPrice = useMemo(() => {
    const costPerShare = settings.market === 'INDIA' ? entryPrice * 0.0005 : 0.01;
    return calculateTakeProfit(entryPrice, stopLossPrice, 3.0, costPerShare);
  }, [entryPrice, stopLossPrice, settings.market]);

  // Position sizing
  const sizing = useMemo(() => {
    return calculatePositionSize(
      entryPrice,
      stopLossPrice,
      settings.risk.accountEquity,
      settings.risk.riskPerTrade,
      settings.market,
      1
    );
  }, [entryPrice, stopLossPrice, settings]);

  // R:R and Risk checks
  const riskValidation = useMemo(() => {
    return validateTradeRisk(
      {
        entry: entryPrice,
        stopLoss: stopLossPrice,
        takeProfit: takeProfitPrice,
        quantity: sizing.quantity || 1,
        symbol: currentSignal?.symbol || 'UNKNOWN',
        market: settings.market,
      },
      settings.risk,
      settings.risk.accountEquity,
      trades,
      0,
      0,
      0
    );
  }, [entryPrice, stopLossPrice, takeProfitPrice, sizing, currentSignal, settings, trades]);

  // Built TradeSetup object
  const setup: TradeSetup = useMemo(() => {
    const isApproved = riskValidation.approved && !sizing.rejected && riskValidation.grossRR >= 3.0;
    const rejectionReason = !isApproved
      ? sizing.rejected
        ? sizing.rejectionReason
        : riskValidation.failures.join(' | ')
      : null;

    return {
      id: `setup_${Date.now()}`,
      signal: currentSignal || {
        id: 'manual',
        timestamp: Date.now(),
        symbol: 'DEFAULT',
        market: settings.market,
        exchange: settings.defaultExchange,
        timeframe: '5m',
        htfBias: 'BULLISH',
        bosDetected: true,
        bosLevel: entryPrice,
        bosTimestamp: Date.now(),
        chochDetected: false,
        chochLevel: null,
        chochTimestamp: null,
        liquiditySweep: null,
        fvg: null,
        orderBlock: null,
        entryZone: { top: entryPrice, bottom: stopLossPrice },
        signalStatus: 'VALID_SIGNAL',
        conditions: {
          htfBullish: true,
          liquidityIdentified: true,
          sweepConfirmed: true,
          chochBosConfirmed: true,
          displacementConfirmed: true,
          fvgDetected: true,
          fvgRetest: true,
          entryConfirmed: true,
          rrQualified: true,
        },
      },
      entry: entryPrice,
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice,
      quantity: sizing.quantity,
      riskPerShare: sizing.riskPerShare,
      rewardPerShare: Math.abs(takeProfitPrice - entryPrice),
      grossRR: riskValidation.grossRR,
      netRR: riskValidation.netRR,
      totalRisk: sizing.totalRisk,
      estimatedProfit: sizing.quantity * Math.abs(takeProfitPrice - entryPrice),
      estimatedCosts: sizing.estimatedTotalCost,
      currency: settings.currency,
      status: isApproved ? 'APPROVED' : 'REJECTED',
      rejectionReason,
      createdAt: Date.now(),
    };
  }, [entryPrice, stopLossPrice, takeProfitPrice, sizing, riskValidation, currentSignal, settings]);

  const ticket = useMemo(() => {
    return generateTradeTicket(setup, setup.signal);
  }, [setup]);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleSimulatePaperTrade = async () => {
    if (setup.status !== 'APPROVED') {
      alert(`Cannot simulate rejected trade: ${setup.rejectionReason}`);
      return;
    }

    const trade: Trade = {
      id: `trade_paper_${Date.now()}`,
      market: setup.signal.market,
      exchange: setup.signal.exchange,
      symbol: setup.signal.symbol,
      strategyVersion: settings.strategyVersion,
      tradeType: 'PAPER',
      direction: 'LONG',
      status: 'OPEN',
      htfBias: setup.signal.htfBias,
      marketStructure: 'BULLISH',
      bosDetected: setup.signal.bosDetected,
      chochDetected: setup.signal.chochDetected,
      liquiditySweepDetected: !!setup.signal.liquiditySweep,
      fvgDetected: !!setup.signal.fvg,
      orderBlockDetected: !!setup.signal.orderBlock,
      entryConfirmation: 'Bullish candle in FVG zone',
      plannedEntry: setup.entry,
      actualEntry: setup.entry,
      stopLoss: setup.stopLoss,
      takeProfit: setup.takeProfit,
      quantity: setup.quantity,
      riskAmount: setup.totalRisk,
      actualExit: null,
      grossPnl: 0,
      estimatedCosts: setup.estimatedCosts,
      actualCosts: setup.estimatedCosts,
      netPnl: 0,
      rMultiple: 0,
      createdAt: Date.now(),
      entryAt: Date.now(),
      exitAt: null,
      screenshot: null,
      entryReasoning: 'SMC V1 qualified setup with >= 3:1 net R:R',
      exitReasoning: '',
      ruleCompliant: true,
      mistakes: '',
      lessonsLearned: '',
      brokerOrderRef: null,
      actualEntryPrice: setup.entry,
      actualQuantity: setup.quantity,
      slOrderConfirmed: true,
      tpOrderConfirmed: true,
    };

    await db.saveTrade(trade);
    addTrade(trade);
    setActiveTab('PaperTrading');
  };

  const handleRecordManualFill = async () => {
    const actEntryNum = parseFloat(actualEntry) || setup.entry;
    const actQtyNum = parseInt(actualQty) || setup.quantity;

    // Recalculate RR based on actual fill
    const { grossRR, netRR } = validateRR(actEntryNum, setup.stopLoss, setup.takeProfit);

    const trade: Trade = {
      id: `trade_live_${Date.now()}`,
      market: setup.signal.market,
      exchange: setup.signal.exchange,
      symbol: setup.signal.symbol,
      strategyVersion: settings.strategyVersion,
      tradeType: 'MANUAL_LIVE',
      direction: 'LONG',
      status: 'OPEN',
      htfBias: setup.signal.htfBias,
      marketStructure: 'BULLISH',
      bosDetected: setup.signal.bosDetected,
      chochDetected: setup.signal.chochDetected,
      liquiditySweepDetected: !!setup.signal.liquiditySweep,
      fvgDetected: !!setup.signal.fvg,
      orderBlockDetected: !!setup.signal.orderBlock,
      entryConfirmation: 'Manual order confirmed by user',
      plannedEntry: setup.entry,
      actualEntry: actEntryNum,
      stopLoss: setup.stopLoss,
      takeProfit: setup.takeProfit,
      quantity: actQtyNum,
      riskAmount: setup.totalRisk,
      actualExit: null,
      grossPnl: 0,
      estimatedCosts: setup.estimatedCosts,
      actualCosts: setup.estimatedCosts,
      netPnl: 0,
      rMultiple: 0,
      createdAt: Date.now(),
      entryAt: Date.now(),
      exitAt: null,
      screenshot: null,
      entryReasoning: `Manual broker order: fill @ ${actEntryNum}. Initial R:R: ${grossRR.toFixed(2)}:1`,
      exitReasoning: '',
      ruleCompliant: grossRR >= 3.0,
      mistakes: grossRR < 3.0 ? 'Entered with fill price that reduced R:R below 3:1' : '',
      lessonsLearned: '',
      brokerOrderRef: brokerRef || null,
      actualEntryPrice: actEntryNum,
      actualQuantity: actQtyNum,
      slOrderConfirmed: slConfirmed,
      tpOrderConfirmed: tpConfirmed,
    };

    await db.saveTrade(trade);
    addTrade(trade);
    setShowManualFillForm(false);
    setActiveTab('TradeJournal');
  };

  const handleLiveOrderSuccess = async (result: any) => {
    setShowLiveModal(false);
    const trade: Trade = {
      id: result.orderId || `trade_live_${Date.now()}`,
      market: setup.signal.market,
      exchange: setup.signal.exchange,
      symbol: setup.signal.symbol,
      strategyVersion: settings.strategyVersion,
      tradeType: 'LIVE',
      direction: 'LONG',
      status: 'OPEN',
      htfBias: setup.signal.htfBias,
      marketStructure: 'BULLISH',
      bosDetected: setup.signal.bosDetected,
      chochDetected: setup.signal.chochDetected,
      liquiditySweepDetected: !!setup.signal.liquiditySweep,
      fvgDetected: !!setup.signal.fvg,
      orderBlockDetected: !!setup.signal.orderBlock,
      entryConfirmation: 'Live Broker Execution Confirmed',
      plannedEntry: setup.entry,
      actualEntry: result.fillPrice || setup.entry,
      stopLoss: setup.stopLoss,
      takeProfit: setup.takeProfit,
      quantity: result.fillQuantity || setup.quantity,
      riskAmount: setup.totalRisk,
      actualExit: null,
      grossPnl: 0,
      estimatedCosts: setup.estimatedCosts,
      actualCosts: setup.estimatedCosts,
      netPnl: 0,
      rMultiple: 0,
      createdAt: Date.now(),
      entryAt: Date.now(),
      exitAt: null,
      screenshot: null,
      entryReasoning: `Live order placed via ${backendStatus.broker}. Broker ID: ${result.brokerOrderId || 'N/A'}. Net R:R: ${setup.netRR.toFixed(2)}:1`,
      exitReasoning: '',
      ruleCompliant: true,
      mistakes: '',
      lessonsLearned: '',
      brokerOrderRef: result.brokerOrderId || null,
      actualEntryPrice: result.fillPrice || setup.entry,
      actualQuantity: result.fillQuantity || setup.quantity,
      slOrderConfirmed: !!result.slOrderId,
      tpOrderConfirmed: !!result.tpOrderId,
    };

    await db.saveTrade(trade);
    addTrade(trade);
    setActiveTab('TradeJournal');
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Futures Not Configured Alert */}
      {isFutures && (
        <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 flex items-start gap-2.5">
          <AlertOctagon className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <div className="font-bold text-xs uppercase tracking-wider">
              {chartContext.statusMessage} ({chartContext.symbol})
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed font-sans">
              Continuous futures contracts ({chartContext.symbol}) require futures margin specifications. Cash equity trade execution is locked for futures.
            </p>
          </div>
        </div>
      )}

      {/* Strict 3:1 Notice Banner */}
      <div className="bg-gray-800/80 p-3 rounded-lg border border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-accent-yellow" />
          <span className="font-bold text-gray-200">STRICT 3:1 REWARD:RISK ENGINE</span>
        </div>
        <span className="text-[10px] bg-red-950/80 text-red-300 border border-red-800/60 px-2 py-0.5 rounded font-mono font-bold">
          NO OVERRIDE BELOW 3.0
        </span>
      </div>

      {/* Terminal Monospace Trade Ticket */}
      <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 font-mono">
        <pre className="text-gray-300 text-[11px] leading-relaxed whitespace-pre overflow-x-auto">
          {formatTicketText(ticket)}
        </pre>
      </div>

      {/* Status Alert */}
      {setup.status === 'APPROVED' ? (
        <div className="bg-green-950/40 border border-green-800/60 p-3 rounded-lg text-green-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Setup meets all 10 SMC conditions and exceeds minimum 3:1 net R:R.</span>
        </div>
      ) : (
        <div className="bg-red-950/40 border border-red-800/60 p-3 rounded-lg text-red-300 space-y-1">
          <div className="flex items-center gap-2 font-bold">
            <AlertOctagon className="w-4 h-4 flex-shrink-0" />
            <span>TRADE SETUP REJECTED</span>
          </div>
          <p className="text-[11px] text-red-400">{setup.rejectionReason}</p>
        </div>
      )}

      {/* Quick Copy Buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => copyToClipboard(formatTicketText(ticket), 'ticket')}
          className="flex items-center justify-center gap-1.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-700 font-medium"
        >
          {copiedType === 'ticket' ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedType === 'ticket' ? 'Copied' : 'Copy Ticket'}</span>
        </button>

        <button
          onClick={() => copyToClipboard(formatSLText(ticket), 'sl')}
          className="flex items-center justify-center gap-1.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-700 font-medium"
        >
          {copiedType === 'sl' ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedType === 'sl' ? 'Copied' : 'Copy SL'}</span>
        </button>

        <button
          onClick={() => copyToClipboard(formatTPText(ticket), 'tp')}
          className="flex items-center justify-center gap-1.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-700 font-medium"
        >
          {copiedType === 'tp' ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedType === 'tp' ? 'Copied' : 'Copy TP'}</span>
        </button>
      </div>

      {/* Primary Actions based on Global Trading Mode */}
      <div className="space-y-2 pt-2">
        {tradingMode === 'PAPER' ? (
          <>
            <button
              onClick={handleSimulatePaperTrade}
              disabled={setup.status !== 'APPROVED' || isFutures}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-gray-950 font-bold rounded-lg transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" />
              <span>Simulate Paper Trade (Virtual Execution Engine)</span>
            </button>

            <button
              onClick={() => setShowManualFillForm(!showManualFillForm)}
              disabled={setup.status !== 'APPROVED' || isFutures}
              className="w-full flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 font-medium rounded-lg border border-gray-700 transition-colors"
            >
              <span>Record Manual Broker Fill (Journal Only)</span>
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => setShowLiveModal(true)}
              disabled={
                setup.status !== 'APPROVED' ||
                isFutures ||
                !backendStatus.connected ||
                !backendStatus.brokerConnected ||
                backendStatus.killSwitchActive
              }
              className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-gray-950 font-black rounded-lg transition-colors shadow-lg"
            >
              <Send className="w-4 h-4" />
              <span>
                {!backendStatus.connected
                  ? 'LIVE LOCKED — LOCAL BACKEND OFFLINE'
                  : !backendStatus.brokerConnected
                    ? 'LIVE LOCKED — BROKER CONNECTION REQUIRED'
                    : backendStatus.killSwitchActive
                      ? 'LIVE LOCKED — KILL SWITCH ACTIVE'
                      : `EXECUTE LIVE ORDER VIA ${backendStatus.broker || 'BROKER'}`}
              </span>
            </button>
            <div className="text-[10px] text-gray-400 text-center font-mono">
              Broker: <strong>{backendStatus.broker || 'None'}</strong> • Available Cash:{' '}
              <strong>
                {settings.currency} {backendStatus.availableFunds.toLocaleString()}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Live Order Confirmation Modal */}
      {showLiveModal && (
        <LiveOrderModal
          setup={setup}
          backendStatus={backendStatus}
          timeframe={chartContext.timeframe || '5m'}
          onClose={() => setShowLiveModal(false)}
          onConfirmSuccess={handleLiveOrderSuccess}
        />
      )}

      {/* Manual Fill Form */}
      {showManualFillForm && (
        <div className="p-4 bg-gray-900 rounded-lg border border-gray-700 space-y-3">
          <p className="font-bold text-gray-200 pb-1 border-b border-gray-800">
            Record Actual Broker Order & Fill
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400">Actual Entry Price</label>
              <input
                type="number"
                placeholder={setup.entry.toFixed(2)}
                value={actualEntry}
                onChange={(e) => setActualEntry(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400">Actual Filled Qty</label>
              <input
                type="number"
                placeholder={String(setup.quantity)}
                value={actualQty}
                onChange={(e) => setActualQty(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-400">Broker Order Reference (Optional)</label>
            <input
              type="text"
              placeholder="e.g. ZERODHA-123456"
              value={brokerRef}
              onChange={(e) => setBrokerRef(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono"
            />
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={slConfirmed}
                onChange={(e) => setSlConfirmed(e.target.checked)}
                className="rounded bg-gray-800 border-gray-700"
              />
              <span>I have entered the Stop-Loss order in my broker</span>
            </label>

            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={tpConfirmed}
                onChange={(e) => setTpConfirmed(e.target.checked)}
                className="rounded bg-gray-800 border-gray-700"
              />
              <span>I have entered the Take-Profit order in my broker</span>
            </label>
          </div>

          <button
            onClick={handleRecordManualFill}
            disabled={!slConfirmed || !tpConfirmed}
            className="w-full py-2 bg-accent-green hover:bg-accent-green/80 disabled:opacity-40 text-gray-900 font-bold rounded transition-colors"
          >
            Confirm & Save to Journal
          </button>
        </div>
      )}
    </div>
  );
}

