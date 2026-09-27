#!/usr/bin/env python3
"""Build products.sqlite from sample-products.csv.

The same catalogue in the other local source type, so the SQLite path is
exercised by a real project rather than only by a test fixture. Generated from
the CSV so the two can never drift apart.

    python3 examples/product-catalogue/_gen_sqlite.py
"""
import csv
import sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSV = HERE / "sample-products.csv"
DB = HERE / "products.sqlite"

# Columns the catalogue treats as numbers. Keeping them as REAL/INTEGER rather
# than TEXT is the point of using SQLite here: FormatCurrency and the
# GreaterThan/LessThan conditions then compare numbers, not strings.
NUMERIC = {"price_eur": "REAL", "stock": "INTEGER"}


def main():
    rows = list(csv.DictReader(CSV.open()))
    if not rows:
        raise SystemExit(f"no rows in {CSV}")
    cols = list(rows[0])

    DB.unlink(missing_ok=True)
    conn = sqlite3.connect(DB)
    ddl = ", ".join(f'"{c}" {NUMERIC.get(c, "TEXT")}' for c in cols)
    conn.execute(f"CREATE TABLE products ({ddl})")

    placeholders = ", ".join("?" for _ in cols)
    for r in rows:
        vals = []
        for c in cols:
            v = r[c]
            if c in NUMERIC and v != "":
                v = float(v) if NUMERIC[c] == "REAL" else int(v)
            vals.append(v)
        conn.execute(
            f'INSERT INTO products ({", ".join(chr(34) + c + chr(34) for c in cols)}) '
            f"VALUES ({placeholders})",
            vals,
        )
    conn.commit()
    conn.close()

    print(f"wrote {DB.name}: {len(rows)} rows, {len(cols)} columns "
          f"({DB.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
