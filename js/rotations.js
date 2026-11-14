// Rotation scoring: combines per-crop climate reliability (from NASA data)
// with soil-health and input-cost agronomy into one transparent score.

import { CROPS } from './crops.js';
import { cropReliability, evalCover, periods, GOOD, mean } from './analysis.js';

// Each step is a crop key; "+rye" means a cereal rye cover crop after it.
export const ROTATIONS = [
  { id: 'cs', name: 'Corn → Soybean', steps: ['corn', 'soybean'], tag: 'Most common in the US Midwest today' },
  { id: 'cc', name: 'Continuous corn', steps: ['corn'], tag: 'Single crop, no rotation' },
  { id: 'cs-rye', name: 'Corn → Soybean, with a cereal rye cover', steps: ['corn+rye', 'soybean+rye'], tag: 'Same cash crops, soil kept covered over winter' },
  { id: 'csw', name: 'Corn → Soybean → Winter wheat', steps: ['corn', 'soybean', 'wheat'], tag: 'Adds a cool-season crop' },
  { id: 'gsw', name: 'Sorghum → Soybean → Winter wheat', steps: ['sorghum', 'soybean', 'wheat+rye'], tag: 'Swaps corn for heat- and drought-tolerant sorghum' },
  { id: 'csoa', name: 'Corn → Soybean → Oats + alfalfa → Alfalfa', steps: ['corn', 'soybean', 'oats', 'alfalfa'], tag: 'Extended rotation with a perennial legume' },
  { id: 'swf', name: 'Soybean → Winter wheat → Sunflower', steps: ['soybean', 'wheat', 'sunflower+rye'], tag: 'Diverse, deep-rooted, avoids peak heat' },
  { id: 'cpw', name: 'Corn → Field pea → Winter wheat', steps: ['corn', 'pea', 'wheat+rye'], tag: 'Cool-season legume that supplies nitrogen' },
  { id: 'gps', name: 'Sorghum → Field pea → Sunflower', steps: ['sorghum', 'pea', 'sunflower'], tag: 'Dryland-style rotation for a hotter, drier future' },
  { id: 'wcp', name: 'Spring wheat → Canola → Field pea', steps: ['springWheat', 'canola', 'pea'], tag: 'Classic northern prairie rotation (Canada, Dakotas, Ukraine)' },
  { id: 'ws', name: 'Spring wheat → Soybean', steps: ['springWheat', 'soybean+rye'], tag: 'Short-season pair for northern edges of the Corn Belt' }
];

const parseStep = (s) => ({ crop: s.replace('+rye', ''), cover: s.endsWith('+rye') });

/** Soil-health index (0-100) from rotation structure. */
export function soilHealth(steps) {
  const parsed = steps.map(parseStep);
  const crops = parsed.map((p) => CROPS[p.crop]);
  const families = new Set(crops.map((c) => c.family));
  const seasons = new Set(crops.map((c) => c.season));
  const legumeFrac = crops.filter((c) => c.nFix).length / crops.length;
  const coverFrac = parsed.filter((p) => p.cover || CROPS[p.crop].winter || CROPS[p.crop].perennial).length / parsed.length;
  const residue = mean(crops.map((c) => c.residue));
  const perennial = crops.some((c) => c.perennial);
  const parts = {
    diversity: Math.min(1, (families.size - 1) / 2) * 25 + Math.min(1, (seasons.size - 1) / 1) * 10,
    legume: Math.min(1, legumeFrac / 0.5) * 20,
    cover: coverFrac * 20,
    residue: residue * 15,
    perennial: perennial ? 10 : 0
  };
  return { score: Math.min(100, Object.values(parts).reduce((a, b) => a + b, 0)), parts, families: families.size };
}

/** Nitrogen fertilizer need index (0 = none, 1 = continuous corn). */
export function nitrogenNeed(steps) {
  const parsed = steps.map(parseStep);
  let total = 0;
  parsed.forEach((p, i) => {
    let n = CROPS[p.crop].nDemand;
    const prev = parsed[(i - 1 + parsed.length) % parsed.length];
    if (parsed.length > 1 && CROPS[prev.crop].nFix) n = Math.max(0, n - (CROPS[prev.crop].perennial ? 0.5 : 0.25));
    total += n;
  });
  return total / parsed.length;
}

/**
 * Score every rotation for a site.
 * weights: { climate, soil, inputs } (any scale, normalized here)
 */
