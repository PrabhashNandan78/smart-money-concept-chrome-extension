"""
SMC Trading Assistant – SQLite Database Manager
Provides persistent local storage for live orders, positions, protection rules, and audit logs.
"""

import sqlite3
import os
import json
import time
from typing import Dict, Any, List, Optional

DB_FILE = os.path.join(os.path.dirname(__file__), "trading.db")

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Orders table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        broker_order_id TEXT,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        market TEXT NOT NULL,
        direction TEXT NOT NULL,
        order_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        planned_entry REAL NOT NULL,
        stop_loss REAL NOT NULL,
        take_profit REAL NOT NULL,
        fill_price REAL,
        fill_quantity INTEGER,
        status TEXT NOT NULL,
        broker TEXT NOT NULL,
        raw_response TEXT,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL
    )
    """)

    # Positions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        market TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        entry_price REAL NOT NULL,
        current_price REAL,
        stop_loss REAL NOT NULL,
        take_profit REAL NOT NULL,
        sl_order_id TEXT,
        tp_order_id TEXT,
        is_bracket INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL, -- OPEN, CLOSED_TP, CLOSED_SL, CLOSED_MANUAL, CLOSED_KILL_SWITCH
        unrealized_pnl REAL DEFAULT 0,
        realized_pnl REAL DEFAULT 0,
        fees REAL DEFAULT 0,
        created_at REAL NOT NULL,
        closed_at REAL
    )
    """)

    # Protection rules & synthetic OCO tracking
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS protection_rules (
        id TEXT PRIMARY KEY,
        position_id TEXT NOT NULL,
        sl_order_id TEXT,
        tp_order_id TEXT,
        sl_price REAL NOT NULL,
        tp_price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        is_native_bracket INTEGER NOT NULL DEFAULT 0,
        sl_status TEXT DEFAULT 'PENDING',
        tp_status TEXT DEFAULT 'PENDING',
        last_reconciled REAL NOT NULL,
        FOREIGN KEY(position_id) REFERENCES positions(id)
    )
    """)

    # Audit Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp REAL NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL
    )
    """)

    # Broker Configuration (Local encrypted or securely stored token references)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS broker_configs (
        broker_name TEXT PRIMARY KEY,
        client_id TEXT,
        token_ref TEXT,
        is_active INTEGER DEFAULT 0,
        last_connected REAL
    )
    """)

    conn.commit()
    conn.close()

def log_audit(action: str, details: Any, status: str = "INFO"):
    try:
        conn = get_connection()
        details_str = json.dumps(details) if not isinstance(details, str) else details
        conn.execute(
            "INSERT INTO audit_logs (timestamp, action, details, status) VALUES (?, ?, ?, ?)",
            (time.time(), action, details_str, status)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB Audit Log Error] {e}")

# Initialize on import
init_db()

