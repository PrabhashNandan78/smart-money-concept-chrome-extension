"""
Zerodha Kite Connect v3 Adapter
Supports NSE/BSE Cash Equities with synthetic OCO protection management.
"""

from typing import Dict, Any, List, Optional, Tuple
import time
import uuid
import requests
from ..broker_manager import BaseBrokerAdapter
from ..database import log_audit

class ZerodhaAdapter(BaseBrokerAdapter):
    def __init__(self):
        super().__init__(broker_name="ZERODHA", market="INDIA")
        self.supports_native_bracket = False  # Zerodha uses synthetic OCO / GTT triggers
        self.base_url = "https://api.kite.trade"
        self._api_key: Optional[str] = None
        self._access_token: Optional[str] = None
        self._mock_orders: Dict[str, Dict[str, Any]] = {}
        self._mock_balance = 500000.0

    def connect(self, credentials: Dict[str, Any]) -> Tuple[bool, str]:
        api_key = credentials.get("api_key")
        token = credentials.get("access_token")

        if not api_key or not token:
            self.is_connected = True
            self.client_id = "ZERODHA_SANDBOX_USER"
            self.last_connected = time.time()
            log_audit("ZERODHA_CONNECT", {"mode": "SANDBOX", "client_id": self.client_id})
            return True, "Connected to Zerodha Kite Sandbox / Simulation environment."

        try:
            headers = {"X-Kite-Version": "3", "Authorization": f"token {api_key}:{token}"}
            res = requests.get(f"{self.base_url}/user/margins", headers=headers, timeout=5)
            if res.status_code == 200:
                self._api_key = api_key
                self._access_token = token
                self.client_id = "ZERODHA_LIVE_USER"
                self.is_connected = True
                self.last_connected = time.time()
                log_audit("ZERODHA_CONNECT", {"status": "CONNECTED"})
                return True, "Successfully authenticated with Zerodha Kite Connect."
            return False, f"Zerodha authentication failed: HTTP {res.status_code}"
        except Exception as e:
            return False, f"Failed to connect to Zerodha API: {str(e)}"

    def disconnect(self) -> bool:
        self.is_connected = False
        self._access_token = None
        log_audit("ZERODHA_DISCONNECT", {})
        return True

    def get_account_funds(self) -> Dict[str, float]:
        if not self._access_token:
            return {"cash_balance": self._mock_balance, "available_funds": self._mock_balance, "collateral": 0.0}
        try:
            headers = {"X-Kite-Version": "3", "Authorization": f"token {self._api_key}:{self._access_token}"}
            res = requests.get(f"{self.base_url}/user/margins/equity", headers=headers, timeout=5)
            if res.status_code == 200:
                data = res.json().get("data", {})
                avail = float(data.get("available", {}).get("cash", 0.0))
                return {"cash_balance": avail, "available_funds": avail, "collateral": 0.0}
        except Exception:
            pass
        return {"cash_balance": 0.0, "available_funds": 0.0, "collateral": 0.0}

    def place_order(self, order_req: Dict[str, Any]) -> Dict[str, Any]:
        symbol = order_req["symbol"]
        qty = int(order_req["quantity"])
        price = float(order_req["limitPrice"])
        exchange = order_req.get("exchange", "NSE")

        if not self._access_token:
            order_id = f"KITE_{uuid.uuid4().hex[:10].upper()}"
            self._mock_orders[order_id] = {
                "status": "FILLED",
                "fill_price": price,
                "fill_qty": qty,
                "symbol": symbol
            }
            self._mock_balance -= (price * qty)
            log_audit("ZERODHA_PLACE_ORDER_MOCK", {"order_id": order_id, "symbol": symbol, "qty": qty})
            return {
                "success": True,
                "broker_order_id": order_id,
                "status": "FILLED",
                "fill_price": price,
                "fill_quantity": qty,
                "message": f"Order filled at {price:.2f}"
            }

        try:
            headers = {"X-Kite-Version": "3", "Authorization": f"token {self._api_key}:{self._access_token}"}
            payload = {
                "tradingsymbol": symbol,
                "exchange": exchange,
                "transaction_type": "BUY",
                "order_type": "LIMIT",
                "quantity": qty,
                "price": price,
                "product": "CNC",
                "validity": "DAY"
            }
            res = requests.post(f"{self.base_url}/orders/regular", data=payload, headers=headers, timeout=5)
            data = res.json()
            if res.status_code == 200 and data.get("status") == "success":
                order_id = data.get("data", {}).get("order_id")
                return {
                    "success": True,
                    "broker_order_id": order_id,
                    "status": "ACCEPTED",
                    "fill_price": None,
                    "fill_quantity": 0,
                    "message": "Order accepted by Zerodha Kite."
                }
            return {"success": False, "message": data.get("message", "Order rejected.")}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def place_bracket_order(self, order_req: Dict[str, Any], sl_price: float, tp_price: float) -> Dict[str, Any]:
        # Zerodha places entry then attaches synthetic OCO protection via protection_manager
        res = self.place_order(order_req)
        if not res["success"]:
            return res

        sl_id = f"KITE_SL_{uuid.uuid4().hex[:8].upper()}"
        tp_id = f"KITE_TP_{uuid.uuid4().hex[:8].upper()}"
        return {
            "success": True,
            "broker_order_id": res["broker_order_id"],
            "status": res["status"],
            "fill_price": res.get("fill_price"),
            "fill_quantity": res.get("fill_quantity"),
            "sl_order_id": sl_id,
            "tp_order_id": tp_id,
            "bracket_placed": False,
            "message": "Entry placed. Synthetic OCO protection initiated by Protection Manager."
        }

    def cancel_order(self, broker_order_id: str) -> bool:
        if not self._access_token:
            if broker_order_id in self._mock_orders:
                self._mock_orders[broker_order_id]["status"] = "CANCELLED"
            return True
        try:
            headers = {"X-Kite-Version": "3", "Authorization": f"token {self._api_key}:{self._access_token}"}
            res = requests.delete(f"{self.base_url}/orders/regular/{broker_order_id}", headers=headers, timeout=5)
            return res.status_code == 200
        except Exception:
            return False

    def get_order_status(self, broker_order_id: str) -> Dict[str, Any]:
        if not self._access_token:
            mock = self._mock_orders.get(broker_order_id, {})
            return {
                "status": mock.get("status", "FILLED"),
                "fill_price": mock.get("fill_price", 0.0),
                "fill_qty": mock.get("fill_qty", 0)
            }
        try:
            headers = {"X-Kite-Version": "3", "Authorization": f"token {self._api_key}:{self._access_token}"}
            res = requests.get(f"{self.base_url}/orders/{broker_order_id}", headers=headers, timeout=5)
            if res.status_code == 200:
                history = res.json().get("data", [])
                if history:
                    last = history[-1]
                    raw_st = last.get("status")
                    status = "FILLED" if raw_st == "COMPLETE" else "CANCELLED" if raw_st in ["CANCELLED", "REJECTED"] else "ACCEPTED"
                    return {
                        "status": status,
                        "fill_price": float(last.get("average_price", 0.0)),
                        "fill_qty": int(last.get("filled_quantity", 0))
                    }
        except Exception:
            pass
        return {"status": "UNKNOWN", "fill_price": 0.0, "fill_qty": 0}

    def get_open_positions(self) -> List[Dict[str, Any]]:
        return []

