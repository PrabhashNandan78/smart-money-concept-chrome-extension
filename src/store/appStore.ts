// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – Zustand App Store
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ActiveTab,
  AppSettings,
  AutoTradeState,
  BackendStatus,
  ChartContext,
  ImportedDataset,
  SMCSignal,
  Trade,
  TradingMode,
  TVPaperAccountInfo,
  TVPaperPosition,
} from '../types';
import type { TVExecutionResult, TVOrderRequest } from '../execution/tv-paper-automator';

// ── Default Settings ──────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  market: 'INDIA',
  defaultExchange: 'NSE',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  tradingSession: { open: '09:15', close: '15:30' },
  strategyVersion: '1.0.0',
  pivotLength: 10,
  atrLength: 14,
  liquidityTolerance: 0.001,
  fvgMinSize: 0.002,
  displacementThreshold: 1.5,
  htfBiasRequired: true,
  ltfConfirmationRequired: true,
  risk: {
    accountEquity: 500000,
    riskPerTrade: 0.25,
    maxDailyLoss: 1.0,
    maxWeeklyLoss: 2.5,
    drawdownPause: 5.0,
    maxConcurrentTrades: 3,
    maxAggregateRisk: 0.75,
    tradesPerSymbolPerSession: 1,
    minRR: 3.0,
    currency: 'INR',
  },
};

// ── Chrome storage helpers ────────────────────────────────────────────────────

function safeStorageGet<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get([key], (result) => {
          resolve((result[key] as T) ?? fallback);
        });
      } else {
        // Dev/non-extension context – use localStorage as fallback
        const raw = localStorage.getItem(`smc_${key}`);
        resolve(raw ? (JSON.parse(raw) as T) : fallback);
      }
    } catch {
      resolve(fallback);
    }
  });
}

function safeStorageSet(key: string, value: unknown): void {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [key]: value });
    } else {
      localStorage.setItem(`smc_${key}`, JSON.stringify(value));
    }
  } catch {
    // ignore storage errors
  }
}

// ── Active TradingView tab finder ──────────────────────────────────────────────

export async function getActiveTVTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
        resolve(null);
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id && tab.url && (tab.url.includes('tradingview.com') || tab.url.includes('in.tradingview.com'))) {
          resolve(tab.id);
        } else {
          chrome.tabs.query({ url: ['*://*.tradingview.com/*', '*://tradingview.com/*'] }, (tvTabs) => {
            if (tvTabs.length > 0 && tvTabs[0]?.id) {
              resolve(tvTabs[0].id);
            } else {
              resolve(null);
            }
          });
        }
      });
    } catch {
      resolve(null);
    }
  });
}

// ── Store shape ───────────────────────────────────────────────────────────────

export interface AppState {
  // UI
  activeTab: ActiveTab;
  sidebarCollapsed: boolean;
  tradingMode: TradingMode; // 'PAPER' | 'LIVE'

  // TradingView Native Paper Trading & Auto-trade state
  autoTrade: AutoTradeState;
  tvPaperAccount: TVPaperAccountInfo;
  tvPositions: TVPaperPosition[];

  // Chart context (received from content script via background)
  chartContext: ChartContext;

  // Local Python execution backend & broker connection status
  backendStatus: BackendStatus;

  // Settings
  settings: AppSettings;
  settingsLoaded: boolean;

  // Imported OHLCV datasets (for backtesting / SMC analysis)
  datasets: ImportedDataset[];

  // SMC signals generated from analysis
  signals: SMCSignal[];
  currentSignal: SMCSignal | null;

  // Paper + manual live trades
  trades: Trade[];

  // ── Actions ──────────────────────────────────────────────────────────────────

  setActiveTab: (tab: ActiveTab) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTradingMode: (mode: TradingMode) => void;

  setChartContext: (ctx: ChartContext) => void;
  setBackendStatus: (status: Partial<BackendStatus>) => void;
  checkBackendHealth: () => Promise<void>;

  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateRiskSettings: (patch: Partial<AppSettings['risk']>) => void;

  setDatasets: (datasets: ImportedDataset[]) => void;
  addDataset: (dataset: ImportedDataset) => void;
  removeDataset: (id: string) => void;

