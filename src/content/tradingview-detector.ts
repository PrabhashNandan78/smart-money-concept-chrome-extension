// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – TradingView Content Script / Dynamic Chart Detector
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ChartContext,
  Exchange,
  InstrumentStatus,
  InstrumentType,
  Market,
  Timeframe,
} from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────
const INDIA_EXCHANGES: Exchange[] = ['NSE', 'BSE', 'NSEIX'];
const US_EXCHANGES: Exchange[] = ['NYSE', 'NASDAQ', 'AMEX'];
const CRYPTO_EXCHANGES: Exchange[] = ['BITSTAMP', 'COINBASE', 'BINANCE'];

import {
  checkTVPaperConnection,
  openTVOrderTicket,
  submitTVPaperOrder,
  getTVOpenPositions,
  type TVOrderRequest,
} from '../execution/tv-paper-automator';

const TIMEFRAME_LABEL_MAP: Record<string, Timeframe> = {
  // Minutes
  '1': '1m',
  '1m': '1m',
  '1M_min': '1m',
  '3': '3m',
  '3m': '3m',
  '5': '5m',
  '5m': '5m',
  '15': '15m',
  '15m': '15m',
  '30': '30m',
  '30m': '30m',
  '45': '45m',
  '45m': '45m',
  // Hours
  '60': '1h',
  '1h': '1h',
  '1H': '1h',
  'H': '1h',
  '120': '2h',
  '2h': '2h',
  '2H': '2h',
  '240': '4h',
  '4h': '4h',
  '4H': '4h',
  // Days
  'D': '1d',
  '1D': '1d',
  '1d': '1d',
  'day': '1d',
  // Weeks
  'W': '1w',
  '1W': '1w',
  '1w': '1w',
  'week': '1w',
  // Months
  'M': '1M',
  '1M': '1M',
  'month': '1M',
};

// Debounce delay for DOM mutations (ms)
const DEBOUNCE_MS = 250;

// ── State ─────────────────────────────────────────────────────────────────────
let lastSentContext: string = '';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let mutationObserver: MutationObserver | null = null;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;
let lastDetectedContext: ChartContext | null = null;

// ── Utility helpers ───────────────────────────────────────────────────────────

/** Try multiple CSS selectors and return the first matching element's text. */
function queryText(...selectors: string[]): string | null {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.textContent?.trim()) return el.textContent.trim();
    } catch {
      // invalid selector – skip
    }
  }
  return null;
}

/** Determine market from exchange string. */
export function marketFromExchange(exchange: Exchange): Market {
  if (CRYPTO_EXCHANGES.includes(exchange)) return 'CRYPTO';
  return INDIA_EXCHANGES.includes(exchange) ? 'INDIA' : 'US';
}

/** Normalise a raw exchange string to a known Exchange value. */
export function parseExchange(raw: string): Exchange | null {
  if (!raw) return null;
  const upper = raw.toUpperCase().trim();
  if (upper === 'NSE') return 'NSE';
  if (upper === 'BSE') return 'BSE';
  if (upper === 'NSEIX') return 'NSEIX';
  if (upper === 'NYSE') return 'NYSE';
  if (upper === 'NASDAQ') return 'NASDAQ';
  if (upper === 'AMEX') return 'AMEX';
  if (upper === 'BITSTAMP') return 'BITSTAMP';
  if (upper === 'COINBASE') return 'COINBASE';
  if (upper === 'BINANCE') return 'BINANCE';
  return null;
}

/** Normalise a raw timeframe label to a known Timeframe value. */
export function parseTimeframe(raw: string): Timeframe | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return TIMEFRAME_LABEL_MAP[trimmed] ?? TIMEFRAME_LABEL_MAP[trimmed.toLowerCase()] ?? null;
}

/**
 * Classify instrument type and eligibility.
 * - Cash equities (RELIANCE, TCS, AAPL, MSFT, etc.): CASH_EQUITY -> EQUITY SUPPORTED
 * - Cryptocurrencies (BTCUSD, ETHUSD, SOLUSD, etc.): CRYPTOCURRENCY -> CRYPTO SUPPORTED
 * - Continuous futures (NIFTY1!, BANKNIFTY1!, ES1!, NSEIX): FUTURES -> FUTURES NOT CONFIGURED
 * - Indices (NIFTY, BANKNIFTY, SPX, NDX): INDEX -> INDEX NOT TRADEABLE IN CURRENT PROFILE
 */
