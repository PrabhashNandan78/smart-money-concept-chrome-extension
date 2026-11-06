"""
Unit Tests for Backend Risk Engine
Verifies strict 3:1 Net R:R, cash equity filtering, and capital protection limits.
"""

import pytest
from ..risk_engine import RiskEngine

def test_strict_3_to_1_net_rr_valid():
    engine = RiskEngine()
    # 500 entry, 490 stop = 10 risk. 535 target = 35 gross reward.
    # With costs (~0.50), net reward ~34.5, net risk ~10.5 -> ~3.28:1 net R:R (Valid)
    approved, gross_rr, net_rr, reason = engine.validate_net_rr(
        entry=500.0,
        stop_loss=490.0,
        take_profit=535.0,
        market="INDIA"
    )
    assert approved is True
    assert net_rr >= 3.00

def test_strict_3_to_1_net_rr_rejected_sub_3():
    engine = RiskEngine()
    # 500 entry, 490 stop = 10 risk. 520 target = 20 gross reward (2.0:1) -> Must REJECT
    approved, gross_rr, net_rr, reason = engine.validate_net_rr(
        entry=500.0,
        stop_loss=490.0,
        take_profit=520.0,
        market="INDIA"
    )
    assert approved is False
    assert net_rr < 3.00
    assert "fails minimum required 3.00:1" in reason

def test_strict_3_to_1_net_rr_rejected_inverted_stop():
    engine = RiskEngine()
    # Inverted stop: stop loss >= entry
    approved, gross_rr, net_rr, reason = engine.validate_net_rr(
        entry=500.0,
        stop_loss=505.0,
        take_profit=535.0,
        market="INDIA"
    )
    assert approved is False
    assert "Stop loss must be strictly below" in reason

def test_cash_equity_filter_rejects_futures():
    engine = RiskEngine()
    order_req = {
        "symbol": "NIFTY1!",
        "exchange": "NSEIX",
        "market": "INDIA",
        "limitPrice": 24000.0,
        "stopLoss": 23900.0,
        "takeProfit": 24400.0,
        "quantity": 50
    }
    val = engine.validate_pre_order(
        order_req=order_req,
        active_positions_count=0,
        daily_realized_loss=0.0,
        available_cash=1000000.0
    )
    assert val["approved"] is False
    assert "Continuous futures" in val["rejection_reason"]

def test_daily_loss_limit_rejection():
    engine = RiskEngine(account_equity=100000.0, max_daily_loss_pct=1.0) # Max daily loss = 1,000
    order_req = {
        "symbol": "RELIANCE",
        "exchange": "NSE",
        "market": "INDIA",
        "limitPrice": 2500.0,
        "stopLoss": 2480.0,
        "takeProfit": 2570.0,
        "quantity": 10
    }
    # Current loss = 1,200 (exceeds limit)
    val = engine.validate_pre_order(
        order_req=order_req,
        active_positions_count=0,
        daily_realized_loss=1200.0,
        available_cash=100000.0
    )
    assert val["approved"] is False
    assert "Daily loss limit reached" in val["rejection_reason"]

def test_max_concurrent_positions_rejection():
    engine = RiskEngine(max_concurrent_positions=3)
    order_req = {
        "symbol": "TCS",
        "exchange": "NSE",
        "market": "INDIA",
        "limitPrice": 3500.0,
        "stopLoss": 3450.0,
        "takeProfit": 3700.0,
        "quantity": 10
    }
    # Already 3 open positions
    val = engine.validate_pre_order(
        order_req=order_req,
        active_positions_count=3,
        daily_realized_loss=0.0,
        available_cash=100000.0
    )
    assert val["approved"] is False
    assert "Maximum concurrent open positions" in val["rejection_reason"]

