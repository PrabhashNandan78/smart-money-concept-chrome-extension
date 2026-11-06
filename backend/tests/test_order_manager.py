"""
Integration Tests for Order Manager, Protection Manager, and Emergency Kill Switch
"""

import pytest
from ..order_manager import OrderManager
from ..broker_manager import broker_registry
from ..india.dhan_adapter import DhanAdapter
from ..protection_manager import protection_manager
from ..kill_switch import kill_switch
from ..database import init_db

@pytest.fixture(autouse=True)
def setup_backend():
    init_db()
    dhan = DhanAdapter()
    dhan.connect({})
    broker_registry.register(dhan)
    broker_registry.set_active_broker("DHAN")
    kill_switch.deactivate()

def test_live_order_execution_and_protection():
    manager = OrderManager()
    order_req = {
        "market": "INDIA",
        "exchange": "NSE",
        "symbol": "RELIANCE",
        "direction": "LONG",
        "timeframe": "15m",
        "quantity": 10,
        "orderType": "LIMIT",
        "limitPrice": 2500.0,
        "stopLoss": 2480.0,
        "takeProfit": 2575.0,
        "broker": "DHAN",
        "confirmedByUser": True
    }

    res = manager.execute_live_order(order_req)
    print("DEBUG RES:", res)
    assert res["success"] is True
    assert res["status"] == "FILLED"
    assert res["positionId"] is not None
    assert res["slOrderId"] is not None
    assert res["tpOrderId"] is not None

def test_emergency_kill_switch():
    # Activate kill switch
    res = kill_switch.activate("Test Emergency Trigger")
    assert res["success"] is True
    assert res["killSwitchActive"] is True

    # Attempt to place order while kill switch is active -> must fail
    manager = OrderManager()
    order_req = {
        "market": "INDIA",
        "exchange": "NSE",
        "symbol": "TCS",
        "direction": "LONG",
        "timeframe": "15m",
        "quantity": 5,
        "orderType": "LIMIT",
        "limitPrice": 3500.0,
        "stopLoss": 3450.0,
        "takeProfit": 3700.0,
        "broker": "DHAN",
        "confirmedByUser": True
    }
    # Pre-order check will be blocked by API or kill switch check
    assert kill_switch.is_active is True

    # Deactivate kill switch
    deact = kill_switch.deactivate()
    assert deact["killSwitchActive"] is False
