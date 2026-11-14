// Data access: NASA POWER (climate), ISRIC SoilGrids (soil), OSM Nominatim (place search).
// Every call has a timeout. Results are cached in memory for the session.

const cache = new Map();

async function fetchJson(url, ms = 45000) {
  if (cache.has(url)) return cache.get(url);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
    const json = await res.json();
    cache.set(url, json);
    return json;
  } finally {
    clearTimeout(t);
  }
}

export const POWER_PARAMS = ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'GWETROOT', 'ALLSKY_SFC_SW_DWN'];

export function powerUrl(lat, lon, startYear, endYear) {
  const q = new URLSearchParams({
    parameters: POWER_PARAMS.join(','), community: 'AG',
    latitude: lat.toFixed(4), longitude: lon.toFixed(4),
    start: `${startYear}0101`, end: `${endYear}1231`, format: 'JSON'
  });
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${q}`;
}

/** Daily NASA POWER data. Tries the latest complete year and steps back if it's not published yet. */
export async function getPower(lat, lon) {
  const lastFull = new Date().getUTCFullYear() - 1;
  let err;
  for (const end of [lastFull, lastFull - 1]) {
    try {
      const json = await fetchJson(powerUrl(lat, lon, 1991, end));
      if (json?.properties?.parameter?.T2M_MAX) return { json, url: powerUrl(lat, lon, 1991, end) };
      err = new Error('Unexpected NASA POWER response');
    } catch (e) { err = e; }
  }
  throw err;
}

export function soilUrl(lat, lon) {
  const q = new URLSearchParams({ lon: lon.toFixed(4), lat: lat.toFixed(4), value: 'mean' });
  for (const p of ['clay', 'sand', 'silt', 'soc', 'phh2o', 'cec']) q.append('property', p);
  for (const d of ['0-5cm', '5-15cm', '15-30cm']) q.append('depth', d);
  return `https://rest.isric.org/soilgrids/v2.0/properties/query?${q}`;
}

/** Parse SoilGrids into topsoil (0–30 cm, thickness-weighted) values in friendly units. */
export function parseSoil(json) {
  const w = { '0-5cm': 5, '5-15cm': 10, '15-30cm': 15 };
  const out = {};
  for (const layer of json?.properties?.layers || []) {
    let s = 0, n = 0;
    for (const d of layer.depths) {
      const v = d.values.mean;
      if (v === null || v === undefined) continue;
      s += (v / layer.unit_measure.d_factor) * w[d.label];
      n += w[d.label];
    }
    out[layer.name] = n ? s / n : null;
  }
  if (out.clay == null && out.sand == null) return null;
  return {
    clay: out.clay,                                  // % (SoilGrids target units)
    sand: out.sand,
    silt: out.silt,
    soc: out.soc,                                    // g/kg
    ph: out.phh2o,
    cec: out.cec,                                    // cmol(c)/kg
    texture: textureClass(out.sand, out.clay),
    awc: Math.round(AWC[textureClass(out.sand, out.clay)] * 1200)  // mm in a 1.2 m root zone
  };
}

// Plant-available water (m³/m³) by USDA texture class, typical values from the
// USDA-NRCS National Soil Survey Handbook / Saxton & Rawls (2006).
const AWC = {
  sand: 0.05, 'loamy sand': 0.08, 'sandy loam': 0.12, loam: 0.16, 'silt loam': 0.2, silt: 0.2,
  'silty clay loam': 0.18, 'clay loam': 0.16, clay: 0.13, unknown: 0.16
};

function textureClass(sand, clay) {
  if (sand == null || clay == null || Number.isNaN(sand)) return 'unknown';
  const silt = 100 - sand - clay;
  if (clay >= 40) return 'clay';
  if (clay >= 27 && sand <= 20) return 'silty clay loam';
  if (clay >= 27) return 'clay loam';
  if (sand >= 85) return 'sand';
  if (sand >= 70) return 'loamy sand';
  if (silt >= 80) return 'silt';
  if (silt >= 50) return 'silt loam';
  if (sand >= 52) return 'sandy loam';
  return 'loam';
}

