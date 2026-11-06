@echo off
echo ========================================================
echo  SMC Trading Assistant - Local Python Execution Backend
echo ========================================================
echo Starting FastAPI service on http://127.0.0.1:8000 ...

if not exist venv (
    echo Virtual environment not found. Creating venv...
    python -m venv venv
    venv\Scripts\pip install -r requirements.txt
)

venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

