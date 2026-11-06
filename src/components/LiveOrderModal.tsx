// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Live Order Confirmation Modal
// Explicit user confirmation before submitting real live broker order
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, CheckCircle2, X, Lock, Send, DollarSign } from 'lucide-react';
import type { TradeSetup, BackendStatus } from '../types';

interface LiveOrderModalProps {
  setup: TradeSetup;
  backendStatus: BackendStatus;
  timeframe: string;
  onClose: () => void;
  onConfirmSuccess: (result: any) => void;
}

export function LiveOrderModal({
  setup,
  backendStatus,
  timeframe,
  onClose,
  onConfirmSuccess,
}: LiveOrderModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userAcknowledged, setUserAcknowledged] = useState(false);

  const handleExecuteLive = async () => {
    if (!userAcknowledged) {
      setError('Please acknowledge and confirm the risk disclosure checkbox.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const orderPayload = {
        market: setup.signal.market,
        exchange: setup.signal.exchange,
        symbol: setup.signal.symbol,
        direction: 'LONG',
        timeframe,
        quantity: setup.quantity,
        orderType: 'LIMIT',
        limitPrice: setup.entry,
        stopLoss: setup.stopLoss,
        takeProfit: setup.takeProfit,
        grossRR: setup.grossRR,
        netRR: setup.netRR,
        riskAmount: setup.totalRisk,
        estimatedCash: setup.quantity * setup.entry,
        broker: backendStatus.broker || 'DHAN',
        confirmedByUser: true,
      };

      const res = await fetch(`${backendStatus.url}/orders/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.detail || 'Broker rejected order.');
      }

      onConfirmSuccess(data);
    } catch (e: any) {
      setError(e.message || 'Failed to place live order. Check backend connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cashRequirement = setup.quantity * setup.entry;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono text-xs">
      <div className="bg-[#0f141f] border border-amber-500/50 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-amber-950/40 border-b border-amber-500/30 p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-amber-200 text-sm tracking-wide">
              CONFIRM LIVE BROKER ORDER EXECUTION
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Warning banner */}
          <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-red-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
            <div className="text-[11px] leading-relaxed">
              <strong>LIVE CAPITAL RISK WARNING:</strong> This action will send an actual limit order with attached protective Stop-Loss and Take-Profit orders directly to your connected broker account (<strong>{backendStatus.broker}</strong> - {backendStatus.accountIdentity || 'Default'}). Real funds will be committed.
            </div>
          </div>

          {/* Trade Parameters Table */}
          <div className="bg-gray-900/90 rounded-lg border border-gray-800 p-3 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between py-1 border-b border-gray-800">
              <span className="text-gray-400">Target Instrument</span>
              <span className="text-accent-green font-bold">
                {setup.signal.exchange}:{setup.signal.symbol} (Cash Equity)
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800">
              <span className="text-gray-400">Timeframe Detected</span>
              <span className="text-gray-200 font-bold">{timeframe}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800">
              <span className="text-gray-400">Order Type & Direction</span>
              <span className="text-blue-400 font-bold">LONG (BUY) LIMIT</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800">
              <span className="text-gray-400">Quantity (Shares)</span>
              <span className="text-gray-100 font-bold">{setup.quantity} shares</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800">
              <span className="text-gray-400">Planned Limit Entry</span>
              <span className="text-accent-blue font-bold">{setup.entry.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800">
              <span className="text-gray-400">Stop Loss (Protective SL)</span>
              <span className="text-accent-red font-bold">{setup.stopLoss.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800">
              <span className="text-gray-400">Take Profit (Target)</span>
              <span className="text-accent-green font-bold">{setup.takeProfit.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800">
              <span className="text-gray-400">Net Reward-to-Risk (Strict 3:1)</span>
              <span className="text-emerald-400 font-bold">{setup.netRR.toFixed(2)}:1</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800">
              <span className="text-gray-400">Max Risk Capital</span>
              <span className="text-red-300 font-bold">
                {setup.currency} {setup.totalRisk.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-800">
              <span className="text-gray-400">Expected Profit</span>
              <span className="text-emerald-300 font-bold">
                {setup.currency} {setup.estimatedProfit.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-1 pt-1.5">
              <span className="text-gray-300 font-bold">Estimated Cash Required</span>
              <span className="text-amber-300 font-bold text-xs">
                {setup.currency} {cashRequirement.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-2.5 bg-red-950 border border-red-800 rounded text-red-300 text-xs font-mono">
              ⚠ Error: {error}
            </div>
          )}

          {/* Checkbox Acknowledgment */}
          <label className="flex items-start gap-2.5 p-2.5 bg-gray-900 border border-gray-800 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={userAcknowledged}
              onChange={(e) => setUserAcknowledged(e.target.checked)}
              className="mt-0.5 rounded bg-gray-800 border-gray-700 text-amber-500 focus:ring-0"
            />
            <span className="text-[11px] text-gray-300 font-sans leading-relaxed">
              I explicitly confirm that I have verified the order parameters, available buying power in <strong>{backendStatus.broker}</strong>, and understand that protective bracket orders will be placed upon broker fill.
            </span>
          </label>
        </div>

        {/* Modal Actions */}
        <div className="bg-[#0c1018] border-t border-gray-800 p-3.5 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExecuteLive}
            disabled={isSubmitting || !userAcknowledged}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-gray-950 font-bold rounded flex items-center gap-2 transition-colors shadow-lg"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Submitting to Broker...' : 'Confirm & Submit Live Order'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

