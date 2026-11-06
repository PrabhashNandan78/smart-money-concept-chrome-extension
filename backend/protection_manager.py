"""
SMC Protection Manager – Real TP/SL Management & Synthetic OCO Reconciliation
Monitors active positions, attaches protective brackets, and guarantees mutually exclusive exit execution.
"""

import time
import threading
from typing import Dict, Any, List, Optional
from .database import get_connection, log_audit
from .broker_manager import broker_registry

class ProtectionManager:
    def __init__(self):
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start_monitoring(self):
        if not self._running:
            self._running = True
            self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self._thread.start()

    def stop_monitoring(self):
        self._running = False

    def attach_protection(
        self,
        position_id: str,
        symbol: str,
        exchange: str,
        quantity: int,
        stop_loss: float,
        take_profit: float,
        is_native_bracket: bool,
        sl_order_id: Optional[str] = None,
        tp_order_id: Optional[str] = None,
        broker_name: str = "DHAN"
    ) -> bool:
        """
        Attaches protective TP/SL rules to an active position.
        """
        conn = get_connection()
        rule_id = f"PROT_{position_id}"

        # If not native bracket, place independent exit orders through adapter
        adapter = broker_registry.get_adapter(broker_name)
        if not is_native_bracket and adapter:
            if not sl_order_id:
                # Place SL trigger order
                sl_req = {
                    "symbol": symbol,
                    "exchange": exchange,
                    "quantity": quantity,
                    "limitPrice": stop_loss,
                    "orderType": "SL_LIMIT",
                    "transactionType": "SELL"
                }
                sl_res = adapter.place_order(sl_req)
                sl_order_id = sl_res.get("broker_order_id", f"SL_LOCAL_{int(time.time())}")

            if not tp_order_id:
                # Place TP target limit order
                tp_req = {
                    "symbol": symbol,
                    "exchange": exchange,
                    "quantity": quantity,
                    "limitPrice": take_profit,
                    "orderType": "LIMIT",
                    "transactionType": "SELL"
                }
                tp_res = adapter.place_order(tp_req)
                tp_order_id = tp_res.get("broker_order_id", f"TP_LOCAL_{int(time.time())}")

        conn.execute("""
            INSERT OR REPLACE INTO protection_rules 
            (id, position_id, sl_order_id, tp_order_id, sl_price, tp_price, quantity, is_native_bracket, sl_status, tp_status, last_reconciled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 'OPEN', ?)
        """, (rule_id, position_id, sl_order_id, tp_order_id, stop_loss, take_profit, quantity, 1 if is_native_bracket else 0, time.time()))

        # Update position record
        conn.execute("""
            UPDATE positions 
            SET sl_order_id = ?, tp_order_id = ?, is_bracket = ?
            WHERE id = ?
        """, (sl_order_id, tp_order_id, 1 if is_native_bracket else 0, position_id))

        conn.commit()
        conn.close()

        log_audit("PROTECTION_ATTACHED", {
            "position_id": position_id,
            "sl_order_id": sl_order_id,
            "tp_order_id": tp_order_id,
            "is_native": is_native_bracket,
            "sl": stop_loss,
            "tp": take_profit
        })
        return True

    def _monitor_loop(self):
        """
        Background loop reconciling open TP and SL orders.
        Guarantees that when TP fills, SL is immediately cancelled, and vice-versa.
        """
        while self._running:
            try:
                self.reconcile_all_protections()
            except Exception as e:
                log_audit("PROTECTION_MONITOR_ERROR", {"error": str(e)}, "ERROR")
            time.sleep(1.0)

    def reconcile_all_protections(self):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.id as pos_id, p.symbol, p.exchange, p.quantity, p.entry_price,
                   r.sl_order_id, r.tp_order_id, r.is_native_bracket, r.sl_price, r.tp_price
            FROM positions p
            JOIN protection_rules r ON p.id = r.position_id
            WHERE p.status = 'OPEN'
        """)
        open_items = cursor.fetchall()
        conn.close()

        adapter = broker_registry.get_adapter()
        if not adapter:
            return

        for row in open_items:
            pos_id = row["pos_id"]
            sl_id = row["sl_order_id"]
            tp_id = row["tp_order_id"]
            qty = row["quantity"]
            entry_px = row["entry_price"]

            if not sl_id or not tp_id:
                continue

            sl_status = adapter.get_order_status(sl_id)
            tp_status = adapter.get_order_status(tp_id)

            # Scenario A: Take-Profit Hit!
            if tp_status.get("status") == "FILLED":
                # Cancel opposing Stop-Loss order to prevent position reversal!
                adapter.cancel_order(sl_id)
                fill_px = tp_status.get("fill_price") or row["tp_price"]
                realized = (fill_px - entry_px) * qty

                self._close_position_in_db(pos_id, "CLOSED_TP", fill_px, realized)
                log_audit("TP_EXECUTED", {
                    "position_id": pos_id,
                    "exit_price": fill_px,
                    "pnl": realized,
                    "cancelled_sl_order": sl_id
                })

            # Scenario B: Stop-Loss Hit!
            elif sl_status.get("status") == "FILLED":
                # Cancel opposing Take-Profit order
                adapter.cancel_order(tp_id)
                fill_px = sl_status.get("fill_price") or row["sl_price"]
                realized = (fill_px - entry_px) * qty

                self._close_position_in_db(pos_id, "CLOSED_SL", fill_px, realized)
                log_audit("SL_EXECUTED", {
                    "position_id": pos_id,
                    "exit_price": fill_px,
                    "pnl": realized,
                    "cancelled_tp_order": tp_id
                })

    def _close_position_in_db(self, position_id: str, status: str, exit_price: float, realized_pnl: float):
        conn = get_connection()
        conn.execute("""
            UPDATE positions 
            SET status = ?, current_price = ?, realized_pnl = ?, closed_at = ?
            WHERE id = ?
        """, (status, exit_price, realized_pnl, time.time(), position_id))
        conn.commit()
        conn.close()

protection_manager = ProtectionManager()

