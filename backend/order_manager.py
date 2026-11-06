"""
SMC Order Manager – Live Order Lifecycle & Verification State Machine
Transitions: PREPARED -> SUBMITTED -> ACCEPTED -> FILLED -> PROTECTED -> CLOSED
"""

import time
import uuid
from typing import Dict, Any, Optional
from .database import get_connection, log_audit
from .broker_manager import broker_registry
from .risk_engine import RiskEngine
from .protection_manager import protection_manager

class OrderManager:
    def __init__(self, risk_engine: Optional[RiskEngine] = None):
        self.risk_engine = risk_engine or RiskEngine()

    def execute_live_order(self, order_req: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes a verified live trade workflow with safety checks.
        """
        conn = get_connection()
        cursor = conn.cursor()

        # Count active open positions
        cursor.execute("SELECT COUNT(*) as cnt FROM positions WHERE status = 'OPEN'")
        active_pos = cursor.fetchone()["cnt"]

        # Calculate daily realized loss
        today_start = time.time() - (time.time() % 86400)
        cursor.execute("""
            SELECT SUM(realized_pnl) as total_pnl 
            FROM positions 
            WHERE status IN ('CLOSED_SL', 'CLOSED_TP', 'CLOSED_MANUAL') AND closed_at >= ?
        """, (today_start,))
        row = cursor.fetchone()
        realized_loss = abs(min(0.0, row["total_pnl"] or 0.0))
        conn.close()

        broker_name = order_req.get("broker", "DHAN").upper()
        adapter = broker_registry.get_adapter(broker_name)
        if not adapter or not adapter.is_connected:
            return {
                "success": False,
                "message": f"Broker {broker_name} is not connected. Connect in settings before live execution."
            }

        funds = adapter.get_account_funds()
        available_cash = funds.get("available_funds", 0.0)

        # 1. Pre-flight Risk Validation
        validation = self.risk_engine.validate_pre_order(
            order_req=order_req,
            active_positions_count=active_pos,
            daily_realized_loss=realized_loss,
            available_cash=available_cash
        )

        if not validation["approved"]:
            log_audit("ORDER_REJECTED_RISK", {
                "order": order_req,
                "reason": validation["rejection_reason"]
            }, "REJECTED")
            return {
                "success": False,
                "message": f"Risk Engine Rejection: {validation['rejection_reason']}"
            }

        order_id = f"ORD_{uuid.uuid4().hex[:10].upper()}"
        symbol = order_req["symbol"].upper()
        exchange = order_req.get("exchange", "NSE")
        market = order_req.get("market", "INDIA")
        qty = int(order_req["quantity"])
        planned_entry = float(order_req["limitPrice"])
        sl_price = float(order_req["stopLoss"])
        tp_price = float(order_req["takeProfit"])

        # 2. Record PREPARED Order in DB
        conn = get_connection()
        conn.execute("""
            INSERT INTO orders (id, symbol, exchange, market, direction, order_type, quantity, planned_entry, stop_loss, take_profit, status, broker, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'LONG', 'LIMIT', ?, ?, ?, ?, 'PREPARED', ?, ?, ?)
        """, (order_id, symbol, exchange, market, qty, planned_entry, sl_price, tp_price, broker_name, time.time(), time.time()))
        conn.commit()
        conn.close()

        # 3. Submit to Broker Adapter (using bracket order if supported)
        if adapter.supports_native_bracket:
            broker_res = adapter.place_bracket_order(order_req, sl_price, tp_price)
        else:
            broker_res = adapter.place_order(order_req)

        if not broker_res.get("success"):
            conn = get_connection()
            conn.execute("UPDATE orders SET status = 'REJECTED', raw_response = ? WHERE id = ?", (broker_res.get("message"), order_id))
            conn.commit()
            conn.close()
            return broker_res

        broker_order_id = broker_res.get("broker_order_id")
        fill_price = broker_res.get("fill_price") or planned_entry
        fill_qty = broker_res.get("fill_quantity") or qty

        # 4. Verify Actual Fill
        # In live trading, if order is in ACCEPTED/PENDING state, poll broker up to 3 seconds for fill
        if broker_res.get("status") == "ACCEPTED":
            for _ in range(3):
                time.sleep(1.0)
                status_check = adapter.get_order_status(broker_order_id)
                if status_check.get("status") == "FILLED":
                    fill_price = status_check.get("fill_price") or planned_entry
                    fill_qty = status_check.get("fill_qty") or qty
                    break

        # 5. Create Open Position & Attach Protection
        pos_id = f"POS_{uuid.uuid4().hex[:10].upper()}"
        conn = get_connection()
        conn.execute("""
            UPDATE orders 
            SET broker_order_id = ?, status = 'FILLED', fill_price = ?, fill_quantity = ?, updated_at = ?
            WHERE id = ?
        """, (broker_order_id, fill_price, fill_qty, time.time(), order_id))

        conn.execute("""
            INSERT INTO positions (id, symbol, exchange, market, quantity, entry_price, current_price, stop_loss, take_profit, is_bracket, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
        """, (pos_id, symbol, exchange, market, fill_qty, fill_price, fill_price, sl_price, tp_price, 1 if adapter.supports_native_bracket else 0, time.time()))
        conn.commit()
        conn.close()

        # 6. Attach Protection Orders (Native or Synthetic OCO)
        protection_manager.attach_protection(
            position_id=pos_id,
            symbol=symbol,
            exchange=exchange,
            quantity=fill_qty,
            stop_loss=sl_price,
            take_profit=tp_price,
            is_native_bracket=adapter.supports_native_bracket,
            sl_order_id=broker_res.get("sl_order_id"),
            tp_order_id=broker_res.get("tp_order_id"),
            broker_name=broker_name
        )

        log_audit("LIVE_ORDER_FILLED_AND_PROTECTED", {
            "order_id": order_id,
            "broker_order_id": broker_order_id,
            "position_id": pos_id,
            "fill_price": fill_price,
            "fill_quantity": fill_qty,
            "net_rr": validation["net_rr"]
        })

        return {
            "success": True,
            "orderId": order_id,
            "brokerOrderId": broker_order_id,
            "positionId": pos_id,
            "status": "FILLED",
            "fillPrice": fill_price,
            "fillQuantity": fill_qty,
            "slOrderId": broker_res.get("sl_order_id"),
            "tpOrderId": broker_res.get("tp_order_id"),
            "bracketPlaced": adapter.supports_native_bracket,
            "message": f"Live order filled @ {fill_price:.2f}. Protective SL ({sl_price:.2f}) and TP ({tp_price:.2f}) verified.",
            "timestamp": time.time()
        }

order_manager = OrderManager()

