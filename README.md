# SMC Trading Assistant — Smart Money Concepts Terminal
**Native TradingView Paper Trading Automation + Dynamic Chart Detection + Auto Execution**

A comprehensive quantitative trading assistant Chrome Extension (Manifest V3) for TradingView (`in.tradingview.com` and `www.tradingview.com`) featuring automated DOM execution directly through TradingView's built-in **Trading Panel → Paper Trading** interface, dynamic multi-asset chart detection, Smart Money Concepts analysis, strict 3:1 net R:R enforcement, and separate authorized live broker integration via a local Python backend.

---

## 1. Primary Execution & Automation Capabilities

- **Native TradingView Paper Trading Automation**:
  - Automatically executes simulated trades directly through TradingView's native **Trading Panel → Paper Trading** dock via visible DOM interaction (no Pine Script Strategy Tester).
  - Automatically opens the native order ticket, selects `BUY` and `LIMIT`, populates quantity, limit price, activates Take Profit checkbox and price, activates Stop Loss checkbox and price, safely places the order, and verifies execution in TradingView's native positions table.
- **Prominent `AUTO TRADE [ ACTIVE / INACTIVE ]` State Machine**:
  - Real-time switch visible across all views in the top navigation header.
  - **Mandatory Consent Safeguard**: Displays `AutoTradeConsentModal` requiring explicit user acknowledgement of simulation rules and 3:1 R:R thresholds before enabling.
  - **Immediate Emergency Disable**: Dedicated red `HALT` / `EMERGENCY DISABLE` kill-switch that instantly disengages auto-trading and halts background evaluation.
- **Dynamic Chart Detection & Multi-Asset Support**:
  - Automatically reconciles active symbols across Indian equities (`NSE`, `BSE`), US equities (`NASDAQ`, `NYSE`), and Cryptocurrencies (`BITSTAMP`, `COINBASE`, `BINANCE` where `BTCUSD` is classified as `CRYPTOCURRENCY` with `USD` currency, not NSE equity).
  - Continuous DOM synchronization (400ms polling + MutationObserver) detects symbol and timeframe changes instantly and invalidates stale setups.
- **Strict 3.00:1 Net Reward-to-Risk Enforcement**:
  - Formally rejects any setup or order fill yielding `< 3.00:1` net R:R after statutory transaction taxes, turnover fees, and slippage. Zero user bypass.
- **Dedicated Section 11 Status Matrix**:
  - Displays real-time matrix of all 16 execution fields: `MODE`, `ACCOUNT`, `AUTO TRADE`, `ACTIVE SYMBOL`, `EXCHANGE`, `TIMEFRAME`, `1H BIAS`, `LIQUIDITY SWEEP`, `CHoCH`, `FVG`, `ENTRY`, `STOP`, `TARGET`, `NET R:R`, `POSITION`, `TRADINGVIEW ORDER`, `SL STATUS`, and `TP STATUS`.
- **Synchronized Journaling & Provenance**:
  - Logs verified executions with source provenance `TRADINGVIEW NATIVE PAPER TRADING` into IndexedDB and displays real-time badges in the Dashboard and Trade Journal.
- **Live Trading Isolation**:
  - Live broker execution remains strictly segregated, requiring local Python backend (`FastAPI` on `127.0.0.1:8000`) and authorized credentials.

---

## 2. Directory Structure

```text
smc-chrome-extension/
  dist/                          # Production Chrome Extension bundle (load unpacked)
  backend/                       # Local Python Execution Backend (for Live Trading)
    main.py                      # FastAPI server (127.0.0.1:8000)
    broker_manager.py            # Adapter registry & base class
    database.py                  # SQLite storage (trading.db)
    risk_engine.py               # Pre-flight risk validator & 3:1 net R:R
    order_manager.py             # Order lifecycle state machine
    protection_manager.py        # TP/SL monitor & synthetic OCO reconciler
    india/                       # DhanHQ & Zerodha adapters
    us/                          # Interactive Brokers adapter
    tests/                       # Backend pytest suite (11 tests)
  src/
    content/                     # TradingView content script & chart detector
    execution/                   # tv-paper-automator.ts (DOM automation engine)
    components/                  # TVPaperPanel, AutoTradeConsentModal, Dashboard, etc.
    strategy/                    # SMC detection (BOS, CHoCH, Sweeps, FVG, Order Blocks)
    risk/                        # Net R:R, position sizing, risk rules
    store/                       # Zustand store with autoTrade state machine
    types/                       # TypeScript schemas and definitions
  tests/                         # Vitest test suite (59 tests)
  smc-trading-extension.zip      # Packaged installable extension archive
  INDEPENDENT_SOFTWARE_REVIEW.md # Complete software & trading system audit report
  LIVE_TRADING_READINESS.md      # Live readiness matrix & market analysis
  PRIORITISED_FIX_PLAN.md        # Prioritised engineering repair plan
  COMPLETE_BUG_FIX_REPORT.md     # Detailed bug remediation log
  FINAL_TEST_REPORT.md           # End-to-end verification report (70 tests)
  PRODUCTION_READINESS_REPORT.md # Final production readiness assessment
```

---

## 3. Installation & Verification

### Step 1: Run Automated Test Suites

```bash
cd smc-chrome-extension

# Run Frontend Vitest Suite (59 tests across 7 test suites)
npm test

# Run Backend Pytest Suite (11 tests across 3 test suites)
backend\venv\Scripts\python -m pytest backend/tests
```

### Step 2: Build the Extension

```bash
# Build production bundle into dist/
npm run build:extension

# Package into ZIP archive
npm run zip
```

### Step 3: Load in Google Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `dist/` directory inside `smc-chrome-extension/`.
4. Open [TradingView](https://in.tradingview.com/chart/ or https://www.tradingview.com/chart/).
5. Connect **Paper Trading** in the bottom dock Trading Panel.
6. Click the extension icon or side panel to monitor live SMC analysis and enable **AUTO TRADE**.
