// NASA NEX-GDDP-CMIP6 future-climate change factors.
//
// data/projections.json is built by tools/build_projections.py from NASA's
// NEX-GDDP-CMIP6 daily downscaled projections (0.25°), accessed through the
// NASA Center for Climate Simulation THREDDS server. For each region and
// climate model it stores monthly change factors between a historical sample
// (2006, 2012) and a mid-century sample (2048, 2052):
//   dTmax / dTmin: additive change in °C, pRatio: multiplicative rain change.
// We apply them to the observed NASA POWER record (the "delta method"), which
// keeps real day-to-day weather while shifting its climate.

let cache = null;

export async function loadProjections() {
  if (cache) return cache;
  try {
    const res = await fetch('data/projections.json');
    cache = res.ok ? await res.json() : { sites: {} };
  } catch {
    cache = { sites: {} };
  }
  return cache;
}

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Nearest precomputed region within maxKm (climate-change signals vary slowly in space). */
export function nearestSite(proj, lat, lon, maxKm = 600) {
  let best = null;
  for (const [key, s] of Object.entries(proj.sites || {})) {
    const d = km(lat, lon, s.lat, s.lon);
    if (d <= maxKm && (!best || d < best.km)) best = { key, ...s, km: Math.round(d) };
  }
  return best;
}

export const SCENARIOS = {
  observed: { label: 'Observed', long: 'Observed climate, 1991–2025 (NASA POWER)' },
  ssp245: { label: '2050s · moderate', long: '2050s, moderate emissions (SSP2-4.5): NASA NEX-GDDP-CMIP6' },
  ssp585: { label: '2050s · high', long: '2050s, high emissions (SSP5-8.5): NASA NEX-GDDP-CMIP6' },
  custom: { label: 'Custom what-if', long: 'Custom what-if (your sliders)' }
};

/** Average change over the growing season (Apr–Sep), for display. */
export function seasonalSummary(delta, lat) {
  const months = lat < 0 ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8];
  const avg = (a) => months.reduce((s, m) => s + a[m], 0) / months.length;
  return { dT: (avg(delta.dTmax) + avg(delta.dTmin)) / 2, dTmax: avg(delta.dTmax), rainPct: (avg(delta.pRatio) - 1) * 100 };
}
