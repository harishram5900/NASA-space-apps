# How we win: judging criteria → our plan

Space Apps projects are scored on **five criteria**: **Impact, Creativity, Validity, Relevance, Presentation**. The official guide says to give presentation as much attention as the other four. Local judges in Chicago use them to choose the projects they nominate for **global judging**, where NASA and partner-agency experts pick 10 global winners.

| Criterion | What judges look for | How AgriHaven scores |
|---|---|---|
| **Impact** | Does it solve a real problem for real people at scale? | Any farmer on Earth, free, no login. Corn → soybean covers most of the Corn Belt. For each farm it shows fertilizer saved, dollars, tonnes of CO₂e and soil-health gains, plus a printable report and a shareable link for the farmer's agronomist or lender. |
| **Creativity** | Is it a fresh approach? | We don't just show climate charts. We "grow" every crop in each of 35 real NASA seasons, then fast-forward that real weather to the 2050s with NASA climate models and re-rank under every model separately. There's also a build-your-own rotation and a farm-impact calculator. |
| **Validity** | Is the science and data sound? Does it work? | Live NASA POWER + NEX-GDDP-CMIP6 + SMAP + MODIS + SoilGrids. Standard methods: Mann-Kendall / Sen's slope, FAO-56 ET₀ (tested against FAO's worked example), the delta method, a 3-model ensemble with a robustness check, and IPCC emission factors. The model independently flags the 2012 and 2005 droughts. 13 automated tests, reproducible build scripts and a clear limitations section. |
| **Relevance** | Does it address the challenge and use NASA data? | The challenge says to combine NASA Earth observations with soil and crop information for resilient crop rotations. That is exactly our pipeline. |
| **Presentation** | Is the demo and story clear and compelling? | A built-in 60-second guided tour, a 30-second story built around one farmer and one field, a live link, a polished mobile and dark-mode UI, and a printable farm report. |

### Award categories we're targeting
- **Best Use of Data**: in 2024, an agriculture app on this kind of challenge won exactly this.
- **Galactic Impact**: also won by a 2024 farming app.
- **Local Impact**: Illinois Corn Belt framing.

---

## What past global winners did, and what we borrowed

| Past winner | What it did | What AgriHaven does |
|---|---|---|
| **2plant** (2024 Galactic Impact) and **Waterwise** (2024 Best Use of Data), both farming apps | Soil-moisture and ET data turned into in-season decisions for farmers | 📡 *Right now on this field*: live NASA POWER vs 35 years, with plant/wait/irrigate/cover-crop advice |
| **TerraTales** (2024 Best Storytelling), **HerCode Space** (2025 Best Storytelling) | Data told as stories for non-experts | 📖 *Field story*: six chapters generated from the field's own NASA data |
| **Arcobaleno** (2023 Global Connection) | Sonification for people with visual impairments | 🔊 *Hear this trend*, plus read-aloud of the story |
| **Global Connection** winners | Reach beyond one language or country | 🌐 Spanish story, presets on 4 continents, works anywhere on Earth |
| **SpaceGenes+** (2025 Best Use of Science) | Rigorous, interactive dashboard for experts | Climate shift tab with p-values, 3-model robustness and reproducible scripts |
| **Two 2023 winners** on Moonquake Map | Interactive maps of real NASA data | Map with NASA GIBS MODIS, SMAP and SEDAC layers |

## 30-second pitch (memorize this)

> "Every farmer in Illinois plans their crops on memories of a climate that's gone. NASA data shows Champaign County now gets about 150 more degree-days of heat and a frost-free season almost two weeks longer than in the 90s, and 2012 showed what one hot, dry summer does to corn.
> **AgriHaven** lets any farmer click their field, pulls 35 years of NASA POWER weather, NASA soil moisture and global soil data, and grows every crop in every one of those real seasons. It ranks rotations by climate resilience, soil health and fertilizer cost, in plain English. Then it fast-forwards that same field to the 2050s with three NASA climate models and checks whether the plan still holds.
> It's free, works anywhere on Earth, and runs entirely on open NASA data."

## 2-minute demo script

1. **(0:00) Hook.** "This is Champaign County, about two hours from where we're standing." The app opens on it.
2. **(0:15) Headline box.** Read the three NASA facts aloud: more heat, longer season, best rotation.
3. **(0:30) Climate shift tab.** Click *Growing degree days* and point at the significant trend. Then click *Hot days*.
4. **(0:50) Crop reliability tab.** "Each square is one real season. See 2012? Every crop goes red. Our model found that drought on its own." Point out that oats and pea are slipping as the climate warms.
5. **(1:10) Rotation planner.** Show the #1 rotation vs today's corn → soybean and read the plain-language reasons.
6. **(1:25) 2050s.** Click *2050s · high*. "Three NASA climate models fast-forward this exact field. Hot days nearly triple, and our top rotation stays in the top 2 under every model." Point at the impact cards: fertilizer, dollars, CO₂e.
7. **(1:40) Go global.** Click *Córdoba, AR* or *Ukraine steppe*. "Same tool, anywhere on Earth."
8. **(1:50) Close.** "Free, open NASA data, built in 30 hours. AgriHaven."

## Submission checklist (do by 2 h before the deadline)

- [ ] Project page on spaceappschallenge.org: title, team, challenge = *Field Shift*
- [ ] High-level summary (paste the pitch above)
- [ ] **Link to the live demo**: https://agrihaven-nasa.vercel.app, plus **this GitHub repo** (must be public)
- [ ] Demo video or slides, within the length limit on the official submission guide (we target ≤ 30 s video or ≤ 7 slides)
- [ ] List of NASA data and resources used (copy the table from the README)
- [ ] Space agency partner data used (if any) and other data (SoilGrids)
- [ ] Use of AI disclosure (see README)
- [ ] Every team member registered on the Space Apps site and added to the team

## Team split (5 people)

| Who | Today | Tomorrow |
|---|---|---|
| **Atharv** (coder) | Learn `analysis.js` and `crops.js`, test 5–10 locations, tune any crop that looks wrong | Fix bugs, add one stretch feature |
| **Dhishant** (coder) | Learn `app.js`, polish UI, check mobile | Deploy, final polish, record the screen capture |
| **Teammate 3** | Agronomy check: are the crop thresholds and rotations realistic for Illinois? Find 2 extension sources | Validation slide (2012 drought) |
| **Teammate 4** | Write the project page text and slides | Rehearse the pitch 5 times |
| **Teammate 5** | Storyboard the video, interview a farmer or agronomist if you can (huge for Impact) | Edit the 30-second video, submit |

## Stretch ideas (only if time remains)
- Add USDA NASS county yields to show that model scores track real yield losses
- Add a short-season corn variety and double-crop soybeans after wheat
- Spanish / Hindi language toggle (Global Connection)
- Share-a-field link (`?lat=…&lon=…`)
