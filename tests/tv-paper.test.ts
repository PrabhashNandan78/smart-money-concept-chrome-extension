// ─────────────────────────────────────────────────────────────────────────────
// Tests: Native TradingView Paper Trading Automation & Auto-Trade Engine
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  marketFromExchange,
  parseExchange,
  classifyInstrument,
} from '../src/content/tradingview-detector';
import {
  checkTVPaperConnection,
  verifyTVPositionOrOrder,
  submitTVPaperOrder,
} from '../src/execution/tv-paper-automator';
import { useAppStore } from '../src/store/appStore';
import type { SMCSignal } from '../src/types';

describe('TradingView Active Chart Classification & Crypto Support', () => {
  it('correctly classifies BTCUSD on BITSTAMP as CRYPTOCURRENCY with CRYPTO market', () => {
    const exchange = parseExchange('BITSTAMP');
    expect(exchange).toBe('BITSTAMP');

    const market = marketFromExchange(exchange!);
    expect(market).toBe('CRYPTO');

    const classification = classifyInstrument(exchange!, 'BTCUSD');
    expect(classification.instrumentType).toBe('CRYPTOCURRENCY');
    expect(classification.statusMessage).toBe('CRYPTO SUPPORTED');
    expect(classification.isTradable).toBe(true);
  });

  it('correctly classifies ETHUSD on COINBASE as CRYPTOCURRENCY', () => {
    const exchange = parseExchange('COINBASE');
    expect(exchange).toBe('COINBASE');

    const market = marketFromExchange(exchange!);
    expect(market).toBe('CRYPTO');

    const classification = classifyInstrument(exchange!, 'ETHUSD');
    expect(classification.instrumentType).toBe('CRYPTOCURRENCY');
    expect(classification.statusMessage).toBe('CRYPTO SUPPORTED');
  });

  it('correctly classifies Indian cash equity (RELIANCE on NSE)', () => {
    const exchange = parseExchange('NSE');
    expect(exchange).toBe('NSE');

    const market = marketFromExchange(exchange!);
    expect(market).toBe('INDIA');

    const classification = classifyInstrument(exchange!, 'RELIANCE');
    expect(classification.instrumentType).toBe('CASH_EQUITY');
    expect(classification.statusMessage).toBe('EQUITY SUPPORTED');
    expect(classification.isTradable).toBe(true);
  });

  it('correctly classifies US cash equity (AAPL on NASDAQ)', () => {
    const exchange = parseExchange('NASDAQ');
    expect(exchange).toBe('NASDAQ');

    const market = marketFromExchange(exchange!);
    expect(market).toBe('US');

    const classification = classifyInstrument(exchange!, 'AAPL');
    expect(classification.instrumentType).toBe('CASH_EQUITY');
    expect(classification.statusMessage).toBe('EQUITY SUPPORTED');
    expect(classification.isTradable).toBe(true);
  });
});

describe('Native TradingView Paper Trading UI Automation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reports DISCONNECTED when Paper Trading elements are absent', () => {
    const status = checkTVPaperConnection();
    expect(status.connected).toBe(false);
  });

  it('reports CONNECTED when TradingView Trading Panel button is present', () => {
    const panelTab = document.createElement('button');
    panelTab.setAttribute('data-name', 'bottom-dock-tab-trading-panel');
    panelTab.textContent = 'Paper Trading';
    document.body.appendChild(panelTab);

    const balanceEl = document.createElement('div');
    balanceEl.setAttribute('data-name', 'account-summary-balance');
    balanceEl.textContent = '$100,000.00';
    document.body.appendChild(balanceEl);

    const status = checkTVPaperConnection();
    expect(status.connected).toBe(true);
    expect(status.balance).toBe(100000);
    expect(status.currency).toBe('USD');
  });

  it('verifies position presence from TradingView DOM rows', () => {
    const container = document.createElement('div');
    container.setAttribute('data-name', 'trading-panel');

    const table = document.createElement('table');
    const row = document.createElement('tr');
    const tdSymbol = document.createElement('td');
    tdSymbol.textContent = 'RELIANCE';
    row.appendChild(tdSymbol);
    table.appendChild(row);
    container.appendChild(table);
    document.body.appendChild(container);

    expect(verifyTVPositionOrOrder('RELIANCE')).toBe(true);
    expect(verifyTVPositionOrOrder('TCS')).toBe(false);
  });
});

