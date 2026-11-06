import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseExchange,
  parseTimeframe,
  marketFromExchange,
  classifyInstrument,
  detectFromURL,
  detectFromTitle,
  detectChartContext,
} from '../src/content/tradingview-detector';

describe('TradingView Instrument & Dynamic Chart Detection', () => {
  beforeEach(() => {
    document.title = 'TradingView';
    document.body.innerHTML = '';
  });

  describe('Exchange and Market Detection', () => {
    it('correctly parses Indian exchanges including NSEIX', () => {
      expect(parseExchange('NSE')).toBe('NSE');
      expect(parseExchange('BSE')).toBe('BSE');
      expect(parseExchange('NSEIX')).toBe('NSEIX');
      expect(marketFromExchange('NSE')).toBe('INDIA');
      expect(marketFromExchange('BSE')).toBe('INDIA');
      expect(marketFromExchange('NSEIX')).toBe('INDIA');
    });

    it('correctly parses US exchanges', () => {
      expect(parseExchange('NASDAQ')).toBe('NASDAQ');
      expect(parseExchange('NYSE')).toBe('NYSE');
      expect(parseExchange('AMEX')).toBe('AMEX');
      expect(marketFromExchange('NASDAQ')).toBe('US');
      expect(marketFromExchange('NYSE')).toBe('US');
      expect(marketFromExchange('AMEX')).toBe('US');
    });

    it('returns null for unknown exchanges', () => {
      expect(parseExchange('UNKNOWN')).toBeNull();
      expect(parseExchange('')).toBeNull();
    });
  });

  describe('Timeframe Parsing', () => {
    it('correctly normalizes 15m and other intraday timeframes', () => {
      expect(parseTimeframe('15m')).toBe('15m');
      expect(parseTimeframe('15')).toBe('15m');
      expect(parseTimeframe('5m')).toBe('5m');
      expect(parseTimeframe('5')).toBe('5m');
      expect(parseTimeframe('1m')).toBe('1m');
      expect(parseTimeframe('30m')).toBe('30m');
      expect(parseTimeframe('1h')).toBe('1h');
      expect(parseTimeframe('60')).toBe('1h');
      expect(parseTimeframe('1H')).toBe('1h');
      expect(parseTimeframe('4h')).toBe('4h');
      expect(parseTimeframe('1d')).toBe('1d');
      expect(parseTimeframe('D')).toBe('1d');
    });
  });

  describe('Instrument Classification & Equity Status Rules', () => {
    it('classifies continuous futures (NIFTY1!) as FUTURES with FUTURES NOT CONFIGURED', () => {
      const res = classifyInstrument('NSEIX', 'NIFTY1!');
      expect(res.instrumentType).toBe('FUTURES');
      expect(res.isTradable).toBe(false);
      expect(res.statusMessage).toBe('FUTURES NOT CONFIGURED');
    });

    it('classifies BankNifty futures as FUTURES with FUTURES NOT CONFIGURED', () => {
      const res = classifyInstrument('NSE', 'BANKNIFTY1!');
      expect(res.instrumentType).toBe('FUTURES');
      expect(res.isTradable).toBe(false);
      expect(res.statusMessage).toBe('FUTURES NOT CONFIGURED');
    });

    it('classifies cash equities as CASH_EQUITY with EQUITY SUPPORTED', () => {
      const nse = classifyInstrument('NSE', 'RELIANCE');
      expect(nse.instrumentType).toBe('CASH_EQUITY');
      expect(nse.isTradable).toBe(true);
      expect(nse.statusMessage).toBe('EQUITY SUPPORTED');

      const bse = classifyInstrument('BSE', '500325');
      expect(nse.instrumentType).toBe('CASH_EQUITY');
      expect(bse.isTradable).toBe(true);
      expect(bse.statusMessage).toBe('EQUITY SUPPORTED');

      const us = classifyInstrument('NASDAQ', 'AAPL');
      expect(us.instrumentType).toBe('CASH_EQUITY');
      expect(us.isTradable).toBe(true);
      expect(us.statusMessage).toBe('EQUITY SUPPORTED');
    });

    it('classifies indices as INDEX with INDEX NOT TRADEABLE IN CURRENT PROFILE', () => {
      const nse = classifyInstrument('NSE', 'NIFTY');
      expect(nse.instrumentType).toBe('INDEX');
      expect(nse.isTradable).toBe(false);
      expect(nse.statusMessage).toBe('INDEX NOT TRADEABLE IN CURRENT PROFILE');

      const spx = classifyInstrument('NYSE', 'SPX');
      expect(spx.instrumentType).toBe('INDEX');
      expect(spx.isTradable).toBe(false);
      expect(spx.statusMessage).toBe('INDEX NOT TRADEABLE IN CURRENT PROFILE');
    });
  });

  describe('Active Chart Detection & Stale URL Override Priority', () => {
    it('TRUSTS VERIFIED VISIBLE CHART OVER STALE URL (User Bug Scenario: URL has NIFTY1! but visible chart is RELIANCE)', () => {
      // Setup stale URL
      const originalLocation = window.location;
      delete (window as any).location;
      (window as any).location = new URL('https://in.tradingview.com/chart/yTfuFdZw/?symbol=NSEIX%3ANIFTY1%21');

      // Setup visible chart in DOM (Toolbar button has RELIANCE)
      document.body.innerHTML = `
        <div id="header-toolbar-symbol-search">
          <button><span class="text-abc">RELIANCE</span></button>
        </div>
        <div class="pane-legend-line">
          <span class="pane-legend-title__exchange">NSE</span>
        </div>
      `;
      // Also document.title has RELIANCE
      document.title = 'RELIANCE 2,750.00 INR — NSE:RELIANCE — TradingView';

      const context = detectChartContext();

      // Must detect visible chart (RELIANCE on NSE), NOT stale URL (NIFTY1!)
      expect(context.detected).toBe(true);
      expect(context.symbol).toBe('RELIANCE');
      expect(context.exchange).toBe('NSE');
      expect(context.market).toBe('INDIA');
      expect(context.instrumentType).toBe('CASH_EQUITY');
      expect(context.isTradable).toBe(true);

      // Must record URL mismatch diagnostic
      expect(context.isMismatch).toBe(true);
      expect(context.urlSymbol).toBe('NIFTY1!');
      expect(context.urlExchange).toBe('NSEIX');
      expect(context.mismatchDiagnostic).toContain('differs from active visible chart');

      (window as any).location = originalLocation;
    });

    it('dynamically switches when user changes RELIANCE to TCS', () => {
      const originalLocation = window.location;
      delete (window as any).location;
      (window as any).location = new URL('https://in.tradingview.com/chart/yTfuFdZw/');

      // Step 1: RELIANCE
      document.title = 'RELIANCE — NSE:RELIANCE — TradingView';
      let ctx = detectChartContext();
      expect(ctx.symbol).toBe('RELIANCE');
      expect(ctx.exchange).toBe('NSE');

      // Step 2: User switches to TCS
      document.title = 'Tata Consultancy Services — NSE:TCS — TradingView';
      ctx = detectChartContext();
      expect(ctx.symbol).toBe('TCS');
      expect(ctx.exchange).toBe('NSE');
      expect(ctx.isTradable).toBe(true);
      expect(ctx.statusMessage).toBe('EQUITY SUPPORTED');

      (window as any).location = originalLocation;
    });

    it('dynamically switches when user changes TCS to AAPL on NASDAQ', () => {
      const originalLocation = window.location;
      delete (window as any).location;
      (window as any).location = new URL('https://www.tradingview.com/chart/');

      document.title = 'Apple Inc — NASDAQ:AAPL — TradingView';
      const ctx = detectChartContext();
      expect(ctx.symbol).toBe('AAPL');
      expect(ctx.exchange).toBe('NASDAQ');
      expect(ctx.market).toBe('US');
      expect(ctx.instrumentType).toBe('CASH_EQUITY');
      expect(ctx.isTradable).toBe(true);

      (window as any).location = originalLocation;
    });

    it('falls back to URL query parameter when no visible DOM/title is available', () => {
      const originalLocation = window.location;
      delete (window as any).location;
      (window as any).location = new URL('https://in.tradingview.com/chart/?symbol=NSE%3AINFY');

      document.title = 'TradingView'; // generic title
      document.body.innerHTML = '';

      const ctx = detectChartContext();
      expect(ctx.symbol).toBe('INFY');
      expect(ctx.exchange).toBe('NSE');
      expect(ctx.source).toBe('URL');

      (window as any).location = originalLocation;
    });
  });
});
