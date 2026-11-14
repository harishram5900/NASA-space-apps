// Core analysis: NASA POWER daily weather -> climate-shift indicators,
// per-year crop outcomes and trend statistics. Pure functions, no DOM,
// so the same code runs in the browser and in the Node tests.

import { CROPS, COVER } from './crops.js';

const FILL = -999;

/** Parse a NASA POWER daily point response into an array of day records. */
export function parsePower(json, lat) {
  const p = json.properties.parameter;
  const keys = Object.keys(p.T2M_MAX).sort();
  const days = [];
  for (const k of keys) {
    const v = (name) => {
      const x = p[name] ? p[name][k] : null;
      return x === undefined || x === null || x === FILL ? null : x;
    };
    const tmax = v('T2M_MAX'), tmin = v('T2M_MIN');
    if (tmax === null || tmin === null) continue;
    const orig = new Date(Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)));
    const doy = Math.round((orig - Date.UTC(orig.getUTCFullYear(), 0, 1)) / 86400000) + 1;
    // Southern Hemisphere: shift by half a year so NH season windows line up.
    const date = lat < 0 ? new Date(orig.getTime() + 182 * 86400000) : orig;
    days.push({
      y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(),
      om: orig.getUTCMonth(), ra: extraterrestrialRadiation(lat, doy),
      tmax, tmin, prcp: Math.max(0, v('PRECTOTCORR') ?? 0), wet: v('GWETROOT'),
      sun: v('ALLSKY_SFC_SW_DWN')
    });
  }
  return days;
}

