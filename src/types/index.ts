// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – Shared TypeScript Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Candle {
  timestamp: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '45m'
  | '1h'
  | '2h'
  | '4h'
  | '1d'
  | '1w'
  | '1M';
export type Market = 'INDIA' | 'US' | 'CRYPTO';
export type Exchange = 'NSE' | 'BSE' | 'NSEIX' | 'NYSE' | 'NASDAQ' | 'AMEX' | 'BITSTAMP' | 'COINBASE' | 'BINANCE';
export type Direction = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type TradingMode = 'PAPER' | 'LIVE';
export type InstrumentType = 'CASH_EQUITY' | 'CRYPTOCURRENCY' | 'INDEX' | 'FUTURES' | 'UNKNOWN';

export type InstrumentStatus =
  | 'EQUITY SUPPORTED'
  | 'CRYPTO SUPPORTED'
  | 'FUTURES NOT CONFIGURED'
  | 'INDEX NOT TRADEABLE IN CURRENT PROFILE'
  | 'DATA NOT IMPORTED'
  | 'DATA MISMATCH'
  | 'CHART METADATA MISMATCH'
  | 'BROKER NOT CONNECTED'
  | 'PAPER MODE READY'
  | 'LIVE MODE LOCKED'
  | 'LIVE MODE READY';

export interface TVPaperAccountInfo {
  connected: boolean;
  accountName: string;
  balance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  currency: string;
  lastUpdated: number;
}

export interface TVPaperPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  takeProfit: number | null;
  stopLoss: number | null;
  slStatus: 'PROTECTED' | 'NOT_VERIFIED' | 'NONE';
  tpStatus: 'PROTECTED' | 'NOT_VERIFIED' | 'NONE';
}

export interface TVPaperOrder {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET' | 'STOP';
  quantity: number;
  limitPrice: number | null;
  stopPrice: number | null;
  status: 'WORKING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  isTP: boolean;
  isSL: boolean;
}

export interface AutoTradeState {
  active: boolean;
  consentGiven: boolean;
  lastTriggered: number | null;
  lastError: string | null;
  emergencyDisabled: boolean;
  verifiedTVOrder: boolean;
  positionStatus: 'OPEN' | 'NONE';
}

export interface ChartContext {
  detected: boolean;
  exchange: Exchange | null;
  symbol: string | null;
  timeframe: Timeframe | null;
  market: Market | null;
  instrumentType: InstrumentType;
  isTradable: boolean; // true for cash equities (RELIANCE, TCS, AAPL, etc.)
  statusMessage: InstrumentStatus | string;
  chartStatus: 'CONNECTED' | 'DISCONNECTED' | 'NOT_TRADINGVIEW';
  url: string;
  lastUpdated: number;
  source: 'VISIBLE_TRADINGVIEW_CHART' | 'DOM_TITLE' | 'DOM_HEADER' | 'URL' | 'MANUAL' | 'NONE';
  visibleSymbol?: string | null;
  visibleExchange?: Exchange | null;
  urlSymbol?: string | null;
  urlExchange?: Exchange | null;
  isMismatch?: boolean;
  mismatchDiagnostic?: string | null;
  lastError?: string | null;
}

export interface BackendStatus {
  connected: boolean;
  url: string;
  broker: 'DHAN' | 'ZERODHA' | 'IBKR' | 'MOCK' | null;
  brokerConnected: boolean;
  accountIdentity: string | null;
  marketPermissions: Market[];
  cashBalance: number;
  availableFunds: number;
  tradingPermissions: boolean;
  marketDataPermissions: boolean;
  lastSuccessfulConnection: number | null;
  lastPing: number | null;
  error: string | null;
  killSwitchActive: boolean;
}

export interface LiveOrderRequest {
  market: Market;
  exchange: Exchange;
  symbol: string;
  direction: 'LONG';
  timeframe: Timeframe;
  quantity: number;
  orderType: 'LIMIT' | 'MARKET';
  limitPrice: number;
  stopLoss: number;
  takeProfit: number;
  grossRR: number;
  netRR: number;
  riskAmount: number;
  estimatedCash: number;
  broker: string;
  confirmedByUser: boolean;
}

