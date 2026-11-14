// Upstream data sources the Azure Functions proxy and cache.

export const POWER_PARAMS = ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'GWETROOT', 'ALLSKY_SFC_SW_DWN', 'RH2M', 'WS2M', 'TS', 'GWETTOP', 'GWETPROF', 'T2MDEW', 'ALLSKY_SFC_UV_INDEX'];
export const RECENT_PARAMS = ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'GWETROOT', 'GWETTOP', 'GWETPROF', 'RH2M', 'ALLSKY_SFC_UV_INDEX'];

/** Validate and round coordinates (4 decimals ≈ 11 m, plenty for a ~50 km NASA grid). */
export function coords(q) {
  const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
}

export function powerUrl(lat, lon, startYear, endYear) {
  const q = new URLSearchParams({
    parameters: POWER_PARAMS.join(','), community: 'AG', latitude: lat.toFixed(4), longitude: lon.toFixed(4),
    start: `${startYear}0101`, end: `${endYear}1231`, format: 'JSON'
  });
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${q}`;
}

export function recentUrl(lat, lon, now = new Date()) {
  const q = new URLSearchParams({
    parameters: RECENT_PARAMS.join(','), community: 'AG', latitude: lat.toFixed(4), longitude: lon.toFixed(4),
    start: `${now.getUTCFullYear() - 1}0101`, end: now.toISOString().slice(0, 10).replace(/-/g, ''), format: 'JSON'
  });
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${q}`;
}

export function soilUrl(lat, lon) {
  const q = new URLSearchParams({ lon: lon.toFixed(4), lat: lat.toFixed(4), value: 'mean' });
  for (const p of ['clay', 'sand', 'silt', 'soc', 'phh2o', 'cec', 'nitrogen', 'bdod']) q.append('property', p);
  for (const d of ['0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm']) q.append('depth', d);
  return `https://rest.isric.org/soilgrids/v2.0/properties/query?${q}`;
}

export async function fetchJson(url, ms = 60000, fetchImpl = fetch) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, headers: { 'User-Agent': 'AgriHaven/1.0 (NASA Space Apps 2026)' } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Azure Maps Search (fuzzy, typeahead) → AgriHaven place suggestions. */
export function mapsUrl(query, key) {
  const q = new URLSearchParams({ 'api-version': '1.0', query, typeahead: 'true', limit: '6', language: 'en-US', idxSet: 'Geo,PAD', 'subscription-key': key });
  return `https://atlas.microsoft.com/search/fuzzy/json?${q}`;
}

export function mapsToPlaces(json) {
  const seen = new Set();
  return (json?.results || []).map((r) => {
    const a = r.address || {};
    const main = r.poi?.name || a.municipality || a.countrySecondarySubdivision || a.countrySubdivisionName || a.country || a.freeformAddress;
    const county = a.countrySecondarySubdivision && a.countrySecondarySubdivision !== main ? a.countrySecondarySubdivision : null;
    const detail = [county, a.countrySubdivisionName !== main ? a.countrySubdivisionName : null, a.country].filter(Boolean).join(', ');
    return { main, detail, name: [main, a.countrySubdivisionCode || a.countrySubdivisionName, a.countryCode].filter(Boolean).join(', '), lat: r.position.lat, lon: r.position.lon };
  }).filter((p) => p.main && !seen.has(p.main + p.detail) && seen.add(p.main + p.detail));
}
