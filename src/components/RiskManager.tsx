// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Risk Manager & Capital Protection
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ShieldCheck, AlertTriangle, Lock, Ban, Activity, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export function RiskManager() {
  const { settings, trades } = useAppStore();
  const risk = settings.risk;

  // Calculate live risk metrics from open trades
  const openTrades = trades.filter((t) => t.status === 'OPEN' || t.status === 'WAITING_ENTRY');
  const aggregateRisk = openTrades.reduce((acc, t) => acc + (t.riskAmount || 0), 0);
  const aggregateRiskPercent = risk.accountEquity > 0 ? (aggregateRisk / risk.accountEquity) * 100 : 0;

  // Calculate today's P&L
  const today = new Date().toDateString();
  const todayTrades = trades.filter((t) => new Date(t.createdAt).toDateString() === today);
  const dailyLoss = todayTrades.reduce((acc, t) => acc + (t.netPnl !== null && t.netPnl < 0 ? Math.abs(t.netPnl) : 0), 0);
  const dailyLossPercent = risk.accountEquity > 0 ? (dailyLoss / risk.accountEquity) * 100 : 0;

  // Determine system status
  let status: 'NORMAL' | 'WARNING' | 'PAUSED' | 'HALTED' = 'NORMAL';
  if (dailyLossPercent >= risk.maxDailyLoss) {
    status = 'HALTED';
  } else if (openTrades.length >= risk.maxConcurrentTrades || aggregateRiskPercent >= risk.maxAggregateRisk) {
    status = 'PAUSED';
  } else if (dailyLossPercent > risk.maxDailyLoss * 0.7) {
    status = 'WARNING';
  }

  const sym = settings.currency === 'INR' ? '₹' : '$';

  return (
    <div className="space-y-4 text-xs font-mono">
      {/* Risk Status Header */}
      <div className="p-3 bg-gray-800/80 rounded-lg border border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-accent-green" />
          <div>
            <div className="font-bold text-gray-200">RISK ENGINE STATUS</div>
            <div className="text-[10px] text-gray-500 font-sans">Enforcing Capital Preservation Rules</div>
          </div>
        </div>
        <span
          className={`px-2.5 py-1 rounded font-bold text-[11px] ${
            status === 'NORMAL'
              ? 'bg-green-950 text-green-300 border border-green-700'
              : status === 'WARNING'
                ? 'bg-yellow-950 text-yellow-300 border border-yellow-700'
                : 'bg-red-950 text-red-300 border border-red-700'
          }`}
        >
          {status === 'NORMAL' ? 'TRADING ACTIVE' : status === 'PAUSED' ? 'TRADING PAUSED' : 'DAILY LIMIT HIT'}
        </span>
      </div>

      {/* Account Equity Card */}
      <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 space-y-2">
        <div className="flex justify-between items-center pb-2 border-b border-gray-800">
          <span className="text-gray-400">Account Equity ({settings.market})</span>
          <span className="text-accent-green font-bold text-base">
            {sym}{risk.accountEquity.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-gray-500">Risk Budget Per Trade ({risk.riskPerTrade}%)</span>
          <span className="text-gray-200 font-bold">
            {sym}{(risk.accountEquity * (risk.riskPerTrade / 100)).toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-gray-500">Open Concurrent Positions</span>
          <span className="text-gray-200 font-bold">
            {openTrades.length} / {risk.maxConcurrentTrades}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-gray-500">Aggregate Open Risk</span>
          <span className="text-gray-200 font-bold">
            {sym}{aggregateRisk.toFixed(2)} ({aggregateRiskPercent.toFixed(2)}% / max {risk.maxAggregateRisk}%)
          </span>
        </div>
      </div>

      {/* Risk Limit Trackers */}
      <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 space-y-3">
        <div className="text-gray-300 font-bold text-[11px] pb-1 border-b border-gray-800">
          RISK LIMIT ENFORCEMENT
        </div>

        {/* Daily loss limit */}
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-gray-400">Daily Loss Utilization</span>
            <span className={dailyLossPercent >= risk.maxDailyLoss ? 'text-accent-red font-bold' : 'text-gray-300'}>
              {dailyLossPercent.toFixed(2)}% / {risk.maxDailyLoss}%
            </span>
          </div>
          <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                dailyLossPercent >= risk.maxDailyLoss
                  ? 'bg-accent-red'
                  : dailyLossPercent > risk.maxDailyLoss * 0.7
                    ? 'bg-accent-yellow'
                    : 'bg-accent-green'
              }`}
              style={{ width: `${Math.min(100, (dailyLossPercent / risk.maxDailyLoss) * 100)}%` }}
            />
          </div>
        </div>

        {/* Max concurrent positions */}
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-gray-400">Concurrent Positions</span>
            <span className="text-gray-300">
              {openTrades.length} / {risk.maxConcurrentTrades} Max
            </span>
          </div>
          <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-blue transition-all"
              style={{ width: `${Math.min(100, (openTrades.length / risk.maxConcurrentTrades) * 100)}%` }}
            />
          </div>
        </div>

        {/* Reward:Risk Rule */}
        <div className="pt-2 border-t border-gray-800 flex justify-between items-center">
          <div className="flex items-center gap-1.5 text-gray-300">
            <Lock className="w-3.5 h-3.5 text-accent-yellow" />
            <span>Minimum Reward-to-Risk</span>
          </div>
          <span className="text-accent-green font-bold bg-green-950/60 px-2 py-0.5 rounded border border-green-800/50">
            {risk.minRR.toFixed(1)} : 1 (LOCKED)
          </span>
        </div>
      </div>

      {/* Mandatory Safety Invariants */}
      <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700 space-y-1.5 text-[11px]">
        <div className="text-gray-300 font-bold mb-1">MANDATORY PROTECTION INVARIANTS</div>
        <div className="flex items-center gap-2 text-gray-400">
          <Ban className="w-3.5 h-3.5 text-accent-red flex-shrink-0" />
          <span>Averaging down strictly forbidden</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <Ban className="w-3.5 h-3.5 text-accent-red flex-shrink-0" />
          <span>Martingale or lot-escalation disabled</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <Ban className="w-3.5 h-3.5 text-accent-red flex-shrink-0" />
          <span>Stop-loss widening rejected by system</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <CheckCircle2 className="w-3.5 h-3.5 text-accent-green flex-shrink-0" />
          <span>Auto-halt after 1% daily drawdown</span>
        </div>
      </div>
    </div>
  );
}

