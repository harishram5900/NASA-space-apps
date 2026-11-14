// Crop library: simplified agronomic requirements used to evaluate each crop
// against every year of NASA POWER weather.
//
// Values are rounded, typical figures drawn from FAO Ecocrop / FAO-56 and US
// land-grant extension guides (Iowa State, Illinois, Purdue, NDSU). They are
// screening values for comparing options, not field prescriptions.
//
// Season windows are written for the Northern Hemisphere. For sites south of
// the equator the analysis shifts the weather record by half a year so the
// same windows apply.

export const CROPS = {
  corn: {
    name: 'Corn (maize)', emoji: '🌽', family: 'grass', season: 'warm',
    sow: [5, 1], harvest: [10, 10],            // [month, day]
    baseT: 10, capT: 30, gddNeed: 1450,        // °C growing degree days, 86/50 method
    sensitive: [7, 5, 8, 5], heatT: 35,        // pollination window & damaging Tmax
    waterNeed: [500, 800],                     // mm over the season (rain + stored soil water)
    drought: 0.3,                              // 0 = very sensitive, 1 = very tolerant
    frostKill: -1,
    ph: [5.8, 7.2],
    nDemand: 1.0, nFix: false, residue: 1.0, perennial: false,
    note: 'High yield, high nitrogen need. Pollination in July is very sensitive to heat and drought.'
  },
  soybean: {
    name: 'Soybean', emoji: '🫘', family: 'legume', season: 'warm',
    sow: [5, 15], harvest: [10, 5],
    baseT: 10, capT: 30, gddNeed: 1250,
    sensitive: [7, 20, 8, 31], heatT: 36,
    waterNeed: [450, 700], drought: 0.4, frostKill: -1,
    ph: [6.0, 7.0],
    nDemand: 0.1, nFix: true, residue: 0.35, perennial: false,
    note: 'Fixes its own nitrogen. Pod fill in August needs moisture.'
  },
  wheat: {
    name: 'Winter wheat', emoji: '🌾', family: 'grass', season: 'cool',
    sow: [10, 1], harvest: [7, 1], winter: true,
    baseT: 0, capT: 26, gddNeed: 1900,
    sensitive: [5, 20, 6, 25], heatT: 32,      // flowering and grain fill
    waterNeed: [350, 550], drought: 0.5,
    winterKill: -22,                           // °C air minimum (no snow cover assumed)
    ph: [5.8, 7.5],
    nDemand: 0.6, nFix: false, residue: 0.8, perennial: false,
    note: 'Sown in fall, harvested in early summer. It avoids the worst late-summer heat and drought and covers the soil over winter.'
  },
  oats: {
    name: 'Oats (spring)', emoji: '🥣', family: 'grass', season: 'cool',
    sow: [4, 5], harvest: [7, 20],
    baseT: 0, capT: 25, gddNeed: 1300,
    sensitive: [6, 10, 7, 10], heatT: 30,
    waterNeed: [300, 500], drought: 0.4, frostKill: -6,
    ph: [5.5, 7.0],
    nDemand: 0.4, nFix: false, residue: 0.6, perennial: false,
    note: 'Short, cool-season small grain. Good nurse crop for alfalfa or clover. Heat during grain fill cuts yield.'
  },
  sorghum: {
    name: 'Grain sorghum', emoji: '🌿', family: 'grass', season: 'warm',
    sow: [5, 20], harvest: [10, 15],
    baseT: 10, capT: 32, gddNeed: 1350,
    sensitive: [7, 15, 8, 15], heatT: 38,
    waterNeed: [350, 600], drought: 0.85, frostKill: -1,
    ph: [5.5, 7.8],
    nDemand: 0.65, nFix: false, residue: 0.8, perennial: false,
    note: 'The "camel of crops". It tolerates heat and drought far better than corn and uses the same equipment.'
  },
  sunflower: {
    name: 'Sunflower', emoji: '🌻', family: 'composite', season: 'warm',
    sow: [5, 20], harvest: [9, 30],
    baseT: 7, capT: 32, gddNeed: 1300,
    sensitive: [7, 15, 8, 10], heatT: 38,
    waterNeed: [400, 600], drought: 0.75, frostKill: -2,
    ph: [6.0, 7.5],
    nDemand: 0.45, nFix: false, residue: 0.4, perennial: false,
    note: 'Deep taproot reaches subsoil water and breaks the corn and soybean pest cycle.'
  },
  pea: {
    name: 'Field pea', emoji: '🟢', family: 'legume', season: 'cool',
    sow: [4, 1], harvest: [7, 10],
    baseT: 1, capT: 25, gddNeed: 1150,
    sensitive: [6, 1, 6, 30], heatT: 30,
    waterNeed: [300, 450], drought: 0.35, frostKill: -6,
    ph: [6.0, 7.5],
    nDemand: 0.0, nFix: true, residue: 0.3, perennial: false,
    note: 'Cool-season legume that adds nitrogen and is harvested before peak summer heat.'
  },
  springWheat: {
    name: 'Spring wheat', emoji: '🍞', family: 'grass', season: 'cool',
    sow: [4, 25], harvest: [8, 20],
    baseT: 0, capT: 26, gddNeed: 1500,
    sensitive: [6, 20, 7, 25], heatT: 30,     // grain fill: >30°C shrivels kernels
    waterNeed: [300, 450], drought: 0.5, frostKill: -5,
    ph: [6.0, 8.0],
    nDemand: 0.6, nFix: false, residue: 0.8, perennial: false,
    note: 'The main grain of cold northern prairies. It is planted in spring, so winterkill is not a risk.'
  },
  canola: {
    name: 'Canola', emoji: '💛', family: 'brassica', season: 'cool',
    sow: [5, 5], harvest: [8, 31],
    baseT: 5, capT: 28, gddNeed: 1100,
    sensitive: [7, 1, 7, 31], heatT: 30,
    waterNeed: [300, 450], drought: 0.35, frostKill: -4,
    ph: [5.5, 8.0],
    nDemand: 0.7, nFix: false, residue: 0.5, perennial: false,
    note: 'Oilseed in the brassica family. It breaks cereal disease cycles but flowers are sensitive to heat above 30°C.'
  },
  alfalfa: {
    name: 'Alfalfa (hay)', emoji: '🍀', family: 'legume', season: 'perennial',
    sow: [4, 10], harvest: [9, 30],
    baseT: 5, capT: 30, gddNeed: 1500,
    sensitive: [6, 1, 8, 31], heatT: 37,
    waterNeed: [600, 1000], drought: 0.7, frostKill: -4,
    winterKill: -30,
    ph: [6.5, 7.8],
    nDemand: 0.0, nFix: true, residue: 0.9, perennial: true,
    note: 'Perennial legume with roots 2 m deep or more. It builds soil carbon and leaves nitrogen for the next crop.'
  }
};

// Cover crop sown after harvest, evaluated on fall establishment.
export const COVER = {
  name: 'Cereal rye cover crop', emoji: '🌱',
  window: [10, 1, 11, 30],   // establishment window
  baseT: 4, gddNeed: 120,    // fall GDD needed to establish ~3 leaves
  rainNeed: 40               // mm in window to germinate
};
