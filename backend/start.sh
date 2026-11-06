#!/usr/bin/env bash
echo "========================================================"
echo " SMC Trading Assistant - Local Python Execution Backend"
echo "========================================================"
echo "Starting FastAPI service on http://127.0.0.1:8000 ..."

if [ ! -d "venv" ]; then
    python3 -m venv venv
    venv/bin/pip install -r requirements.txt
fi

venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

