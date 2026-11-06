// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Settings Panel
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Save, Lock, CheckCircle2, Shield, Settings2, Globe } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { saveSettings } from '../storage/settings';
import type { AppSettings, Exchange, Market } from '../types';

export function Settings() {
  const { settings, updateSettings } = useAppStore();

  const [form, setForm] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    // Lock minRR strictly at >= 3.0
    const sanitized: AppSettings = {
      ...form,
      risk: {
        ...form.risk,
        minRR: Math.max(3.0, form.risk.minRR),
      },
    };

    await saveSettings(sanitized);
    updateSettings(sanitized);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-4 text-xs font-mono">
      {/* Save Button Floating Alert */}
      {saved && (
        <div className="p-2.5 bg-green-950/80 border border-green-700 rounded text-green-300 flex items-center gap-2 font-sans font-medium">
          <CheckCircle2 className="w-4 h-4" />
          <span>Settings saved locally to extension storage!</span>
        </div>
      )}

      {/* Market Profile Settings */}
      <div className="p-3 bg-gray-900 rounded-lg border border-gray-800 space-y-2">
        <div className="text-gray-200 font-bold flex items-center gap-1.5 pb-1 border-b border-gray-800 font-sans">
          <Globe className="w-4 h-4 text-accent-blue" />
          <span>Market Profile Settings</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Default Market</label>
            <select
              value={form.market}
              onChange={(e) => {
                const m = e.target.value as Market;
                setForm({
                  ...form,
                  market: m,
                  defaultExchange: m === 'INDIA' ? 'NSE' : 'NASDAQ',
                  currency: m === 'INDIA' ? 'INR' : 'USD',
                  timezone: m === 'INDIA' ? 'Asia/Kolkata' : 'America/New_York',
                  risk: { ...form.risk, currency: m === 'INDIA' ? 'INR' : 'USD' },
                });
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            >
              <option value="INDIA">India (NSE / BSE)</option>
              <option value="US">United States (NYSE / NASDAQ)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Default Exchange</label>
            <select
              value={form.defaultExchange}
              onChange={(e) => setForm({ ...form, defaultExchange: e.target.value as Exchange })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            >
              {form.market === 'INDIA' ? (
                <>
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                </>
              ) : (
                <>
                  <option value="NASDAQ">NASDAQ</option>
                  <option value="NYSE">NYSE</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Currency</label>
            <input
              type="text"
              disabled
              value={form.currency}
              className="w-full bg-gray-800/50 border border-gray-800 rounded px-2 py-1 text-gray-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Timezone</label>
            <input
              type="text"
              disabled
              value={form.timezone}
              className="w-full bg-gray-800/50 border border-gray-800 rounded px-2 py-1 text-gray-500"
            />
          </div>
        </div>
      </div>

      {/* SMC Strategy Parameters */}
      <div className="p-3 bg-gray-900 rounded-lg border border-gray-800 space-y-2">
        <div className="text-gray-200 font-bold flex items-center gap-1.5 pb-1 border-b border-gray-800 font-sans">
          <Settings2 className="w-4 h-4 text-accent-green" />
          <span>SMC Strategy Parameters</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Pivot Length (L & R bars)</label>
            <input
              type="number"
              value={form.pivotLength}
              onChange={(e) => setForm({ ...form, pivotLength: parseInt(e.target.value) || 3 })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">ATR Length</label>
            <input
              type="number"
              value={form.atrLength}
              onChange={(e) => setForm({ ...form, atrLength: parseInt(e.target.value) || 14 })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Displacement (x ATR)</label>
            <input
              type="number"
              step="0.1"
              value={form.displacementThreshold}
              onChange={(e) => setForm({ ...form, displacementThreshold: parseFloat(e.target.value) || 1.5 })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">FVG Min Size (x ATR)</label>
            <input
              type="number"
              step="0.05"
              value={form.fvgMinSize}
              onChange={(e) => setForm({ ...form, fvgMinSize: parseFloat(e.target.value) || 0.3 })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            />
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          <label className="flex items-center gap-2 text-gray-300 cursor-pointer font-sans">
            <input
              type="checkbox"
              checked={form.htfBiasRequired}
              onChange={(e) => setForm({ ...form, htfBiasRequired: e.target.checked })}
              className="rounded bg-gray-800 border-gray-700"
            />
            <span>Require 1H Higher-Timeframe Bullish Bias</span>
          </label>
        </div>
      </div>

      {/* Capital Protection & Risk Settings */}
      <div className="p-3 bg-gray-900 rounded-lg border border-gray-800 space-y-2">
        <div className="text-gray-200 font-bold flex items-center gap-1.5 pb-1 border-b border-gray-800 font-sans">
          <Shield className="w-4 h-4 text-accent-yellow" />
          <span>Capital Protection & Risk Limits</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Account Capital ({form.currency})</label>
            <input
              type="number"
              value={form.risk.accountEquity}
              onChange={(e) =>
                setForm({
                  ...form,
                  risk: { ...form.risk, accountEquity: parseFloat(e.target.value) || 100000 },
                })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Risk Per Trade (%)</label>
            <input
              type="number"
              step="0.05"
              value={form.risk.riskPerTrade}
              onChange={(e) =>
                setForm({
                  ...form,
                  risk: { ...form.risk, riskPerTrade: parseFloat(e.target.value) || 0.25 },
                })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Max Daily Loss (%)</label>
            <input
              type="number"
              step="0.1"
              value={form.risk.maxDailyLoss}
              onChange={(e) =>
                setForm({
                  ...form,
                  risk: { ...form.risk, maxDailyLoss: parseFloat(e.target.value) || 1.0 },
                })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Max Concurrent Positions</label>
            <input
              type="number"
              value={form.risk.maxConcurrentTrades}
              onChange={(e) =>
                setForm({
                  ...form,
                  risk: { ...form.risk, maxConcurrentTrades: parseInt(e.target.value) || 3 },
                })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            />
          </div>
        </div>

        {/* LOCKED 3:1 RR Field */}
        <div className="pt-2 border-t border-gray-800 flex justify-between items-center bg-gray-950 p-2 rounded">
          <div>
            <span className="text-gray-300 font-bold block">Minimum Reward-to-Risk Ratio</span>
            <span className="text-[10px] text-gray-500 font-sans">Enforced across all trade tickets</span>
          </div>
          <div className="flex items-center gap-1.5 text-accent-green font-bold bg-green-950/70 border border-green-800/60 px-3 py-1 rounded">
            <Lock className="w-3.5 h-3.5 text-accent-yellow" />
            <span>3.00 : 1 (LOCKED)</span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-green hover:bg-accent-green/80 text-gray-900 font-bold rounded-lg transition-colors font-sans"
      >
        <Save className="w-4 h-4" />
        <span>Save All Configuration Settings</span>
      </button>
    </div>
  );
}