export function classifyInstrument(
  exchange: Exchange | null,
  symbol: string | null
): { instrumentType: InstrumentType; isTradable: boolean; statusMessage: InstrumentStatus } {
  if (!symbol) {
    return {
      instrumentType: 'UNKNOWN',
      isTradable: false,
      statusMessage: 'DATA NOT IMPORTED',
    };
  }

  const upperSym = symbol.toUpperCase().trim();

  // Cryptocurrencies (BTCUSD, ETHUSD, SOLUSD on Bitstamp, Coinbase, Binance)
  const isCrypto =
    (exchange && CRYPTO_EXCHANGES.includes(exchange)) ||
    upperSym.startsWith('BTC') ||
    upperSym.startsWith('ETH') ||
    upperSym.startsWith('SOL') ||
    upperSym.endsWith('USDT') ||
    upperSym === 'BTCUSD' ||
    upperSym === 'ETHUSD';

  if (isCrypto) {
    return {
      instrumentType: 'CRYPTOCURRENCY',
      isTradable: true,
      statusMessage: 'CRYPTO SUPPORTED',
    };
  }

  // Continuous futures or futures contract identifiers
  if (upperSym.endsWith('!') || upperSym.endsWith('1!') || upperSym.endsWith('2!') || upperSym.includes('FUT') || exchange === 'NSEIX') {
    return {
      instrumentType: 'FUTURES',
      isTradable: false,
      statusMessage: 'FUTURES NOT CONFIGURED',
    };
  }

  // Major Index symbols
  const indexSymbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'SPX', 'NDX', 'DJI', 'VIX'];
  if (indexSymbols.includes(upperSym) || upperSym.startsWith('CNX')) {
    return {
      instrumentType: 'INDEX',
      isTradable: false,
      statusMessage: 'INDEX NOT TRADEABLE IN CURRENT PROFILE',
    };
  }

  // Cash Equities on supported exchanges
  if (exchange && ['NSE', 'BSE', 'NASDAQ', 'NYSE', 'AMEX'].includes(exchange)) {
    return {
      instrumentType: 'CASH_EQUITY',
      isTradable: true,
      statusMessage: 'EQUITY SUPPORTED',
    };
  }

  return {
    instrumentType: 'UNKNOWN',
    isTradable: false,
    statusMessage: 'DATA NOT IMPORTED',
  };
}

// ── Detection strategies with strict priority ───────────────────────────────────

/**
 * Strategy 1 (HIGHEST PRIORITY):
 * Detect actual visible selected TradingView chart symbol and exchange from active DOM.
 * Inspects:
 * - Header toolbar symbol search button text (#header-toolbar-symbol-search)
 * - Active chart pane legend series item (div[data-name="legend-series-item"])
 * - Breadcrumbs / pane title
 */
