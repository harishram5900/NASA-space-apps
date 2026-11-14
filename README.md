# 🛰️ Rotation Radar

**Test-drive your next crop rotation against 35 years of NASA observations and NASA's 2050s climate projections, before you plant it.**

NASA Space Apps Challenge 2026 · Challenge: **Field Shift: Adapting Farms with NASA Data** · Team Rotation Radar, Chicago

### 🌐 Live demo: **https://rotationradar.vercel.app**

![Rotation Radar screenshot](og.png)

---

## The problem

Farmers plan crop rotations from experience: "what worked for my parents." But the climate that experience was built in no longer exists. In central Illinois, NASA data shows the growing season now has about **150 more degree-days of heat** and a **frost-free season about 12 days longer** than in 1991–2005. Heat waves and flash droughts like **2012** still wipe out whole seasons. Most farmers have no easy way to ask:

> *"Given how **my** field's climate has actually changed, which rotation will hold up best, and what does it do for my soil?"*

## Our solution

Rotation Radar is a free web app. Click any field on Earth and it will:

1. **Download 35 years of daily NASA POWER weather** (1991–present) and **SoilGrids topsoil** data for that exact point.
2. **Show how the climate has really shifted.** It covers 8 farm-relevant indicators (heat units, frost-free season, hot days, heavy spring rain, dry spells, NASA root-zone soil wetness and more), each tested for a statistically significant trend (Mann-Kendall + Sen's slope).
3. **"Grow" 10 crops in every one of those 35 real seasons.** Each crop is checked against its heat-unit needs, flowering heat stress, water supply (rain plus NASA soil moisture), frost and winterkill, and soil pH. The result is a year-by-year reliability strip for each crop.
4. **Rank 11 rotations, or one you build yourself.** Scores combine **climate resilience**, **soil health** (diversity, legumes, winter cover, perennials) and **fertilizer need**, weighted by what matters to the farmer.
5. **Fast-forward to the 2050s** with **NASA NEX-GDDP-CMIP6** projections from three independent climate models (GFDL-ESM4, MRI-ESM2-0, ACCESS-CM2) under moderate (SSP2-4.5) and high (SSP5-8.5) emissions. Rotations are re-ranked under every model separately, so you can see whether the recommendation is robust. A custom what-if slider is also available.
6. **Show what switching is worth:** nitrogen fertilizer saved, dollars, tonnes of CO₂e avoided and soil-health gain for *your* acreage and fertilizer price.
7. **Tell the field's story** in six data-driven chapters (the climate it was built for, the year everything went wrong, the new normal, the 2050s, a plan that holds) in **English or Spanish**, with **read-aloud**.
8. **Check the season right now:** NASA POWER near-real-time data (~3-day latency) compared with the same dates in every year since 1991, turned into timely advice (plant, wait, irrigate, seed a cover crop).
9. **Hear the data:** any climate trend can be played as sound (sonification) for accessibility.
10. **Explain everything in plain language**, with a 60-second guided tour, a shareable field link and a printable farm report.

Satellite context layers from **NASA GIBS** (MODIS NDVI vegetation greenness, SMAP root-zone soil moisture, SEDAC croplands) show what's growing around the field right now.

## NASA data used

| Dataset | Use |
|---|---|
| [NASA POWER](https://power.larc.nasa.gov/) Agroclimatology daily API (MERRA-2 / CERES / satellite) | T2M_MAX, T2M_MIN, PRECTOTCORR, GWETROOT, ALLSKY_SFC_SW_DWN, 1991–2025 |
| [NASA NEX-GDDP-CMIP6](https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6) v2.0 (NASA Center for Climate Simulation) | Daily downscaled Tmax, Tmin and precipitation, 3 models × SSP2-4.5 / SSP5-8.5, turned into monthly change factors (`tools/`) |
| [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/): MODIS Terra NDVI 8-day | Current crop greenness map layer |
| NASA GIBS: SMAP L4 root-zone soil moisture | Current soil moisture map layer |
| NASA GIBS: SEDAC Agricultural Lands, Croplands 2000 | Where cropland is |
| [ISRIC SoilGrids 2.0](https://soilgrids.org) (partner data) | Topsoil texture, pH, organic carbon, CEC |
| FAO Ecocrop / FAO-56, US extension guides | Crop thresholds, Hargreaves reference evapotranspiration |
| USDA-NRCS available-water values by texture | Root-zone water storage from SoilGrids texture |
| IPCC 2019 Refinement (EF1) and AR6 GWP | N₂O and CO₂e estimates |

## Validation

Without being tuned to any particular year, the model ranks **2012**, the historic US drought, among the two worst corn seasons in central Illinois. It also flags **2005**, a severe Illinois drought. The FAO-56 radiation code reproduces FAO's own worked example, and July reference ET in central Illinois comes out at 5–6 mm/day, as expected. `npm test` runs 13 automated checks covering the statistics, unit conversions, climate-model deltas, impact maths and scoring logic.

### Rebuilding the NASA projections
```bash
python3 tools/fetch_nex_gddp.py                     # downloads from NASA NCCS THREDDS (~4 min per region)
python3 tools/build_projections.py proj_raw.json    # writes data/projections.json
```

## Run it

It's a static site with no build step and no API keys.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # 9 tests, Node 18+
```

If the live APIs are unreachable during a demo, the app offers a bundled **offline sample** (real NASA POWER data for Champaign County, IL).

## Project structure

```
index.html          app shell
css/style.css       styles (light/dark, mobile, print report)
js/api.js           NASA POWER, SoilGrids, GIBS, geocoding
js/analysis.js      climate indicators, crop-year model, Mann-Kendall / Sen's slope
js/crops.js         crop library (thresholds and sources)
js/rotations.js     rotation scoring and plain-language explanations
js/app.js           UI: map, charts, tabs
js/projections.js   NASA NEX-GDDP-CMIP6 scenarios
js/impact.js        fertilizer, $ and CO2e impact
data/               offline sample (real NASA POWER + SoilGrids) + projections.json
tools/              scripts that build projections.json from NASA NEX-GDDP-CMIP6
tests/run.js        tests
docs/               pitch, demo script, judging plan
```

## Limitations

NASA POWER is a ~50 km grid, so it gives regional climate, not microclimate. The 2050s projections use 3 models × 2 sample years per period, precomputed for the preset regions; nearby fields (within ~600 km) use the nearest region. Crop thresholds are generic screening values. Scores compare options; they are not yield forecasts or financial advice. Rotation Radar helps a farmer start a conversation with their agronomist. It doesn't replace one.

## Use of AI

AI coding assistants helped write the code and documentation. All data comes from the cited sources, and the team reviewed the model logic and results.

## Team

| Name | Role |
|---|---|
| Atharv | Lead developer: data pipeline and analysis |
| Dhishant | Lead developer: UI, map and charts |
| _teammate_ | Agronomy research and validation |
| _teammate_ | Story, slides and project page |
| _teammate_ | Demo video and design |

*Not affiliated with or endorsed by NASA.*
