# INDEPENDENT SOFTWARE AUDIT & TRADING SYSTEM REVIEW
**Project: SMC Trading Assistant — Indian and US Markets**
**Evaluation Perspective:** Independent Senior Software Reviewer, Quantitative Trading Researcher, Financial Trading System Architect, Cybersecurity Auditor, and Paying Professional Trading Customer.

---

## 1. Executive Verdict

### **VERDICT: ORANGE — PAPER TRADING ONLY**
*(Conditionally suitable for research and TradingView Native Paper Trading simulation; NOT production-ready for automated live-market execution).*

### Executive Summary
From the perspective of a paying trader who expects a professional, financially reliable, and mathematically sound trading assistant:
1. **Strengths**:
   - The user interface is clean, modular, and responsive with a comprehensive 11-panel side navigation.
   - Dynamic chart detection accurately identifies visible TradingView charts, distinguishes Indian equities, US equities, and Cryptocurrencies (`BTCUSD` on `BITSTAMP` is correctly classified with `USD` currency), and properly handles URL/DOM desynchronization.
   - The DOM automation engine (`tv-paper-automator.ts`) successfully targets TradingView's built-in **Trading Panel → Paper Trading** dock and overcomes React/Vue synthetic event barriers.
   - Both the frontend test suite (56 tests) and Python backend test suite (11 tests) pass without syntax or build failures.

2. **Critical Vulnerabilities & Limitations Identified**:
   - **P0 — Unverified Execution Recorded as Filled Trade**: When TradingView DOM does not confirm an order fill within the timeout window, the automator returned `success: true` with `status: 'EXECUTION_UNVERIFIED'`, causing the store to record an unconfirmed trade into the journal.
   - **P0 — Backtester Used Toy Heuristic Instead of Real SMC Strategy**: In `src/analytics/backtester.ts`, `detectSignal()` bypassed the multi-timeframe SMC engine entirely and ran a simplified 5-candle lower-lows heuristic. A trader backtesting was not backtesting the actual SMC strategy.
   - **P1 — Risk Validator Checked Gross R:R Instead of Net R:R**: `src/risk/risk-validator.ts` checked `grossRR < 3.0` instead of `netRR < 3.0`, allowing trades with sub-3.00:1 net R:R after regulatory fees to pass validation.
   - **P1 — Symbol Mismatch Bypass in SMC Analysis**: `SMCAnalysis.tsx` alerted the user to symbol mismatches but did not block running analysis and generating signals for a symbol different from the active chart.
   - **P1 — Missing Manifest `tabs` Permission**: `chrome.tabs.query({ url: [...] })` was used in `appStore.ts` without `"tabs"` in `manifest.json` permissions, risking runtime failure in Chrome MV3.
   - **P0 / Legal — Live Trading Regulatory Non-Compliance**: Automated broker order placement via browser extensions violates Indian SEBI retail algorithmic trading guidelines unless bound to broker-approved algorithm registrations and static IP allocations.

---

## 2. Problem Register

| ID | Component | Problem Description | Evidence | Severity | Impact | Recommended Fix |
|:---|:---|:---|:---|:---:|:---|:---|
| **BUG-01** | `tv-paper-automator.ts` | Orders not visibly verified in TradingView still return `success: true`, logging phantom positions. | Line 433: `return { success: true, verifiedInTV: false, status: 'EXECUTION_UNVERIFIED' }` | **P0** | Trader journal records trades that never executed in TradingView. | Return `success: false` if `!verified`. Do not log position in `appStore`. |
| **BUG-02** | `backtester.ts` | Backtester used a 5-bar toy heuristic instead of the real SMC strategy engine. | Line 107-163: `detectSignal()` checks only 5 lookback bars, ignoring HTF bias, sweeps, and FVGs. | **P0** | Backtest metrics are invalid and mislead algorithmic research. | Wire `runEntryEngine()` directly into the backtesting simulation loop. |
| **BUG-03** | `risk-validator.ts` | Frontend validator checked `grossRR` instead of `netRR` against mandatory 3.00:1 minimum. | Line 99: `if (grossRR < riskSettings.minRR)` | **P1** | Sub-3:1 net trades approved after accounting for statutory charges. | Update check to `if (netRR < riskSettings.minRR)`. |
| **BUG-04** | `manifest.json` | Missing `"tabs"` permission in Manifest V3 permissions array. | `manifest.json` permissions lack `"tabs"`; `appStore.ts` calls `chrome.tabs.query({ url })`. | **P1** | Extension fails to query background TradingView tabs cleanly. | Add `"tabs"` to `permissions` in `public/manifest.json` and build scripts. |
| **BUG-05** | `SMCAnalysis.tsx` | Allows running analysis and generating orders when dataset symbol mismatches active chart. | Line 41: `handleRunAnalysis` proceeds even when `isSymbolMismatch` is true. | **P1** | Signals from dataset A can accidentally trigger orders on symbol B. | Strictly block analysis when `isSymbolMismatch` is true. |
| **BUG-06** | `entry-engine.ts` | Hardcoded `symbol: 'CHART_SYMBOL'` in default return and `'UNKNOWN'` in early returns. | Line 217: `symbol: 'CHART_SYMBOL'`; lines 79, 110: `'UNKNOWN'`. | **P2** | Signal symbol missing or desynchronized on early exit. | Pass `symbol?: string` into `runEntryEngine` options. |
| **BUG-07** | `tv-paper-automator.ts` | Closed/minimized Trading Panel prevents reading positions/orders rows. | Document query fails if `bottom-dock-tab-trading-panel` is collapsed. | **P2** | False negative verification when bottom panel is closed. | Implement `ensureTradingPanelOpen()` prior to table inspection. |
| **BUG-08** | `backend/main.py` | Live trading requires SEBI algo compliance and static IP registration. | Direct `/orders/execute` endpoint without 2FA or static IP binding. | **P0 (Live)** | Unlawful retail automated algorithmic execution in Indian markets. | Keep Live Trading strictly locked; enforce manual broker ticket preparation. |