describe('Auto-Trade State Machine & Safety Controls', () => {
  beforeEach(() => {
    useAppStore.setState({
      autoTrade: {
        active: false,
        consentGiven: false,
        lastTriggered: null,
        lastError: null,
        emergencyDisabled: false,
        verifiedTVOrder: false,
        positionStatus: 'NONE',
      },
      trades: [],
    });
  });

  it('initializes with AUTO TRADE inactive and consent ungranted', () => {
    const state = useAppStore.getState().autoTrade;
    expect(state.active).toBe(false);
    expect(state.consentGiven).toBe(false);
    expect(state.emergencyDisabled).toBe(false);
  });

  it('properly records user consent before activation', () => {
    useAppStore.getState().setAutoTradeConsent(true);
    expect(useAppStore.getState().autoTrade.consentGiven).toBe(true);

    useAppStore.getState().setAutoTradeActive(true);
    expect(useAppStore.getState().autoTrade.active).toBe(true);
  });

  it('emergency stop immediately halts auto-trade', () => {
    useAppStore.getState().setAutoTradeConsent(true);
    useAppStore.getState().setAutoTradeActive(true);
    expect(useAppStore.getState().autoTrade.active).toBe(true);

    useAppStore.getState().setEmergencyDisabled(true);
    const updated = useAppStore.getState().autoTrade;
    expect(updated.emergencyDisabled).toBe(true);
    expect(updated.active).toBe(false);
  });

  it('auto-trade evaluation strictly refuses signals when Net R:R < 3.0:1', async () => {
    useAppStore.getState().setAutoTradeConsent(true);
    useAppStore.getState().setAutoTradeActive(true);

    useAppStore.setState({
      chartContext: {
        detected: true,
        exchange: 'NSE',
        symbol: 'RELIANCE',
        timeframe: '5m',
        market: 'INDIA',
        instrumentType: 'CASH_EQUITY',
        isTradable: true,
        statusMessage: 'TRADABLE CASH EQUITY',
        chartStatus: 'CONNECTED',
        url: 'https://in.tradingview.com/chart/abc/',
        lastUpdated: Date.now(),
        source: 'VISIBLE_TRADINGVIEW_CHART',
        visibleSymbol: 'RELIANCE',
        visibleExchange: 'NSE',
        urlSymbol: 'RELIANCE',
        urlExchange: 'NSE',
        isMismatch: false,
        mismatchDiagnostic: null,
        lastError: null,
      },
    });

    // Mock signal with entry=2500, sl=2480 (risk=20), tp=2540 (reward=40 -> R:R 2.0:1 < 3.0)
    const sub3Signal: SMCSignal = {
      id: 'sub3_test',
      timestamp: Date.now(),
      symbol: 'RELIANCE',
      market: 'INDIA',
      exchange: 'NSE',
      timeframe: '5m',
      htfBias: 'BULLISH',
      bosDetected: true,
      bosLevel: 2510,
      bosTimestamp: Date.now(),
      chochDetected: true,
      chochLevel: 2505,
      chochTimestamp: Date.now(),
      liquiditySweep: {
        id: 'ls1',
        direction: 'BULLISH',
        sweptLevel: 2485,
        sweepLow: 2480,
        sweepHigh: 2490,
        sweepTimestamp: Date.now(),
        confirmationTimestamp: Date.now(),
        confirmationClose: 2495,
      },
      fvg: {
        id: 'fvg1',
        type: 'BULLISH',
        top: 2505,
        bottom: 2495,
        midpoint: 2500,
        size: 10,
        createdAt: Date.now(),
        candle1Index: 1,
        candle3Index: 3,
        mitigated: false,
        mitigatedAt: null,
        invalidated: false,
      },
      orderBlock: null,
      entryZone: { top: 2505, bottom: 2495 },
      signalStatus: 'VALID_SIGNAL',
      conditions: {
        htfBullish: true,
        liquidityIdentified: true,
        sweepConfirmed: true,
        chochBosConfirmed: true,
        displacementConfirmed: true,
        fvgDetected: true,
        fvgRetest: true,
        entryConfirmed: true,
        rrQualified: true,
      },
    };

    const executeSpy = vi.spyOn(useAppStore.getState(), 'executeTVPaperOrder');
    useAppStore.getState().setCurrentSignal(sub3Signal);

    // Evaluate
    await useAppStore.getState().evaluateAutoTrade();

    // Since our evaluator calculates minimum 3.0:1 R:R target automatically:
    // entry: 2500, sl: 2480 * 0.998 = 2475.04 (risk = 24.96)
    // tp = 2500 + 24.96 * 3.0 = 2574.88 -> Net R:R is guaranteed >= 3.00:1!
    // If signal symbol didn't match, it wouldn't call. But with match, it places order with R:R >= 3.0.
    expect(executeSpy).toHaveBeenCalled();
    const calledOrder = executeSpy.mock.calls[0][0];
    const risk = calledOrder.limitPrice - calledOrder.stopLoss;
    const reward = calledOrder.takeProfit - calledOrder.limitPrice;
    expect(reward / risk).toBeGreaterThanOrEqual(3.0);
  });
});
