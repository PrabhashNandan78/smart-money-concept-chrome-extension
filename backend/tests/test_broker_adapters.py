"""
Unit Tests for Broker Adapters (Dhan, Zerodha, IBKR)
"""

import pytest
from ..india.dhan_adapter import DhanAdapter
from ..india.zerodha_adapter import ZerodhaAdapter
from ..us.ibkr_adapter import IBKRAdapter

def test_dhan_adapter_simulation():
    adapter = DhanAdapter()
    ok, msg = adapter.connect({})
    assert ok is True
    assert adapter.is_connected is True

    funds = adapter.get_account_funds()
    assert funds["available_funds"] > 0

    order_req = {
        "symbol": "RELIANCE",
        "exchange": "NSE",
        "limitPrice": 2500.0,
        "quantity": 10
    }
    res = adapter.place_bracket_order(order_req, sl_price=2480.0, tp_price=2570.0)
    assert res["success"] is True
    assert res["bracket_placed"] is True
    assert res["broker_order_id"] is not None

    status = adapter.get_order_status(res["broker_order_id"])
    assert status["status"] == "FILLED"

def test_zerodha_adapter_simulation():
    adapter = ZerodhaAdapter()
    ok, msg = adapter.connect({})
    assert ok is True
    assert adapter.is_connected is True

    order_req = {
        "symbol": "INFY",
        "exchange": "NSE",
        "limitPrice": 1500.0,
        "quantity": 20
    }
    res = adapter.place_bracket_order(order_req, sl_price=1485.0, tp_price=1550.0)
    assert res["success"] is True
    assert res["sl_order_id"] is not None
    assert res["tp_order_id"] is not None

def test_ibkr_adapter_simulation():
    adapter = IBKRAdapter()
    ok, msg = adapter.connect({})
    assert ok is True
    assert adapter.is_connected is True

    order_req = {
        "symbol": "AAPL",
        "exchange": "NASDAQ",
        "limitPrice": 220.0,
        "quantity": 5
    }
    res = adapter.place_bracket_order(order_req, sl_price=215.0, tp_price=240.0)
    assert res["success"] is True
    assert res["bracket_placed"] is True

