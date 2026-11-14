// Satellite Lab: read real values for a field straight out of NASA GIBS imagery.
// GIBS tiles are colorized PNGs; GIBS publishes the color tables (colormaps), so
// each pixel's color can be turned back into a physical value (NDVI, kelvin,
// m³/m³). Tiles are served with CORS, so this all runs in the browser.

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
let colormaps = null;

export async function loadColormaps() {
  if (!colormaps) colormaps = await fetch('data/gibs-colormaps.json').then((r) => r.json()).catch(() => ({}));
  return colormaps;
}

export function tileFor(lat, lon, z) {
  const n = 2 ** z;
  const xt = ((lon + 180) / 360) * n;
  const lr = (lat * Math.PI) / 180;
  const yt = ((1 - Math.asinh(Math.tan(lr)) / Math.PI) / 2) * n;
  return { x: Math.floor(xt), y: Math.floor(yt), px: Math.floor((xt % 1) * 256), py: Math.floor((yt % 1) * 256) };
}

const tileCache = new Map();
async function getTile(url) {
  if (tileCache.has(url)) return tileCache.get(url);
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image')) return null;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    return { canvas: c, ctx };
  })().catch(() => null);
  tileCache.set(url, p);
  return p;
}

/**
 * Read the pixel at (lat, lon) from a GIBS layer on a date.
 * Returns { rgba, window (array of rgba around the point), thumb (data URL), url } or null.
 */
export async function readPixel(layer, date, lat, lon, { z = layer.z, win = 4, thumb = 48 } = {}) {
  const t = tileFor(lat, lon, z);
  const ext = layer.ext || 'png';
  const url = `${GIBS}/${layer.id}/default/${date}/${layer.matrix}/${z}/${t.y}/${t.x}.${ext}`;
  const tile = await getTile(url);
  if (!tile) return null;
  const d = tile.ctx.getImageData(t.px, t.py, 1, 1).data;
  if (d[3] === 0) return null;
  if (ext === 'jpg' && d[0] + d[1] + d[2] < 15) return null; // outside swath (black)
  const x0 = Math.max(0, t.px - win), y0 = Math.max(0, t.py - win);
  const w = Math.min(256 - x0, win * 2 + 1), h = Math.min(256 - y0, win * 2 + 1);
  const wd = tile.ctx.getImageData(x0, y0, w, h).data;
  const window = [];
  for (let i = 0; i < wd.length; i += 4) if (wd[i + 3] > 0) window.push([wd[i], wd[i + 1], wd[i + 2]]);
  // thumbnail centred on the field, with a crosshair
  const c = document.createElement('canvas');
  c.width = c.height = thumb * 2;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tile.canvas, t.px - thumb / 2, t.py - thumb / 2, thumb, thumb, 0, 0, thumb * 2, thumb * 2);
  ctx.strokeStyle = '#fc3d21'; ctx.lineWidth = 2;
  ctx.strokeRect(thumb - 5, thumb - 5, 10, 10);
  return { rgba: [d[0], d[1], d[2], d[3]], window, thumb: c.toDataURL(), url, date };
}

/** Color → value using a GIBS colormap table (exact match, else nearest color). */
export function decode(table, rgb) {
  if (!table || !rgb) return null;
  const k = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  if (k in table) return table[k];
  let best = null, bd = Infinity;
  for (const [key, v] of Object.entries(table)) {
    const [r, g, b] = key.split(',').map(Number);
    const dd = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (dd < bd) { bd = dd; best = v; }
  }
  return bd <= 300 ? best : null;
}

const iso = (d) => d.toISOString().slice(0, 10);
export function datesBack(fromDate, n, step = 1) {
  return Array.from({ length: n }, (_, i) => iso(new Date(fromDate.getTime() - i * step * 86400000)));
}

/** First date (in order) with a valid pixel. Fetches in small parallel batches. */
export async function firstValid(layer, dates, lat, lon, opts) {
  for (let i = 0; i < dates.length; i += 4) {
    const batch = await Promise.all(dates.slice(i, i + 4).map((d) => readPixel(layer, d, lat, lon, opts)));
    const hit = batch.find(Boolean);
    if (hit) return hit;
  }
  return null;
}

