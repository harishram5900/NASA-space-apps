// Soil conservation: erosion (RUSLE) and soil-carbon gains per rotation.
//
// Soil loss A = R · K · LS · C   (Revised Universal Soil Loss Equation, USDA)
//   R  rainfall erosivity from NASA POWER annual rainfall (Renard & Freimund 1994)
//   K  soil erodibility from SoilGrids texture + organic carbon (EPIC, Williams 1995)
//   LS slope length/steepness: assumed gently sloping field (~2–3 %, 50 m) = 0.3
//   C  cover-management factor per crop, typical mulch-till values from RUSLE
//      handbooks (USDA Agriculture Handbook 703), with a cover crop cutting C by 40 %.
// Soil carbon:
//   cover crops     +0.32 t C/ha/yr  (Poeplau & Don 2015, global meta-analysis)
//   ≥3-crop rotation +0.20 t C/ha/yr  (West & Post 2002, rotation complexity)

import { parseStep } from './rotations.js';

export const C_FACTOR = {
  corn: 0.30, sorghum: 0.30, soybean: 0.40, sunflower: 0.40, pea: 0.35, canola: 0.30,
  wheat: 0.15, springWheat: 0.18, oats: 0.15, alfalfa: 0.02
};
export const LS_DEFAULT = 0.3;
const T_HA_TO_T_AC = 0.4461;

/** Rainfall erosivity R (MJ·mm/(ha·h·yr)) from mean annual rainfall P (mm). */
export function erosivity(P) {
  return P < 850 ? 0.0483 * Math.pow(P, 1.61) : 587.8 - 1.219 * P + 0.004105 * P * P;
}

export function annualRain(years) {
  const totals = [...years.values()].map((days) => days.reduce((s, d) => s + d.prcp, 0));
  return totals.reduce((a, b) => a + b, 0) / totals.length;
}

/** Soil loss in tonnes per acre per year for a rotation. */
export function soilLoss(steps, R, K, LS = LS_DEFAULT) {
  const parsed = steps.map(parseStep);
  const C = parsed.reduce((s, p) => s + (C_FACTOR[p.crop] ?? 0.3) * (p.cover ? 0.6 : 1), 0) / parsed.length;
  return { tPerAc: R * (K ?? 0.03) * LS * C * T_HA_TO_T_AC, C };
}

/** Soil organic carbon gain (t C/ha/yr) relative to a simple corn-soybean system. */
export function carbonGain(steps) {
  const parsed = steps.map(parseStep);
  const coverFrac = parsed.filter((p) => p.cover).length / parsed.length;
  const distinct = new Set(parsed.map((p) => p.crop)).size;
  return coverFrac * 0.32 + (distinct >= 3 ? 0.2 : 0);
}

/** Conservation summary for every scored rotation. */
export function conservation(scored, years, soil) {
  const P = annualRain(years);
  const R = erosivity(P);
  const K = soil?.kFactor ?? 0.03;
  const out = {};
  for (const r of scored) {
    const loss = soilLoss(r.steps, R, K);
    out[r.id] = { lossTAc: loss.tPerAc, C: loss.C, carbonTHa: carbonGain(r.steps) };
  }
  return { P, R, K, byId: out, tolerance: 5 }; // USDA soil-loss tolerance "T" ≈ 5 t/ac/yr for deep soils
}
