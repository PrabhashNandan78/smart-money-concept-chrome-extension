// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – Main Side Panel Terminal
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  LineChart,
  Activity,
  Ticket,
  ShieldAlert,
  PlaySquare,
  BookOpen,
  FlaskConical,
  BarChart3,
  Settings as SettingsIcon,
  Terminal,
  Wifi,
  WifiOff,
  Zap,
  PowerOff,
} from 'lucide-react';
import { useAppStore } from './store/appStore';
import type { ActiveTab } from './types';
import { db } from './db';
import { AutoTradeConsentModal } from './components/AutoTradeConsentModal';

// Component Panels
import { Dashboard } from './components/Dashboard';
import { ChartMonitor } from './components/ChartMonitor';
import { SMCAnalysis } from './components/SMCAnalysis';
import { TradeSetup } from './components/TradeSetup';
import { RiskManager } from './components/RiskManager';
import { PaperTrading } from './components/PaperTrading';
import { TradeJournal } from './components/TradeJournal';
import { Backtesting } from './components/Backtesting';
import { Reports } from './components/Reports';
import { Settings } from './components/Settings';
import { ChartDiagnostics } from './components/ChartDiagnostics';

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'Dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'ChartMonitor', label: 'Chart Monitor', icon: <LineChart className="w-4 h-4" /> },
  { id: 'SMCAnalysis', label: 'SMC Analysis', icon: <Activity className="w-4 h-4" /> },
  { id: 'TradeSetup', label: 'Trade Setup', icon: <Ticket className="w-4 h-4" /> },
  { id: 'RiskManager', label: 'Risk Manager', icon: <ShieldAlert className="w-4 h-4" /> },
  { id: 'PaperTrading', label: 'Paper Trading', icon: <PlaySquare className="w-4 h-4" /> },
  { id: 'TradeJournal', label: 'Journal', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'Backtesting', label: 'Backtesting', icon: <FlaskConical className="w-4 h-4" /> },
  { id: 'Reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'Diagnostics', label: 'Diagnostics', icon: <Terminal className="w-4 h-4" /> },
  { id: 'Settings', label: 'Settings', icon: <SettingsIcon className="w-4 h-4" /> },
];

