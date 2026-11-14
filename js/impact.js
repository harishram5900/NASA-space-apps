// Farm-scale impact of switching rotation: fertilizer, money, greenhouse gas.
//
// Assumptions (shown to the user in the UI):
// - Continuous corn needs ~200 lb N/acre/yr; the rotation's nitrogen index scales
//   this (Illinois MRTN guidance: ~180–200 lb N/ac for corn).
// - Direct N2O emission factor: 1% of applied N (IPCC 2019 Refinement, EF1 = 0.01).
// - N2O global warming potential: 273 (IPCC AR6, 100-year).
// - Fertilizer production & transport: ~4 kg CO2e per kg N (typical life-cycle figure).

export const N_FULL_LB = 200;
const LB_TO_KG = 0.4536;

export function impact(choice, baseline, acres = 500, pricePerLbN = 0.55) {
  const nChoice = choice.nNeed * N_FULL_LB;
  const nBase = baseline.nNeed * N_FULL_LB;
  const savedLbPerAc = nBase - nChoice;
  const savedKgTotal = savedLbPerAc * acres * LB_TO_KG;
  const n2oCO2e = savedKgTotal * 0.01 * (44 / 28) * 273;   // kg CO2e
  const mfgCO2e = savedKgTotal * 4;                         // kg CO2e
  return {
    nChoice, nBase, savedLbPerAc,
    dollars: savedLbPerAc * acres * pricePerLbN,
    tCO2e: (n2oCO2e + mfgCO2e) / 1000,
    carsEquivalent: (n2oCO2e + mfgCO2e) / 1000 / 4.6, // EPA: ~4.6 t CO2e per passenger car per year
    coverYears: choice.soil.parts.cover / 20,
    climateDelta: choice.climate - baseline.climate,
    badYearsDelta: baseline.badYears.length - choice.badYears.length
  };
}
