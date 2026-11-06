# PAPER TRADING TEST REPORT: NATIVE TRADINGVIEW EXECUTION

---

## 1. Test Suite Summary

- **Frontend Test Suite**: 6 test files, 56 total tests.
- **Pass Rate**: 100% (56/56 passing).
- **Backend Test Suite**: 3 test files, 11 total tests.
- **Pass Rate**: 100% (11/11 passing).

---

## 2. Test Execution Breakdown

### `tests/tv-paper.test.ts` (11 tests)
- `correctly classifies BTCUSD on BITSTAMP as CRYPTOCURRENCY with CRYPTO market`: PASS (ensures `BTCUSD` is not misclassified as an NSE cash equity).
- `correctly classifies ETHUSD on COINBASE as CRYPTOCURRENCY`: PASS.
- `correctly classifies Indian cash equity (RELIANCE on NSE)`: PASS.
- `correctly classifies US cash equity (AAPL on NASDAQ)`: PASS.
- `reports DISCONNECTED when Paper Trading elements are absent`: PASS.
- `reports CONNECTED when TradingView Trading Panel button is present`: PASS (tests balance parsing, currency detection, and account name extraction).
- `verifies position presence from TradingView DOM rows`: PASS (verifies row scraping logic for symbol presence).
- `initializes with AUTO TRADE inactive and consent ungranted`: PASS.
- `properly records user consent before activation`: PASS.
- `emergency stop immediately halts auto-trade`: PASS.
- `auto-trade evaluation strictly refuses signals when Net R:R < 3.0:1`: PASS (verifies that any auto-executed order strictly enforces minimum 3.00:1 net R:R).

### `tests/detection.test.ts` (12 tests)
- Validates exchange parsing for `NSE`, `BSE`, `NASDAQ`, `NYSE`, `AMEX`, `BITSTAMP`, `COINBASE`, `BINANCE`.
- Validates timeframe extraction across `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w`.
- Validates DOM reconciliation between visible chart legend and URL path, overriding URL mismatch.

### `tests/risk.test.ts` (12 tests)
- Capital allocation limits (max 0.25% equity risk per trade).
- Daily loss limit (1.0%) and weekly loss limit (2.5%) circuit breakers.
- Maximum drawdown pause (5.0%).
- Position sizing based on distance to stop-loss.

### `tests/rr.test.ts` (7 tests)
- Cost-inclusive net reward-to-risk calculations.
- Strict rejection when net R:R < 3.00:1.
- Take profit adjustment ensuring target satisfies cost-inclusive 3.0:1 R:R.

### `tests/smc.test.ts` (7 tests)
- Swing point detection (pivots).
- Break of Structure (BOS) vs Change of Character (CHoCH).
- Liquidity sweeps of equal highs/lows.
- Fair Value Gap (FVG) detection and retest logic.

### `tests/csv.test.ts` (7 tests)
- Historical OHLCV parsing from CSV files.
- Header normalisation and timestamp sorting.
- Multi-timeframe validation (1H for bias, 5M for entries).

---

## 3. DOM Automation Verification Matrix (Section 11 Specification)

| Parameter | TradingView Paper Automation Output | Verification Status |
| :--- | :--- | :--- |
| **1. MODE** | `TRADINGVIEW NATIVE PAPER TRADING` | Verified via DOM automator |
| **2. ACCOUNT** | `TradingView Paper Trading` | Verified from dock balance bar |
| **3. AUTO TRADE** | `ACTIVE` / `INACTIVE` | Verified via store state & HUD overlay |
| **4. ACTIVE SYMBOL** | Visible symbol (e.g. `RELIANCE` / `AAPL` / `BTCUSD`) | Verified from chart legend / title |
| **5. EXCHANGE** | `NSE` / `NASDAQ` / `BITSTAMP` | Verified from exchange badge |
| **6. TIMEFRAME** | `5m` / `15m` / `1h` | Verified from active timeframe button |
| **7. 1H BIAS** | `BULLISH` | Verified from 1H swing structure |
| **8. LIQUIDITY SWEEP** | `CONFIRMED` | Verified from swing low sweep candle |
| **9. CHoCH** | `CONFIRMED` | Verified from swing high break |
| **10. FVG** | `CONFIRMED` | Verified from 3-candle imbalance |
| **11. ENTRY** | `Limit Price` | Populated in TradingView Order Ticket |
| **12. STOP** | `Stop Loss Price` | Populated in Stop Loss bracket input |
| **13. TARGET** | `Take Profit Price` | Populated in Take Profit bracket input |
| **14. NET R:R** | `>= 3.00:1` | Formally gated before submission |
| **15. POSITION** | `OPEN` / `NONE` | Scraped from Trading Panel `tr` rows |
| **16. TRADINGVIEW ORDER** | `VERIFIED` | Scraped from Trading Panel `tr` rows |
| **17. SL STATUS** | `PROTECTED` | Bracket active in Paper Trading dock |
| **18. TP STATUS** | `PROTECTED` | Bracket active in Paper Trading dock |

