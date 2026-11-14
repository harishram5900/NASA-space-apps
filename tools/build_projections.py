"""Turn raw NEX-GDDP-CMIP6 monthly means (from fetch_nex_gddp.py) into
data/projections.json change factors used by the app.

    python3 tools/fetch_nex_gddp.py      # ~10 min per region (NASA NCCS THREDDS)
    python3 tools/build_projections.py proj_raw.json
"""
import json, sys
from collections import defaultdict

SITES = {
    'champaign': ('Central Illinois', 40.2, -88.4), 'ames': ('Central Iowa', 42.03, -93.62),
    'salina': ('Central Kansas', 38.84, -97.61), 'fargo': ('Red River Valley, ND', 46.88, -96.79),
    'ukraine': ('Ukrainian steppe', 48.5, 35.0), 'cordoba': ('Córdoba, Argentina', -31.9, -63.6),
    'saskatoon': ('Saskatchewan prairie', 52.13, -106.67),
}

def smooth(a):  # 3-month circular running mean (reduces sampling noise in rainfall)
    return [(a[i - 1] + a[i] + a[(i + 1) % 12]) / 3 for i in range(12)]

raw = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'proj_raw.json'))
acc = defaultdict(list)  # (site, model, scen, var) -> list of monthly arrays
for r in raw:
    if r['monthly']:
        acc[(r['site'], r['m'], r['scen'], r['var'])].append(r['monthly'])
mean12 = lambda arrs: [sum(a[i] for a in arrs) / len(arrs) for i in range(12)]

out = {
    'source': 'NASA NEX-GDDP-CMIP6 v2.0 (daily, 0.25°), NASA Center for Climate Simulation THREDDS',
    'method': 'Monthly change factors from 3-month smoothed means: mean(2048, 2052) minus mean(2006, 2012) per model (temperature); ratio for rain',
    'models': sorted({k[1] for k in acc}), 'sites': {},
}
for site, (name, lat, lon) in SITES.items():
    entry = {'name': name, 'lat': lat, 'lon': lon}
    for scen in ['ssp245', 'ssp585']:
        models = {}
        for m in out['models']:
            try:
                h = {v: mean12(acc[(site, m, 'historical', v)]) for v in ['tasmax', 'tasmin', 'pr']}
                f = {v: mean12(acc[(site, m, scen, v)]) for v in ['tasmax', 'tasmin', 'pr']}
            except ZeroDivisionError:
                continue
            hp, fp = smooth(h['pr']), smooth(f['pr'])
            # 3-month smoothing of temperature too: with 2 sample years per period,
            # single months are noisy; seasonal signals are robust.
            for v in ['tasmax', 'tasmin']:
                h[v], f[v] = smooth(h[v]), smooth(f[v])
            models[m] = {
                'dTmax': [round(f['tasmax'][i] - h['tasmax'][i], 2) for i in range(12)],
                'dTmin': [round(f['tasmin'][i] - h['tasmin'][i], 2) for i in range(12)],
                'pRatio': [round(min(1.6, max(0.6, fp[i] / hp[i])) if hp[i] > 0.05 else 1.0, 3) for i in range(12)],
            }
        if models:
            ms = list(models.values())
            entry[scen] = {'models': models, 'mean': {k: [round(sum(x[k][i] for x in ms) / len(ms), 3) for i in range(12)] for k in ['dTmax', 'dTmin', 'pRatio']}}
    if 'ssp245' in entry:
        out['sites'][site] = entry
json.dump(out, open('data/projections.json', 'w'), indent=1)
print('regions:', list(out['sites']))
