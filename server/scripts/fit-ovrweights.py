"""
Fit the game's actual overall formula per (position bucket, archetype) from the
game-generated classes dumped by dump-game-prospects.js, for the archetypes where
ovrweights.json disagrees with the game (offensive line, long snappers).

Model: OVR = 99 * (sum(w_i * attr_i)/sum(w) - DL) / (DH - DL), i.e. linear in the
attributes. We regress OVR on the entry's weighted attributes (non-negative least
squares), then express the fit back as weights + DesiredLow/DesiredHigh so the
existing calculator can apply it. Only archetypes whose fit beats the stored
entry by a clear margin are written to data/lookups/ovrweights-overrides[-m27].json.

  python scripts/fit-ovrweights.py [m26|m27]
"""
import json, sys, os
import numpy as np

def nnls(A, b, iters=3000):
    """Tiny projected-gradient non-negative least squares (no scipy needed)."""
    A = np.asarray(A, float); b = np.asarray(b, float)
    x = np.zeros(A.shape[1]); L = np.linalg.norm(A, 2) ** 2 or 1.0
    for _ in range(iters):
        g = A.T @ (A @ x - b)
        x = np.maximum(0.0, x - g / L)
    return x, None

version = (sys.argv[1] if len(sys.argv) > 1 else 'm26').lower()
here = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(here, '..', 'cache', f'game-prospects-{version}.json'), encoding='utf-8'))
ovrw = json.load(open(os.path.join(here, '..', 'data', 'lookups', 'ovrweights.json'), encoding='utf-8'))

POS_TO_BUCKET = {'QB':'QB','HB':'HB','FB':'FB','WR':'WR','TE':'TE','LT':'OT','RT':'OT','LG':'G','RG':'G','C':'C','LEDG':'DE','REDG':'DE','DT':'DT','SAM':'OLB','WILL':'OLB','MIKE':'MLB','CB':'CB','FS':'S','SS':'S','K':'KP','P':'KP','LS':'LS'}
STEM_OVERRIDE = {'BCVision':'ballCarrierVision','Press':'pressCoverage'}
def stem_to_attr(stem):
    return STEM_OVERRIDE.get(stem, stem[0].lower() + stem[1:])
def norm(s): return ''.join(ch for ch in s.lower() if ch.isalnum())

entries = {}
for e in ovrw:
    if not e.get('Pos'): continue
    w = {stem_to_attr(k[:-6]): float(v) for k, v in e.items() if k.endswith('Rating') and float(v or 0) != 0}
    suffix = norm(e['Archetype'].split('_', 1)[1] if '_' in e['Archetype'] else e['Archetype'])
    entries[(e['Pos'], suffix)] = {'weights': w, 'DL': float(e['DesiredLow']), 'DH': float(e['DesiredHigh'])}

def stored_ovr(e, r):
    s = sum(w * r.get(a, 0) for a, w in e['weights'].items()); sw = sum(e['weights'].values())
    return round(99 * (s / sw - e['DL']) / (e['DH'] - e['DL']))

groups = {}
for r in rows:
    bucket = POS_TO_BUCKET[r['pos']]
    suffix = norm(r['archetypeName'])
    key = None
    for (p, s) in entries:
        if p == bucket and (s == suffix or (suffix and (suffix in s or s in suffix))):
            key = (p, s); break
    if key is None:
        key = next(((p, s) for (p, s) in entries if p == bucket), None)
    if key is None: continue
    groups.setdefault(key, []).append(r)

overrides = {}
total = exact = 0
for key, rs in sorted(groups.items()):
    e = entries[key]
    n = len(rs)
    miss = sum(1 for r in rs if stored_ovr(e, r) != r['overall'])
    total += n; exact += n - miss
    if n < 12 or miss / n < 0.25: continue
    ALL = [k for k in rs[0].keys() if k not in ('pos','posId','archetype','archetypeName','overall')]
    def fit(attrs):
        Xa = np.array([[r.get(a, 0) for a in attrs] for r in rs], dtype=float)
        ya = np.array([r['overall'] for r in rs], dtype=float)
        xm = Xa.mean(axis=0); ym = ya.mean()
        c, _ = nnls(Xa - xm, ya - ym)
        c0 = ym - xm @ c
        pred = np.rint(Xa @ c + c0)
        return c, c0, int((pred == ya).sum()), int((np.abs(pred - ya) <= 1).sum())
    attrs = list(e['weights'].keys())
    c, c0, fit_exact, within1 = fit(attrs)
    # If the entry's own attributes cannot explain the game's overall (long snappers),
    # search all attributes and keep the ones the fit actually uses.
    # (Needs a big sample: 54 unknowns on 28 long snappers just fits noise.)
    if within1 < 0.7 * n and n >= 150:
        c2, c02, ex2, w12 = fit(ALL)
        if w12 > within1:
            keep = [a for a, ci in zip(ALL, c2) if ci > 0.02]
            c, c0, fit_exact, within1 = fit(keep)
            attrs = keep
    # Express as weights summing to 10 and DL/DH: OVR = 99*(wavg - DL)/(DH-DL), wavg = sum(w_i a_i)/10
    s = c.sum()
    if s <= 0: continue
    w = {a: round(10 * ci / s, 3) for a, ci in zip(attrs, c) if ci > 1e-9}
    # wavg = (c @ a) * 10 / s / 10 = (c @ a)/s ; OVR = 99*(wavg - DL)/(DH-DL) => 99/(DH-DL) = s ; -99*DL/(DH-DL) = c0
    span = 99 / s; DL = -c0 / s; DH = DL + span
    improved = fit_exact > (n - miss) + max(2, n // 10)
    print(f"{key[0]:3} {key[1]:14} n={n:3} stored exact {n-miss:3}  fit exact {fit_exact:3} (within1 {within1:3})  DL/DH {e['DL']:.0f}/{e['DH']:.0f} -> {DL:.2f}/{DH:.2f} {'WRITE' if improved else ''}")
    if improved:
        overrides[f"{key[0]}:{key[1]}"] = {'pos': key[0], 'archetype': key[1], 'weights': w, 'desiredLow': round(DL, 3), 'desiredHigh': round(DH, 3), 'n': n, 'fitExact': fit_exact, 'storedExact': n - miss}

print(f"{version}: stored formula exact {exact}/{total}")
dest = os.path.join(here, '..', 'data', 'lookups', 'ovrweights-overrides-m27.json' if version == 'm27' else 'ovrweights-overrides.json')
json.dump({'_source': f'fit from {total} game-generated {version} prospects (scripts/fit-ovrweights.py)', 'overrides': overrides}, open(dest, 'w', encoding='utf-8', newline='\n'), indent=1)
print('wrote', dest, len(overrides), 'overrides')
