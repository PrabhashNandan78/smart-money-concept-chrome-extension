# BUG FIX REPORT: SMC TRADING ASSISTANT
**Exhaustive Log of Identified Bugs, Root Causes, and Applied Fixes**

---

### Bug 1: Pine Script Strategy Tester Execution vs Native Paper Trading
- **Issue**: Previous versions relied on Pine Script Strategy Tester or internal offline simulation, which did not place orders in TradingView's actual Paper Trading account.
- **Root Cause**: Absence of DOM interaction engine targeting TradingView's native Trading Panel interface.
- **Fix**: Created `src/execution/tv-paper-automator.ts`, implementing automated opening of the order ticket dialog, selecting `BUY` and `LIMIT`, dispatching native synthetic events for Quantity, Limit Price, Take Profit, and Stop Loss brackets, clicking `Place Order`, and scraping the Trading Panel table to verify execution.

---

### Bug 2: Cryptocurrency (`BTCUSD`) Misclassification as Indian Equity
- **Issue**: Opening a cryptocurrency chart such as `BTCUSD` on `BITSTAMP` or `COINBASE` caused the detector to fall back to `NSE` Indian cash equity rules.
- **Root Cause**: `INDIA_EXCHANGES` was the default fallback, and cryptocurrency symbols were not matched before checking equity patterns.
- **Fix**: Added `CRYPTO_EXCHANGES` (`BITSTAMP`, `COINBASE`, `BINANCE`), added `Market: 'CRYPTO'`, `InstrumentType: 'CRYPTOCURRENCY'`, and updated `marketFromExchange` and `classifyInstrument` in `src/content/tradingview-detector.ts` to detect crypto symbols (`BTCUSD`, `ETHUSD`, `SOLUSD`) as `CRYPTOCURRENCY` with `USD` currency and `CRYPTO SUPPORTED` status.

---

### Bug 3: TradingView Synthetic Event Input Rejection
- **Issue**: Setting `inputEl.value = '...'` in TradingView's Order Ticket did not register on React/Vue reactive forms, leaving inputs blank upon submission.
- **Root Cause**: React and Vue override standard HTMLInputElement `value` setters with synthetic getters/setters.
- **Fix**: Implemented `triggerNativeInputChange` using `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set` and subsequently dispatching synthetic bubbling `input` and `change` DOM events.

---

### Bug 4: Regulatory Cost Erosion Reducing Net Reward-to-Risk Below 3.0:1
- **Issue**: Orders with gross R:R above 3.0:1 (e.g. 3.5:1) were failing because Indian regulatory charges (STT, exchange turnover fees, GST, stamp duty) reduced net R:R below 3.00:1.
- **Root Cause**: Incomplete cost-accounting in target calculation.
- **Fix**: Integrated statutory transaction tax models into `calculateTakeProfit` and `validateTradeRisk`. The position calculator now sets the target price to guarantee that **NET R:R after all statutory charges** satisfies the mandatory 3.00:1 threshold.

---

### Bug 5: Missing Auto-Trade State Machine & Safety Safeguards
- **Issue**: Lack of an autonomous auto-trade loop and safety controls to prevent unintended automated executions.
- **Root Cause**: The application only supported manual trigger buttons.
- **Fix**: Designed a comprehensive auto-trade state machine in `src/store/appStore.ts` with:
  1. `AutoTradeConsentModal.tsx` requiring explicit confirmation before enabling.
  2. One-click `AUTO TRADE [ ACTIVE / INACTIVE ]` toggle in the top header.
  3. Prominent red `HALT` / `EMERGENCY DISABLE` button that immediately pauses execution.
  4. Automatic duplicate-order prevention and chart context invalidation on symbol switch.

---

### Bug 6: Chrome Extension Manifest Permissions on `in.tradingview.com`
- **Issue**: Extension permissions showed "When you click the extension" instead of persistent site access on `in.tradingview.com`.
- **Root Cause**: Missing host permissions matching exact subdomains.
- **Fix**: Configured `manifest.json` with host permissions:
  - `*://in.tradingview.com/*`
  - `*://www.tradingview.com/*`
  - `*://tradingview.com/*`
  Ensuring persistent site access across all TradingView regional domains without requesting broad `*://*/*` access.