export function scoreRotations(years, soil, weights, list = ROTATIONS) {
  const cropKeys = new Set();
  list.forEach((r) => r.steps.forEach((s) => cropKeys.add(parseStep(s).crop)));
  const rel = {};
  for (const k of cropKeys) rel[k] = cropReliability(k, years, soil);
  const coverRes = [...years.keys()].map((y) => evalCover(years, y)).filter(Boolean);
  const { recent, base } = periods([...years.keys()]);
  const coverRecent = mean(coverRes.filter((c) => recent.includes(c.year)).map((c) => c.score));

  const w = { climate: 1, soil: 1, inputs: 1, ...weights };
  const wsum = w.climate + w.soil + w.inputs || 1;

  const scored = list.map((rot) => {
    const parsed = rot.steps.map(parseStep);
    // Climate: average crop outcome in the recent period, per year of rotation.
    const yearly = (ys) => ys.map((y) => {
      const s = parsed.map((p) => rel[p.crop].results.find((r) => r.year === y)?.score).filter((x) => x !== undefined);
      return s.length ? { y, score: mean(s), min: Math.min(...s) } : null;
    }).filter(Boolean);
    const rec = yearly(recent), bas = yearly(base);
    const climate = mean(rec.map((r) => r.score));
    const climateBase = mean(bas.map((r) => r.score));
    // Risk: share of recent years where the farm's average crop outcome is poor.
    const badYears = rec.filter((r) => r.score < GOOD).map((r) => r.y);
    // Worst single crop-year in the recent period (tail risk).
    const worst = Math.min(...parsed.map((p) => Math.min(...rel[p.crop].results.filter((r) => recent.includes(r.year)).map((r) => r.score))));
    const coverPenalty = parsed.some((p) => p.cover) && coverRecent < 70 ? (70 - coverRecent) / 4 : 0;
    // A rotation is only as reliable as its weakest crop: blend the average outcome
    // with the success rate of the least reliable crop.
    const weakest = Math.min(...parsed.map((p) => rel[p.crop].recent.goodPct));
    const badFrac = rec.length ? badYears.length / rec.length : 0;
    const climateScore = Math.max(0, Math.min(100, 0.65 * climate + 0.35 * weakest - coverPenalty - badFrac * 15 + (worst - 50) * 0.08));

    const sh = soilHealth(rot.steps);
    const n = nitrogenNeed(rot.steps);
    const inputs = Math.max(0, 100 - n * 100);

    // Viability gate: no farmer plants a crop that fails in >90% of seasons.
    const notViable = [...new Set(parsed.map((p) => p.crop))].filter((k) => rel[k].recent.goodPct < 10);
    let total = (w.climate * climateScore + w.soil * sh.score + w.inputs * inputs) / wsum;
    if (notViable.length) total *= 0.6;
    return {
      ...rot, parsed, total, climate: climateScore, climateRaw: climate, climateBase, climateChange: climate - climateBase,
      soil: sh, inputs, nNeed: n, badYears, worst, coverRecent, notViable
    };
  });
  scored.sort((a, b) => b.total - a.total);
  return { scored, rel, coverRecent, periods: { recent, base } };
}

/** Plain-language explanation for a rotation result. */
export function explain(r, rel, baseline, nRecent = 15, future = false) {
  const yrs = future ? `of ${nRecent} simulated 2050s seasons` : 'of recent years';
  const lines = [];
  const crops = [...new Set(r.parsed.map((p) => p.crop))];
  const stressWords = { heat: 'summer heat', dry: 'drought', cool: 'too little season heat', frost: 'frost or winterkill', wet: 'waterlogging', soil: 'soil pH' };
  if (r.notViable?.length) lines.push(`⛔ Not viable here: ${r.notViable.map((k) => CROPS[k].name).join(', ')} met ${r.notViable.length > 1 ? 'their' : 'its'} needs in under 10% ${yrs}.`);
  const resilient = crops.filter((k) => rel[k].recent.goodPct >= 80);
  const fragile = crops.filter((k) => rel[k].recent.goodPct < 65);
  const declining = crops.filter((k) => rel[k].recent.goodPct >= 65 && rel[k].recent.goodPct - rel[k].base.goodPct <= -15);
  if (resilient.length) lines.push(`✅ ${resilient.map((k) => CROPS[k].name).join(', ')} succeeded in ≥80% ${yrs} at this location.`);
  for (const k of fragile) lines.push(`⚠️ ${CROPS[k].name} hit its targets in only ${Math.round(rel[k].recent.goodPct)}% ${yrs}. The main cause was ${stressWords[rel[k].mainStress] || 'mixed stresses'}.`);
  for (const k of declining) lines.push(`↘️ ${CROPS[k].name} is slipping: it succeeded in ${Math.round(rel[k].base.goodPct)}% of baseline years but only ${Math.round(rel[k].recent.goodPct)}% recently.`);
  if (r.badYears.length) lines.push(future
    ? `📉 ${r.badYears.length} of ${nRecent} simulated 2050s seasons were poor for the rotation as a whole (today's ${r.badYears.join(', ')} weather, made warmer).`
    : `📉 In ${r.badYears.length} of the last ${nRecent} years the rotation as a whole had a poor season (${r.badYears.join(', ')}).`);
  else lines.push('🛡️ No recent year was poor for the rotation as a whole, because the crops spread the risk.');
  if (r.soil.parts.legume > 0) lines.push(`🌱 Legumes supply nitrogen, so fertilizer need is about ${Math.round(r.nNeed * 100)}% of continuous corn.`);
  if (r.parsed.some((p) => p.cover)) lines.push(`🧥 A rye cover crop established in ${Math.round(r.coverRecent)}% of fall conditions (by NASA temperature and rain), protecting soil from spring downpours.`);
  if (baseline && r.id !== baseline.id) {
    const d = r.total - baseline.total;
    lines.push(`${d >= 0 ? '⬆️' : '⬇️'} ${Math.abs(d).toFixed(0)} points ${d >= 0 ? 'better' : 'worse'} overall than ${baseline.name}.`);
  }
  return lines;
}

export { parseStep };
