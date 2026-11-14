// Soil–nutrient relationships from SoilGrids, and a nitrogen budget per rotation.
//
// - Soil N supply: total N stock (0–30 cm) × ~1.2 %/yr net mineralization, a typical
//   value for temperate cropland (Stanford & Smith 1972; Illinois extension guidance
//   puts Corn Belt soil N supply around 80–120 lb N/acre/yr).
// - pH controls nutrient availability (classic Truog chart): most nutrients are best
//   available at pH 6.0–7.0; P is tied up below 5.5 and above 7.5.
// - CEC is the soil's nutrient-holding capacity (K, Ca, Mg).
// - C:N ratio governs how fast organic matter releases nitrogen.

import { CROPS } from './crops.js';
import { parseStep } from './rotations.js';

const KG_HA_TO_LB_AC = 0.892;
const CROP_N_LB = 220; // corn N need (~1 lb N per bushel at ~220 bu/ac)

export function soilNutrients(soil) {
  if (!soil) return null;
  const n = soil.nitrogen, bd = soil.bdod ?? 1.4;
  const nStockKgHa = n != null ? n * bd * 3000 : null;           // g/kg × t/m³ × 3000 m³/ha (0–30 cm)
  const supplyLbAc = nStockKgHa != null ? nStockKgHa * 0.012 * KG_HA_TO_LB_AC : null;
  const cn = soil.soc != null && n ? soil.soc / n : null;
  const ph = soil.ph;
  const phBand = ph == null ? null : ph < 5.5 ? 'strongly acid' : ph < 6.0 ? 'moderately acid' : ph <= 7.0 ? 'optimal' : ph <= 7.5 ? 'slightly alkaline' : 'alkaline';
  // Relative availability (0–1) by pH, simplified from the Truog chart
  const avail = (lo, hi) => (ph == null ? null : ph >= lo && ph <= hi ? 1 : Math.max(0.3, 1 - Math.min(Math.abs(ph - lo), Math.abs(ph - hi)) * 0.45));
  const cec = soil.cec;
  return {
    nStockKgHa, supplyLbAc, cn, ph, phBand, cec,
    cecClass: cec == null ? null : cec < 10 ? 'low' : cec <= 20 ? 'medium' : 'high',
    availability: {
      Nitrogen: avail(6.0, 8.0), Phosphorus: avail(6.0, 7.2), Potassium: avail(6.0, 9.0),
      Sulfur: avail(6.0, 9.0), 'Calcium & magnesium': avail(6.5, 8.5), 'Iron & manganese': avail(4.5, 6.5),
      'Zinc & copper': avail(5.0, 7.0), Molybdenum: avail(6.5, 9.0)
    }
  };
}

/**
 * Nitrogen budget for a rotation (lb N/acre/yr averaged over the rotation):
 * crop demand vs soil supply + legume carry-over credit → fertilizer gap.
 */
export function nitrogenBudget(steps, nut) {
  const parsed = steps.map(parseStep);
  const soilSupply = nut?.supplyLbAc ?? 90;
  let demand = 0, credit = 0, fert = 0;
  parsed.forEach((p, i) => {
    const c = CROPS[p.crop];
    const prev = parsed[(i - 1 + parsed.length) % parsed.length];
    const d = c.nDemand * CROP_N_LB;
    const cr = parsed.length > 1 && CROPS[prev.crop].nFix ? (CROPS[prev.crop].perennial ? 100 : 40) : 0;
    demand += d; credit += cr;
    // Fertilizer = need − the share of soil supply that reaches the crop in time (~25 %) − legume credit.
    // Calibrated so continuous corn ≈ 195 and corn after soybean ≈ 155 lb N/ac, close to Illinois MRTN guidance.
    fert += c.nFix ? 0 : Math.max(0, d - soilSupply * 0.25 - cr);
  });
  const k = parsed.length;
  return { demand: demand / k, legumeCredit: credit / k, soilSupply, fertilizer: fert / k };
}
