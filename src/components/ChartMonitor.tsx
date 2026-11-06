// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Chart Monitor
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Activity, RefreshCw, AlertCircle, CheckCircle2, ChevronRight, Database, AlertTriangle, ShieldX } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { Exchange, Market, Timeframe, InstrumentType } from '../types';
import { CSVImporter } from './CSVImporter';

export function ChartMonitor() {
  const { chartContext, setChartContext, datasets, setActiveTab } = useAppStore();
  const [showImporter, setShowImporter] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Manual override state
  const [manualSymbol, setManualSymbol] = useState(chartContext.symbol || 'RELIANCE');
  const [manualExchange, setManualExchange] = useState<Exchange>(chartContext.exchange || 'NSE');
  const [manualTimeframe, setManualTimeframe] = useState<Timeframe>(chartContext.timeframe || '5m');
  const [manualMarket, setManualMarket] = useState<Market>(chartContext.market || 'INDIA');

  const handleRefresh = () => {
    setIsRefreshing(true);
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'REFRESH_DIAGNOSTICS' }, (res) => {
        setIsRefreshing(false);
        if (res && res.context) {
          setChartContext(res.context);
        }
      });
    } else {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const applyManualOverride = () => {
    const sym = manualSymbol.toUpperCase().trim();
    const isFutures = sym.endsWith('1!') || sym.endsWith('2!') || sym.endsWith('!') || sym.includes('FUT');
    const isIndex = sym === 'NIFTY' || sym === 'BANKNIFTY' || sym === 'SPX' || sym === 'NDX';
    const instrumentType: InstrumentType = isFutures ? 'FUTURES' : isIndex ? 'INDEX' : 'CASH_EQUITY';
    const isTradable = instrumentType === 'CASH_EQUITY';
    const statusMessage = isTradable ? 'EQUITY SUPPORTED' : isFutures ? 'FUTURES NOT CONFIGURED' : 'INDEX NOT TRADEABLE IN CURRENT PROFILE';

    setChartContext({
      detected: true,
      symbol: sym,
      exchange: manualExchange,
      timeframe: manualTimeframe,
      market: manualMarket,
      instrumentType,
      isTradable,
      statusMessage,
      chartStatus: 'CONNECTED',
      url: window.location.href,
      lastUpdated: Date.now(),
      source: 'MANUAL',
    });
  };

  const currentDataset = datasets.find(
    (d) => d.symbol === chartContext.symbol && d.timeframe === chartContext.timeframe
  );

  return (
    <div className="space-y-4 text-xs">
      {/* Header status bar */}
      <div className="bg-gray-800/80 p-3 rounded-lg border border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              chartContext.detected ? 'bg-accent-green animate-pulse' : 'bg-accent-red'
            }`}
          />
          <span className="font-bold text-gray-200">
            {chartContext.detected ? 'CONNECTED TO CHART' : 'CHART NOT DETECTED'}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded font-mono text-[10px] transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* URL Mismatch Banner */}
      {chartContext.isMismatch && (
        <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <div className="font-bold text-xs uppercase tracking-wider">
              URL MISMATCH OVERRIDDEN — VERIFIED VISIBLE CHART ACTIVE
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed font-sans">
              TradingView URL still contains <strong>{chartContext.urlExchange || ''}:{chartContext.urlSymbol || ''}</strong>, but visible chart displays <strong>{chartContext.exchange}:{chartContext.symbol}</strong>. The extension is tracking the verified visible chart.
            </p>
          </div>
        </div>
      )}

      {/* Non-Equity Notice if Futures/Index */}
      {chartContext.detected && !chartContext.isTradable && (
        <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <div className="font-bold text-xs uppercase tracking-wider">
              {chartContext.statusMessage} ({chartContext.instrumentType})
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed font-sans">
              Continuous futures contracts (e.g., GIFT NIFTY / NIFTY1!) and broad indices require dedicated futures margin profiles. Switch to a cash equity instrument (e.g. RELIANCE, TCS, AAPL, MSFT) for cash equity execution.
            </p>
          </div>
        </div>
      )}

      {/* Detected chart card */}
      <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 font-mono space-y-2">
        <div className="text-center font-bold text-gray-400 pb-2 border-b border-gray-800 text-[11px] flex items-center justify-between">
          <span>ACTIVE INSTRUMENT</span>
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
            chartContext.isTradable ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
          }`}>
            {chartContext.statusMessage}
          </span>
        </div>
        <div className="flex justify-between py-1 border-b border-gray-800/50">
          <span className="text-gray-500">Exchange</span>
          <span className="text-gray-200 font-bold">{chartContext.exchange || 'NOT DETECTED'}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-gray-800/50">
          <span className="text-gray-500">Symbol</span>
          <span className="text-accent-green font-bold text-sm">
            {chartContext.symbol || 'NOT DETECTED'}
          </span>
        </div>
        <div className="flex justify-between py-1 border-b border-gray-800/50">
          <span className="text-gray-500">Instrument Type</span>
          <span className="text-gray-200 font-bold">{chartContext.instrumentType || 'UNKNOWN'}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-gray-800/50">
          <span className="text-gray-500">Timeframe</span>
          <span className="text-gray-200">{chartContext.timeframe || 'NOT DETECTED'}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-gray-800/50">
          <span className="text-gray-500">Market</span>
          <span className="text-gray-200">{chartContext.market || 'NOT DETECTED'}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-gray-800/50">
          <span className="text-gray-500">Detection Source</span>
          <span className="text-gray-400">{chartContext.source || 'NONE'}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-gray-500">Candle Data</span>
          <span className={currentDataset ? 'text-accent-green font-bold' : 'text-accent-yellow font-bold'}>
            {currentDataset ? `${currentDataset.totalCandles} CSV Candles` : 'NO CSV IMPORTED'}
          </span>
        </div>
      </div>

      {/* Manual Override Form */}
      <div className="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-gray-300">Manual Instrument Override</span>
          <span className="text-[10px] text-gray-500">If DOM detection fails</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] text-gray-500">Symbol</label>
            <input
              type="text"
              value={manualSymbol}
              onChange={(e) => setManualSymbol(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Exchange</label>
            <select
              value={manualExchange}
              onChange={(e) => setManualExchange(e.target.value as Exchange)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono text-xs"
            >
              <option value="NSE">NSE</option>
              <option value="NSEIX">NSEIX (Gift City)</option>
              <option value="BSE">BSE</option>
              <option value="NASDAQ">NASDAQ</option>
              <option value="NYSE">NYSE</option>
              <option value="AMEX">AMEX</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Timeframe</label>
            <select
              value={manualTimeframe}
              onChange={(e) => setManualTimeframe(e.target.value as Timeframe)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono text-xs"
            >
              <option value="1m">1m</option>
              <option value="3m">3m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="30m">30m</option>
              <option value="1h">1h</option>
              <option value="2h">2h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Market</label>
            <select
              value={manualMarket}
              onChange={(e) => setManualMarket(e.target.value as Market)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono text-xs"
            >
              <option value="INDIA">INDIA (INR)</option>
              <option value="US">US (USD)</option>
            </select>
          </div>
        </div>
        <button
          onClick={applyManualOverride}
          className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-1.5 rounded font-medium transition-colors"
        >
          Set Chart Instrument Manually
        </button>
      </div>

      {/* Action buttons */}
      <div className="space-y-2">
        <button
          onClick={() => setShowImporter(!showImporter)}
          className="w-full flex items-center justify-between p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg border border-gray-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-accent-blue" />
            <span className="font-semibold">
              {showImporter ? 'Hide Historical CSV Importer' : 'Import Historical CSV Data'}
            </span>
          </div>
          <ChevronRight
            className={`w-4 h-4 text-gray-500 transition-transform ${showImporter ? 'rotate-90' : ''}`}
          />
        </button>

        {showImporter && (
          <div className="p-3 bg-gray-900 rounded-lg border border-gray-800">
            <CSVImporter />
          </div>
        )}

        <button
          onClick={() => setActiveTab('SMCAnalysis')}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-green hover:bg-accent-green/80 text-gray-900 font-bold rounded-lg transition-colors"
        >
          <Activity className="w-4 h-4" />
          <span>Proceed to SMC Analysis</span>
        </button>
      </div>
    </div>
  );
}