export function detectFromVisibleDOM(): (Partial<ChartContext> & { source: 'VISIBLE_TRADINGVIEW_CHART' | 'DOM_HEADER' }) | null {
  const isIndianHost = typeof window !== 'undefined' && window.location.hostname.includes('in.tradingview.com');

  // 1. Check the active symbol search button on the top toolbar
  const toolbarSymbolSelectors = [
    '#header-toolbar-symbol-search [class*="text-"]',
    'div[id="header-toolbar-symbol-search"] button [class*="text-"]',
    '#header-toolbar-symbol-search button',
    '#header-toolbar-symbol-search',
    'div[id*="header-toolbar-symbol-search"]',
    'button[id*="symbol-search"]',
  ];

  let toolbarSymbolText: string | null = null;
  for (const sel of toolbarSymbolSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.textContent?.trim()) {
        const text = el.textContent.trim();
        // Skip default placeholder text like "Symbol Search"
        if (!text.toLowerCase().includes('search') && text.length > 0 && text.length < 25) {
          toolbarSymbolText = text;
          break;
        }
      }
    } catch {
      // skip
    }
  }

  // 2. Check the active chart widget's legend line for symbol & exchange
  const legendSelectors = [
    'div[class*="chart-widget"][class*="active"] div[data-name="legend-series-item"]',
    'div[data-name="legend-series-item"] [class*="title"]',
    'div[data-name="legend-series-item"]',
    '.pane-legend-line .pane-legend-title__description',
    '.tv-symbol-header__short-title',
    '[data-symbol-short]',
  ];

  const exchangeSelectors = [
    'div[class*="chart-widget"][class*="active"] div[data-name="legend-series-item"] [class*="exchange"]',
    'div[data-name="legend-series-item"] [class*="exchange"]',
    '.pane-legend-line .pane-legend-title__exchange',
    '.tv-symbol-header__exchange',
    '[data-exchange]',
  ];

  const legendText = queryText(...legendSelectors);
  const exchangeText = queryText(...exchangeSelectors);

  let detectedSymbol = toolbarSymbolText || null;
  let detectedExchange: Exchange | null = exchangeText ? parseExchange(exchangeText) : null;

  // If legend text contains format like "EXCHANGE:SYMBOL" or "SYMBOL · 15 · EXCHANGE"
  if (legendText) {
    if (legendText.includes(':')) {
      const parts = legendText.split(':');
      const ex = parseExchange(parts[0]);
      if (ex) {
        detectedExchange = ex;
        detectedSymbol = parts[1]?.trim().split(/\s+/)[0] || detectedSymbol;
      }
    } else if (legendText.includes('·') || legendText.includes(',')) {
      const parts = legendText.split(/[·,]/).map((p) => p.trim());
      if (parts[0]) detectedSymbol = parts[0];
      for (const p of parts.slice(1)) {
        const ex = parseExchange(p);
        if (ex) {
          detectedExchange = ex;
          break;
        }
      }
    } else if (!detectedSymbol) {
      detectedSymbol = legendText.split(/\s+/)[0];
    }
  }

  if (detectedSymbol) {
    // Clean up symbol (remove trailing numbers/timeframes if accidentally concatenated)
    const cleanSym = detectedSymbol.replace(/[^A-Z0-9.&!_-]/gi, '').toUpperCase().trim();
    if (cleanSym.length > 0 && !cleanSym.toLowerCase().includes('search')) {
      const resolvedExchange: Exchange | null =
        detectedExchange || (isIndianHost ? 'NSE' : parseExchange('NASDAQ'));
      const { instrumentType, isTradable, statusMessage } = classifyInstrument(resolvedExchange, cleanSym);
      return {
        source: 'VISIBLE_TRADINGVIEW_CHART',
        symbol: cleanSym,
        exchange: resolvedExchange,
        market: resolvedExchange ? marketFromExchange(resolvedExchange) : isIndianHost ? 'INDIA' : 'US',
        instrumentType,
        isTradable,
        statusMessage,
      };
    }
  }

  return null;
}

/**
 * Strategy 2 (HIGH PRIORITY):
 * Parse document.title.
 * TradingView immediately and dynamically updates document.title when the user switches instruments:
 * e.g. "RELIANCE 2,750.00 INR — NSE:RELIANCE — TradingView"
 * or "AAPL — NASDAQ:AAPL — TradingView"
 */
export function detectFromTitle(): (Partial<ChartContext> & { source: 'DOM_TITLE' }) | null {
  const title = typeof document !== 'undefined' ? document.title || '' : '';
  // Match EXCHANGE:SYMBOL in document title
  const match = title.match(/(?:—|-|\s|^)([A-Z0-9]+):([A-Z0-9.&!_-]+)/);
  if (match) {
    const exchange = parseExchange(match[1]);
    const symbol = match[2]?.trim().toUpperCase();
    if (exchange && symbol) {
      const { instrumentType, isTradable, statusMessage } = classifyInstrument(exchange, symbol);
      return {
        source: 'DOM_TITLE',
        exchange,
        symbol,
        market: marketFromExchange(exchange),
        instrumentType,
        isTradable,
        statusMessage,
      };
    }
  }
  return null;
}