/**
 * Topsoil for the field. SoilGrids masks cities and water, so if the exact point
 * has no soil we look a few km around it for the nearest mapped soil.
 */
const soilKey = (lat, lon) => `ah-soil:${lat.toFixed(2)},${lon.toFixed(2)}`;

export async function getSoil(lat, lon) {
  // 1. Soil saved from an earlier visit (survives SoilGrids outages during a demo)
  try { const c = localStorage.getItem(soilKey(lat, lon)); if (c) return JSON.parse(c); } catch {}
  const offsets = [[0, 0], [0.04, 0], [-0.04, 0], [0, 0.05], [0, -0.05], [0.08, 0.08], [-0.08, -0.08]];
  for (const [dy, dx] of offsets) {
    try {
      const soil = parseSoil(await fetchJson(soilUrl(lat + dy, lon + dx), 12000));
      if (soil) {
        const out = { ...soil, offsetKm: Math.round(Math.hypot(dy * 111, dx * 111 * Math.cos(lat * Math.PI / 180))) };
        try { localStorage.setItem(soilKey(lat, lon), JSON.stringify(out)); } catch {}
        return out;
      }
    } catch {
      break; // service down or slow: fall through to the bundled sample
    }
  }
  // 2. Bundled SoilGrids sample for central Illinois (our home region)
  if (Math.abs(lat - 40.2) < 0.4 && Math.abs(lon + 88.4) < 0.5) {
    try {
      const j = await fetch('data/sample-soil-champaign-il.json').then((r) => r.json());
      return { ...parseSoil(j), cached: true };
    } catch {}
  }
  return null; // soil is optional; analysis falls back to neutral soil
}

export async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetchJson(url, 15000);
  return res.map((r) => ({ name: r.display_name, lat: +r.lat, lon: +r.lon }));
}

export async function reverseName(lat, lon) {
  try {
    const r = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`, 10000);
    const a = r.address || {};
    return [a.county || a.city || a.town || a.village || a.state_district, a.state || a.region, a.country_code?.toUpperCase()]
      .filter(Boolean).join(', ');
  } catch {
    return null;
  }
}

/** Near-real-time NASA POWER (~3-day latency): Jan 1 of last year to today. */
export async function getRecent(lat, lon) {
  const now = new Date();
  const start = `${now.getUTCFullYear() - 1}0101`;
  const end = now.toISOString().slice(0, 10).replace(/-/g, '');
  const q = new URLSearchParams({ parameters: 'T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT', community: 'AG',
    latitude: lat.toFixed(4), longitude: lon.toFixed(4), start, end, format: 'JSON' });
  return fetchJson(`https://power.larc.nasa.gov/api/temporal/daily/point?${q}`, 45000);
}

/** Offline demo data bundled with the app (Champaign County, Illinois). */
export async function getSample() {
  const [power, soil] = await Promise.all([
    fetch('data/sample-power-champaign-il.json').then((r) => r.json()),
    fetch('data/sample-soil-champaign-il.json').then((r) => r.json())
  ]);
  return { power, soil: parseSoil(soil) };
}

// NASA GIBS map layers (WMTS, Web Mercator)
export const GIBS_LAYERS = {
  ndvi: { id: 'MODIS_Terra_NDVI_8Day', matrix: 'GoogleMapsCompatible_Level9', maxNative: 9, label: 'Vegetation greenness (MODIS NDVI, 8-day)', daily: true },
  soil: { id: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', matrix: 'GoogleMapsCompatible_Level6', maxNative: 6, label: 'Root-zone soil moisture (SMAP L4)', daily: true },
  crops: { id: 'Agricultural_Lands_Croplands_2000', matrix: 'GoogleMapsCompatible_Level7', maxNative: 7, label: 'Croplands (SEDAC, 2000)', daily: false }
};

export function gibsUrl(layer, date) {
  const t = layer.daily ? date : 'default';
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.id}/default/${t}/${layer.matrix}/{z}/{y}/{x}.png`;
}
