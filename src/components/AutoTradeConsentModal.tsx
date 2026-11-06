// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Auto-Trade Authorization & Consent Modal
// Explicit user confirmation before enabling Native TradingView Auto-Execution
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, X, CheckSquare, Square, Zap } from 'lucide-react';

interface AutoTradeConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function AutoTradeConsentModal({
  isOpen,
  onClose,
  onConfirm,
}: AutoTradeConsentModalProps) {
  const [ackPaperOnly, setAckPaperOnly] = useState(false);
  const [ackRiskRules, setAckRiskRules] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleActivate = () => {
    if (!ackPaperOnly || !ackRiskRules) {
      setError('You must check both authorization boxes before enabling Auto Trade.');
      return;
    }
    setError(null);
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-teal-500/30 bg-slate-900 text-slate-100 shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="p-3 bg-teal-500/10 rounded-lg border border-teal-500/30">
            <Zap className="w-6 h-6 text-teal-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              Activate TradingView Native Auto-Trade
            </h2>
            <p className="text-xs text-slate-400">
              Direct DOM-based order placement into TradingView Paper Trading
            </p>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3.5 mb-5 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            <strong>Simulation Safeguard:</strong> This automated execution operates directly on your
            connected <strong>TradingView Native Paper Trading</strong> interface. Real money broker
            orders will never be submitted through this switch.
          </div>
        </div>

        <div className="space-y-3 mb-6 text-xs text-slate-300">
          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60 space-y-2">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Automated Safety & Execution Rules:
            </div>
            <ul className="list-disc pl-4 space-y-1 text-slate-400">
              <li>
                Executes orders exclusively when SMC qualifications (1H Bias, Liquidity Sweep, CHoCH,
                FVG) are confirmed.
              </li>
              <li>
                Strictly enforces a <strong>minimum 3.00:1 NET Reward-to-Risk ratio</strong> (zero user bypass).
              </li>
              <li>
                Automatically enters Limit Order with Take Profit and Stop Loss brackets in TradingView.
              </li>
              <li>
                Immediate kill-switch available via the prominent <strong>EMERGENCY DISABLE</strong> button.
              </li>
            </ul>
          </div>

          <label
            onClick={() => setAckPaperOnly(!ackPaperOnly)}
            className="flex items-center space-x-3 p-2.5 rounded-lg border border-slate-700 hover:bg-slate-800/40 cursor-pointer transition select-none"
          >
            {ackPaperOnly ? (
              <CheckSquare className="w-4 h-4 text-teal-400 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-slate-500 shrink-0" />
            )}
            <span className="text-xs text-slate-200 font-medium">
              I authorize automated order placement directly through TradingView's Paper Trading interface.
            </span>
          </label>

          <label
            onClick={() => setAckRiskRules(!ackRiskRules)}
            className="flex items-center space-x-3 p-2.5 rounded-lg border border-slate-700 hover:bg-slate-800/40 cursor-pointer transition select-none"
          >
            {ackRiskRules ? (
              <CheckSquare className="w-4 h-4 text-teal-400 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-slate-500 shrink-0" />
            )}
            <span className="text-xs text-slate-200 font-medium">
              I confirm that all orders must meet the 3.00:1 net R:R and risk management thresholds.
            </span>
          </label>
        </div>

        {error && (
          <div className="mb-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
          >
            Cancel / Keep Inactive
          </button>
          <button
            onClick={handleActivate}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 ${
              ackPaperOnly && ackRiskRules
                ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-lg shadow-teal-500/20'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>AUTHORIZE & ACTIVATE</span>
          </button>
        </div>
      </div>
    </div>
  );
}