/**
 * Strategy 3 (FALLBACK ONLY):
 * Parse URL query string.
 * This is strictly a fallback. It must NOT override a verified visible chart.
 */
export function detectFromURL(): (Partial<ChartContext> & { source: 'URL' }) | null {
  try {
    const url = new URL(window.location.href);
    const symbolParam = url.searchParams.get('symbol');
    if (symbolParam) {
      const decoded = decodeURIComponent(symbolParam).trim();
      if (decoded.includes(':')) {
        const [rawEx, rawSym] = decoded.split(':');
        const exchange = parseExchange(rawEx);
        const cleanSymbol = rawSym?.trim().toUpperCase();
        if (exchange && cleanSymbol) {
          const { instrumentType, isTradable, statusMessage } = classifyInstrument(exchange, cleanSymbol);
          return {
            source: 'URL',
            exchange,
            symbol: cleanSymbol,
            market: marketFromExchange(exchange),
            instrumentType,
            isTradable,
            statusMessage,
          };
        }
      } else if (decoded.length > 0) {
        const isIndian = window.location.hostname.includes('in.tradingview.com');
        const exchange: Exchange = isIndian ? 'NSE' : 'NASDAQ';
        const cleanSymbol = decoded.toUpperCase();
        const { instrumentType, isTradable, statusMessage } = classifyInstrument(exchange, cleanSymbol);
        return {
          source: 'URL',
          exchange,
          symbol: cleanSymbol,
          market: marketFromExchange(exchange),
          instrumentType,
          isTradable,
          statusMessage,
        };
      }
    }
  } catch (e) {
    console.debug('[SMC] URL parse notice:', e);
  }
  return null;
}

/**
 * Detect active timeframe from the chart toolbar, document title, or URL.
 */
export function detectTimeframe(): Timeframe | null {
  // 1. Toolbar active timeframe buttons (standard TradingView UI)
  const toolbarSelectors = [
    'button[id*="header-toolbar-intervals"] [class*="text-"]',
    'button[id*="header-toolbar-intervals"]',
    'div[id*="header-toolbar-intervals"] button[class*="isActive"]',
    'div[id*="header-toolbar-intervals"] [class*="value-"]',
    '.chart-toolbar-timeframes button.isActive',
    '.chart-toolbar-timeframes button[class*="active"]',
    '.chart-toolbar [class*="timeframe"][class*="active"]',
    'button[class*="interval-btn"][class*="active"]',
    'div[class*="timeframe"] button[class*="isActive"]',
    'div[data-name="time-interval-menu"] button[class*="active"]',
    'div[data-name="time-interval-menu"] [class*="isActive"]',
  ];

  for (const sel of toolbarSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const dataVal = el.getAttribute('data-value');
        if (dataVal) {
          const tf = parseTimeframe(dataVal);
          if (tf) return tf;
        }
        if (el.textContent?.trim()) {
          const tf = parseTimeframe(el.textContent.trim());
          if (tf) return tf;
        }
      }
    } catch {
      // skip
    }
  }

  // 2. Fallback: inspect document title for interval e.g. "RELIANCE 15m" or "NSE:RELIANCE 15"
  const title = typeof document !== 'undefined' ? document.title || '' : '';
  const titleTfMatch = title.match(/\b(1m|3m|5m|15m|30m|45m|1h|2h|4h|1d|1w|1M)\b/i);
  if (titleTfMatch) {
    const tf = parseTimeframe(titleTfMatch[1]);
    if (tf) return tf;
  }

  // 3. Fallback: URL parameter ?interval=15
  try {
    const url = new URL(window.location.href);
    const intervalParam = url.searchParams.get('interval');
    if (intervalParam) {
      const tf = parseTimeframe(intervalParam);
      if (tf) return tf;
    }
  } catch {
    // skip
  }

  return null;
}

// ── Main unified detection function with verified reconciliation ───────────────