export interface LiveExecutionResponse {
  success: boolean;
  orderId?: string;
  brokerOrderId?: string;
  status?: 'SUBMITTED' | 'ACCEPTED' | 'PARTIALLY_FILLED' | 'FILLED' | 'REJECTED' | 'CANCELLED';
  fillPrice?: number;
  fillQuantity?: number;
  slOrderId?: string;
  tpOrderId?: string;
  bracketPlaced?: boolean;
  message?: string;
  timestamp?: number;
}

export interface SMCSignal {
  id: string;
  timestamp: number;
  symbol: string;
  market: Market;
  exchange: Exchange;
  timeframe: Timeframe;
  htfBias: Direction;
  bosDetected: boolean;
  bosLevel: number | null;
  bosTimestamp: number | null;
  chochDetected: boolean;
  chochLevel: number | null;
  chochTimestamp: number | null;
  liquiditySweep: LiquiditySweep | null;
  fvg: FVG | null;
  orderBlock: OrderBlock | null;
  entryZone: { top: number; bottom: number } | null;
  signalStatus: SignalStatus;
  conditions: SMCConditions;
}

export type SignalStatus =
  | 'SCANNING'
  | 'WAITING_SWEEP'
  | 'WAITING_CHOCH'
  | 'WAITING_FVG'
  | 'WAITING_RETEST'
  | 'VALID_SIGNAL'
  | 'INVALIDATED'
  | 'NO_SETUP';

export interface SMCConditions {
  htfBullish: boolean;
  liquidityIdentified: boolean;
  sweepConfirmed: boolean;
  chochBosConfirmed: boolean;
  displacementConfirmed: boolean;
  fvgDetected: boolean;
  fvgRetest: boolean;
  entryConfirmed: boolean;
  rrQualified: boolean;
}

export interface SwingPoint {
  index: number;
  timestamp: number;
  price: number;
  type: 'HIGH' | 'LOW';
  confirmed: boolean;
}

export interface MarketStructure {
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  trend: Direction;
  lastBOS: { level: number; timestamp: number; direction: Direction } | null;
  lastCHoCH: { level: number; timestamp: number; direction: Direction } | null;
}

export interface FVG {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  midpoint: number;
  size: number;
  createdAt: number;
  candle1Index: number;
  candle3Index: number;
  mitigated: boolean;
  mitigatedAt: number | null;
  invalidated: boolean;
}

export interface LiquiditySweep {
  id: string;
  direction: 'BULLISH' | 'BEARISH'; // bullish sweep = swept below EQL/swingLow, bearish = above
  sweptLevel: number;
  sweepLow: number;
  sweepHigh: number;
  sweepTimestamp: number;
  confirmationTimestamp: number;
  confirmationClose: number;
}

export interface OrderBlock {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  midpoint: number;
  createdAt: number;
  candleIndex: number;
  valid: boolean;
  mitigated: boolean;
}

export interface TradeSetup {
  id: string;
  signal: SMCSignal;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  riskPerShare: number;
  rewardPerShare: number;
  grossRR: number;
  netRR: number;
  totalRisk: number;
  estimatedProfit: number;
  estimatedCosts: number;
  currency: 'INR' | 'USD';
  status: 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: number;
}

export interface RiskSettings {
  accountEquity: number;
  riskPerTrade: number;       // percentage e.g. 0.25
  maxDailyLoss: number;       // percentage e.g. 1.0
  maxWeeklyLoss: number;      // percentage e.g. 2.5
  drawdownPause: number;      // percentage e.g. 5.0
  maxConcurrentTrades: number; // e.g. 3
  maxAggregateRisk: number;   // percentage e.g. 0.75
  tradesPerSymbolPerSession: number; // e.g. 1
  minRR: number;              // LOCKED at 3.0 – NOT CONFIGURABLE BELOW 3
  currency: 'INR' | 'USD';
}

export type TradeStatus =
  | 'SETUP_DETECTED'
  | 'WAITING_ENTRY'
  | 'ENTRY_SIMULATED'
  | 'OPEN'
  | 'STOP_LOSS_HIT'
  | 'TAKE_PROFIT_HIT'
  | 'CANCELLED'
  | 'CLOSED_MANUALLY';

export type TradeType = 'PAPER' | 'MANUAL_LIVE' | 'LIVE' | 'TV_NATIVE_PAPER';

