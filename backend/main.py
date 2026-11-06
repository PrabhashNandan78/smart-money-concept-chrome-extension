"""
SMC Trading Assistant – Local Python Execution Backend
FastAPI service on 127.0.0.1:8000 powering official broker integrations, risk validation, and TP/SL protection.
"""

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, Optional, List
import time
import os

from .database import init_db, log_audit, get_connection
from .broker_manager import broker_registry
from .india.dhan_adapter import DhanAdapter
from .india.zerodha_adapter import ZerodhaAdapter
from .us.ibkr_adapter import IBKRAdapter
from .risk_engine import RiskEngine
from .order_manager import order_manager
from .protection_manager import protection_manager
from .reconciliation import reconciliation_manager
from .kill_switch import kill_switch

app = FastAPI(
    title="SMC Trading Assistant Local Execution Backend",
    description="Local execution server for TradingView SMC Chrome Extension. Manages broker authentication, live orders, and TP/SL protection.",
    version="1.0.0"
)

# CORS configuration to allow Chrome Extension and local requests
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="chrome-extension://.*|http://localhost:.*|http://127.0.0.1:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database, register adapters, and start background workers on startup
@app.on_event("startup")
def on_startup():
    init_db()

    # Register all broker adapters
    dhan = DhanAdapter()
    zerodha = ZerodhaAdapter()
    ibkr = IBKRAdapter()

    broker_registry.register(dhan)
    broker_registry.register(zerodha)
    broker_registry.register(ibkr)

    # Default to Dhan in simulation/sandbox mode
    broker_registry.set_active_broker("DHAN")
    dhan.connect({})

    # Start protection manager monitoring loop
    protection_manager.start_monitoring()

    # Initial state reconciliation
    reconciliation_manager.reconcile_state()
    log_audit("BACKEND_STARTUP", {"version": "1.0.0", "status": "ONLINE"})

@app.on_event("shutdown")
def on_shutdown():
    protection_manager.stop_monitoring()
    log_audit("BACKEND_SHUTDOWN", {"status": "OFFLINE"})

# ── Health & Status Endpoints ──────────────────────────────────────────────────

@app.get("/health")
def health_check():
    adapter = broker_registry.get_adapter()
    funds = adapter.get_account_funds() if adapter else {}
    return {
        "status": "ok",
        "service": "SMC Trading Backend",
        "broker": adapter.broker_name if adapter else None,
        "broker_connected": adapter.is_connected if adapter else False,
        "account_identity": adapter.client_id if adapter else None,
        "cash_balance": funds.get("cash_balance", 0.0),
        "available_funds": funds.get("available_funds", 0.0),
        "trading_permissions": True,
        "market_data_permissions": True,
        "kill_switch_active": kill_switch.is_active,
        "timestamp": time.time()
    }

@app.get("/status")
def system_status():
    return health_check()

# ── Broker Management Endpoints ────────────────────────────────────────────────

@app.get("/broker/list")
def list_supported_brokers():
    return {"brokers": broker_registry.list_brokers()}

@app.get("/broker/status")
def broker_status():
    adapter = broker_registry.get_adapter()
    if not adapter:
        return {"connected": False, "broker": None}
    funds = adapter.get_account_funds()
    return {
        "connected": adapter.is_connected,
        "broker": adapter.broker_name,
        "client_id": adapter.client_id,
        "market": adapter.market,
        "funds": funds,
        "supports_native_bracket": adapter.supports_native_bracket,
        "last_connected": adapter.last_connected
    }

@app.post("/broker/select")
def select_broker(payload: Dict[str, Any] = Body(...)):
    broker_name = payload.get("broker")
    if not broker_name:
        raise HTTPException(status_code=400, detail="Missing 'broker' field.")
    ok = broker_registry.set_active_broker(broker_name)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Broker {broker_name} not supported.")
    return {"success": True, "active_broker": broker_name.upper()}

@app.post("/broker/connect")
def connect_broker(payload: Dict[str, Any] = Body(...)):
    broker_name = payload.get("broker")
    credentials = payload.get("credentials", {})
    adapter = broker_registry.get_adapter(broker_name)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"Broker {broker_name} not found.")

    success, msg = adapter.connect(credentials)
    if success:
        broker_registry.set_active_broker(broker_name)
        return {"success": True, "message": msg, "broker": adapter.broker_name}
    raise HTTPException(status_code=401, detail=msg)

@app.post("/broker/disconnect")
def disconnect_broker():
    adapter = broker_registry.get_adapter()
    if adapter:
        adapter.disconnect()
        return {"success": True, "message": f"{adapter.broker_name} disconnected."}
    return {"success": True}

# ── Live Order Execution Endpoints ─────────────────────────────────────────────

@app.post("/orders/validate")
def validate_order(order_req: Dict[str, Any] = Body(...)):
    """Pre-flight risk check without placing an order."""
    adapter = broker_registry.get_adapter(order_req.get("broker"))
    funds = adapter.get_account_funds() if adapter else {}
    available_cash = funds.get("available_funds", 500000.0)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as cnt FROM positions WHERE status = 'OPEN'")
    active_pos = cursor.fetchone()["cnt"]
    conn.close()

    val = order_manager.risk_engine.validate_pre_order(
        order_req=order_req,
        active_positions_count=active_pos,
        daily_realized_loss=0.0,
        available_cash=available_cash
    )
    return val

@app.post("/orders/execute")
def execute_order(order_req: Dict[str, Any] = Body(...)):
    """Submits live order through connected broker adapter with verified TP/SL."""
    if kill_switch.is_active:
        raise HTTPException(status_code=403, detail="Emergency Kill Switch is ACTIVE. Live orders are blocked.")

    confirmed = order_req.get("confirmedByUser", False)
    if not confirmed:
        raise HTTPException(status_code=400, detail="Explicit user confirmation required for live broker orders.")

    res = order_manager.execute_live_order(order_req)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Order execution failed."))
    return res

@app.get("/orders/active")
def get_active_orders():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM orders WHERE status IN ('PREPARED', 'ACCEPTED', 'SUBMITTED') ORDER BY created_at DESC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"orders": rows}

@app.get("/positions")
def get_positions():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM positions ORDER BY created_at DESC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"positions": rows}

# ── Emergency Kill Switch ──────────────────────────────────────────────────────

@app.post("/kill-switch/activate")
def activate_kill_switch(payload: Dict[str, Any] = Body(default={})):
    reason = payload.get("reason", "Manual trigger from UI")
    res = kill_switch.activate(reason)
    return res

@app.post("/kill-switch/deactivate")
def deactivate_kill_switch():
    res = kill_switch.deactivate()
    return res

# ── Live Trade Journal ─────────────────────────────────────────────────────────

@app.get("/journal/live-trades")
def get_live_journal():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM positions WHERE status LIKE 'CLOSED_%' ORDER BY closed_at DESC")
    closed = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"trades": closed}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)

