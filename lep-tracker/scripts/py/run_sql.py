"""Run a .sql file against the database.

Usage:
    python scripts/py/run_sql.py db/migrations/001_well_tests.sql

Runs the whole file in one transaction. Migration files here are written to be
safe to re-run (idempotent), so you can apply them more than once.
"""
import sys
from db import connect


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python scripts/py/run_sql.py <path-to.sql>")
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8") as f:
        sql = f.read()
    conn = connect()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(sql)
        print(f"Ran {path} successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
