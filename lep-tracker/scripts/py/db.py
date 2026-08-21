"""Shared database connection for the Python data scripts.

Reads DATABASE_URL from a .env file (or the environment). Use the Supabase
POOLER connection string for this — same one the app uses.
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()  # loads .env from the project root if present


def connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit(
            "DATABASE_URL is not set. Put it in a .env file at the project root:\n"
            '  DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres"'
        )
    # Supabase requires SSL; add it if the URL doesn't already say so.
    if "sslmode" not in url and "localhost" not in url and "127.0.0.1" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return psycopg2.connect(url)
