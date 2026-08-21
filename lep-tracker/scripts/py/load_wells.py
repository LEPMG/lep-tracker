"""Load wells (and their batteries) from an Excel or CSV file into the database.

Usage:
    python scripts/py/load_wells.py path/to/wells.xlsx
    python scripts/py/load_wells.py path/to/wells.csv

Why this instead of the in-app CSV import:
  * Reads .xlsx directly — no "Save As CSV" step.
  * Forces the API column to stay TEXT, so Excel can never mangle it into
    scientific notation (4.2E+13) again.
  * Idempotent: re-running updates existing wells (matched by API #, or by
    well name when there's no API) instead of creating duplicates.

Accepted column headers (case-insensitive, extra columns ignored):
  well | api_number | battery | field | county | state | status |
  test_oil_bopd | test_water_bwpd | test_gas_mcfd | test_date

Batteries are created automatically from the `battery` column if they don't
exist yet. `test_*` columns require the well-test migration (001) to be applied.
"""
import sys
import math
import pandas as pd
from db import connect

# maps many possible spreadsheet headers -> our canonical field
ALIASES = {
    "well": ["well", "name", "well name", "well_name"],
    "api_number": ["api_number", "api", "api #", "api number", "api14", "api_14"],
    "battery": ["battery", "battery name", "battery_name", "tank battery"],
    "field": ["field", "lease"],
    "county": ["county"],
    "state": ["state", "st"],
    "status": ["status"],
    "test_oil_bopd": ["test_oil_bopd", "oil_bopd", "oil bopd", "oil", "bopd"],
    "test_water_bwpd": ["test_water_bwpd", "water_bwpd", "water bwpd", "water", "bwpd"],
    "test_gas_mcfd": ["test_gas_mcfd", "gas_mcfd", "gas mcfd", "gas", "mcfd"],
    "test_date": ["test_date", "test date"],
}
STATUSES = {"UP", "DOWN", "SHUT_IN", "INACTIVE"}


def build_colmap(columns):
    lower = {str(c).strip().lower(): c for c in columns}
    out = {}
    for canon, names in ALIASES.items():
        for n in names:
            if n in lower:
                out[canon] = lower[n]
                break
    return out


def cell(row, colmap, key):
    if key not in colmap:
        return None
    v = row[colmap[key]]
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    return s or None


def num(row, colmap, key):
    s = cell(row, colmap, key)
    if s is None:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python scripts/py/load_wells.py <file.xlsx|.csv>")
    path = sys.argv[1]

    # dtype=str keeps API numbers (and everything) as text -> no sci-notation
    if path.lower().endswith((".xlsx", ".xls")):
        df = pd.read_excel(path, dtype=str)
    else:
        df = pd.read_csv(path, dtype=str)

    colmap = build_colmap(df.columns)
    if "well" not in colmap:
        raise SystemExit(
            f"Could not find a 'well' (name) column. Found columns: {list(df.columns)}"
        )

    conn = connect()
    stats = {"batteries": 0, "wells_inserted": 0, "wells_updated": 0, "skipped": 0}
    warnings = []
    bat_cache = {}

    with conn, conn.cursor() as cur:
        # preload existing batteries
        cur.execute("select id, lower(name) from batteries")
        for bid, lname in cur.fetchall():
            bat_cache[lname] = bid

        for _, row in df.iterrows():
            name = cell(row, colmap, "well")
            if not name:
                stats["skipped"] += 1
                continue

            # battery (create if new)
            bname = cell(row, colmap, "battery")
            bid = None
            if bname:
                key = bname.lower()
                if key not in bat_cache:
                    cur.execute(
                        "insert into batteries (name, field, county, state) "
                        "values (%s,%s,%s,%s) returning id",
                        (bname, cell(row, colmap, "field"),
                         cell(row, colmap, "county"), cell(row, colmap, "state")),
                    )
                    bat_cache[key] = cur.fetchone()[0]
                    stats["batteries"] += 1
                bid = bat_cache[key]

            api = cell(row, colmap, "api_number")
            if api and ("E+" in api.upper() or api.replace(".", "").isdigit() is False and "e" in api.lower()):
                warnings.append(f"{name}: API '{api}' looks like scientific notation — pull it as text.")

            status = (cell(row, colmap, "status") or "UP").upper().replace(" ", "_").replace("-", "_")
            if status not in STATUSES:
                status = "UP"

            vals = dict(
                name=name, api=api, bid=bid,
                field=cell(row, colmap, "field"),
                county=cell(row, colmap, "county"),
                state=cell(row, colmap, "state"),
                status=status,
                oil=num(row, colmap, "test_oil_bopd"),
                water=num(row, colmap, "test_water_bwpd"),
                gas=num(row, colmap, "test_gas_mcfd"),
                tdate=cell(row, colmap, "test_date"),
            )

            # find existing well: by API if present, else by exact name
            if api:
                cur.execute("select id from wells where api_number=%s", (api,))
            else:
                cur.execute("select id from wells where name=%s", (name,))
            found = cur.fetchone()

            if found:
                cur.execute(
                    """update wells set name=%(name)s, battery_id=coalesce(%(bid)s,battery_id),
                         field=%(field)s, county=%(county)s, state=%(state)s, status=%(status)s,
                         test_oil_bopd=%(oil)s, test_water_bwpd=%(water)s,
                         test_gas_mcfd=%(gas)s, test_date=%(tdate)s, updated_at=now()
                       where id=%(id)s""",
                    {**vals, "id": found[0]},
                )
                stats["wells_updated"] += 1
            else:
                cur.execute(
                    """insert into wells (name, api_number, battery_id, field, county, state,
                         status, test_oil_bopd, test_water_bwpd, test_gas_mcfd, test_date)
                       values (%(name)s,%(api)s,%(bid)s,%(field)s,%(county)s,%(state)s,
                         %(status)s,%(oil)s,%(water)s,%(gas)s,%(tdate)s)""",
                    vals,
                )
                stats["wells_inserted"] += 1

    conn.close()
    print("Load complete:")
    print(f"  batteries created : {stats['batteries']}")
    print(f"  wells inserted    : {stats['wells_inserted']}")
    print(f"  wells updated     : {stats['wells_updated']}")
    print(f"  rows skipped      : {stats['skipped']}")
    for w in warnings:
        print("  WARN:", w)


if __name__ == "__main__":
    main()
