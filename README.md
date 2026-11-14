# 🛰️ Rotation Radar

**Test-drive your next crop rotation against 35 years of NASA climate data, before you plant it.**

NASA Space Apps Challenge 2026 · Challenge: **Field Shift: Adapting Farms with NASA Data** · Team Rotation Radar, Chicago

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
5. **Stress-test the future** with warming (+0 to +3 °C) and rainfall (−30% to +20%) sliders.
6. **Explain everything in plain language** and export a printable farm report.

Satellite context layers from **NASA GIBS** (MODIS NDVI vegetation greenness, SMAP root-zone soil moisture, SEDAC croplands) show what's growing around the field right now.

## NASA data used

| Dataset | Use |
|---|---|
| [NASA POWER](https://power.larc.nasa.gov/) Agroclimatology daily API (MERRA-2 / satellite) | T2M_MAX, T2M_MIN, PRECTOTCORR, GWETROOT, 1991–2025 |
| [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/): MODIS Terra NDVI 8-day | Current crop greenness map layer |
| NASA GIBS: SMAP L4 root-zone soil moisture | Current soil moisture map layer |
| NASA GIBS: SEDAC Agricultural Lands, Croplands 2000 | Where cropland is |
| [ISRIC SoilGrids 2.0](https://soilgrids.org) (partner data) | Topsoil texture, pH, organic carbon, CEC |
| FAO Ecocrop / FAO-56, US extension guides | Crop thresholds |

## Validation

Without being tuned to any particular year, the model ranks **2012**, the historic US drought, among the two worst corn seasons in central Illinois. It also flags **2005**, a severe Illinois drought. Automated tests (`npm test`) check this along with the statistics, unit conversions and scoring logic.

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
data/               offline sample (real NASA POWER + SoilGrids responses)
tests/run.js        tests
docs/               pitch, demo script, judging plan
```

## Limitations

NASA POWER is a ~50 km grid, so it gives regional climate, not microclimate. Crop thresholds are generic screening values. Scores compare options; they are not yield forecasts or financial advice. Rotation Radar helps a farmer start a conversation with their agronomist. It doesn't replace one.

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
