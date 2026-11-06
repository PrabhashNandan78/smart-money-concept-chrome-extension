"""
SMC Reconciliation Manager – State Synchronization with Broker Books
Reconciles open orders and positions on startup and periodic schedule.
"""

import time
from typing import Dict, Any, List
from .database import get_connection, log_audit
from .broker_manager import broker_registry

class ReconciliationManager:
    def reconcile_state(self) -> Dict[str, Any]:
        """
        Reconciles pending orders and positions against broker state.
        """
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id, broker_order_id, broker FROM orders WHERE status = 'ACCEPTED'")
        pending = cursor.fetchall()

        updated_orders = 0
        for row in pending:
            b_id = row["broker_order_id"]
            b_name = row["broker"]
            if b_id:
                adapter = broker_registry.get_adapter(b_name)
                if adapter:
                    st = adapter.get_order_status(b_id)
                    if st.get("status") == "FILLED":
                        fill_px = st.get("fill_price", 0.0)
                        fill_q = st.get("fill_qty", 0)
                        cursor.execute("""
                            UPDATE orders SET status = 'FILLED', fill_price = ?, fill_quantity = ?, updated_at = ?
                            WHERE id = ?
                        """, (fill_px, fill_q, time.time(), row["id"]))
                        updated_orders += 1

        conn.commit()
        conn.close()

        log_audit("RECONCILIATION_COMPLETED", {"updated_orders": updated_orders})
        return {
            "success": True,
            "reconciledOrders": updated_orders,
            "timestamp": time.time()
        }

reconciliation_manager = ReconciliationManager()