/** FAO-56 eq. 21: extraterrestrial radiation Ra (MJ m-2 day-1). */
export function extraterrestrialRadiation(latDeg, doy) {
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
  return ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

/** FAO-56 eq. 52 Hargreaves reference evapotranspiration (mm/day). */
export function et0(d) {
  const tmean = (d.tmax + d.tmin) / 2;
  return Math.max(0, 0.0023 * 0.408 * d.ra * (tmean + 17.8) * Math.sqrt(Math.max(0, d.tmax - d.tmin)));
}

/**
 * Apply monthly climate-model change factors ("delta method").
 * deltas = { dTmax[12], dTmin[12], pRatio[12] } indexed by calendar month.
 */
export function applyMonthlyDeltas(days, deltas) {
  if (!deltas) return days;
  return days.map((d) => ({
    ...d,
    tmax: d.tmax + deltas.dTmax[d.om],
    tmin: d.tmin + deltas.dTmin[d.om],
    prcp: d.prcp * deltas.pRatio[d.om]
  }));
}

/** Apply a warming / rainfall what-if scenario. */
export function applyScenario(days, dT = 0, rainPct = 0) {
  if (!dT && !rainPct) return days;
  const f = 1 + rainPct / 100;
  return days.map((d) => ({ ...d, tmax: d.tmax + dT, tmin: d.tmin + dT, prcp: d.prcp * f }));
}

/** Group days by year; keep only complete years. */
export function byYear(days) {
  const map = new Map();
  for (const d of days) {
    if (!map.has(d.y)) map.set(d.y, []);
    map.get(d.y).push(d);
  }
  for (const [y, arr] of map) if (arr.length < 360) map.delete(y);
  return map;
}

const md = (m, d) => m * 100 + d;
const inWin = (day, a, b) => {
  const x = md(day.m, day.d);
  return x >= md(a[0], a[1]) && x <= md(b[0], b[1]);
};

/** Days of a season. Winter crops span from the previous year's sowing date. */
function seasonDays(years, y, sow, harvest, winter = false) {
  if (!winter) return (years.get(y) || []).filter((d) => inWin(d, sow, harvest));
  const prev = years.get(y - 1);
  if (!prev) return null;
  return [
    ...prev.filter((d) => md(d.m, d.d) >= md(sow[0], sow[1])),
    ...(years.get(y) || []).filter((d) => md(d.m, d.d) <= md(harvest[0], harvest[1]))
  ];
}

const gddDay = (d, base, cap) => {
  const hi = Math.min(Math.max(d.tmax, base), cap);
  const lo = Math.min(Math.max(d.tmin, base), cap);
  return (hi + lo) / 2 - base;
};

function longestDry(days, thresh = 1) {
  let best = 0, run = 0;
  for (const d of days) {
    run = d.prcp < thresh ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sum = (a) => a.reduce((s, x) => s + x, 0);

/** Climate indicators that matter for farm planning, per year. */
export const INDICATORS = [
  { key: 'gdd', label: 'Growing degree days (Apr–Oct, base 10°C)', unit: '°C·d', good: 'up', dec: 0,
    why: 'Total heat available to warm-season crops. More heat allows longer-season hybrids and double crops.' },
  { key: 'frostFree', label: 'Frost-free season', unit: 'days', good: 'up', dec: 0,
    why: 'Days between the last spring frost and the first fall frost (≤0°C).' },
  { key: 'lastFrost', label: 'Last spring frost (day of year)', unit: 'DOY', good: 'down', dec: 0,
    why: 'An earlier last frost means earlier planting is possible.' },
  { key: 'hotDays', label: 'Hot days in summer (Tmax ≥ 32°C, Jun–Aug)', unit: 'days', good: 'down', dec: 1,
    why: 'Heat during flowering and grain fill reduces yield, especially for corn.' },
  { key: 'gsRain', label: 'Growing-season rain (Apr–Sep)', unit: 'mm', good: 'up', dec: 0,
    why: 'Rain that falls while crops grow.' },
  { key: 'springDeluge', label: 'Heavy-rain days in spring (≥ 25 mm, Apr–Jun)', unit: 'days', good: 'down', dec: 1,
    why: 'Downpours delay planting, waterlog fields, wash away soil and leach nitrogen.' },
  { key: 'drySpell', label: 'Longest dry spell (May–Sep)', unit: 'days', good: 'down', dec: 0,
    why: 'The longest run of days with less than 1 mm of rain. Flash droughts start this way.' },
  { key: 'waterBalance', label: 'Water balance (rain − evaporative demand, Apr–Sep)', unit: 'mm', good: 'up', dec: 0,
    why: 'Rain minus FAO-56 reference evapotranspiration. Below zero, crops depend on stored soil water and every heat wave hurts more.' },
  { key: 'summerSoil', label: 'Summer root-zone wetness (Jul–Aug)', unit: '0–1', good: 'up', dec: 2,
    why: 'NASA GWETROOT (0 = completely dry, 1 = saturated) shows how much water roots can reach during the critical months.' }
];

export function climateIndicators(years) {
  const out = [];
  for (const [y, days] of years) {
    const gs = days.filter((d) => d.m >= 4 && d.m <= 10);
    const firstHalf = days.filter((d) => d.m < 7);
    const secondHalf = days.filter((d) => d.m >= 7);
    const lastSpring = [...firstHalf].reverse().find((d) => d.tmin <= 0);
    const firstFall = secondHalf.find((d) => d.tmin <= 0);
    const doy = (d) => Math.round((Date.UTC(d.y, d.m - 1, d.d) - Date.UTC(d.y, 0, 1)) / 86400000) + 1;
    const lf = lastSpring ? doy(lastSpring) : 1;
    const ff = firstFall ? doy(firstFall) : 366;
    const wetVals = days.filter((d) => (d.m === 7 || d.m === 8) && d.wet !== null).map((d) => d.wet);
    out.push({
      year: y,
      gdd: sum(gs.map((d) => gddDay(d, 10, 30))),
      frostFree: ff - lf - 1,
      lastFrost: lf,
      hotDays: days.filter((d) => d.m >= 6 && d.m <= 8 && d.tmax >= 32).length,
      gsRain: sum(days.filter((d) => d.m >= 4 && d.m <= 9).map((d) => d.prcp)),
      springDeluge: days.filter((d) => d.m >= 4 && d.m <= 6 && d.prcp >= 25).length,
      drySpell: longestDry(days.filter((d) => d.m >= 5 && d.m <= 9)),
      waterBalance: sum(days.filter((d) => d.m >= 4 && d.m <= 9).map((d) => d.prcp - et0(d))),
      summerSoil: wetVals.length ? mean(wetVals) : null
    });
  }
  return out.sort((a, b) => a.year - b.year);
}

/**
 * Evaluate one crop in one year of weather.
 * Returns a 0-100 outcome score plus the stresses that drove it.
 */
export function evalCropYear(crop, years, y, soil) {
  let days = seasonDays(years, y, crop.sow, crop.harvest, crop.winter);
  if (!days || days.length < 60) return null;
  // Farmers wait for the last killing frost: plant after it (up to 40 days late).
  if (!crop.winter && crop.frostKill !== undefined) {
    const spring = (years.get(y) || []).filter((d) => d.m <= 6 && d.tmin <= crop.frostKill);
    const last = spring[spring.length - 1];
    if (last) {
      const lastMd = md(last.m, last.d);
      const latest = new Date(Date.UTC(y, crop.sow[0] - 1, crop.sow[1] + 40));
      const cap = md(latest.getUTCMonth() + 1, latest.getUTCDate());
      const start = Math.min(lastMd, cap);
      days = days.filter((d) => md(d.m, d.d) > start);
    }
  }
  const stresses = [];
  let score = 100;

  // 1. Enough heat to mature?
  const gdd = sum(days.map((d) => gddDay(d, crop.baseT, crop.capT)));
  const heatRatio = gdd / crop.gddNeed;
  if (heatRatio < 1) {
    const p = Math.min(70, (1 - heatRatio) * 250);
    score -= p;
    stresses.push({ k: 'cool', p, text: `only ${Math.round(heatRatio * 100)}% of the heat units needed to mature` });
  }

  // 2. Heat stress in the sensitive window
  const sens = days.filter((d) => inWin(d, [crop.sensitive[0], crop.sensitive[1]], [crop.sensitive[2], crop.sensitive[3]]));
  const hot = sens.filter((d) => d.tmax >= crop.heatT);
  const heatDeg = sum(hot.map((d) => d.tmax - crop.heatT + 1));
  if (hot.length) {
    const p = Math.min(35, heatDeg * 2.2);
    score -= p;
    stresses.push({ k: 'heat', p, text: `${hot.length} day(s) ≥ ${crop.heatT}°C at flowering or grain fill` });
  }

  // 3. Water: rain plus a soil-moisture buffer vs crop need
  const rain = sum(days.map((d) => d.prcp));
  const wetVals = sens.filter((d) => d.wet !== null).map((d) => d.wet);
  const wet = wetVals.length ? mean(wetVals) : 0.6;
  // Stored soil water: GWETROOT is the fraction of saturation; above ~0.25 roots can
  // extract it. Root-zone plant-available water comes from the SoilGrids texture
  // (default ~200 mm for a 1.2 m loam root zone).
  const awc = soil?.awc ?? 200;
  const storage = (Math.max(0, wet - 0.25) / 0.75) * awc;
  const supply = rain + storage;
  const need = crop.waterNeed[0];
  if (supply < need) {
    const deficit = (need - supply) / need;
    const p = Math.min(40, deficit * 90 * (1 - crop.drought * 0.7));
    score -= p;
    stresses.push({ k: 'dry', p, text: `water supply ≈${Math.round(supply)} mm vs ${need} mm needed` });
  }
  if (wet < 0.4) {
    const p = (0.4 - wet) * 120 * (1 - crop.drought * 0.7);
    score -= p;
    stresses.push({ k: 'dry', p, text: `root zone dry (wetness ${wet.toFixed(2)}) during the critical window` });
  }
  // Waterlogging / excess (in-season)
  const excess = rain - crop.waterNeed[1] * 1.35;
  if (excess > 0) {
    const p = Math.min(15, excess / 20);
    score -= p;
    stresses.push({ k: 'wet', p, text: `very wet season (${Math.round(rain)} mm), with waterlogging and disease risk` });
  }

  // 4. Frost after sowing (non-winter crops) or winter kill
  if (!crop.winter && crop.frostKill !== undefined) {
    const frost = days.filter((d) => d.tmin <= crop.frostKill).length;
    if (frost) {
      const p = Math.min(25, frost * 6);
      score -= p;
      stresses.push({ k: 'frost', p, text: `${frost} damaging frost day(s) in season` });
    }
  }
  if (crop.winterKill !== undefined) {
    const kill = days.filter((d) => d.tmin <= crop.winterKill).length;
    if (kill) {
      const p = Math.min(30, kill * 8);
      score -= p;
      stresses.push({ k: 'frost', p, text: `${kill} night(s) below ${crop.winterKill}°C (winterkill risk)` });
    }
  }

  // 5. Soil pH fit
  if (soil && soil.ph != null) {
    if (soil.ph < crop.ph[0] - 0.3 || soil.ph > crop.ph[1] + 0.3) {
      score -= 8;
      stresses.push({ k: 'soil', p: 8, text: `soil pH ${soil.ph.toFixed(1)} outside ideal ${crop.ph[0]}–${crop.ph[1]}` });
    }
  }

  return { year: y, score: Math.max(0, Math.round(score)), gdd: Math.round(gdd), rain: Math.round(rain), stresses };
}

export function evalCover(years, y) {
  const days = (years.get(y) || []).filter((d) => inWin(d, [COVER.window[0], COVER.window[1]], [COVER.window[2], COVER.window[3]]));
  if (!days.length) return null;
  const gdd = sum(days.map((d) => Math.max(0, (d.tmax + d.tmin) / 2 - COVER.baseT)));
  const rain = sum(days.map((d) => d.prcp));
  let score = 100;
  if (gdd < COVER.gddNeed) score -= Math.min(60, (1 - gdd / COVER.gddNeed) * 100);
  if (rain < COVER.rainNeed) score -= Math.min(30, (1 - rain / COVER.rainNeed) * 50);
  return { year: y, score: Math.max(0, Math.round(score)), gdd: Math.round(gdd), rain: Math.round(rain) };
}

/** Split the record into a baseline and a recent period of equal length. */
export function periods(yearList) {
  const ys = [...yearList].sort((a, b) => a - b);
  const n = Math.min(15, Math.floor(ys.length / 2));
  return { base: ys.slice(0, n), recent: ys.slice(-n) };
}

export const GOOD = 70; // a "good year" for a crop

export function cropReliability(cropKey, years, soil) {
  const crop = CROPS[cropKey];
  const results = [...years.keys()].sort((a, b) => a - b)
    .map((y) => evalCropYear(crop, years, y, soil)).filter(Boolean);
  const { base, recent } = periods(results.map((r) => r.year));
  const pick = (ys) => results.filter((r) => ys.includes(r.year));
  const summarize = (rs) => ({
    mean: mean(rs.map((r) => r.score)),
    goodPct: rs.length ? (100 * rs.filter((r) => r.score >= GOOD).length) / rs.length : NaN,
    n: rs.length
  });
  const b = summarize(pick(base)), r = summarize(pick(recent));
  // Most common stress in recent bad years
  const tally = {};
  for (const res of pick(recent)) for (const s of res.stresses) tally[s.k] = (tally[s.k] || 0) + s.p;
  const mainStress = Object.entries(tally).sort((a, b2) => b2[1] - a[1])[0]?.[0] || null;
  return { key: cropKey, crop, results, base: b, recent: r, change: r.mean - b.mean, mainStress,
    trend: mannKendall(results.map((x) => x.year), results.map((x) => x.score)) };
}

// ---------- statistics ----------

/** Ordinary least squares slope and intercept. */
export function linreg(xs, ys) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([, y]) => y !== null && !Number.isNaN(y));
  const n = pts.length;
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  let sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx, n };
}

