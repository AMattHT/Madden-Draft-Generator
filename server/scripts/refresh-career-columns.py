"""Bring ALL_PLAYER_LOOKUP.csv's career columns (wAV, PB, AP1, St, To) up to date
from nflverse draft_picks (cache/nflverse_draft_picks.csv, refreshed by
scripts/refresh-data.ts).

The lookup was exported once and its careers froze there (the 2025 class shipped
with every wAV at 0; 2024's first-year values never grew). nflverse carries PFR's
current numbers for every drafted player since 1960. Rows are matched on draft
year + overall pick, with the surname required to agree, and a value only ever
moves UP (careers accumulate; a lower nflverse number means a mismatch, not a
regression). Undrafted rows have no nflverse career row and are left alone.

    python scripts/refresh-career-columns.py [--dry-run]
"""
import csv
import os
import re
import sys
from collections import Counter

SERVER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOOKUP = os.path.join(SERVER, 'data', 'lookups', 'ALL_PLAYER_LOOKUP.csv')
PICKS = os.path.join(SERVER, 'cache', 'nflverse_draft_picks.csv')
COLUMNS = {'wAV': 'w_av', 'PB': 'probowls', 'AP1': 'allpro', 'St': 'seasons_started', 'To': 'to'}


def norm(s: str) -> str:
    return re.sub(r'[^a-z]', '', (s or '').lower())


def num(s: str):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def main() -> None:
    dry = '--dry-run' in sys.argv
    picks = {}
    with open(PICKS, encoding='utf8', newline='') as f:
        for r in csv.DictReader(f):
            if r['season'].isdigit() and r['pick'].isdigit():
                picks[(int(r['season']), int(r['pick']))] = r

    with open(LOOKUP, encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = list(reader)

    changed = Counter()
    touched = 0
    unmatched_name = 0
    for r in rows:
        y, p = r['Draft Class'].strip(), r['Pick'].strip()
        if not y.isdigit() or not p.isdigit() or int(y) < 1960:
            continue
        n = picks.get((int(y), int(p)))
        if not n:
            continue
        if norm(r['Last Name']) not in norm(n['pfr_player_name']) and norm(n['pfr_player_name'].split()[-1]) not in norm(r['Last Name']):
            unmatched_name += 1
            continue
        row_changed = False
        for col, src in COLUMNS.items():
            new = num(n.get(src))
            old = num(r.get(col))
            if new is None or (old is not None and new <= old):
                continue
            r[col] = str(int(new)) if new == int(new) else str(new)
            changed[col] += 1
            row_changed = True
        touched += int(row_changed)

    print(f'{touched} rows updated; per column: {dict(changed)}; {unmatched_name} pick matches skipped because the surname differs')
    if dry:
        return
    with open(LOOKUP, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


if __name__ == '__main__':
    main()
