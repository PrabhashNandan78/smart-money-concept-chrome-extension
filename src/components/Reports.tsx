// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Performance Reports & Analytics Dashboard
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import { Download, TrendingUp, BarChart2, PieChart as PieIcon, Calendar, ShieldCheck } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { useAppStore } from '../store/appStore';
import { calculatePerformanceStats, calculateEquityCurve } from '../analytics/performance';
import { generateTextReport } from '../analytics/report-generator';
import type { Market } from '../types';

export function Reports() {
  const { trades, settings } = useAppStore();
  const [selectedMarket, setSelectedMarket] = useState<Market | 'ALL'>('ALL');

  // Filter trades by selected market
  const marketTrades = useMemo(() => {
    if (selectedMarket === 'ALL') return trades;
    return trades.filter((t) => t.market === selectedMarket);
  }, [trades, selectedMarket]);

  // Performance stats calculated from actual recorded trades
  const stats = useMemo(() => {
    return calculatePerformanceStats(marketTrades);
  }, [marketTrades]);

  // Equity curve
  const equityCurve = useMemo(() => {
    return calculateEquityCurve(marketTrades, settings.risk.accountEquity);
  }, [marketTrades, settings.risk.accountEquity]);

  // Distribution data for R-Multiples
  const rDistData = useMemo(() => {
    const bins: Record<string, number> = {
      'Loss (-1R)': 0,
      '0R - 1R': 0,
      '1R - 2R': 0,
      '2R - 3R': 0,
      '3R+ (Target)': 0,
    };

    for (const t of marketTrades) {
      if (t.rMultiple === null) continue;
      if (t.rMultiple <= -0.5) bins['Loss (-1R)']++;
      else if (t.rMultiple < 1) bins['0R - 1R']++;
      else if (t.rMultiple < 2) bins['1R - 2R']++;
      else if (t.rMultiple < 3) bins['2R - 3R']++;
      else bins['3R+ (Target)']++;
    }

    return Object.entries(bins).map(([name, count]) => ({ name, count }));
  }, [marketTrades]);

  const handleDownloadReport = () => {
    const text = generateTextReport(
      marketTrades,
      `Market: ${selectedMarket} | Currency: ${settings.currency}`
    );
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smc_performance_report_${Date.now()}.txt`;
    a.click();
  };

  const sym = settings.currency === 'INR' ? '₹' : '$';

  return (
    <div className="space-y-4 text-xs font-mono">
      {/* Top Header & Market Toggle */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-800">
        <span className="font-bold text-gray-200">PERFORMANCE ANALYTICS</span>
        <div className="flex gap-2">
          <select
            value={selectedMarket}
            onChange={(e) => setSelectedMarket(e.target.value as Market | 'ALL')}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-gray-300 text-[11px]"
          >
            <option value="ALL">All Markets</option>
            <option value="INDIA">India (INR)</option>
            <option value="US">US (USD)</option>
          </select>

          <button
            onClick={handleDownloadReport}
            className="flex items-center gap-1 px-2.5 py-1 bg-accent-blue hover:bg-accent-blue/80 text-white rounded font-medium text-[10px]"
          >
            <Download className="w-3 h-3" />
            <span>Download Report</span>
          </button>
        </div>
      </div>

      {marketTrades.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-gray-900 rounded-lg border border-gray-800">
          No trade records available yet. Import historical CSV data and simulate paper trades or record manual trades to view performance analytics.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Total Closed</span>
              <span className="text-base font-bold text-gray-200">{stats.totalTrades}</span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Win Rate</span>
              <span className="text-base font-bold text-accent-green">
                {stats.winRate.toFixed(1)}%
              </span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Net P&L</span>
              <span
                className={`text-base font-bold ${
                  stats.totalNetPnl >= 0 ? 'text-accent-green' : 'text-accent-red'
                }`}
              >
                {stats.totalNetPnl >= 0 ? '+' : ''}{sym}{stats.totalNetPnl.toFixed(2)}
              </span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Profit Factor</span>
              <span className="text-base font-bold text-gray-200">
                {stats.profitFactor.toFixed(2)}
              </span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Average R</span>
              <span className="text-base font-bold text-gray-200">
                {stats.avgR.toFixed(2)}R
              </span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Max Drawdown</span>
              <span className="text-base font-bold text-accent-red">
                {stats.maxDrawdown.toFixed(1)}%
              </span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Avg Winner</span>
              <span className="text-base font-bold text-accent-green">
                {sym}{stats.avgWinner.toFixed(2)}
              </span>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">Rule Compliance</span>
              <span className="text-base font-bold text-gray-200">
                {stats.ruleComplianceRate.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Equity Curve Chart */}
          <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
            <span className="text-gray-400 font-bold text-[11px] block mb-2 font-sans">
              REALIZED EQUITY CURVE
            </span>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(ts) => new Date(ts).toLocaleDateString()}
                    stroke="#64748b"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis stroke="#64748b" domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                    formatter={(val: number) => [`${sym}${val.toFixed(2)}`, 'Equity']}
                    labelFormatter={(label) => new Date(label).toLocaleString()}
                  />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#00d4aa"
                    strokeWidth={2}
                    dot={{ fill: '#00d4aa', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* R-Multiple Distribution Chart */}
          <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
            <span className="text-gray-400 font-bold text-[11px] block mb-2 font-sans">
              R-MULTIPLE DISTRIBUTION (STRICT 3:1 TARGETS)
            </span>
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rDistData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                  />
                  <Bar dataKey="count" fill="#2980ef" radius={[4, 4, 0, 0]}>
                    {rDistData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.name.includes('Loss') ? '#ff4757' : entry.name.includes('3R') ? '#00d4aa' : '#2980ef'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

