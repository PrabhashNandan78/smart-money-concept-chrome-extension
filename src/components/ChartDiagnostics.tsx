// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – Chart Diagnostics & System Health
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Activity, Terminal } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { ChartDiagnosticsData } from '../types';

export function ChartDiagnostics() {
  const { chartContext, datasets, backendStatus, checkBackendHealth } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [diagData, setDiagData] = useState<ChartDiagnosticsData | null>(null);

  const fetchDiagnostics = () => {
    setLoading(true);
    checkBackendHealth();

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'REFRESH_DIAGNOSTICS' }, (response) => {
        setLoading(false);
        if (response?.payload) {
          const data = response.payload as ChartDiagnosticsData;
          data.ohlcDataImported = datasets.length > 0;
          data.backendConnected = backendStatus.connected;
          setDiagData(data);
          if (data.symbol && data.exchange) {
            useAppStore.getState().setChartContext({
              detected: true,
              exchange: data.exchange,
              symbol: data.symbol,
              timeframe: data.timeframe,
              market: chartContext.market,
              instrumentType: data.instrumentType,
              isTradable: data.isTradable,
              statusMessage: data.statusMessage,
              chartStatus: 'CONNECTED',
              url: data.chartUrl,
              lastUpdated: Date.now(),
              source: chartContext.source || 'DIAGNOSTICS',
              visibleSymbol: data.visibleSymbol,
              urlSymbol: data.urlSymbol,
              isMismatch: data.isMismatch,
              lastError: null,
            });
          }
        }
      });
    } else {
      // Local fallback / dev mock diagnostics
      setTimeout(() => {
        setLoading(false);
        setDiagData({
          activeTabConnected: chartContext.chartStatus === 'CONNECTED',
          tradingViewHostDetected: chartContext.url.includes('tradingview.com'),
          hostPermissionGranted: true,
          contentScriptLoaded: chartContext.detected,
          messageHandshakePassed: chartContext.detected,
          chartUrl: chartContext.url || 'https://in.tradingview.com/chart/',
          exchange: chartContext.exchange,
          symbol: chartContext.symbol,
          visibleSymbol: chartContext.visibleSymbol,
          urlSymbol: chartContext.urlSymbol,
          isMismatch: chartContext.isMismatch,
          instrumentType: chartContext.instrumentType,
          isTradable: chartContext.isTradable,
          statusMessage: chartContext.statusMessage,
          timeframe: chartContext.timeframe,
          ohlcDataImported: datasets.length > 0,
          realTimeDataStatus: 'Unavailable (Visible DOM/URL metadata only)',
          smcEngineStatus: chartContext.detected ? 'Ready' : 'Waiting',
          backendConnected: backendStatus.connected,
          lastSuccessfulUpdate: chartContext.lastUpdated || null,
          lastError: chartContext.lastError || null,
        });
      }, 300);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, [chartContext, datasets]);

  const activeData: ChartDiagnosticsData = diagData || {
    activeTabConnected: chartContext.chartStatus === 'CONNECTED',
    tradingViewHostDetected: chartContext.url.includes('tradingview.com'),
    hostPermissionGranted: true,
    contentScriptLoaded: chartContext.detected,
    messageHandshakePassed: chartContext.detected,
    chartUrl: chartContext.url || 'Not Connected',
    exchange: chartContext.exchange,
    symbol: chartContext.symbol,
    visibleSymbol: chartContext.visibleSymbol,
    urlSymbol: chartContext.urlSymbol,
    isMismatch: chartContext.isMismatch,
    instrumentType: chartContext.instrumentType,
    isTradable: chartContext.isTradable,
    statusMessage: chartContext.statusMessage,
    timeframe: chartContext.timeframe,
    ohlcDataImported: datasets.length > 0,
    realTimeDataStatus: 'Unavailable (Visible metadata only)',
    smcEngineStatus: chartContext.detected ? 'Ready' : 'Waiting for Chart Context',
    backendConnected: backendStatus.connected,
    lastSuccessfulUpdate: chartContext.lastUpdated || null,
    lastError: chartContext.lastError || null,
  };

  interface DiagRow {
    param: string;
    status: string;
    isOk: boolean;
    isWarning?: boolean;
    isText?: boolean;
    neutral?: boolean;
  }

  const rows: DiagRow[] = [
    {
      param: 'Active browser tab',
      status: activeData.activeTabConnected ? 'Connected' : 'Disconnected',
      isOk: activeData.activeTabConnected,
    },
    {
      param: 'TradingView host',
      status: activeData.tradingViewHostDetected ? 'Detected (in.tradingview.com / www)' : 'Not detected',
      isOk: activeData.tradingViewHostDetected,
    },
    {
      param: 'Host permission',
      status: activeData.hostPermissionGranted ? 'Granted' : 'Missing',
      isOk: activeData.hostPermissionGranted,
    },
    {
      param: 'Content script',
      status: activeData.contentScriptLoaded ? 'Loaded' : 'Failed / Standby',
      isOk: activeData.contentScriptLoaded,
    },
    {
      param: 'Message handshake',
      status: activeData.messageHandshakePassed ? 'Passed' : 'Failed',
      isOk: activeData.messageHandshakePassed,
    },
    {
      param: 'Visible Chart vs URL',
      status: activeData.isMismatch
        ? `URL (${activeData.urlSymbol}) differs from visible chart (${activeData.symbol}) - Visible Chart Active`
        : 'Synchronized with URL',
      isOk: !activeData.isMismatch,
      isWarning: activeData.isMismatch,
    },
    {
      param: 'Active Exchange & Symbol',
      status: activeData.symbol && activeData.exchange ? `${activeData.exchange}:${activeData.symbol}` : 'Missing',
      isOk: !!(activeData.symbol && activeData.exchange),
    },
    {
      param: 'Instrument Classification',
      status: activeData.statusMessage || activeData.instrumentType,
      isOk: activeData.isTradable,
      isWarning: !activeData.isTradable,
    },
    {
      param: 'Timeframe',
      status: activeData.timeframe ?? 'Missing',
      isOk: !!activeData.timeframe,
    },
    {
      param: 'Local Python Backend',
      status: backendStatus.connected
        ? `Connected (${backendStatus.url}) - Broker: ${backendStatus.broker || 'Ready'}`
        : 'Offline (http://127.0.0.1:8000) - Live Trading Locked',
      isOk: backendStatus.connected,
      isWarning: !backendStatus.connected,
    },
    {
      param: 'OHLC data',
      status: activeData.ohlcDataImported ? 'Imported (CSV)' : 'Not imported',
      isOk: activeData.ohlcDataImported,
    },
    {
      param: 'SMC engine',
      status: activeData.smcEngineStatus,
      isOk: activeData.smcEngineStatus === 'Ready',
    },
    {
      param: 'Last successful update',
      status: activeData.lastSuccessfulUpdate ? new Date(activeData.lastSuccessfulUpdate).toLocaleTimeString() : 'Never',
      isOk: !!activeData.lastSuccessfulUpdate,
    },
    {
      param: 'Last error',
      status: activeData.lastError || 'None',
      isOk: !activeData.lastError,
      isText: true,
    },
  ];

  return (
    <div className="space-y-4 text-xs font-mono">
      {/* Header bar */}
      <div className="p-3 bg-gray-800/80 rounded-lg border border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-accent-blue" />
          <span className="font-bold text-gray-200">CHART DIAGNOSTICS & SYSTEM AUDIT</span>
        </div>
        <button
          onClick={fetchDiagnostics}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1 bg-accent-blue hover:bg-accent-blue/80 text-white font-bold rounded text-[11px] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>REFRESH DIAGNOSTICS</span>
        </button>
      </div>

      {/* Diagnostics Table */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-950 border-b border-gray-800 text-gray-400 text-[10px] uppercase tracking-wider">
              <th className="p-2.5">Parameter</th>
              <th className="p-2.5 text-right">Status / Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-800/20 transition-colors">
                <td className="p-2.5 text-gray-300 font-medium">{row.param}</td>
                <td className="p-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {row.neutral ? (
                      <span className="text-gray-400">{row.status}</span>
                    ) : row.isWarning ? (
                      <>
                        <span className="text-accent-yellow font-bold">{row.status}</span>
                        <AlertTriangle className="w-3.5 h-3.5 text-accent-yellow" />
                      </>
                    ) : row.isOk ? (
                      <>
                        <span className="text-accent-green font-bold truncate max-w-xs">{row.status}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-accent-green flex-shrink-0" />
                      </>
                    ) : (
                      <>
                        <span className="text-accent-red font-bold truncate max-w-xs">{row.status}</span>
                        <XCircle className="w-3.5 h-3.5 text-accent-red flex-shrink-0" />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Troubleshooting guide */}
      <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700 text-[11px] space-y-1.5 font-sans">
        <p className="font-bold text-gray-300">Diagnostics Troubleshooting Guide:</p>
        <p className="text-gray-400">
          • If <strong>Content script</strong> reports Failed: reload the TradingView chart tab (<kbd className="bg-gray-700 px-1 rounded">F5</kbd>) so the updated content script injects.
        </p>
        <p className="text-gray-400">
          • If <strong>Host permission</strong> is missing: open <kbd className="bg-gray-700 px-1 rounded">chrome://extensions</kbd>, select Details, and ensure site access is allowed on <code>in.tradingview.com</code>.
        </p>
        <p className="text-gray-400">
          • If <strong>V1 Tradability</strong> displays Not Supported: Cash equities only are supported in V1. Futures and indices cannot be simulated or traded.
        </p>
      </div>
    </div>
  );
}