export const LAB_LAYERS = {
  ndvi: { id: 'MODIS_Terra_NDVI_8Day', matrix: 'GoogleMapsCompatible_Level9', z: 9 },
  nir: { id: 'MODIS_Terra_CorrectedReflectance_Bands721', matrix: 'GoogleMapsCompatible_Level9', z: 9, ext: 'jpg' },
  lst: { id: 'MODIS_Terra_Land_Surface_Temp_Day', matrix: 'GoogleMapsCompatible_Level7', z: 7 },
  smap: { id: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', matrix: 'GoogleMapsCompatible_Level6', z: 6 },
  nisar: { id: 'NISAR_L2_Geocoded_Polarimetric_Covariance', matrix: 'GoogleMapsCompatible_Level13', z: 10 },
  opera: { id: 'OPERA_L2_Radiometric_Terrain_Corrected_SAR_Sentinel-1', matrix: 'GoogleMapsCompatible_Level12', z: 10 }
};

/** Radar summary from pixel window: brightness (0–1) and texture (coefficient of variation → 0–1). */
export function radarStats(px) {
  const vals = px.window.map(([r, g, b]) => (r + g + b) / 765);
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
  const [r, g, b] = px.rgba;
  return { brightness: m, texture: Math.min(1, m ? sd / m : 0), crossShare: g / Math.max(1, r + g + b) };
}

/** NDVI → vegetation density class. */
export function densityClass(ndvi) {
  if (ndvi == null) return null;
  if (ndvi >= 0.6) return 'High';
  if (ndvi >= 0.4) return 'Moderate';
  if (ndvi >= 0.2) return 'Low';
  return 'Bare / sparse';
}

/** Simple phenology from an NDVI season curve: green-up, peak, senescence (50 % amplitude crossings). */
export function phenology(series) {
  const s = series.filter((p) => p.v != null);
  if (s.length < 5) return null;
  const vmin = Math.min(...s.map((p) => p.v)), peak = s.reduce((a, b) => (b.v > a.v ? b : a));
  const half = vmin + (peak.v - vmin) / 2;
  const up = s.find((p) => p.date <= peak.date && p.v >= half);
  const down = [...s].reverse().find((p) => p.date >= peak.date && p.v >= half);
  return { greenUp: up?.date, peak: peak.date, peakNdvi: peak.v, senescence: down?.date, amplitude: peak.v - vmin };
}

// Approximate GDD (°C·d, base 10, 30 cap) to reach each stage, from US extension
// growing-degree-day guides (°F values ÷ 1.8).
export const STAGES = {
  corn: [['Planting', 0], ['Emergence', 65], ['V6 (rapid growth)', 260], ['Silking / pollination', 780], ['Dough', 1035], ['Dent', 1250], ['Maturity (black layer)', 1450]],
  soybean: [['Planting', 0], ['Emergence', 70], ['V3', 280], ['R1 flowering', 500], ['R3 pod set', 700], ['R5 seed fill', 900], ['R7 maturity', 1200]]
};

/** Stage dates for a crop in a year of daily weather (array of {m,d,tmax,tmin}), planted on sow [m,d]. */
export function stageDates(days, sow, stages) {
  const out = [];
  let g = 0, si = 0;
  const started = days.filter((d) => d.m * 100 + d.d >= sow[0] * 100 + sow[1]);
  for (const d of started) {
    const hi = Math.min(Math.max(d.tmax, 10), 30), lo = Math.min(Math.max(d.tmin, 10), 30);
    g += (hi + lo) / 2 - 10;
    while (si < stages.length && g >= stages[si][1]) { out.push({ stage: stages[si][0], date: `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`, gdd: Math.round(g) }); si++; }
  }
  for (; si < stages.length; si++) out.push({ stage: stages[si][0], date: null, gdd: null });
  return out;
}