/** Sen's slope: median of pairwise slopes, robust to outliers. */
export function senSlope(xs, ys) {
  const s = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    if (ys[i] === null || ys[j] === null) continue;
    s.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
  }
  s.sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function normCdf(z) {
  // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const dd = 0.3989423 * Math.exp(-z * z / 2);
  const p = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Mann-Kendall trend test (two-sided). Returns tau, p-value, Sen slope. */
export function mannKendall(xs, ys) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([, y]) => y !== null && !Number.isNaN(y));
  const n = pts.length;
  let S = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += Math.sign(pts[j][1] - pts[i][1]);
  // tie correction
  const counts = {};
  for (const [, y] of pts) counts[y] = (counts[y] || 0) + 1;
  let tieAdj = 0;
  for (const c of Object.values(counts)) if (c > 1) tieAdj += c * (c - 1) * (2 * c + 5);
  const varS = (n * (n - 1) * (2 * n + 5) - tieAdj) / 18;
  const z = S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return { S, z, p, tau: S / (0.5 * n * (n - 1)), sen: senSlope(pts.map((q) => q[0]), pts.map((q) => q[1])), n };
}

/** Summary of each indicator: baseline vs recent means, trend and significance. */
export function indicatorSummary(rows) {
  const { base, recent } = periods(rows.map((r) => r.year));
  return INDICATORS.map((ind) => {
    const val = (ys) => rows.filter((r) => ys.includes(r.year) && r[ind.key] !== null).map((r) => r[ind.key]);
    const b = mean(val(base)), r = mean(val(recent));
    const mk = mannKendall(rows.map((x) => x.year), rows.map((x) => x[ind.key]));
    const delta = r - b;
    const better = ind.good === 'up' ? delta > 0 : delta < 0;
    return { ...ind, base: b, recent: r, delta, pct: b ? (100 * delta) / Math.abs(b) : 0, mk, better,
      baseYears: [base[0], base[base.length - 1]], recentYears: [recent[0], recent[recent.length - 1]] };
  });
}

export { mean, sum };
