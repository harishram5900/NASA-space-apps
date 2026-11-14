// Run with: npm test   (Node 18+, no dependencies)
// Uses the bundled real NASA POWER sample for Champaign County, Illinois.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parsePower, byYear, climateIndicators, indicatorSummary, cropReliability, mannKendall, applyScenario, applyMonthlyDeltas, et0, extraterrestrialRadiation } from '../js/analysis.js';
import { impact } from '../js/impact.js';
import { scoreRotations, soilHealth, nitrogenNeed } from '../js/rotations.js';
import { parseSoil } from '../js/api.js';

const json = JSON.parse(fs.readFileSync(new URL('../data/sample-power-champaign-il.json', import.meta.url)));
const soilJson = JSON.parse(fs.readFileSync(new URL('../data/sample-soil-champaign-il.json', import.meta.url)));
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('✓', name); };

const days = parsePower(json, 40.3);
const years = byYear(days);
const soil = parseSoil(soilJson);

test('parses 35 complete years of daily NASA POWER data', () => {
  assert.equal(years.size, 35);
  assert.ok(days.every((d) => d.tmax >= d.tmin - 0.01));
});

test('SoilGrids units convert to sensible topsoil values', () => {
  assert.ok(soil.clay > 20 && soil.clay < 45, `clay ${soil.clay}`);
  assert.ok(soil.ph > 5 && soil.ph < 8, `ph ${soil.ph}`);
  assert.ok(soil.sand < 20);
  assert.equal(soil.texture, 'silty clay loam');
});

test('Mann-Kendall detects a clear trend and rejects noise', () => {
  const xs = [...Array(30).keys()];
  assert.ok(mannKendall(xs, xs.map((x) => x + Math.sin(x))).p < 0.001);
  assert.ok(mannKendall(xs, xs.map((x) => (x % 2 ? 1 : -1))).p > 0.2);
});

test('Illinois growing-season heat has risen significantly since 1991', () => {
  const s = indicatorSummary(climateIndicators(years)).find((i) => i.key === 'gdd');
  assert.ok(s.delta > 50 && s.mk.p < 0.05, JSON.stringify({ d: s.delta, p: s.mk.p }));
});

test('model independently flags the 2012 drought as a top-2 worst corn year', () => {
  const r = cropReliability('corn', years, soil);
  const worst = [...r.results].sort((a, b) => a.score - b.score).slice(0, 2).map((x) => x.year);
  assert.ok(worst.includes(2012), `worst years ${worst}`);
});

test('warming scenario never improves corn reliability', () => {
  const hot = byYear(applyScenario(days, 2, -10));
  assert.ok(cropReliability('corn', hot, soil).recent.mean <= cropReliability('corn', years, soil).recent.mean);
});

test('soil health: diverse rotation beats continuous corn', () => {
  assert.ok(soilHealth(['corn', 'soybean', 'oats', 'alfalfa']).score > soilHealth(['corn']).score + 30);
  assert.ok(nitrogenNeed(['corn', 'soybean']) < nitrogenNeed(['corn']));
});

test('rotation ranking: continuous corn near the bottom, cold-climate canola rotation not favored in Illinois', () => {
  const { scored } = scoreRotations(years, soil, { climate: 3, soil: 2, inputs: 1 });
  const rank = (id) => scored.findIndex((r) => r.id === id);
  assert.ok(rank('cc') >= scored.length - 2);
  assert.ok(rank('cc') > rank('cs'));
  assert.ok(rank('wcp') > rank('cs-rye'));
  assert.ok(scored.every((r) => r.total >= 0 && r.total <= 100));
});

test('Southern Hemisphere dates are shifted half a year', () => {
  const sh = parsePower(json, -31.9);
  assert.ok(sh[0].m === 7);
});

test('FAO-56 radiation and ET0 match textbook values', () => {
  // FAO-56 Example 8: 20°S on 3 Sept (DOY 246) -> Ra = 32.2 MJ/m2/day
  assert.ok(Math.abs(extraterrestrialRadiation(-20, 246) - 32.2) < 0.3);
  const july = days.filter((d) => d.m === 7);
  const mean = july.reduce((s, d) => s + et0(d), 0) / july.length;
  assert.ok(mean > 4 && mean < 7, `July ET0 ${mean}`); // central Illinois ~5-6 mm/day
});

test('monthly climate-model deltas shift only the right month', () => {
  const z = Array(12).fill(0), one = Array(12).fill(1);
  const dT = [...z]; dT[6] = 2;
  const out = applyMonthlyDeltas(days, { dTmax: dT, dTmin: z, pRatio: one });
  const i = days.findIndex((d) => d.m === 7), j = days.findIndex((d) => d.m === 1);
  assert.equal(+(out[i].tmax - days[i].tmax).toFixed(6), 2);
  assert.equal(out[j].tmax, days[j].tmax);
});

test('impact maths: 25 lb N/ac on 500 ac at $0.55 = $6,875', () => {
  const r = impact({ nNeed: 0.3, soil: { parts: { cover: 0 } }, climate: 80, badYears: [] }, { nNeed: 0.425, soil: { parts: { cover: 0 } }, climate: 80, badYears: [] }, 500, 0.55);
  assert.equal(Math.round(r.dollars), 6875);
  assert.ok(r.tCO2e > 40 && r.tCO2e < 55);
});

test('projection file (if built) has 3 models and sane change factors', () => {
  const url = new URL('../data/projections.json', import.meta.url);
  if (!fs.existsSync(url)) return;
  const p = JSON.parse(fs.readFileSync(url));
  for (const site of Object.values(p.sites)) for (const sc of ['ssp245', 'ssp585']) {
    if (!site[sc]) continue;
    assert.equal(Object.keys(site[sc].models).length, 3);
    for (const k of ['dTmax', 'dTmin']) assert.ok(site[sc].mean[k].every((x) => x > -3 && x < 8));
    assert.ok(site[sc].mean.pRatio.every((x) => x >= 0.6 && x <= 1.6));
  }
});

console.log(`\n${passed} tests passed`);
