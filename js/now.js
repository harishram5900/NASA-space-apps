// "Right now": compare this season's NASA POWER near-real-time data (~3-day latency)
// with the same calendar window in every year of the 35-year record, and turn the
// result into timely, plain-language advice. Inspired by past Space Apps winners
// that gave farmers in-season decision support.

import { parsePower } from './analysis.js';

const md = (d) => d.m * 100 + d.d;
const gdd = (d) => Math.max(0, (Math.min(d.tmax, 30) + Math.max(Math.min(d.tmin, 30), 10)) / 2 - 10);

/** Percentile rank (0-100) of x among values. */
function pct(values, x) {
  const v = values.filter((y) => y !== null && !Number.isNaN(y));
  if (!v.length) return null;
  return Math.round((100 * v.filter((y) => y < x).length) / v.length);
}

/**
 * recentJson: NASA POWER daily response from Jan 1 (or ~1 year back) to today.
 * histDays: parsed observed record (parsePower output) for the same point.
 */
export function seasonNow(recentJson, histDays, lat) {
  const rec = parsePower(recentJson, lat).filter((d) => d.wet !== null);
  if (rec.length < 40) return null;
  const last = rec[rec.length - 1];
  const lastMd = md(last), lastY = last.y;
  // Window: the 30 days ending on the last valid date (same calendar days each year).
  const startDate = new Date(Date.UTC(last.y, last.m - 1, last.d - 29));
  const startMd = (startDate.getUTCMonth() + 1) * 100 + startDate.getUTCDate();
  const inWin = (d) => (startMd <= lastMd ? md(d) >= startMd && md(d) <= lastMd : md(d) >= startMd || md(d) <= lastMd);

  const win = rec.filter((d) => inWin(d) && (d.y === lastY || (startMd > lastMd && d.y === lastY - 1)));
  const rain30 = win.reduce((s, d) => s + d.prcp, 0);
  const wet7 = rec.slice(-7).reduce((s, d) => s + d.wet, 0) / Math.min(7, rec.length);
  const tAnom = win.reduce((s, d) => s + (d.tmax + d.tmin) / 2, 0) / win.length;
  const gddYtd = rec.filter((d) => d.y === lastY && md(d) <= lastMd).reduce((s, d) => s + gdd(d), 0);

  // Same windows in history
  const years = [...new Set(histDays.map((d) => d.y))].filter((y) => y < lastY);
  const hist = years.map((y) => {
    const days = histDays.filter((d) => (startMd <= lastMd ? d.y === y : d.y === y || d.y === y - 1) && inWin(d) &&
      !(startMd > lastMd && ((d.y === y - 1 && md(d) < startMd) || (d.y === y && md(d) > lastMd))));
    const w7 = histDays.filter((d) => d.y === y && md(d) <= lastMd).slice(-7).filter((d) => d.wet !== null);
    return {
      y,
      rain: days.reduce((s, d) => s + d.prcp, 0),
      temp: days.length ? days.reduce((s, d) => s + (d.tmax + d.tmin) / 2, 0) / days.length : null,
      wet: w7.length ? w7.reduce((s, d) => s + d.wet, 0) / w7.length : null,
      gdd: histDays.filter((d) => d.y === y && md(d) <= lastMd).reduce((s, d) => s + gdd(d), 0)
    };
  }).filter((h) => h.temp !== null);
  const avg = (k) => hist.reduce((s, h) => s + h[k], 0) / hist.length;

  const out = {
    asOf: realLastDate(recentJson),
    month: last.m,
    rain30, rainNormal: avg('rain'), rainPct: pct(hist.map((h) => h.rain), rain30),
    wet7, wetNormal: avg('wet'), wetPct: pct(hist.map((h) => h.wet), wet7),
    temp: tAnom, tempNormal: avg('temp'), tempPct: pct(hist.map((h) => h.temp), tAnom),
    gddYtd, gddNormal: avg('gdd'), gddPct: pct(hist.map((h) => h.gdd), gddYtd),
    nYears: hist.length
  };
  out.advice = advice(out);
  return out;
}

function realLastDate(json) {
  const p = json.properties.parameter;
  const k = Object.keys(p.GWETROOT).sort().filter((x) => p.GWETROOT[x] !== -999 && p.T2M_MAX[x] !== -999).pop();
  return `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
}

function level(p) { return p === null ? 'normal' : p <= 20 ? 'low' : p >= 80 ? 'high' : 'normal'; }

function advice(n) {
  const m = n.month, soil = level(n.wetPct), rain = level(n.rainPct), heat = level(n.tempPct);
  const a = [];
  const stage = m >= 3 && m <= 5 ? 'planting' : m >= 6 && m <= 8 ? 'growing' : m >= 9 && m <= 11 ? 'harvest' : 'planning';
  if (stage === 'planting') {
    if (soil === 'high') a.push('Soils are wetter than in most years at this date. Wait for fields to dry before planting to avoid compaction, and expect nitrogen losses after heavy rain.');
    else if (soil === 'low') a.push('Soils are drier than in most years at this date. Favor the drought-tolerant crops in your rotation (sorghum, sunflower) and keep residue on the surface to hold moisture.');
    else a.push('Soil moisture is close to normal for planting season, so planting can go ahead on schedule.');
  } else if (stage === 'growing') {
    if (soil === 'low' || rain === 'low') a.push('Drought watch: root-zone moisture or recent rain is in the driest 20% of years. Prioritize irrigation (if available) for crops near flowering, and scout for heat stress.');
    else if (heat === 'high') a.push('This has been one of the hottest stretches on record for these dates. Corn pollination and soybean pod fill are most at risk.');
    else a.push('In-season conditions are within the normal range for this field.');
  } else if (stage === 'harvest') {
    if (soil === 'low') a.push('Fall soils are dry. Cover crops may establish slowly, so drill cereal rye rather than broadcasting it, and expect less soil-water recharge before spring.');
    else if (soil === 'high') a.push('Fall soils are wet. Watch for harvest delays and compaction. This is a good window to establish a cereal rye cover crop, which will soak up leftover nitrogen.');
    else a.push('Fall moisture is near normal, a good window to establish a cereal rye cover crop after harvest.');
  } else {
    if (soil === 'low') a.push('Soil-water recharge is below normal going into next season. Consider moving a drought-tolerant crop earlier in your rotation.');
    else a.push('Winter soil moisture is near or above normal, a good starting point for next season.');
  }
  const rank = (p) => (p >= 100 ? 'more than in any year since 1991' : `more than in ${p}% of years since 1991`);
  if (n.tempPct !== null && n.tempPct >= 90) a.push(`The last 30 days averaged ${(n.temp - n.tempNormal).toFixed(1)} °C above normal for these dates, ${n.tempPct >= 100 ? 'the warmest on record for this field' : `warmer than ${n.tempPct}% of years`}.`);
  if (n.gddPct !== null && n.gddPct >= 80) a.push(`This year has had ${Math.round(n.gddYtd)} °C·days of growing heat so far, ${rank(n.gddPct)}, in line with the long-term warming trend.`);
  return a;
}
