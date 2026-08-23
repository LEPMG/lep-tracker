"""Load batteries and their tanks (strapping table) from CSV into the database.

Usage:
    python scripts/py/load_tanks.py path/to/tanks.csv
    python scripts/py/load_tanks.py path/to/tanks.csv --batteries path/to/batteries.csv

Batteries CSV columns : name, code, field, county, state
Tanks CSV columns     : battery, tank, type, size_bbls, bbls_per_inch

Idempotent: batteries are matched by name and tanks by (battery, tank name),
so re-running updates the existing rows instead of creating duplicates. A
battery named in the tanks file that doesn't exist yet is created on the fly.

`bbls_per_inch` is required (it's what converts a gauge to barrels). `type`
must be OIL / WATER / GAS_COND and defaults to OIL.
"""
import sys
import math
import pandas as pd
from db import connect

TANK_TYPES = {"OIL", "WATER", "GAS_COND"}

BATTERY_ALIASES = {
    "name": ["name", "battery", "battery name", "battery_name"],
    "code": ["code", "battery code", "battery_code"],
    "field": ["field", "lease"],
    "county": ["county"],
    "state": ["state", "st"],
}
TANK_ALIASES = {
    "battery": ["battery", "battery name", "battery_name", "tank battery"],
    "tank": ["tank", "tank name", "tank_name", "name", "tank #", "tank_no"],
    "type": ["type", "tank type", "tank_type", "fluid"],
    "size_bbls": ["size_bbls", "size", "size bbls", "capacity", "capacity_bbls"],
    "bbls_per_inch": ["bbls_per_inch", "bbls per inch", "bpi", "bbl_per_inch",
                      "bbls/inch", "factor"],
}


def build_colmap(columns, aliases):
    lower = {str(c).strip().lower(): c for c in columns}
    out = {}
    for canon, names in aliases.items():
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
        return float(s.replace(",", ""))
    except ValueError:
        return None


def parse_args(argv):
    if len(argv) < 2:
        raise SystemExit(
            "Usage: python scripts/py/load_tanks.py <tanks.csv> [--batteries <batteries.csv>]"
        )
    tanks_path = None
    batteries_path = None
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--batteries":
            i += 1
            if i >= len(argv):
                raise SystemExit("--batteries needs a file path")
            batteries_path = argv[i]
        elif tanks_path is None:
            tanks_path = a
        else:
            raise SystemExit(f"Unexpected argument: {a}")
        i += 1
    if tanks_path is None:
        raise SystemExit("Missing <tanks.csv>")
    return tanks_path, batteries_path


def load_batteries(cur, path, bat_cache, stats, warnings):
    df = pd.read_csv(path, dtype=str)
    colmap = build_colmap(df.columns, BATTERY_ALIASES)
    if "name" not in colmap:
        raise SystemExit(
            f"Batteries file has no 'name' column. Found: {list(df.columns)}"
        )

    for _, row in df.iterrows():
        name = cell(row, colmap, "name")
        if not name:
            stats["skipped"] += 1
            continue
        vals = dict(
            name=name,
            code=cell(row, colmap, "code"),
            field=cell(row, colmap, "field"),
            county=cell(row, colmap, "county"),
            state=cell(row, colmap, "state"),
        )
        key = name.lower()
        bid = bat_cache.get(key)
        if bid:
            cur.execute(
                """update batteries set name=%(name)s, code=coalesce(%(code)s,code),
                     field=%(field)s, county=%(county)s, state=%(state)s, updated_at=now()
                   where id=%(id)s""",
                {**vals, "id": bid},
            )
            stats["batteries_updated"] += 1
        else:
            cur.execute(
                "insert into batteries (name, code, field, county, state) "
                "values (%(name)s,%(code)s,%(field)s,%(county)s,%(state)s) returning id",
                vals,
            )
            bat_cache[key] = cur.fetchone()[0]
            stats["batteries_new"] += 1


def load_tanks(cur, path, bat_cache, stats, warnings):
    df = pd.read_csv(path, dtype=str)
    colmap = build_colmap(df.columns, TANK_ALIASES)
    for required in ("battery", "tank"):
        if required not in colmap:
            raise SystemExit(
                f"Tanks file has no '{required}' column. Found: {list(df.columns)}"
            )

    for _, row in df.iterrows():
        bname = cell(row, colmap, "battery")
        tname = cell(row, colmap, "tank")
        if not bname or not tname:
            stats["skipped"] += 1
            continue

        bpi = num(row, colmap, "bbls_per_inch")
        if bpi is None:
            warnings.append(f"{bname} / {tname}: missing bbls_per_inch — skipped.")
            stats["skipped"] += 1
            continue

        ttype = (cell(row, colmap, "type") or "OIL").upper().replace(" ", "_").replace("-", "_")
        if ttype not in TANK_TYPES:
            warnings.append(f"{bname} / {tname}: unknown type '{ttype}' — using OIL.")
            ttype = "OIL"

        # battery (create if the tanks file names one we haven't seen)
        key = bname.lower()
        if key not in bat_cache:
            cur.execute(
                "insert into batteries (name) values (%s) returning id", (bname,)
            )
            bat_cache[key] = cur.fetchone()[0]
            stats["batteries_new"] += 1
        bid = bat_cache[key]

        vals = dict(
            bid=bid, name=tname, type=ttype,
            size=num(row, colmap, "size_bbls"), bpi=bpi,
        )

        cur.execute(
            "select id from tanks where battery_id=%s and name=%s", (bid, tname)
        )
        found = cur.fetchone()
        if found:
            cur.execute(
                """update tanks set type=%(type)s, size_bbls=%(size)s,
                     bbls_per_inch=%(bpi)s, updated_at=now()
                   where id=%(id)s""",
                {**vals, "id": found[0]},
            )
            stats["tanks_updated"] += 1
        else:
            cur.execute(
                """insert into tanks (battery_id, name, type, size_bbls, bbls_per_inch)
                   values (%(bid)s,%(name)s,%(type)s,%(size)s,%(bpi)s)""",
                vals,
            )
            stats["tanks_new"] += 1


def main():
    tanks_path, batteries_path = parse_args(sys.argv)

    conn = connect()
    stats = {
        "batteries_new": 0, "batteries_updated": 0,
        "tanks_new": 0, "tanks_updated": 0, "skipped": 0,
    }
    warnings = []
    bat_cache = {}

    with conn, conn.cursor() as cur:
        cur.execute("select id, lower(name) from batteries")
        for bid, lname in cur.fetchall():
            bat_cache[lname] = bid

        if batteries_path:
            load_batteries(cur, batteries_path, bat_cache, stats, warnings)
        load_tanks(cur, tanks_path, bat_cache, stats, warnings)

    conn.close()
    print("Load complete:")
    print(f"  batteries created : {stats['batteries_new']}")
    print(f"  batteries updated : {stats['batteries_updated']}")
    print(f"  tanks inserted    : {stats['tanks_new']}")
    print(f"  tanks updated     : {stats['tanks_updated']}")
    print(f"  rows skipped      : {stats['skipped']}")
    for w in warnings:
        print("  WARN:", w)


if __name__ == "__main__":
    main()
