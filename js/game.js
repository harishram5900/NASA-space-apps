// "2050 Farm Challenge": play eight seasons of 2050s weather on this field.
// Each season is a real NASA POWER year (2011–2025) shifted by NASA NEX-GDDP-CMIP6
// change factors, so the weather is plausible for the 2050s. Crop outcomes come
// from the same crop model as the rest of AgriHaven; rotation effects (pest
// build-up, legume nitrogen credit, cover crops) follow standard agronomy.
// Harvest points are a game simplification, not an economic forecast.

import { CROPS } from './crops.js';
import { evalCropYear } from './analysis.js';
import { parseStep } from './rotations.js';

const VALUE = { corn: 1.15, soybean: 1.1, wheat: 0.9, springWheat: 0.9, sorghum: 0.95, sunflower: 1.0, oats: 0.7, pea: 0.85, canola: 1.0, alfalfa: 0.9 };
const SEASONS = 8;

function rng(seed) { // deterministic so a challenge can be replayed / shared
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

export function newGame(years, seed = Date.now() % 100000) {
  const pool = [...years.keys()].sort((a, b) => a - b).slice(-15).filter((y) => years.has(y - 1));
  const r = rng(seed);
  const seq = Array.from({ length: SEASONS }, () => pool[Math.floor(r() * pool.length)]);
  return { seed, seq, i: 0, soil: 50, points: 0, history: [], years };
}

/** Play one season. choice = { crop, cover } */
export function playSeason(g, choice, soilData) {
  const y = g.seq[g.i];
  const crop = CROPS[choice.crop];
  const base = evalCropYear(crop, g.years, y, soilData) ?? { score: 0, stresses: [] };
  const prev = g.history[g.history.length - 1];
  const notes = [];
  let score = base.score;
  if (prev && prev.crop === choice.crop && !crop.perennial) {
    score -= 12; notes.push('Same crop twice: pests and disease built up (−12).');
  }
  if (prev && CROPS[prev.crop].nFix && !crop.nFix) {
    score += 6; notes.push(`Nitrogen credit from last year's ${CROPS[prev.crop].name.toLowerCase()} (+6).`);
  }
  if (prev && prev.cover) { score += 3; notes.push('Last year\'s rye cover protected the soil (+3).'); }
  score = Math.max(0, Math.min(100, score));

  let dSoil = 0;
  if (crop.nFix) dSoil += 4;
  if (crop.perennial) dSoil += 5;
  if (choice.cover) dSoil += 5;
  if (crop.winter) dSoil += 2;
  if (prev && prev.crop === choice.crop && !crop.perennial) dSoil -= 4;
  if (crop.residue < 0.5 && !choice.cover) dSoil -= 2;
  // Heavy spring rain on bare soil = erosion
  const spring = (g.years.get(y) || []).filter((d) => d.m >= 4 && d.m <= 6 && d.prcp >= 25).length;
  if (spring >= 2 && !choice.cover && !crop.perennial && !crop.winter) { dSoil -= 3; notes.push(`${spring} downpours hit bare soil in spring: erosion (soil −3).`); }
  g.soil = Math.max(0, Math.min(100, g.soil + dSoil));
  // Soil health feeds back into yield
  const pts = Math.round(score * (VALUE[choice.crop] ?? 1) * (0.85 + g.soil / 333));
  g.points += pts;
  const days = g.years.get(y) || [];
  const weather = {
    hot: days.filter((d) => d.m >= 6 && d.m <= 8 && d.tmax >= 32).length,
    rain: Math.round(days.filter((d) => d.m >= 4 && d.m <= 9).reduce((s, d) => s + d.prcp, 0))
  };
  const rec = { season: g.i + 1, year: y, crop: choice.crop, cover: !!choice.cover, score, pts, dSoil, soil: g.soil, stresses: base.stresses, notes, weather };
  g.history.push(rec);
  g.i++;
  return rec;
}

/** Play a rotation through the same weather sequence (for the comparison). */
export function autoPlay(years, seq, steps, soilData) {
  const g = { seq, i: 0, soil: 50, points: 0, history: [], years };
  for (let k = 0; k < seq.length; k++) {
    const p = parseStep(steps[k % steps.length]);
    playSeason(g, { crop: p.crop, cover: p.cover }, soilData);
  }
  return g;
}

export const SEASON_COUNT = SEASONS;