export function detectChartContext(): ChartContext {
  const isTV = typeof window !== 'undefined' && window.location.hostname.includes('tradingview.com');
  const isIndianHost = typeof window !== 'undefined' && window.location.hostname.includes('in.tradingview.com');

  const baseContext: ChartContext = {
    detected: false,
    exchange: null,
    symbol: null,
    timeframe: null,
    market: isIndianHost ? 'INDIA' : null,
    instrumentType: 'UNKNOWN',
    isTradable: false,
    statusMessage: 'DATA NOT IMPORTED',
    chartStatus: isTV ? 'CONNECTED' : 'NOT_TRADINGVIEW',
    url: typeof window !== 'undefined' ? window.location.href : '',
    lastUpdated: Date.now(),
    source: 'NONE',
    lastError: isTV ? null : 'Not a TradingView page',
  };

  if (!isTV) {
    return baseContext;
  }

  // Evaluate detection sources in strict priority order:
  // 1. Visible DOM (Toolbar search + active chart legend series)
  const fromVisibleDOM = detectFromVisibleDOM();

  // 2. Visible Document Title (dynamically updated by TradingView immediately on chart change)
  const fromTitle = detectFromTitle();

  // 3. URL Parameter (STRICTLY A FALLBACK)
  const fromURL = detectFromURL();

  // Determine the verified visible chart
  const visibleChart = fromVisibleDOM || fromTitle;

  let exchange: Exchange | null = null;
  let symbol: string | null = null;
  let source: ChartContext['source'] = 'NONE';
  let isMismatch = false;
  let mismatchDiagnostic: string | null = null;

  if (visibleChart && visibleChart.symbol) {
    // Verified visible chart found! Trust visible chart over stale URL
    symbol = visibleChart.symbol;
    exchange = visibleChart.exchange ?? (isIndianHost ? 'NSE' : 'NASDAQ');
    source = visibleChart.source;

    // Check if URL has a conflicting/stale symbol
    if (fromURL && fromURL.symbol && fromURL.symbol !== symbol) {
      isMismatch = true;
      mismatchDiagnostic = `TradingView URL parameter (${fromURL.exchange || ''}:${fromURL.symbol}) differs from active visible chart (${exchange}:${symbol}). Trusting verified visible chart.`;
    }
  } else if (fromURL && fromURL.symbol) {
    // Fallback: visible chart could not be read from DOM/title yet, use URL
    symbol = fromURL.symbol;
    exchange = fromURL.exchange ?? (isIndianHost ? 'NSE' : 'NASDAQ');
    source = 'URL';
  }

  const timeframe = detectTimeframe();
  const detected = !!(exchange && symbol);

  const { instrumentType, isTradable, statusMessage } = classifyInstrument(exchange, symbol);

  const finalStatusMessage: InstrumentStatus = isMismatch
    ? 'CHART METADATA MISMATCH'
    : statusMessage;

  const ctx: ChartContext = {
    detected,
    exchange,
    symbol,
    timeframe,
    market: exchange ? marketFromExchange(exchange) : isIndianHost ? 'INDIA' : null,
    instrumentType,
    isTradable,
    statusMessage: finalStatusMessage,
    chartStatus: detected ? 'CONNECTED' : 'DISCONNECTED',
    url: window.location.href,
    lastUpdated: Date.now(),
    source,
    visibleSymbol: visibleChart?.symbol || null,
    visibleExchange: visibleChart?.exchange || null,
    urlSymbol: fromURL?.symbol || null,
    urlExchange: fromURL?.exchange || null,
    isMismatch,
    mismatchDiagnostic,
    lastError: detected ? null : 'Chart symbol/exchange not detected in DOM or URL',
  };

  lastDetectedContext = ctx;
  return ctx;
}

// ── Send context to background and side panel ─────────────────────────────────

export function sendContextToBackground(ctx: ChartContext): void {
  const serialised = JSON.stringify(ctx);
  if (serialised === lastSentContext) return;
  lastSentContext = serialised;

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'CHART_CONTEXT_UPDATE',
        payload: ctx,
      });
    }
  } catch (e) {
    console.debug('[SMC] sendMessage notice:', e);
  }
}

// ── Overlay management ────────────────────────────────────────────────────────

let overlayEl: HTMLElement | null = null;

