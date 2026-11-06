// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – MV3 Service Worker (Background)
// ─────────────────────────────────────────────────────────────────────────────

import { AppSettings, ChartContext, ChartDiagnosticsData, MessageToBackground } from '../types';

// ── Default Settings ──────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
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

// ── In-memory tab → ChartContext cache ───────────────────────────────────────
const chartContextCache = new Map<number, ChartContext>();
const openSidePanels = new Set<number>();

// ── Install / Update handler ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[SMC SW] onInstalled:', details.reason);

  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
  });

  try {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (e) {
    console.warn('[SMC SW] sidePanel.setPanelBehavior not available:', e);
  }
});

// ── Browser action click → open side panel ────────────────────────────────────
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  try {
    chrome.sidePanel.open({ tabId: tab.id });
    openSidePanels.add(tab.id);
  } catch (e) {
    console.warn('[SMC SW] Failed to open side panel:', e);
  }
});

// ── Active tab switch → update context ────────────────────────────────────────
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const cached = chartContextCache.get(activeInfo.tabId);
  if (cached) {
    broadcastContext(cached, activeInfo.tabId);
  } else {
    // Try pinging the content script in the active tab
    queryTabContext(activeInfo.tabId);
  }
});

// ── Tab removal cleanup ────────────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  chartContextCache.delete(tabId);
  openSidePanels.delete(tabId);
});

function broadcastContext(ctx: ChartContext, tabId: number | null): void {
  try {
    chrome.runtime.sendMessage({
      type: 'CHART_CONTEXT_UPDATE',
      payload: ctx,
      tabId,
    });
  } catch {
    // Ignore when views are closed
  }
}

function queryTabContext(tabId: number): Promise<ChartContext | null> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(
        tabId,
        { type: 'GET_TRADINGVIEW_CHART_CONTEXT' },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          if (response?.payload) {
            chartContextCache.set(tabId, response.payload);
            broadcastContext(response.payload, tabId);
            resolve(response.payload);
          } else {
            resolve(null);
          }
        }
      );
    } catch {
      resolve(null);
    }
  });
}

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (message: MessageToBackground, sender, sendResponse) => {
    const senderTabId = sender.tab?.id ?? null;

    switch (message.type) {
      // ── Content script sends chart context update ──────────────────────────
      case 'CHART_CONTEXT_UPDATE': {
        const ctx = message.payload as ChartContext;
        if (senderTabId !== null) {
          chartContextCache.set(senderTabId, ctx);
        }
        broadcastContext(ctx, senderTabId);
        sendResponse({ type: 'ACK', payload: { ok: true } });
        break;
      }

      // ── Side panel requests current chart context ──────────────────────────
      case 'GET_TRADINGVIEW_CHART_CONTEXT': {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          const activeTab = tabs[0];
          if (!activeTab?.id) {
            sendResponse({ type: 'ACK', payload: null, error: 'No active tab' });
            return;
          }

          // Check memory cache first
          const cached = chartContextCache.get(activeTab.id);
          if (cached) {
            sendResponse({ type: 'ACK', payload: cached });
            // Refresh in background
            queryTabContext(activeTab.id);
            return;
          }

          // Query tab directly
          const fresh = await queryTabContext(activeTab.id);
          sendResponse({ type: 'ACK', payload: fresh });
        });
        return true; // async
      }

      // ── Diagnostics query ──────────────────────────────────────────────────
      case 'REFRESH_DIAGNOSTICS': {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          const activeTab = tabs[0];
          const tabId = activeTab?.id ?? null;
          const url = activeTab?.url ?? '';
          const isTV = url.includes('tradingview.com');
          const isIndiaHost = url.includes('in.tradingview.com');

          let hostPermission = false;
          try {
            hostPermission = await chrome.permissions.contains({
              origins: ['https://in.tradingview.com/*', 'https://www.tradingview.com/*'],
            });
          } catch {
            hostPermission = true;
          }

          let contentScriptLoaded = false;
          let ctx: ChartContext | null = tabId ? chartContextCache.get(tabId) ?? null : null;

          if (tabId && isTV) {
            const fresh = await queryTabContext(tabId);
            if (fresh) {
              contentScriptLoaded = true;
              ctx = fresh;
            }
          }

          const diagnostics: ChartDiagnosticsData = {
            activeTabConnected: !!tabId,
            tradingViewHostDetected: isTV,
            hostPermissionGranted: hostPermission,
            contentScriptLoaded,
            messageHandshakePassed: !!ctx,
            chartUrl: url || 'N/A',
            exchange: ctx?.exchange ?? null,
            symbol: ctx?.symbol ?? null,
            visibleSymbol: ctx?.visibleSymbol ?? null,
            urlSymbol: ctx?.urlSymbol ?? null,
            isMismatch: ctx?.isMismatch ?? false,
            instrumentType: ctx?.instrumentType ?? 'UNKNOWN',
            isTradable: ctx?.isTradable ?? false,
            statusMessage: ctx?.statusMessage ?? 'DATA NOT IMPORTED',
            timeframe: ctx?.timeframe ?? null,
            ohlcDataImported: false, // UI sets this from dataset count
            realTimeDataStatus: 'Unavailable (Visible DOM/URL metadata only)',
            smcEngineStatus: ctx?.detected ? 'Ready' : 'Waiting for Chart Context',
            backendConnected: false,
            lastSuccessfulUpdate: ctx?.lastUpdated ?? null,
            lastError: isTV
              ? contentScriptLoaded
                ? ctx?.lastError ?? null
                : 'Content script not responding. Ensure tab is reloaded on in.tradingview.com'
              : 'Active tab is not TradingView',
          };

          sendResponse({ type: 'DIAGNOSTICS_RESPONSE', payload: diagnostics });
        });
        return true; // async
      }

      // ── Side panel requests current settings ───────────────────────────────
      case 'GET_SETTINGS': {
        chrome.storage.local.get(['settings'], (result) => {
          const settings: AppSettings = result.settings ?? DEFAULT_SETTINGS;
          sendResponse({ type: 'SETTINGS_RESPONSE', payload: settings });
        });
        return true; // async
      }

      // ── Open Side Panel ────────────────────────────────────────────────────
      case 'OPEN_SIDE_PANEL': {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs[0]?.id;
          if (tabId) {
            try {
              chrome.sidePanel.open({ tabId });
              openSidePanels.add(tabId);
              sendResponse({ type: 'ACK', payload: { ok: true } });
            } catch (e) {
              sendResponse({ type: 'ACK', payload: { ok: false, error: String(e) } });
            }
          } else {
            sendResponse({ type: 'ACK', payload: { ok: false, error: 'No active tab' } });
          }
        });
        return true; // async
      }

      default:
        sendResponse({ type: 'ACK', payload: { ok: false, error: 'Unknown message type' } });
        break;
    }

    return true;
  }
);

console.log('[SMC SW] Service worker initialised.');
