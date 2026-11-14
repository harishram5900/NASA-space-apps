# AgriHaven: project details

**What it does and how it works**

AgriHaven lets any farmer test a crop rotation on NASA data, both for today's climate and for the 2050s, before planting it. The farmer types in a field anywhere on Earth. AgriHaven then pulls 35 years of daily NASA POWER weather for that exact spot, along with satellite readings and soil data. It replays those real years on ten crops and scores each rotation on:

- yield risk
- the Water Certainty Rate: how often rain plus stored soil water covers what the crop needs
- fertilizer needed
- soil lost to erosion
- soil carbon
- climate resilience

It then re-runs the same rotations under three NASA NEX-GDDP-CMIP6 climate models for the 2050s. The spread between the three models shows the farmer how uncertain the future is. Every result is explained in plain English.

The app has six main parts:

- **Field story:** six short chapters written from the field's own data. One example: it finds the 2012 drought on its own.
- **"Right now":** compares this season with the last 35 years and suggests whether to plant, wait, irrigate or seed a cover crop.
- **Satellite lab:**
  - MODIS greenness (NDVI) and near-infrared
  - land surface temperature
  - SMAP soil moisture
  - NISAR and OPERA radar
  - GPM rainfall
  - UV index
  - a time-lapse of the crop season
- **Compare & risk:** the full tradeoff table.
- **Build your own:** design any rotation and score it.
- **2050 Challenge:** a game where you farm eight seasons of future weather.

**Benefits**

- It turns NASA data that farmers never see into one clear decision.
- It is free and works for any field, on a phone, in English or Spanish, with read-aloud.
- It shows tradeoffs openly instead of giving one black-box answer. For example, corn-soybean is the safest choice today, but it uses the most fertilizer and loses the most soil.
- It makes uncertainty visible rather than hiding it.

**Intended impact**

We want farmers to plan for the climate they will actually farm in, not the one they remember. Take one 500-acre Illinois farm that switches to the rotation AgriHaven recommends. Each year, it would:

- save about $6,900 in fertilizer
- keep 524 tonnes of topsoil on the field
- avoid 47 tonnes of CO₂e from fertilizer
- store 228 tonnes of CO₂ in the soil

Across many farms, that adds up to healthier soil, cleaner water and more stable incomes.

**Tools, languages and software**

- **Code:**
  - JavaScript (ES modules), HTML and CSS
  - Python scripts to process NEX-GDDP-CMIP6 projections
  - Node.js for 31 automated tests
- **Libraries and browser features:**
  - Leaflet for maps and Chart.js for charts
  - the Web Speech API (read-aloud) and Web Audio (trends played as sound)
  - Photon/OpenStreetMap for field search
- **Hosting:** GitHub for code and Vercel for hosting. No special hardware; it runs in any browser.
- **NASA data:**
  - NASA POWER
  - NEX-GDDP-CMIP6
  - satellite layers through NASA GIBS: MODIS, SMAP, NISAR, OPERA, GPM IMERG, CERES and SEDAC
- **Partner data:** ISRIC SoilGrids
- **Science methods:**
  - FAO-56 Penman-Monteith for crop water use
  - USDA RUSLE for erosion
  - IPCC emission factors
  - Mann-Kendall and Sen's slope trend tests

**How it's creative**

- We decode satellite image pixels back into real numbers using NASA GIBS colormaps. That gives one single field actual NDVI, °C and soil-moisture values, not just a picture.
- The app writes each field its own story, plays climate trends as sound, and turns the 2050s into a game you can try to beat.
- It also includes a "time machine" that switches between today and the 2050s.

**Factors we considered**

- **Accuracy:**
  - We used standard, published methods.
  - We checked that the model finds real events on its own: the 2012 drought and Illinois's 2019 wet spring, when there were only two dry days to plant.
- **Trust:** every score is explained and every source is shown.
- **Uncertainty:** we use three climate models instead of one.
- **Accessibility:** works on phones, two languages, read-aloud, simple wording.
- **Cost:** free and needs no account.
- **Global reach:** works for any field on Earth.
- **Real farm tradeoffs:** money, soil, water and carbon.
- **Inspiration:** our own grandparents' farms. All four of us watched them depend on one guess about the weather.