function createOverlay(): HTMLElement {
  const existing = document.getElementById('smc-overlay');
  if (existing) return existing;

  const el = document.createElement('div');
  el.id = 'smc-overlay';
  el.innerHTML = `
    <div class="smc-overlay-header" id="smc-overlay-drag">
      <span class="smc-overlay-title">▲ SMC TERMINAL</span>
      <button class="smc-overlay-collapse" id="smc-collapse-btn" title="Collapse">−</button>
    </div>
    <div class="smc-overlay-body" id="smc-overlay-body">
      <div class="smc-overlay-row">
        <span class="smc-label">Symbol</span>
        <span class="smc-value" id="smc-symbol">—</span>
      </div>
      <div class="smc-overlay-row">
        <span class="smc-label">Exchange</span>
        <span class="smc-value" id="smc-exchange">—</span>
      </div>
      <div class="smc-overlay-row">
        <span class="smc-label">Timeframe</span>
        <span class="smc-value" id="smc-timeframe">—</span>
      </div>
      <div class="smc-overlay-row">
        <span class="smc-label">Market</span>
        <span class="smc-value" id="smc-market">—</span>
      </div>
      <div class="smc-overlay-row">
        <span class="smc-label">Type</span>
        <span class="smc-value" id="smc-type">—</span>
      </div>
      <div class="smc-overlay-row">
        <span class="smc-label">Status</span>
        <span class="smc-value" id="smc-status-msg">—</span>
      </div>
      <div class="smc-overlay-row">
        <span class="smc-label">TV Paper</span>
        <span class="smc-value" id="smc-tv-paper">CHECKING...</span>
      </div>
      <div class="smc-overlay-row">
        <span class="smc-label">Auto Trade</span>
        <span class="smc-value" id="smc-auto-trade">INACTIVE</span>
      </div>
      <div class="smc-overlay-status" id="smc-status">● NOT DETECTED</div>
    </div>
  `;
  document.body.appendChild(el);
  initDrag(el);
  initCollapse(el);
  return el;
}

function updateOverlay(ctx: ChartContext): void {
  if (!overlayEl) return;

  const get = (id: string) => overlayEl!.querySelector(`#${id}`);

  const sym = get('smc-symbol');
  const ex = get('smc-exchange');
  const tf = get('smc-timeframe');
  const mkt = get('smc-market');
  const typ = get('smc-type');
  const statusMsg = get('smc-status-msg');
  const status = get('smc-status');

  if (sym) sym.textContent = ctx.symbol ?? '—';
  if (ex) ex.textContent = ctx.exchange ?? '—';
  if (tf) tf.textContent = ctx.timeframe ?? '—';
  if (mkt) mkt.textContent = ctx.market ?? '—';
  if (typ) typ.textContent = ctx.instrumentType;
  if (statusMsg) {
    statusMsg.textContent = ctx.statusMessage;
    (statusMsg as HTMLElement).style.color = ctx.isTradable ? '#00d4aa' : '#ffd32a';
  }
  const tvPaper = get('smc-tv-paper');
  if (tvPaper) {
    const conn = checkTVPaperConnection();
    tvPaper.textContent = conn.connected ? 'CONNECTED' : 'DISCONNECTED';
    (tvPaper as HTMLElement).style.color = conn.connected ? '#00d4aa' : '#ff4757';
  }
  if (status) {
    status.textContent = ctx.detected
      ? `● ${ctx.chartStatus} (${ctx.source})${ctx.isMismatch ? ' [URL MISMATCH OVERRIDDEN]' : ''}`
      : '● NOT DETECTED';
    (status as HTMLElement).style.color = ctx.detected ? '#00d4aa' : '#ff4757';
  }
}

// ── Draggable overlay ─────────────────────────────────────────────────────────

function initDrag(el: HTMLElement): void {
  const handle = el.querySelector('#smc-overlay-drag') as HTMLElement | null;
  if (!handle) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startRight = 16;
  let startTop = 60;

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const style = window.getComputedStyle(el);
    startRight = parseInt(style.right, 10) || 16;
    startTop = parseInt(style.top, 10) || 60;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.right = `${startRight - dx}px`;
    el.style.top = `${startTop + dy}px`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// ── Collapse toggle ───────────────────────────────────────────────────────────

function initCollapse(el: HTMLElement): void {
  const btn = el.querySelector('#smc-collapse-btn') as HTMLButtonElement | null;
  const body = el.querySelector('#smc-overlay-body') as HTMLElement | null;
  if (!btn || !body) return;

  let collapsed = false;
  btn.addEventListener('click', () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : 'block';
    btn.textContent = collapsed ? '+' : '−';
  });
}

