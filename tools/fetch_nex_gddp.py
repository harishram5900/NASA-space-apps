import subprocess, json, sys, csv, io
from concurrent.futures import ThreadPoolExecutor
MODELS = {'GFDL-ESM4': ('r1i1p1f1','gr1'), 'MRI-ESM2-0': ('r1i1p1f1','gn'), 'ACCESS-CM2': ('r1i1p1f1','gn')}
HIST = [2006, 2012]
FUT = [2048, 2052]
SITES = {'champaign':(40.2,-88.4),'ames':(42.03,-93.62),'salina':(38.84,-97.61),'fargo':(46.88,-96.79),'ukraine':(48.5,35.0),'cordoba':(-31.9,-63.6),'saskatoon':(52.13,-106.67)}
def url(m, scen, var, yr, lat, lon):
    mem, g = MODELS[m]
    return (f"https://ds.nccs.nasa.gov/thredds/ncss/grid/AMES/NEX/GDDP-CMIP6/{m}/{scen}/{mem}/{var}/{var}_day_{m}_{scen}_{mem}_{g}_{yr}_v2.0.nc"
            f"?var={var}&latitude={lat}&longitude={lon}&time_start={yr}-01-01T00:00:00Z&time_end={yr}-12-31T23:59:59Z&accept=csv")
def fetch(job):
    for attempt in range(4):
        r = subprocess.run(['curl','-sS','-m','120',job['url']], capture_output=True, text=True)
        rows = list(csv.reader(io.StringIO(r.stdout)))
        if len(rows) > 300:
            sums=[0.0]*12; n=[0]*12
            for row in rows[1:]:
                mo=int(row[0][5:7])-1; v=float(row[-1])
                v = v*86400 if job['var']=='pr' else v-273.15
                sums[mo]+=v; n[mo]+=1
            job['monthly']=[s/c for s,c in zip(sums,n)]
            return job
    job['monthly']=None; print('FAIL', job['url'], file=sys.stderr); return job
import os
out = json.load(open('proj_raw.json')) if os.path.exists('proj_raw.json') else []
have = {o['site'] for o in out}
for site,(lat,lon) in SITES.items():
    if site in have: continue
    jobs=[]
    for m in MODELS:
        for var in ['tasmax','tasmin','pr']:
            for yr in HIST: jobs.append(dict(site=site,m=m,var=var,yr=yr,scen='historical',url=url(m,'historical',var,yr,lat,lon)))
            for scen in ['ssp245','ssp585']:
                for yr in FUT: jobs.append(dict(site=site,m=m,var=var,yr=yr,scen=scen,url=url(m,scen,var,yr,lat,lon)))
    with ThreadPoolExecutor(3) as ex:
        res=list(ex.map(fetch, jobs))
    out += [{k:v for k,v in j.items() if k!='url'} for j in res]
    json.dump(out, open('proj_raw.json','w'))
    print('SITE', site, 'failures', sum(1 for j in res if j['monthly'] is None), flush=True)
print('ALLDONE', flush=True)