export interface Trade {
  id: string;
  market: Market;
  exchange: Exchange;
  symbol: string;
  strategyVersion: string;
  tradeType: TradeType;
  direction: 'LONG';
  status: TradeStatus;
  // SMC data
  htfBias: Direction;
  marketStructure: string;
  bosDetected: boolean;
  chochDetected: boolean;
  liquiditySweepDetected: boolean;
  fvgDetected: boolean;
  orderBlockDetected: boolean;
  entryConfirmation: string;
  // Trade data
  plannedEntry: number;
  actualEntry: number | null;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  riskAmount: number;
  actualExit: number | null;
  grossPnl: number | null;
  estimatedCosts: number;
  actualCosts: number | null;
  netPnl: number | null;
  rMultiple: number | null;
  // Timestamps
  createdAt: number;
  entryAt: number | null;
  exitAt: number | null;
  // Review fields
  screenshot: string | null;
  entryReasoning: string;
  exitReasoning: string;
  ruleCompliant: boolean;
  mistakes: string;
  lessonsLearned: string;
  // Manual live fields
  brokerOrderRef: string | null;
  actualEntryPrice: number | null;
  actualQuantity: number | null;
  slOrderConfirmed: boolean;
  tpOrderConfirmed: boolean;
}

export interface AppSettings {
  market: Market;
  defaultExchange: Exchange;
  currency: 'INR' | 'USD';
  timezone: string;
  tradingSession: { open: string; close: string };
  strategyVersion: string;
  pivotLength: number;
  atrLength: number;
  liquidityTolerance: number;
  fvgMinSize: number;
  displacementThreshold: number;
  htfBiasRequired: boolean;
  ltfConfirmationRequired: boolean;
  risk: RiskSettings;
}

export interface ImportedDataset {
  id: string;
  symbol: string;
  market: Market;
  exchange: Exchange;
  timeframe: Timeframe;
  candles: Candle[];
  importedAt: number;
  dateRange: { start: number; end: number };
  totalCandles: number;
  missingCandles: number;
  duplicateCandles: number;
  dataQuality: 'GOOD' | 'WARNING' | 'POOR';
}

export interface PerformanceStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalNetPnl: number;
  profitFactor: number;
  avgR: number;
  maxDrawdown: number;
  avgWinner: number;
  avgLoser: number;
  totalFees: number;
  ruleComplianceRate: number;
}

export interface TradeFilters {
  market?: Market;
  symbol?: string;
  startDate?: number;
  endDate?: number;
  tradeType?: TradeType;
  status?: TradeStatus;
}

export type ActiveTab =
  | 'Dashboard'
  | 'ChartMonitor'
  | 'SMCAnalysis'
  | 'TradeSetup'
  | 'RiskManager'
  | 'PaperTrading'
  | 'TradeJournal'
  | 'Backtesting'
  | 'Reports'
  | 'Settings'
  | 'Diagnostics';

export interface ChartDiagnosticsData {
  activeTabConnected: boolean;
  tradingViewHostDetected: boolean;
  hostPermissionGranted: boolean;
  contentScriptLoaded: boolean;
  messageHandshakePassed: boolean;
  chartUrl: string;
  exchange: Exchange | null;
  symbol: string | null;
  visibleSymbol?: string | null;
  urlSymbol?: string | null;
  isMismatch?: boolean;
  instrumentType: InstrumentType;
  isTradable: boolean;
  statusMessage: string;
  timeframe: Timeframe | null;
  ohlcDataImported: boolean;
  realTimeDataStatus: string;
  smcEngineStatus: string;
  backendConnected: boolean;
  lastSuccessfulUpdate: number | null;
  lastError: string | null;
}

export interface MessageToBackground {
  type:
    | 'CHART_CONTEXT_UPDATE'
    | 'GET_SETTINGS'
    | 'OPEN_SIDE_PANEL'
    | 'GET_TRADINGVIEW_CHART_CONTEXT'
    | 'REFRESH_DIAGNOSTICS';
  payload?: unknown;
}

export interface MessageFromBackground {
  type:
    | 'SETTINGS_RESPONSE'
    | 'CHART_CONTEXT_UPDATED'
    | 'DIAGNOSTICS_RESPONSE'
    | 'ACK';
  payload?: unknown;
}