// ── Link stylesheet ───────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('smc-overlay-styles')) return;
  try {
    const link = document.createElement('link');
    link.id = 'smc-overlay-styles';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('overlay.css');
    document.head.appendChild(link);
  } catch (e) {
    console.debug('[SMC] Stylesheet link notice:', e);
  }
}

// ── Re-detection on DOM changes ───────────────────────────────────────────────

function runDetection(): void {
  const ctx = detectChartContext();
  updateOverlay(ctx);
  sendContextToBackground(ctx);
}

function debouncedRunDetection(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runDetection, DEBOUNCE_MS);
}

export function observeDOM(): void {
  if (mutationObserver) mutationObserver.disconnect();
  mutationObserver = new MutationObserver(() => {
    debouncedRunDetection();
  });

  // Watch body for subtree changes (legend text, active toolbar buttons, title mutations)
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-value', 'data-symbol-short', 'aria-label'],
  });

  // Watch document.title
  const titleEl = document.querySelector('title');
  if (titleEl) {
    const titleObserver = new MutationObserver(() => {
      debouncedRunDetection();
    });
    titleObserver.observe(titleEl, { childList: true, characterData: true });
  }

  // Periodic fallback polling (every 400ms) to guarantee continuous dynamic synchronization
  if (pollIntervalId) clearInterval(pollIntervalId);
  pollIntervalId = setInterval(runDetection, 400);

  // Watch for history popstate / pushState changes
  window.addEventListener('popstate', debouncedRunDetection);
  window.addEventListener('hashchange', debouncedRunDetection);
}

// ── Listen for query requests from background/side panel ───────────────────────

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_TRADINGVIEW_CHART_CONTEXT' || message.type === 'REFRESH_DIAGNOSTICS') {
      const freshContext = detectChartContext();
      updateOverlay(freshContext);
      sendResponse({ context: freshContext });
      return true;
    }

    if (message.type === 'CHECK_TV_PAPER_STATUS') {
      const accountInfo = checkTVPaperConnection();
      const tvPaperEl = overlayEl?.querySelector('#smc-tv-paper');
      if (tvPaperEl) {
        tvPaperEl.textContent = accountInfo.connected ? 'CONNECTED' : 'DISCONNECTED';
        (tvPaperEl as HTMLElement).style.color = accountInfo.connected ? '#00d4aa' : '#ff4757';
      }
      sendResponse({ account: accountInfo });
      return true;
    }

    if (message.type === 'GET_TV_POSITIONS') {
      const positions = getTVOpenPositions();
      sendResponse({ positions });
      return true;
    }

    if (message.type === 'OPEN_TV_ORDER_TICKET') {
      const opened = openTVOrderTicket();
      sendResponse({ success: opened });
      return true;
    }

    if (message.type === 'EXECUTE_TV_PAPER_ORDER') {
      submitTVPaperOrder(message.order).then((result) => {
        sendResponse({ result });
      });
      return true; // Keep channel open for async response
    }

    if (message.type === 'UPDATE_AUTO_TRADE_STATUS') {
      const autoTradeEl = overlayEl?.querySelector('#smc-auto-trade');
      if (autoTradeEl) {
        autoTradeEl.textContent = message.active ? 'ACTIVE' : 'INACTIVE';
        (autoTradeEl as HTMLElement).style.color = message.active ? '#00d4aa' : '#ff4757';
      }
      sendResponse({ success: true });
      return true;
    }
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function initDetector(): void {
  if (!window.location.hostname.includes('tradingview.com')) return;
  injectStyles();
  overlayEl = createOverlay();
  runDetection();
  observeDOM();
}

// Auto-run if injected directly into a TradingView document
if (typeof window !== 'undefined' && window.location?.hostname?.includes('tradingview.com')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDetector);
  } else {
    initDetector();
  }
}
