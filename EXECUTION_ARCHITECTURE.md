# EXECUTION ARCHITECTURE: NATIVE TRADINGVIEW PAPER TRADING AUTOMATION

---

## 1. Overview & Execution Target

The **SMC Trading Assistant** executes automated orders directly through TradingView's built-in **Trading Panel → Paper Trading** interface using browser-side JavaScript and DOM interaction.

**Execution Destination:**
`TradingView Website → Bottom Dock → Trading Panel → Paper Trading`

**Prohibited Execution Paths:**
- Pine Script Strategy Tester (strictly bypassed).
- Broker APIs in Paper Mode (all paper execution is 100% API-free).
- Hidden or private TradingView WebSockets / internal undocumented APIs.

---

## 2. DOM Automation Mechanics (`src/execution/tv-paper-automator.ts`)

### 2.1 Connection Verification
1. Inspects the bottom dock tab:
   - `button[data-name="bottom-dock-tab-trading-panel"]`
   - `div[data-name="bottom-area"] [data-name="trading"]`
2. Inspects chart instant order buttons:
   - `div[data-name="order-placement-buttons"]` or `[class*="buySellButtons-"]`
3. Parses account summary balance and currency:
   - `[data-name="account-summary-balance"]` (supports both `₹` INR and `$` USD balances).

### 2.2 Order Ticket Invocation
1. Verifies if ticket dialog is open via:
   - `div[data-name="order-ticket-dialog"]`
   - `div[data-dialog-name="order-ticket"]`
2. If closed, opens the order ticket by triggering:
   - Right sidebar order panel: `button[data-name="order-ticket"]` or `button[data-name="order-panel"]`
   - Or chart instant buy button.

### 2.3 Synthetic Event Property Dispatch
TradingView uses modern frontend reactive frameworks (React / Vue) with synthetic event wrappers. Direct assignment (`input.value = "..."`) is ignored by reactive component state. 
To bypass this limitation cleanly, `triggerNativeInputChange` calls the native HTML input prototype property setter:
```typescript
function triggerNativeInputChange(inputEl: HTMLInputElement, value: string | number): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(inputEl, String(value));
  } else {
    inputEl.value = String(value);
  }

  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  inputEl.dispatchEvent(new Event('change', { bubbles: true }));
}
```

### 2.4 Complete Bracket Order Entry
1. **Side Selection**: Selects `BUY` tab.
2. **Order Type**: Selects `LIMIT` order type.
3. **Quantity Input**: Populates calculated risk-adjusted quantity into `input[data-name="quantity"]` / `input[data-name="units"]`.
4. **Limit Price**: Populates entry price into `input[data-name="price"]`.
5. **Take Profit Bracket**:
   - Locates `input[data-name="take-profit-checkbox"]` and checks it if unchecked.
   - Populates target price into `input[data-name="take-profit-price"]`.
6. **Stop Loss Bracket**:
   - Locates `input[data-name="stop-loss-checkbox"]` and checks it if unchecked.
   - Populates stop price into `input[data-name="stop-loss-price"]`.
7. **Safe Submission**:
   - Triggers native mousedown, mouseup, and click events on `button[data-name="place-order"]` or `button[data-name="submit"]`.

### 2.5 Verification in TradingView Positions / Orders Table
1. After submission, the automator awaits 1200ms for DOM update.
2. Scrapes `div[data-name="trading-panel"] tr` to confirm the symbol, direction, quantity, and price appear in TradingView's native table.
3. Marks order as `VERIFIED` with `slStatus: PROTECTED` and `tpStatus: PROTECTED`.

---

## 3. Autonomous Trade Loop & Safety Architecture

```
                                  ┌───────────────────────────┐
                                  │ Active Chart Context      │
                                  │ (Symbol, Timeframe, Mkt)  │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
                                  ┌───────────────────────────┐
                                  │ SMC Qualification Engine  │
                                  │ 1H Bias + Sweep + CHoCH   │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
     ┌────────────────────────┐   ┌───────────────────────────┐
     │ Auto Trade Switch      ├──►│ Gating Evaluation:        │
     │ Consent Given?         │   │ 1. Active & Consent Given │
     │ Emergency Halt Active? │   │ 2. Symbol Tradable        │
     └────────────────────────┘   │ 3. Signal Valid & Bullish │
                                  │ 4. No Duplicate Position  │
                                  │ 5. NET R:R >= 3.00:1      │
                                  └─────────────┬─────────────┘
                                                │ (All Passed)
                                                ▼
                                  ┌───────────────────────────┐
                                  │ Position Sizer & Bracket  │
                                  │ Entry, SL, TP Calculation │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
                                  ┌───────────────────────────┐
                                  │ TradingView DOM Execution │
                                  │ Paper Order Ticket Auto   │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
                                  ┌───────────────────────────┐
                                  │ Visible DOM Verification  │
                                  │ Trading Panel Row Check   │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
                                  ┌───────────────────────────┐
                                  │ Synchronized Journal      │
                                  │ 'TV_NATIVE_PAPER' Logged  │
                                  └───────────────────────────┘
```

### Safety Rules Enforced:
1. **Mandatory First-Activation Consent**: Users must acknowledge simulation parameters and risk thresholds in `AutoTradeConsentModal`.
2. **Instant Emergency Disable**: A dedicated red `HALT` / `EMERGENCY DISABLE` button in both the header and status matrix immediately disengages auto-trading and notifies the TradingView content script.
3. **No Duplicate Execution**: Prevents submitting duplicate orders if an open position or working order exists for that symbol.
4. **Symbol Invalidation on Chart Change**: Changing the TradingView chart symbol or timeframe immediately invalidates any prior analysis and re-evaluates context from scratch.

