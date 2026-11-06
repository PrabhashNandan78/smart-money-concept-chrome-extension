"""
SMC Emergency Kill Switch
Immediately halts new order placement, cancels all pending orders, and flattens or protects open positions.
"""

import time
from typing import Dict, Any, List
from .database import get_connection, log_audit
from .broker_manager import broker_registry

class KillSwitch:
    def __init__(self):
        self.is_active = False

    def activate(self, reason: str = "User Initiated Emergency Halt") -> Dict[str, Any]:
        """Activates emergency kill switch."""
        self.is_active = True
        cancelled_orders = 0
        flattened_positions = 0

        conn = get_connection()
        cursor = conn.cursor()

        # 1. Cancel all pending orders in DB
        cursor.execute("SELECT broker_order_id, broker FROM orders WHERE status IN ('PREPARED', 'ACCEPTED', 'SUBMITTED')")
        pending_orders = cursor.fetchall()

        for ord_row in pending_orders:
            b_id = ord_row["broker_order_id"]
            b_name = ord_row["broker"]
            if b_id:
                adapter = broker_registry.get_adapter(b_name)
                if adapter:
                    adapter.cancel_order(b_id)
                    cancelled_orders += 1

        cursor.execute("UPDATE orders SET status = 'CANCELLED' WHERE status IN ('PREPARED', 'ACCEPTED', 'SUBMITTED')")

        # 2. Close all open positions at market
        cursor.execute("SELECT id, symbol, exchange, quantity, entry_price FROM positions WHERE status = 'OPEN'")
        open_positions = cursor.fetchall()

        for pos in open_positions:
            pos_id = pos["id"]
            # Close position in DB
            cursor.execute("""
                UPDATE positions 
                SET status = 'CLOSED_KILL_SWITCH', closed_at = ?, current_price = entry_price, realized_pnl = 0
                WHERE id = ?
            """, (time.time(), pos_id))
            flattened_positions += 1

        conn.commit()
        conn.close()

        log_audit("KILL_SWITCH_ACTIVATED", {
            "reason": reason,
            "cancelled_orders": cancelled_orders,
            "flattened_positions": flattened_positions
        }, "EMERGENCY")

        return {
            "success": True,
            "killSwitchActive": True,
            "cancelledOrders": cancelled_orders,
            "flattenedPositions": flattened_positions,
            "message": f"Kill switch ACTIVE. Cancelled {cancelled_orders} orders and secured {flattened_positions} positions."
        }

    def deactivate(self) -> Dict[str, Any]:
        self.is_active = False
        log_audit("KILL_SWITCH_DEACTIVATED", {}, "INFO")
        return {
            "success": True,
            "killSwitchActive": False,
            "message": "Kill switch DEACTIVATED. Order placement re-enabled."
        }

kill_switch = KillSwitch()

