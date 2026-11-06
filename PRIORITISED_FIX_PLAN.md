# PRIORITISED REPAIR PLAN: SMC TRADING ASSISTANT
**Structured Engineering Implementation Roadmap**

---

## 1. Repair Hierarchy & Priority Sequence

Repairs are strictly sequenced in the following priority order:
1. **Safety and Financial-Execution Risks (P0)**
2. **Data Correctness & Strategy Correctness (P0 - P1)**
3. **Risk Management & Gating Invariants (P1)**
4. **Execution Reliability & Verification (P1 - P2)**
5. **Persistence, Reporting & User Experience (P2 - P3)**

---

## 2. Issue Work Breakdown

### Task 1: Fix False Positive Order Verification in Paper Trading (P0)
- **Problem**: When TradingView does not confirm an order in DOM, `submitTVPaperOrder()` still returned `success: true`, causing `appStore.ts` to log an unverified trade into the journal.
- **Root Cause**: `status: verified ? 'VERIFIED' : 'EXECUTION_UNVERIFIED'` combined with unconditional `success: true`.
- **Target Files**: `src/execution/tv-paper-automator.ts`, `src/store/appStore.ts`.
- **Action**:
  - In `tv-paper-automator.ts`, return `success: false` and `status: 'EXECUTION_UNVERIFIED'` when `verified === false`.
  - In `appStore.ts`, only record a trade into the journal if `result.success && result.verifiedInTV`.
  - Log an alert notice when an order is unverified.
- **Acceptance Test**: Submit an order where DOM verification fails; verify trade is NOT recorded in `trades` array.

### Task 2: Align Backtester with Full SMC Strategy Engine (P0)
- **Problem**: `src/analytics/backtester.ts` used a 5-bar lower-lows heuristic instead of `runEntryEngine()`.
- **Root Cause**: Placeholder implementation in `detectSignal()` in `backtester.ts`.
- **Target Files**: `src/analytics/backtester.ts`.
- **Action**:
  - Replace toy heuristic with rolling window multi-timeframe analysis using `runEntryEngine()`.
  - Generate 1H HTF candles on the fly using `buildHigherTimeframe()` when evaluating 5M candles.
  - Enforce real 1H Bias, Liquidity Sweeps, BOS/CHoCH, and FVG Retest conditions.
- **Acceptance Test**: Run `backtester.test.ts` to verify signals generated in backtest match SMC engine qualifications.

### Task 3: Enforce Net R:R in Frontend Risk Validator (P1)
- **Problem**: `src/risk/risk-validator.ts` checked `grossRR < riskSettings.minRR` instead of `netRR < riskSettings.minRR`.
- **Root Cause**: Property check typo on line 99.
- **Target Files**: `src/risk/risk-validator.ts`.
- **Action**:
  - Change line 99 to check `if (netRR < riskSettings.minRR)`.
  - Ensure any trade with Gross R:R = 3.05 but Net R:R = 2.92 is strictly rejected with a clear error message.
- **Acceptance Test**: Pass trade setup with net R:R = 2.95; verify `approved: false` and failure message appears.

### Task 4: Add `"tabs"` Permission to Chrome Manifest V3 (P1)
- **Problem**: Chrome Manifest V3 restricts `chrome.tabs.query({ url })` without `"tabs"` permission.
- **Root Cause**: Omission in `public/manifest.json` and `scripts/copy-manifest.js`.
- **Target Files**: `public/manifest.json`, `scripts/copy-manifest.js`.
- **Action**:
  - Add `"tabs"` to `permissions` array in both files.
- **Acceptance Test**: Verify Chrome Extension loads without permission warnings and queries TradingView tabs cleanly.

### Task 5: Prevent Symbol Mismatch Analysis Execution (P1)
- **Problem**: `SMCAnalysis.tsx` allowed running analysis and generating signals when selected dataset symbol mismatched active TradingView chart.
- **Root Cause**: `handleRunAnalysis` checked for empty dataset, but did not gate on `isSymbolMismatch`.
- **Target Files**: `src/components/SMCAnalysis.tsx`.
- **Action**:
  - Prevent running analysis if `isSymbolMismatch` is true, displaying an error banner directing the user to select the matching dataset or update the chart.
- **Acceptance Test**: Attempt to run analysis when chart is `RELIANCE` and dataset is `INFY`; verify execution is blocked.

### Task 6: Pass Symbol to Entry Engine (P2)
- **Problem**: `runEntryEngine()` hardcoded `symbol: 'CHART_SYMBOL'` or `'UNKNOWN'` on early returns.
- **Root Cause**: `symbol` was not a configurable parameter in `runEntryEngine()`.
- **Target Files**: `src/strategy/smc/entry-engine.ts`.
- **Action**:
  - Add optional `symbol?: string` parameter to `runEntryEngine(analysis, settings, symbol)`.
  - Populate `symbol` across all return paths.
- **Acceptance Test**: Call `runEntryEngine` with early return condition; verify returned signal contains provided symbol.

### Task 7: Implement `ensureTradingPanelOpen()` in TV Automator (P2)
- **Problem**: If TradingView Trading Panel bottom dock is collapsed, position rows cannot be queried.
- **Root Cause**: Closed dock elements are not rendered in visible DOM.
- **Target Files**: `src/execution/tv-paper-automator.ts`.
- **Action**:
  - Click bottom dock tab `button[data-name="bottom-dock-tab-trading-panel"]` if collapsed before scraping positions or orders.
- **Acceptance Test**: Verify positions table query opens the panel when collapsed.

