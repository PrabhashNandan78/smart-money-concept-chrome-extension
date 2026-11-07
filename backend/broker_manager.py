"""
SMC Broker Manager – Abstract Adapter Base & Provider Registry
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Tuple
import time

class BaseBrokerAdapter(ABC):
    def __init__(self, broker_name: str, market: str):
        self.broker_name = broker_name
        self.market = market
        self.is_connected = False
        self.client_id: Optional[str] = None
        self.last_connected: Optional[float] = None
        self.supports_native_bracket = False

    @abstractmethod
    def connect(self, credentials: Dict[str, Any]) -> Tuple[bool, str]:
        """Authenticates with broker API. Never stores plaintext secrets."""
        pass

    @abstractmethod
    def disconnect(self) -> bool:
        """Terminates session."""
        pass

    @abstractmethod
    def get_account_funds(self) -> Dict[str, float]:
        """Returns cash_balance, available_margin, buying_power."""
        pass

    @abstractmethod
    def place_order(self, order_req: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submits standard order.
        Returns: {success: bool, broker_order_id: str, status: str, message: str}
        """
        pass

    @abstractmethod
    def place_bracket_order(
        self,
        order_req: Dict[str, Any],
        sl_price: float,
        tp_price: float
    ) -> Dict[str, Any]:
        """
        Submits native bracket / OCO order where supported.
        """
        pass

    @abstractmethod
    def cancel_order(self, broker_order_id: str) -> bool:
        """Cancels a pending order."""
        pass

    @abstractmethod
    def get_order_status(self, broker_order_id: str) -> Dict[str, Any]:
        """
        Retrieves real-time status:
        Returns: {status: 'SUBMITTED'|'ACCEPTED'|'PARTIALLY_FILLED'|'FILLED'|'REJECTED'|'CANCELLED', fill_price: float, fill_qty: int}
        """
        pass

    @abstractmethod
    def get_open_positions(self) -> List[Dict[str, Any]]:
        """Retrieves list of active positions from broker."""
        pass


class BrokerRegistry:
    def __init__(self):
        self._adapters: Dict[str, BaseBrokerAdapter] = {}
        self._active_broker: Optional[str] = None

    def register(self, adapter: BaseBrokerAdapter):
        self._adapters[adapter.broker_name.upper()] = adapter

    def get_adapter(self, broker_name: Optional[str] = None) -> Optional[BaseBrokerAdapter]:
        name = (broker_name or self._active_broker or "DHAN").upper()
        return self._adapters.get(name)

    def set_active_broker(self, broker_name: str) -> bool:
        name = broker_name.upper()
        if name in self._adapters:
            self._active_broker = name
            return True
        return False

    def list_brokers(self) -> List[Dict[str, Any]]:
        result = []
        for name, ad in self._adapters.items():
            result.append({
                "name": name,
                "market": ad.market,
                "is_connected": ad.is_connected,
                "supports_native_bracket": ad.supports_native_bracket,
                "client_id": ad.client_id
            })
        return result

# Global registry instance
broker_registry = BrokerRegistry()