export function App() {
  const {
    activeTab,
    setActiveTab,
    chartContext,
    setTrades,
    setDatasets,
    trades,
    tradingMode,
    setTradingMode,
    backendStatus,
    loadSettings,
    checkBackendHealth,
    autoTrade,
    setAutoTradeActive,
    setAutoTradeConsent,
    setEmergencyDisabled,
  } = useAppStore();

  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);

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

  // Initialize IndexedDB and hydrate saved state on mount
  useEffect(() => {
    async function initStorage() {
      try {
        await loadSettings();
        await db.open();
        const loadedTrades = await db.getAllTrades();
        if (loadedTrades && loadedTrades.length > 0) {
          setTrades(loadedTrades);
        }
        const loadedDatasets = await db.getAllDatasets();
        if (loadedDatasets && loadedDatasets.length > 0) {
          setDatasets(loadedDatasets);
        }
        checkBackendHealth();
      } catch (e) {
        console.warn('[SMC Terminal] Storage initialization notice:', e);
      }
    }
    initStorage();
  }, [setTrades, setDatasets, loadSettings, checkBackendHealth]);

  // Listen for messages from background/content-script & query on mount
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const listener = (message: any) => {
        if (message.type === 'CHART_CONTEXT_UPDATE' && message.payload) {
          useAppStore.getState().setChartContext(message.payload);
        }
      };
      chrome.runtime.onMessage.addListener(listener);

      // Active handshake: Query current tab context immediately on mount
      chrome.runtime.sendMessage({ type: 'GET_TRADINGVIEW_CHART_CONTEXT' }, (res) => {
        if (chrome.runtime.lastError) {
          // background service worker might be dormant or not on tradingview
          return;
        }
        if (res && res.context) {
          useAppStore.getState().setChartContext(res.context);
        }
      });

      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  return (
    <div className="flex h-screen w-screen bg-[#0b0e14] text-gray-100 font-sans select-none overflow-hidden">
      {/* Left Navigation Sidebar */}
      <aside className="w-48 bg-[#0f141f] border-r border-gray-800 flex flex-col flex-shrink-0">
        {/* Terminal Header */}
        <div className="p-3 border-b border-gray-800 flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-accent-green/20 border border-accent-green/50 flex items-center justify-center font-mono font-black text-accent-green text-xs">
            S
          </div>
          <div className="leading-none">
            <span className="font-bold text-xs tracking-wider text-gray-200 block">SMC TERMINAL</span>
            <span className="text-[9px] text-gray-400 font-mono">QUANTITATIVE TRADING</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/30 font-semibold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                }`}
              >
                <span className={isActive ? 'text-accent-blue' : 'text-gray-500'}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Chart Status Pill */}
        <div className="p-2.5 border-t border-gray-800/80 bg-[#0c1018] text-[10px] font-mono">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="flex items-center gap-1">
              {chartContext.detected ? (
                <Wifi className="w-3 h-3 text-accent-green" />
              ) : (
                <WifiOff className="w-3 h-3 text-gray-500" />
              )}
              <span>{chartContext.detected ? 'CHART DETECTED' : 'NO CHART'}</span>
            </span>
            <span className="text-gray-500">{chartContext.market || 'LOCAL'}</span>
          </div>
          <div className="text-accent-green font-bold truncate">
            {chartContext.exchange ? `${chartContext.exchange}:` : ''}
            {chartContext.symbol || 'SELECT INSTRUMENT'}
          </div>
          <div className="text-[9px] mt-1 text-gray-400 truncate">
            {chartContext.statusMessage}
          </div>
          {chartContext.isMismatch && (
            <div className="text-[8px] text-amber-400 truncate mt-0.5" title={chartContext.mismatchDiagnostic || ''}>
              ⚠ URL MISMATCH OVERRIDDEN
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0b0e14] overflow-hidden">
        {/* Top View Title Bar with Mode Selector */}
        <header className="h-12 bg-[#0f141f] border-b border-gray-800 px-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-xs text-gray-200">
              {NAV_ITEMS.find((i) => i.id === activeTab)?.label}
            </span>
            <span className="text-gray-600">/</span>
            <span className="text-[11px] text-gray-400 font-mono">
              {chartContext.symbol ? `${chartContext.symbol} • ${chartContext.timeframe || '5m'}` : 'Offline Mode'}
            </span>
          </div>

          {/* Center Mode Selector */}
          <div className="flex items-center gap-2">
            {/* Auto-Trade Switch & Emergency Button */}
            <button
              onClick={handleToggleAutoTrade}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-[10px] font-black transition-all ${
                autoTrade.active && !autoTrade.emergencyDisabled
                  ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
              title="Toggle TradingView Native Paper Trading Auto Execution"
            >
              <Zap className="w-3 h-3" />
              <span>AUTO TRADE [ {autoTrade.active && !autoTrade.emergencyDisabled ? 'ACTIVE' : 'INACTIVE'} ]</span>
            </button>

            {autoTrade.active && !autoTrade.emergencyDisabled && (
              <button
                onClick={() => setEmergencyDisabled(true)}
                className="flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm"
                title="Immediate Kill Switch for Auto Trade"
              >
                <PowerOff className="w-3 h-3" />
                <span>HALT</span>
              </button>
            )}

            <div className="flex items-center bg-gray-900 border border-gray-700/80 rounded p-0.5">
              <button
                onClick={() => setTradingMode('PAPER')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  tradingMode === 'PAPER'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                PAPER TRADING
              </button>
              <button
                onClick={() => setTradingMode('LIVE')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  tradingMode === 'LIVE'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                LIVE TRADING
              </button>
            </div>

            {/* Mode Indicator Pill */}
            {tradingMode === 'PAPER' ? (
              <span className="px-2 py-1 rounded text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 font-mono font-bold">
                SIMULATED EXECUTION
              </span>
            ) : backendStatus.connected && backendStatus.brokerConnected ? (
              <span className="px-2 py-1 rounded text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800/80 font-mono font-bold">
                LIVE: {backendStatus.broker} CONNECTED
              </span>
            ) : (
              <span
                className="px-2 py-1 rounded text-[10px] bg-red-950/60 text-red-300 border border-red-800/80 font-mono font-bold cursor-pointer"
                onClick={() => checkBackendHealth()}
                title={backendStatus.error || 'Click to retry connection'}
              >
                LIVE MODE LOCKED — {backendStatus.connected ? 'BROKER REQ.' : 'BACKEND OFFLINE'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="text-gray-500 hidden sm:inline">
              Trades: <strong className="text-gray-300">{trades.length}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 font-bold">
              Strict 3:1 NET R:R
            </span>
          </div>
        </header>

        {/* Active Panel View */}
        <section className="flex-1 p-4 overflow-y-auto">
          {activeTab === 'Dashboard' && <Dashboard />}
          {activeTab === 'ChartMonitor' && <ChartMonitor />}
          {activeTab === 'SMCAnalysis' && <SMCAnalysis />}
          {activeTab === 'TradeSetup' && <TradeSetup />}
          {activeTab === 'RiskManager' && <RiskManager />}
          {activeTab === 'PaperTrading' && <PaperTrading />}
          {activeTab === 'TradeJournal' && <TradeJournal />}
          {activeTab === 'Backtesting' && <Backtesting />}
          {activeTab === 'Reports' && <Reports />}
          {activeTab === 'Diagnostics' && <ChartDiagnostics />}
          {activeTab === 'Settings' && <Settings />}
        </section>
      </main>

      {/* Auto Trade Consent Modal */}
      <AutoTradeConsentModal
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
        onConfirm={() => {
          setAutoTradeConsent(true);
          setAutoTradeActive(true);
        }}
      />
    </div>
  );
}

export default App;