---

## 3. Detailed Category-by-Category Audit

### 3.1 Chart Detection & Data Pipeline
- **Chart Detection**: Excellent priority-based reconciliation (Toolbar Search > DOM Title > URL Fallback). Overrides stale TradingView URL parameters when the user changes symbols in the chart.
- **Instrument Classification**: Accurately classifies Indian cash equities (`NSE`, `BSE`), US equities (`NASDAQ`, `NYSE`), Cryptocurrencies (`BITSTAMP`, `COINBASE`), and identifies unsupported futures/indices.
- **Market Data Pipeline**: Purely local. Historical candles imported via CSV with strict mathematical validation (`candle-validator.ts`). Missing/duplicate candle detection is operational.

### 3.2 SMC Strategy Engine
- **Market Structure**: Confirmed pivots with 3-bar left and 3-bar right requirements eliminate look-ahead bias.
- **BOS / CHoCH**: Evaluates candle closes against confirmed swing points. Accurately flags Change of Character when previous structural trend is reversed.
- **Liquidity Sweeps**: Checks whether prices wick below equal lows/swing lows and close back above within a 3-candle confirmation window.
- **Fair Value Gaps**: Implements 3-candle imbalance logic with dynamic ATR filtering and mitigation tracking.
- **Displacement**: Requires displacement candle body $\ge 1.5 \times \text{ATR}$.

### 3.3 Risk Management
- **Position Sizing**: Mathematically sound formula: $\text{Quantity} = \lfloor \text{Risk Budget} / (\text{Distance to SL} + \text{Cost per share}) \rfloor$.
- **Circuit Breakers**: Daily loss limit (1%), weekly loss limit (2.5%), and drawdown pause (5%) implemented in both frontend and Python backend.
- **Net R:R Gating**: Python backend strictly enforces 3.00:1 net R:R. Frontend validator had a bug checking gross R:R instead of net R:R (fixed in Stage 3).

### 3.4 Paper Trading & DOM Automation
- Targets TradingView's built-in **Trading Panel → Paper Trading** dock.
- Overcomes React synthetic event bindings via HTMLInputElement prototype setter dispatch.
- Verification mechanism previously allowed unverified orders to register as filled (fixed in Stage 3).

### 3.5 Live-Market Readiness
- Local Python backend provides DhanHQ, Zerodha Kite, and Interactive Brokers adapters.
- **Verdict for Live Trading**: **RED / LOCKED**. Retail automated execution without broker-approved algorithmic testing is prohibited by SEBI circulars in India and requires registered institutional gateways in the US.

---

## 4. Professional Trader's Perspective & Review

### Would you trust it to analyse a stock?
**Yes.** The SMC analysis engine objectively identifies swing pivots, liquidity sweeps, BOS, CHoCH, and FVGs based on confirmed historical candles.

### Would you trust the SMC signals?
**Yes, for manual trade preparation and paper trading.** The deterministic 10-point qualification avoids repainting because pivots require 3 closed confirmation bars.

### Would you trust the backtest?
**Not prior to this audit.** The previous backtester used a 5-bar lower-lows heuristic rather than the SMC engine. After our Stage 3 repair integrating `runEntryEngine`, backtest metrics can be trusted.

### Would you trust the risk calculations?
**Yes.** Position sizing, capital allocation, and statutory transaction cost factoring are mathematically sound.

### Would you allow it to manage a paper account automatically?
**Yes, with the consent modal and emergency disable switch active.**

### Would you allow it to place actual live trades automatically?
**No.** Automated execution with real money without exchange algo approvals and institutional broker infrastructure poses severe regulatory and financial risks. Live execution should remain strictly manual via prepared broker order tickets.

---

## 5. Five Most Critical Weaknesses Identified

1. **Backtesting / Strategy Engine Desynchronization**: Backtester previously simulated an oversimplified heuristic instead of actual SMC rules.
2. **False Positive Order Verification**: Unconfirmed TradingView DOM orders were logged as executed positions.
3. **Frontend Net R:R Check Leak**: Checked gross R:R rather than cost-inclusive net R:R.
4. **Symbol Mismatch Permissiveness**: Allowed analyzing data from one stock while viewing another.
5. **Regulatory Exposure for Live Orders**: Attempting automated broker execution without SEBI retail algo registration.

