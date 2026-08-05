"""Ponto de entrada do TecLog+.
Local:  python run.py  → http://127.0.0.1:5001
Produção (Render): gunicorn run:app --bind 0.0.0.0:$PORT
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from backend.app import app  # noqa: E402  (depois do .env)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, use_reloader=False)
