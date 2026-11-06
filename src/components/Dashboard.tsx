// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – Dashboard Component
// ─────────────────────────────────────────────────────────────────────────────

import {
  Activity,
  AlertTriangle,
  BarChart2,
  CheckCircle,
  DollarSign,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import React, { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import type { Trade } from '../types';

// ── Stat Card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color?: 'green' | 'red' | 'blue' | 'yellow' | 'gray';
}

const colorMap: Record<string, string> = {
  green: 'text-green-400 bg-green-900/30',
  red: 'text-red-400 bg-red-900/30',
  blue: 'text-blue-400 bg-blue-900/30',
  yellow: 'text-yellow-400 bg-yellow-900/30',
  gray: 'text-gray-400 bg-gray-700/30',
};

function StatCard({ title, value, sub, icon, color = 'gray' }: StatCardProps) {
  return (
    <div className="smc-card flex items-start gap-3">
      <div className={`p-2 rounded-md ${colorMap[color]} flex-shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-gray-500 text-[10px] uppercase tracking-wider">{title}</p>
        <p className="text-gray-100 text-base font-bold mono truncate">{value}</p>
        {sub && <p className="text-gray-500 text-[10px] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Recent trades row ─────────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: Trade }) {
  const isWin =
    trade.status === 'TAKE_PROFIT_HIT' || (trade.netPnl !== null && trade.netPnl > 0);
  const isLoss =
    trade.status === 'STOP_LOSS_HIT' || (trade.netPnl !== null && trade.netPnl < 0);

  const statusColor = isWin
    ? 'text-green-400'
    : isLoss
      ? 'text-red-400'
      : 'text-gray-400';

  const pnlText =
    trade.netPnl !== null
      ? `${trade.netPnl >= 0 ? '+' : ''}${trade.netPnl.toFixed(2)}`
      : '—';

  const pnlColor =
    trade.netPnl === null
      ? 'text-gray-500'
      : trade.netPnl >= 0
        ? 'text-green-400'
        : 'text-red-400';

  const date = new Date(trade.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });

  return (
    <tr className="border-b border-gray-700/40 hover:bg-gray-700/20 transition-colors">
      <td className="px-2 py-1.5 text-gray-300 font-semibold text-xs mono">
        {trade.symbol}
      </td>
      <td className="px-2 py-1.5 text-gray-500 text-xs">{trade.exchange}</td>
      <td className="px-2 py-1.5 text-gray-500 text-xs">{date}</td>
      <td className="px-2 py-1.5 text-xs">
        <span
          className={`smc-badge ${
            trade.tradeType === 'TV_NATIVE_PAPER'
              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
              : trade.tradeType === 'PAPER'
              ? 'smc-badge-blue'
              : 'smc-badge-yellow'
          }`}
        >
          {trade.tradeType === 'TV_NATIVE_PAPER' ? 'TV Paper' : trade.tradeType === 'PAPER' ? 'Paper' : 'Live'}
        </span>
      </td>
      <td className={`px-2 py-1.5 text-xs font-semibold ${statusColor}`}>
        {trade.status.replace(/_/g, ' ')}
      </td>
      <td className={`px-2 py-1.5 text-xs font-bold mono ${pnlColor}`}>
        {pnlText}
      </td>
      {trade.rMultiple !== null ? (
        <td className={`px-2 py-1.5 text-xs mono ${pnlColor}`}>
          {trade.rMultiple.toFixed(2)}R
        </td>
      ) : (
        <td className="px-2 py-1.5 text-xs text-gray-600">—</td>
      )}
    </tr>
  );
}

// ── Chart detection status badge ──────────────────────────────────────────────

function ChartStatusBadge() {
  const { chartContext, setActiveTab } = useAppStore();

  if (chartContext.detected) {
    return (
      <div className="smc-card flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle size={14} className="text-green-400" />
          <div>
            <p className="text-green-400 text-xs font-semibold">
              {chartContext.exchange}:{chartContext.symbol}
            </p>
            <p className="text-gray-500 text-[10px]">
              {chartContext.timeframe ?? '?'} · {chartContext.market ?? '?'} ·{' '}
              {chartContext.source}
            </p>
          </div>
        </div>
        <button
          className="btn-secondary text-[10px] py-1 px-2"
          onClick={() => setActiveTab('ChartMonitor')}
        >
          Details
        </button>
      </div>
    );
  }

  return (
    <div className="smc-card flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-yellow-400" />
        <div>
          <p className="text-yellow-400 text-xs font-semibold">Chart Not Detected</p>
          <p className="text-gray-500 text-[10px]">
            Open TradingView in the active tab to detect symbol
          </p>
        </div>
      </div>
      <button
        className="btn-secondary text-[10px] py-1 px-2"
        onClick={() => setActiveTab('ChartMonitor')}
      >
        Override
      </button>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { trades, settings, setActiveTab } = useAppStore();

  const stats = useMemo(() => {
    const closed = trades.filter(
      (t) => t.status === 'TAKE_PROFIT_HIT' || t.status === 'STOP_LOSS_HIT' || t.status === 'CLOSED_MANUALLY'
    );
    const wins = closed.filter(
      (t) => t.netPnl !== null && t.netPnl > 0
    );
    const losses = closed.filter(
      (t) => t.netPnl !== null && t.netPnl <= 0
    );
    const totalNetPnl = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const openCount = trades.filter(
      (t) => t.status === 'OPEN' || t.status === 'WAITING_ENTRY' || t.status === 'ENTRY_SIMULATED'
    ).length;

    const grossWins = wins.reduce((s, t) => s + (t.grossPnl ?? 0), 0);
    const grossLosses = Math.abs(losses.reduce((s, t) => s + (t.grossPnl ?? 0), 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : wins.length > 0 ? Infinity : 0;

    return {
      total: trades.length,
      closed: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalNetPnl,
      openCount,
      profitFactor,
    };
  }, [trades]);

  const recentTrades = trades.slice(0, 8);

  const currency = settings.currency === 'INR' ? '₹' : '\$';
  const pnlColor =
    stats.totalNetPnl >= 0 ? 'green' : 'red';

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto p-3">
      {/* Chart Status */}
      <ChartStatusBadge />

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          title="Total Trades"
          value={String(stats.total)}
          sub={`${stats.closed} closed`}
          icon={<BarChart2 size={14} />}
          color="blue"
        />
        <StatCard
          title="Win Rate"
          value={stats.closed > 0 ? `${stats.winRate.toFixed(1)}%` : '—'}
          sub={`${stats.wins}W / ${stats.losses}L`}
          icon={<TrendingUp size={14} />}
          color={stats.winRate >= 50 ? 'green' : 'red'}
        />
        <StatCard
          title="Net P&amp;L"
          value={
            stats.closed > 0
              ? `${stats.totalNetPnl >= 0 ? '+' : ''}${currency}${Math.abs(stats.totalNetPnl).toFixed(2)}`
              : '—'
          }
          sub={`Profit Factor: ${stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}`}
          icon={<DollarSign size={14} />}
          color={pnlColor}
        />
        <StatCard
          title="Open Positions"
          value={String(stats.openCount)}
          sub={`Max ${settings.risk.maxConcurrentTrades}`}
          icon={<Activity size={14} />}
          color={stats.openCount > 0 ? 'yellow' : 'gray'}
        />
      </div>

      {/* Account equity */}
      <div className="smc-card">
        <p className="section-title">Account</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-[10px] uppercase tracking-wide">Equity</p>
            <p className="text-gray-100 text-sm font-bold mono">
              {currency}
              {settings.risk.accountEquity.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-gray-500 text-[10px] uppercase tracking-wide">Market</p>
            <p className="text-gray-200 text-sm font-semibold">{settings.market}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-500 text-[10px] uppercase tracking-wide">Risk / Trade</p>
            <p className="text-gray-200 text-sm font-semibold">
              {settings.risk.riskPerTrade}%
            </p>
          </div>
        </div>
      </div>

      {/* Recent trades */}
      <div className="smc-card flex-1 min-h-0">
        <div className="flex items-center justify-between mb-2">
          <p className="section-title mb-0">Recent Trades</p>
          <button
            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            onClick={() => setActiveTab('TradeJournal')}
          >
            View All →
          </button>
        </div>

        {recentTrades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-gray-600">
            <XCircle size={20} className="mb-1" />
            <p className="text-xs">No trades yet</p>
            <button
              className="mt-2 btn-secondary text-[10px]"
              onClick={() => setActiveTab('PaperTrading')}
            >
              Start Paper Trading
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-2 py-1 text-left text-gray-500 font-medium text-[10px] uppercase">
                    Symbol
                  </th>
                  <th className="px-2 py-1 text-left text-gray-500 font-medium text-[10px] uppercase">
                    Exch
                  </th>
                  <th className="px-2 py-1 text-left text-gray-500 font-medium text-[10px] uppercase">
                    Date
                  </th>
                  <th className="px-2 py-1 text-left text-gray-500 font-medium text-[10px] uppercase">
                    Type
                  </th>
                  <th className="px-2 py-1 text-left text-gray-500 font-medium text-[10px] uppercase">
                    Status
                  </th>
                  <th className="px-2 py-1 text-right text-gray-500 font-medium text-[10px] uppercase">
                    Net P&amp;L
                  </th>
                  <th className="px-2 py-1 text-right text-gray-500 font-medium text-[10px] uppercase">
                    R
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t) => (
                  <TradeRow key={t.id} trade={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'SMC Analysis', tab: 'SMCAnalysis' as const },
          { label: 'Risk Manager', tab: 'RiskManager' as const },
          { label: 'Reports', tab: 'Reports' as const },
        ].map(({ label, tab }) => (
          <button
            key={tab}
            className="btn-secondary justify-center text-[10px] py-1.5"
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