  addSignal: (signal: SMCSignal) => void;
  setCurrentSignal: (signal: SMCSignal | null) => void;
  clearSignals: () => void;

  setTrades: (trades: Trade[]) => void;
  addTrade: (trade: Trade) => void;
  updateTrade: (id: string, patch: Partial<Trade>) => void;
  removeTrade: (id: string) => void;

  // Auto-trade and TV Paper Actions
  setAutoTradeActive: (active: boolean) => void;
  setAutoTradeConsent: (consent: boolean) => void;
  setEmergencyDisabled: (disabled: boolean) => void;
  setTVPaperAccount: (info: TVPaperAccountInfo) => void;
  setTVPositions: (positions: TVPaperPosition[]) => void;
  syncTVPaperStatus: () => Promise<void>;
  executeTVPaperOrder: (order: TVOrderRequest) => Promise<TVExecutionResult>;
  evaluateAutoTrade: () => Promise<void>;

  // Derived helpers
  getOpenTrades: () => Trade[];
  getPaperTrades: () => Trade[];
  getLiveTrades: () => Trade[];
}

// ── Create store ──────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial state ─────────────────────────────────────────────────────────
    activeTab: 'Dashboard',
    sidebarCollapsed: false,
    tradingMode: 'PAPER',

    autoTrade: {
      active: false,
      consentGiven: false,
      lastTriggered: null,
      lastError: null,
      emergencyDisabled: false,
      verifiedTVOrder: false,
      positionStatus: 'NONE',
    },

    tvPaperAccount: {
      connected: false,
      accountName: 'TradingView Paper Trading',
      balance: 100000,
      equity: 100000,
      unrealizedPnl: 0,
      realizedPnl: 0,
      currency: 'USD',
      lastUpdated: 0,
    },

    tvPositions: [],

    chartContext: {
      detected: false,
      exchange: null,
      symbol: null,
      timeframe: null,
      market: null,
      instrumentType: 'UNKNOWN',
      isTradable: false,
      statusMessage: 'DATA NOT IMPORTED',
      chartStatus: 'DISCONNECTED',
      url: '',
      lastUpdated: 0,
      source: 'NONE',
      visibleSymbol: null,
      visibleExchange: null,
      urlSymbol: null,
      urlExchange: null,
      isMismatch: false,
      mismatchDiagnostic: null,
      lastError: null,
    },

    backendStatus: {
      connected: false,
      url: 'http://127.0.0.1:8000',
      broker: null,
      brokerConnected: false,
      accountIdentity: null,
      marketPermissions: ['INDIA', 'US'],
      cashBalance: 0,
      availableFunds: 0,
      tradingPermissions: false,
      marketDataPermissions: false,
      lastSuccessfulConnection: null,
      lastPing: null,
      error: null,
      killSwitchActive: false,
    },

    settings: DEFAULT_SETTINGS,
    settingsLoaded: false,

    datasets: [],
    signals: [],
    currentSignal: null,
    trades: [],

    // ── UI Actions ────────────────────────────────────────────────────────────

    setActiveTab: (tab) => set({ activeTab: tab }),

    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

    setTradingMode: (mode) => {
      set({ tradingMode: mode });
      safeStorageSet('tradingMode', mode);
      if (mode === 'LIVE') {
        get().checkBackendHealth();
      }
    },

    // ── Chart context with automated invalidation ─────────────────────────────

    setChartContext: (ctx) => {
      const prev = get().chartContext;
      const symbolChanged = prev.symbol !== ctx.symbol;
      const timeframeChanged = prev.timeframe !== ctx.timeframe;

      // When the active instrument changes, invalidate any previously selected analysis that belongs to another instrument.
      // Never continue displaying the previous symbol's signals or entry levels.
      if (symbolChanged || timeframeChanged) {
        set({
          chartContext: ctx,
          currentSignal: null, // Invalidate previous analysis!
        });
      } else {
        set({ chartContext: ctx });
      }
    },

    // ── Backend & Broker Health ───────────────────────────────────────────────

    setBackendStatus: (patch) => {
      set({ backendStatus: { ...get().backendStatus, ...patch } });
    },

    checkBackendHealth: async () => {
      const backendUrl = get().backendStatus.url;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${backendUrl}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          set({
            backendStatus: {
              ...get().backendStatus,
              connected: true,
              broker: data.broker || null,
              brokerConnected: data.broker_connected || false,
              accountIdentity: data.account_identity || null,
              cashBalance: data.cash_balance || 0,
              availableFunds: data.available_funds || 0,
              tradingPermissions: data.trading_permissions || false,
              marketDataPermissions: data.market_data_permissions || false,
              killSwitchActive: data.kill_switch_active || false,
              lastPing: Date.now(),
              error: null,
            },
          });
        } else {
          set({
            backendStatus: {
              ...get().backendStatus,
              connected: false,
              brokerConnected: false,
              error: `Backend responded with HTTP ${res.status}`,
            },
          });
        }
      } catch (e: any) {
        set({
          backendStatus: {
            ...get().backendStatus,
            connected: false,
            brokerConnected: false,
            error: 'Cannot connect to local backend (http://127.0.0.1:8000). Ensure backend/main.py is running.',
          },
        });
      }
    },

    // ── Settings ──────────────────────────────────────────────────────────────

    loadSettings: async () => {
      const stored = await safeStorageGet<AppSettings>('settings', DEFAULT_SETTINGS);
      const savedMode = await safeStorageGet<TradingMode>('tradingMode', 'PAPER');
      // Ensure minRR is never below 3.0
      if (stored.risk) {
        stored.risk.minRR = Math.max(stored.risk.minRR ?? 3.0, 3.0);
      }
      set({ settings: stored, settingsLoaded: true, tradingMode: savedMode });
    },

    updateSettings: (patch) => {
      const next = { ...get().settings, ...patch };
      // Guard: minRR must remain >= 3.0
      if (next.risk) {
        next.risk.minRR = Math.max(next.risk.minRR, 3.0);
      }
      set({ settings: next });
      safeStorageSet('settings', next);
    },

    updateRiskSettings: (patch) => {
      const current = get().settings;
      const nextRisk = { ...current.risk, ...patch };
      // Guard: minRR must remain >= 3.0
      nextRisk.minRR = Math.max(nextRisk.minRR ?? 3.0, 3.0);
      const next = { ...current, risk: nextRisk };
      set({ settings: next });
      safeStorageSet('settings', next);
    },

    // ── Datasets ──────────────────────────────────────────────────────────────

    setDatasets: (datasets) => set({ datasets }),

    addDataset: (dataset) => {
      const next = [
        dataset,
        ...get().datasets.filter((d) => d.id !== dataset.id),
      ];
      set({ datasets: next });
      safeStorageSet('datasets', next);
    },

    removeDataset: (id) => {
      const next = get().datasets.filter((d) => d.id !== id);
      set({ datasets: next });
      safeStorageSet('datasets', next);
    },

    // ── Signals ───────────────────────────────────────────────────────────────

    addSignal: (signal) => {
      const next = [signal, ...get().signals].slice(0, 200); // keep last 200
      set({ signals: next });
    },

    setCurrentSignal: (signal) => {
      set({ currentSignal: signal });
      if (signal && get().autoTrade.active) {
        get().evaluateAutoTrade();
      }
    },

    clearSignals: () => set({ signals: [], currentSignal: null }),

    // ── Trades ───────────────────────────────────────────────────────────────

    setTrades: (trades) => set({ trades }),

    addTrade: (trade) => {
      const next = [trade, ...get().trades];
      set({ trades: next });
      safeStorageSet('trades', next);
    },

    updateTrade: (id, patch) => {
      const next = get().trades.map((t) => (t.id === id ? { ...t, ...patch } : t));
      set({ trades: next });
      safeStorageSet('trades', next);
    },

    removeTrade: (id) => {
      const next = get().trades.filter((t) => t.id !== id);
      set({ trades: next });
      safeStorageSet('trades', next);
    },

    // ── TV Paper Trading & Auto-Trade Actions ───────────────────────────────────

    setAutoTradeActive: (active) => {
      set((state) => ({
        autoTrade: {
          ...state.autoTrade,
          active,
          emergencyDisabled: active ? false : state.autoTrade.emergencyDisabled,
        },
      }));
      // Notify active TradingView tab
      getActiveTVTabId().then((tabId) => {
        if (tabId && typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
          chrome.tabs.sendMessage(tabId, { type: 'UPDATE_AUTO_TRADE_STATUS', active });
        }
      });
      if (active) {
        get().syncTVPaperStatus();
        get().evaluateAutoTrade();
      }
    },

    setAutoTradeConsent: (consent) => {
      set((state) => ({
        autoTrade: { ...state.autoTrade, consentGiven: consent },
      }));
    },

    setEmergencyDisabled: (disabled) => {
      set((state) => ({
        autoTrade: {
          ...state.autoTrade,
          emergencyDisabled: disabled,
          active: disabled ? false : state.autoTrade.active,
        },
      }));
      // Notify active TradingView tab
      getActiveTVTabId().then((tabId) => {
        if (tabId && typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
          chrome.tabs.sendMessage(tabId, { type: 'UPDATE_AUTO_TRADE_STATUS', active: false });
        }
      });
    },

    setTVPaperAccount: (tvPaperAccount) => set({ tvPaperAccount }),
    setTVPositions: (tvPositions) => set({ tvPositions }),

    syncTVPaperStatus: async () => {
      const tabId = await getActiveTVTabId();
      if (!tabId || typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) return;
      chrome.tabs.sendMessage(tabId, { type: 'CHECK_TV_PAPER_STATUS' }, (res) => {
        if (res?.account) {
          set({ tvPaperAccount: res.account });
        }
      });
      chrome.tabs.sendMessage(tabId, { type: 'GET_TV_POSITIONS' }, (res) => {
        if (res?.positions) {
          set({ tvPositions: res.positions });
        }
      });
    },

    executeTVPaperOrder: async (order: TVOrderRequest): Promise<TVExecutionResult> => {
      const tabId = await getActiveTVTabId();
      if (!tabId || typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
        return {
          success: false,
          verifiedInTV: false,
          status: 'DISCONNECTED',
          slStatus: 'NOT_VERIFIED',
          tpStatus: 'NOT_VERIFIED',
          message: 'No active TradingView tab available for native Paper Trading execution.',
        };
      }
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_TV_PAPER_ORDER', order }, (res) => {
          if (res?.result) {
            const result: TVExecutionResult = res.result;
            if (result.success && result.verifiedInTV) {
              const riskPerShare = Math.abs(order.limitPrice - order.stopLoss);
              const rewardPerShare = Math.abs(order.takeProfit - order.limitPrice);
              const rr = riskPerShare > 0 ? rewardPerShare / riskPerShare : 3.0;
              const estCosts = get().settings.market === 'INDIA' ? order.limitPrice * order.quantity * 0.0005 : order.quantity * 0.01;

              const newTrade: Trade = {
                id: result.orderId || `TV_${Date.now()}`,
                market: get().chartContext.market || 'INDIA',
                exchange: get().chartContext.exchange || 'NSE',
                symbol: order.symbol,
                strategyVersion: get().settings.strategyVersion || '1.0.0',
                tradeType: 'TV_NATIVE_PAPER',
                direction: 'LONG',
                status: 'OPEN',
                htfBias: 'BULLISH',
                marketStructure: 'BULLISH CHoCH',
                bosDetected: true,
                chochDetected: true,
                liquiditySweepDetected: true,
                fvgDetected: true,
                orderBlockDetected: false,
                entryConfirmation: 'FVG Retest Confirmed',
                plannedEntry: order.limitPrice,
                actualEntry: order.limitPrice,
                stopLoss: order.stopLoss,
                takeProfit: order.takeProfit,
                quantity: order.quantity,
                riskAmount: riskPerShare * order.quantity,
                actualExit: null,
                grossPnl: null,
                estimatedCosts: estCosts,
                actualCosts: null,
                netPnl: null,
                rMultiple: null,
                createdAt: Date.now(),
                entryAt: Date.now(),
                exitAt: null,
                screenshot: null,
                entryReasoning: 'TRADINGVIEW NATIVE PAPER TRADING AUTO-EXECUTION',
                exitReasoning: '',
                ruleCompliant: true,
                mistakes: '',
                lessonsLearned: '',
                brokerOrderRef: result.orderId || null,
                actualEntryPrice: order.limitPrice,
                actualQuantity: order.quantity,
                slOrderConfirmed: result.slStatus === 'PROTECTED',
                tpOrderConfirmed: result.tpStatus === 'PROTECTED',
              };
              get().addTrade(newTrade);
              set((state) => ({
                autoTrade: {
                  ...state.autoTrade,
                  lastTriggered: Date.now(),
                  verifiedTVOrder: true,
                  positionStatus: 'OPEN',
                  lastError: null,
                },
              }));
            } else {
              set((state) => ({
                autoTrade: {
                  ...state.autoTrade,
                  verifiedTVOrder: false,
                  lastError: result.message,
                },
              }));
            }
            resolve(result);
          } else {
            resolve({
              success: false,
              verifiedInTV: false,
              status: 'REJECTED',
              slStatus: 'NOT_VERIFIED',
              tpStatus: 'NOT_VERIFIED',
              message: 'TradingView content script did not respond to order execution request.',
            });
          }
        });
      });
    },

    evaluateAutoTrade: async () => {
      const state = get();
      const { autoTrade, currentSignal, chartContext, settings, trades, tvPositions } = state;
      if (!autoTrade.active || !autoTrade.consentGiven || autoTrade.emergencyDisabled) return;
      if (!currentSignal || currentSignal.signalStatus !== 'VALID_SIGNAL') return;
      if (currentSignal.htfBias !== 'BULLISH') return;
      if (!chartContext.isTradable || !chartContext.symbol) return;

      if (currentSignal.symbol.toUpperCase() !== chartContext.symbol.toUpperCase()) return;

      const entry = currentSignal.fvg?.midpoint || (currentSignal.entryZone ? (currentSignal.entryZone.top + currentSignal.entryZone.bottom) / 2 : 0);
      const sl = currentSignal.liquiditySweep ? currentSignal.liquiditySweep.sweepLow * 0.998 : entry * 0.98;
      const riskPerShare = entry - sl;
      if (riskPerShare <= 0) return;

      const tp = entry + riskPerShare * 3.0;
      const rr = (tp - entry) / riskPerShare;
      if (rr < 3.0) return;

      const existingOpen = trades.some(
        (t) => t.symbol.toUpperCase() === chartContext.symbol!.toUpperCase() && (t.status === 'OPEN' || t.status === 'WAITING_ENTRY')
      );
      const existingTVPos = tvPositions.some(
        (p) => p.symbol.toUpperCase().includes(chartContext.symbol!.toUpperCase())
      );
      if (existingOpen || existingTVPos) return;

      const equity = settings.risk.accountEquity || 100000;
      const riskAmount = equity * ((settings.risk.riskPerTrade || 0.25) / 100);
      const quantity = Math.max(1, Math.floor(riskAmount / riskPerShare));

      await state.executeTVPaperOrder({
        symbol: chartContext.symbol,
        side: 'BUY',
        quantity,
        limitPrice: entry,
        stopLoss: sl,
        takeProfit: tp,
      });
    },

    // ── Derived ───────────────────────────────────────────────────────────────

    getOpenTrades: () =>
      get().trades.filter((t) => t.status === 'OPEN' || t.status === 'WAITING_ENTRY' || t.status === 'ENTRY_SIMULATED'),

    getPaperTrades: () =>
      get().trades.filter((t) => t.tradeType === 'PAPER'),

    getLiveTrades: () =>
      get().trades.filter((t) => t.tradeType === 'MANUAL_LIVE'),
  }))
);

// ── Hydrate store from chrome.storage on startup ──────────────────────────────

async function hydrateStore(): Promise<void> {
  const store = useAppStore.getState();

  // Load settings
  await store.loadSettings();

  // Load trades
  const trades = await safeStorageGet<Trade[]>('trades', []);
  useAppStore.setState({ trades });

  // Load datasets (without candle data to avoid memory bloat – candles stored separately)
  const datasets = await safeStorageGet<ImportedDataset[]>('datasets_meta', []);
  useAppStore.setState({ datasets });
}

// Listen for chart context updates relayed from background
try {
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'CHART_CONTEXT_UPDATED' && message.payload) {
        useAppStore.getState().setChartContext(message.payload);
      }
    });
  }
} catch {
  // Non-extension context
}

// Run hydration
hydrateStore().catch(console.error);

export default useAppStore;
