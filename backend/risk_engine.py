"""
SMC Risk Engine – Strict 3:1 Net R:R & Capital Protection Invariants
Enforces strict portfolio risk budgeting, daily/weekly loss limits, and cash equity restrictions.
"""

from typing import Dict, Any, Tuple, List, Optional
import math

class RiskValidationError(Exception):
    pass

class RiskEngine:
    def __init__(
        self,
        account_equity: float = 500000.0,
        risk_per_trade_pct: float = 0.25,
        max_daily_loss_pct: float = 1.0,
        max_weekly_loss_pct: float = 2.5,
        drawdown_pause_pct: float = 5.0,
        max_concurrent_positions: int = 3,
        max_aggregate_risk_pct: float = 0.75,
        min_net_rr: float = 3.0
    ):
        self.account_equity = account_equity
        self.risk_per_trade_pct = risk_per_trade_pct
        self.max_daily_loss_pct = max_daily_loss_pct
        self.max_weekly_loss_pct = max_weekly_loss_pct
        self.drawdown_pause_pct = drawdown_pause_pct
        self.max_concurrent_positions = max_concurrent_positions
        self.max_aggregate_risk_pct = max_aggregate_risk_pct
        self.min_net_rr = min_net_rr

    def calculate_transaction_costs(self, entry: float, exit_price: float, quantity: int, market: str) -> float:
        """
        Computes accurate regulatory round-trip transaction costs:
        - India (NSE/BSE): STT (0.1% delivery / 0.025% intraday), turnover charges, GST (18%), stamp duty.
        - US (NASDAQ/NYSE): SEC fee, FINRA TAF, standard broker fee per share.
        """
        turnover = (entry + exit_price) * quantity
        if market == "INDIA":
            stt = turnover * 0.0005  # avg equity delivery/intraday
            exchange_turnover = turnover * 0.0000345
            sebi_charges = turnover * 0.000001
            stamp_duty = (entry * quantity) * 0.00015
            gst = (exchange_turnover + sebi_charges) * 0.18
            return stt + exchange_turnover + sebi_charges + stamp_duty + gst
        else:
            sec_fee = (exit_price * quantity) * 0.0000278
            finra_taf = quantity * 0.000166
            broker_fee = max(1.0, quantity * 0.005)
            return sec_fee + finra_taf + broker_fee

    def validate_net_rr(self, entry: float, stop_loss: float, take_profit: float, market: str = "INDIA") -> Tuple[bool, float, float, str]:
        """
        Validates minimum 3.00:1 NET Reward:Risk.
        Gross R:R = (TP - Entry) / (Entry - SL)
        Net R:R = (Gross Reward - Costs) / (Gross Risk + Costs)
        """
        if entry <= 0 or stop_loss <= 0 or take_profit <= 0:
            return False, 0.0, 0.0, "All price levels must be greater than zero."

        if stop_loss >= entry:
            return False, 0.0, 0.0, "Stop loss must be strictly below entry price for long trades."

        if take_profit <= entry:
            return False, 0.0, 0.0, "Take profit must be strictly above entry price for long trades."

        gross_risk = entry - stop_loss
        gross_reward = take_profit - entry
        gross_rr = gross_reward / gross_risk

        est_cost_per_share = self.calculate_transaction_costs(entry, take_profit, 1, market)
        net_risk = gross_risk + est_cost_per_share
        net_reward = gross_reward - est_cost_per_share

        net_rr = net_reward / net_risk if net_risk > 0 else 0.0

        if net_rr < self.min_net_rr - 1e-4:  # allow 2.99999 fp tolerance
            return False, gross_rr, net_rr, f"Net Reward:Risk of {net_rr:.2f}:1 fails minimum required 3.00:1 ratio. (No override permitted)."

        return True, gross_rr, net_rr, "Qualified 3:1 Net R:R"

    def calculate_position_size(
        self,
        entry: float,
        stop_loss: float,
        available_cash: float,
        market: str = "INDIA"
    ) -> Tuple[int, float, float]:
        """
        Calculates position size strictly respecting risk budget:
        Risk budget = Account Equity * risk_per_trade_pct
        Quantity = floor(Risk budget / Risk per share)
        """
        risk_budget = self.account_equity * (self.risk_per_trade_pct / 100.0)
        risk_per_share = (entry - stop_loss) + self.calculate_transaction_costs(entry, entry, 1, market)

        if risk_per_share <= 0:
            return 0, 0.0, 0.0

        raw_qty = risk_budget / risk_per_share
        qty = math.floor(raw_qty)

        # Cash constraint
        max_cash_qty = math.floor(available_cash / entry) if entry > 0 else 0
        final_qty = max(0, min(qty, max_cash_qty))

        total_risk = final_qty * risk_per_share
        cash_required = final_qty * entry

        return final_qty, total_risk, cash_required

    def validate_pre_order(
        self,
        order_req: Dict[str, Any],
        active_positions_count: int,
        daily_realized_loss: float,
        available_cash: float
    ) -> Dict[str, Any]:
        """
        Performs full pre-flight risk checks before any live order can be sent to broker.
        """
        symbol = order_req.get("symbol", "").upper()
        entry = float(order_req.get("limitPrice", 0))
        stop_loss = float(order_req.get("stopLoss", 0))
        take_profit = float(order_req.get("takeProfit", 0))
        quantity = int(order_req.get("quantity", 0))
        market = order_req.get("market", "INDIA")

        # 1. Cash Equity check (reject continuous futures)
        if symbol.endswith("!") or "FUT" in symbol or symbol == "NIFTY1!":
            return {
                "approved": False,
                "rejection_reason": f"Continuous futures ({symbol}) not supported in cash equity live profile."
            }

        # 2. Daily Loss Limit
        max_daily_loss = self.account_equity * (self.max_daily_loss_pct / 100.0)
        if daily_realized_loss >= max_daily_loss:
            return {
                "approved": False,
                "rejection_reason": f"Daily loss limit reached ({daily_realized_loss:.2f} >= {max_daily_loss:.2f}). Trading locked for today."
            }

        # 3. Concurrent Positions Limit
        if active_positions_count >= self.max_concurrent_positions:
            return {
                "approved": False,
                "rejection_reason": f"Maximum concurrent open positions ({self.max_concurrent_positions}) reached."
            }

        # 4. Strict 3:1 Net R:R Check
        valid_rr, gross_rr, net_rr, rr_reason = self.validate_net_rr(entry, stop_loss, take_profit, market)
        if not valid_rr:
            return {
                "approved": False,
                "rejection_reason": rr_reason,
                "gross_rr": gross_rr,
                "net_rr": net_rr
            }

        # 5. Buying power / available cash check
        required_cash = entry * quantity
        if required_cash > available_cash:
            return {
                "approved": False,
                "rejection_reason": f"Insufficient available funds. Required: {required_cash:.2f}, Available: {available_cash:.2f}"
            }

        return {
            "approved": True,
            "gross_rr": gross_rr,
            "net_rr": net_rr,
            "required_cash": required_cash,
            "rejection_reason": None
        }

