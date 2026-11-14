// Run with: npm test   (Node 18+, no dependencies)
// Uses the bundled real NASA POWER sample for Champaign County, Illinois.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parsePower, byYear, climateIndicators, indicatorSummary, cropReliability, mannKendall, applyScenario } from '../js/analysis.js';
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

test('rotation ranking is complete and continuous corn ranks last on soil-weighted priorities', () => {
  const { scored } = scoreRotations(years, soil, { climate: 3, soil: 2, inputs: 1 });
  assert.equal(scored.at(-1).id, 'cc');
  assert.ok(scored.every((r) => r.total >= 0 && r.total <= 100));
});

test('Southern Hemisphere dates are shifted half a year', () => {
  const sh = parsePower(json, -31.9);
  assert.ok(sh[0].m === 7);
});

console.log(`\n${passed} tests passed`);
