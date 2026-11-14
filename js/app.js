import { CROPS } from './crops.js';
import {
  parsePower, applyScenario, applyMonthlyDeltas, byYear, climateIndicators, indicatorSummary, INDICATORS, linreg, GOOD,
  heatIndex, heatCategory, waterCertainty, periods
} from './analysis.js';
import { loadColormaps, readPixel, firstValid, decode, datesBack, LAB_LAYERS, radarStats, densityClass, phenology, STAGES, stageDates } from './satlab.js';
import { soilNutrients, nitrogenBudget } from './nutrients.js';
import { loadProjections, nearestSite, SCENARIOS, seasonalSummary } from './projections.js';
import { impact, N_FULL_LB } from './impact.js';
import { ROTATIONS, scoreRotations, explain } from './rotations.js';
import { getPower, getSoil, getSample, getRecent, geocode, suggestPlaces, reverseName, GIBS_LAYERS, gibsUrl, gibsDate, powerUrl, soilUrl } from './api.js';
import { seasonNow } from './now.js';
import { checkAzure, azureStatus, askAgriHaven } from './azure.js';
import { conservation } from './conservation.js';
import { newGame, playSeason, autoPlay, SEASON_COUNT } from './game.js';
import { buildStory, storyStrings } from './story.js';
import { initLanguagePicker, voiceLang, currentLang } from './i18n.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (x, d = 0) => (x === null || Number.isNaN(x) ? '–' : x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));

const PRESETS = [
  { name: 'Champaign Co., IL', lat: 40.2, lon: -88.4 },
  { name: 'Ames, IA', lat: 42.03, lon: -93.62 },
  { name: 'Salina, KS', lat: 38.84, lon: -97.61 },
  { name: 'Fargo, ND', lat: 46.88, lon: -96.79 },
  { name: 'Saskatoon, CA', lat: 52.13, lon: -106.67 },
  { name: 'Córdoba, AR', lat: -31.9, lon: -63.6 },
  { name: 'Ukraine steppe', lat: 48.5, lon: 35.0 }
];
const SAMPLE = { lat: 40.2, lon: -88.4, name: 'Champaign County, Illinois, US (offline sample)' };

const state = {
  lat: null, lon: null, name: '', raw: null, soil: null, powerUrl: null, soilUrl: null,
  custom: [], indicator: 'gdd', tab: 'story', lang: 'en', recent: null, recentErr: false, chart: null, lastResult: null, loadId: 0,
  scenario: 'observed', proj: { sites: {} }, site: null, acres: 500, price: 0.55
};
const projReady = loadProjections().then((p) => { state.proj = p; });

// ---------------- map ----------------
const map = L.map('map', { worldCopyJump: true, zoomControl: false }).setView([28, -40], 3);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics'
}).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 18, opacity: 0.8
}).addTo(map);
const overlays = {};
for (const [key, layer] of Object.entries(GIBS_LAYERS)) {
  overlays[key] = L.tileLayer(gibsUrl(layer), {
    maxNativeZoom: layer.maxNative, maxZoom: 18, opacity: 0.65,
    attribution: 'NASA GIBS / EOSDIS'
  });
  const d = gibsDate(layer);
  const lab = document.createElement('label');
  lab.innerHTML = `<input type="checkbox" data-layer="${key}"> ${esc(layer.label)}${/^\d{4}-\d\d-\d\d$/.test(d) && layer.when !== '2024-01-01' ? ` <span class="muted">(${d})</span>` : ''}`;
  $('#layers').appendChild(lab);
}

// ---------------- season time-lapse (MODIS NDVI) ----------------
const lapse = { layer: null, timer: null, frames: [], i: 0 };
function lapseFrames() {
  const now = new Date();
  const y = now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const out = [];
  for (let d = new Date(Date.UTC(y, 3, 1)); d <= new Date(Date.UTC(y, 9, 31)); d = new Date(d.getTime() + 16 * 86400000)) out.push(d.toISOString().slice(0, 10));
  return out;
}
const LapseCtl = L.Control.extend({
  onAdd() {
    const div = L.DomUtil.create('div', 'lapse');
    div.innerHTML = '<button type="button" id="lapseBtn" title="Watch this season grow from space">▶ Season from space</button><span id="lapseDate"></span>';
    L.DomEvent.disableClickPropagation(div);
    return div;
  }
});
map.addControl(new LapseCtl({ position: 'topright' }));
function lapseStop() {
  clearInterval(lapse.timer); lapse.timer = null;
  if (lapse.layer) { map.removeLayer(lapse.layer); lapse.layer = null; }
  $('#lapseBtn').textContent = '▶ Season from space';
  $('#lapseDate').textContent = '';
}
$('#lapseBtn').onclick = () => {
  if (lapse.timer) { lapseStop(); return; }
  lapse.frames = lapseFrames(); lapse.i = 0;
  const ndvi = GIBS_LAYERS.ndvi;
  lapse.layer = L.tileLayer(gibsUrl(ndvi, lapse.frames[0]), { maxNativeZoom: ndvi.maxNative, maxZoom: 18, opacity: 0.8 }).addTo(map);
  if (map.getZoom() > 9) map.setZoom(9);
  $('#lapseBtn').textContent = '⏹ Stop';
  const show = () => {
    const f = lapse.frames[lapse.i % lapse.frames.length];
    lapse.layer.setUrl(gibsUrl(ndvi, f));
    $('#lapseDate').textContent = `MODIS NDVI · ${new Date(f + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
    lapse.i++;
  };
  show();
  lapse.timer = setInterval(show, 1300);
};
$('#layers').addEventListener('change', (e) => {
  const k = e.target.dataset.layer;
  if (!k) return;
  e.target.checked ? overlays[k].addTo(map) : map.removeLayer(overlays[k]);
});
let marker = null;
map.on('click', (e) => selectLocation(e.latlng.lat, e.latlng.lng));

for (const p of PRESETS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = p.name;
  b.onclick = () => selectLocation(p.lat, p.lon, p.name);
  $('#presets').appendChild(b);
}

// ---------------- search (autocomplete) ----------------
const ac = { items: [], active: -1, timer: null, ctl: null, q: '' };
const searchInput = $('#searchInput'), resultsEl = $('#searchResults');
searchInput.setAttribute('role', 'combobox');
searchInput.setAttribute('aria-autocomplete', 'list');
searchInput.setAttribute('aria-controls', 'searchResults');
searchInput.setAttribute('aria-expanded', 'false');
resultsEl.setAttribute('role', 'listbox');

function presetMatches(q) {
  const ql = q.toLowerCase();
  return PRESETS.filter((p) => p.name.toLowerCase().includes(ql)).map((p) => ({ main: p.name, detail: 'AgriHaven preset', name: p.name, lat: p.lat, lon: p.lon, preset: true }));
}
function hl(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(text) : `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
}
function showSuggestions(items, q, note) {
  ac.items = items; ac.active = items.length ? 0 : -1;
  resultsEl.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
  resultsEl.innerHTML = items.length
    ? items.map((r, i) => `<li role="option" id="ac-${i}" data-i="${i}" aria-selected="${i === ac.active}">
        <span class="ac-ico" aria-hidden="true">${r.preset ? '⭐' : '📍'}</span><span><b>${hl(r.main, q)}</b><small>${esc(r.detail || '')}</small></span></li>`).join('')
    : `<li class="ac-note">${esc(note || 'No places found. Try a town or county name, or click the map.')}</li>`;
  if (ac.active >= 0) searchInput.setAttribute('aria-activedescendant', 'ac-0');
}
function closeSuggestions() {
  resultsEl.hidden = true; ac.items = []; ac.active = -1;
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.removeAttribute('aria-activedescendant');
}
function chooseSuggestion(r) {
  closeSuggestions();
  searchInput.value = r.main;
  searchInput.blur();
  selectLocation(r.lat, r.lon, r.preset ? r.name : r.name);
}
function moveActive(d) {
  if (!ac.items.length) return;
  ac.active = (ac.active + d + ac.items.length) % ac.items.length;
  resultsEl.querySelectorAll('[role=option]').forEach((li, i) => li.setAttribute('aria-selected', i === ac.active));
  searchInput.setAttribute('aria-activedescendant', `ac-${ac.active}`);
  resultsEl.querySelector(`#ac-${ac.active}`)?.scrollIntoView({ block: 'nearest' });
}
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  ac.q = q;
  clearTimeout(ac.timer);
  if (q.length < 2) { closeSuggestions(); return; }
  const local = presetMatches(q);
  showSuggestions(local, q, 'Searching…');
  ac.timer = setTimeout(async () => {
    ac.ctl?.abort();
    ac.ctl = new AbortController();
    try {
      const remote = await suggestPlaces(q, ac.ctl.signal);
      if (ac.q !== q) return;
      showSuggestions([...local, ...remote].slice(0, 7), q);
    } catch (e) {
      if (e.name !== 'AbortError' && ac.q === q) showSuggestions(local, q, 'Suggestions unavailable. Press Enter to search, or click the map.');
    }
  }, 220);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
  else if (e.key === 'Escape') { closeSuggestions(); }
});
resultsEl.addEventListener('mousedown', (e) => {
  const li = e.target.closest('[data-i]');
  if (!li) return;
  e.preventDefault();
  chooseSuggestion(ac.items[+li.dataset.i]);
});
searchInput.addEventListener('blur', () => setTimeout(closeSuggestions, 150));
$('#searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  if (ac.items.length && ac.active >= 0) { chooseSuggestion(ac.items[ac.active]); return; }
  showSuggestions([], q, 'Searching…');
  try {
    const res = await geocode(q);
    if (res.length) chooseSuggestion({ main: res[0].name.split(',')[0], name: res[0].name.split(',').slice(0, 3).join(','), lat: res[0].lat, lon: res[0].lon });
    else showSuggestions([], q);
  } catch {
    showSuggestions([], q, 'Search unavailable. Click the map instead.');
  }
});

// ---------------- controls ----------------
const sliders = [['dT', 'dTOut', (v) => `+${(+v).toFixed(1)} °C`], ['rain', 'rainOut', (v) => `${v > 0 ? '+' : ''}${v}%`],
  ['wClimate', 'wcOut', String], ['wSoil', 'wsOut', String], ['wInputs', 'wiOut', String]];
for (const [id, out, f] of sliders) {
  const el = $('#' + id);
  el.addEventListener('input', () => { $('#' + out).textContent = f(el.value); scheduleRender(); });
}
let renderTimer;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 120); }

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(tab) {
  state.tab = tab;
  document.body.dataset.tab = tab;
  document.querySelectorAll('#bottomNav [data-nav]').forEach((b) => {
    const more = !['map', 'story', 'rotations', 'lab'].includes(tab);
    if (b.dataset.nav === tab || (b.dataset.nav === 'more' && more)) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (tab === 'settings') { window.scrollTo({ top: 0 }); return; }
  document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', x.dataset.tab === tab));
  document.querySelectorAll('.tabpane').forEach((p) => { p.hidden = p.id !== 'tab-' + tab; });
  if (tab === 'climate' && state.lastResult) drawChart();
  if (tab === 'lab') renderLab();
  if (tab === 'compare') renderCompare();
  if (tab === 'map') setTimeout(() => map.invalidateSize(), 30);
}

$('#themeBtn').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('ah-theme', root.dataset.theme); } catch {}
  if (state.lastResult) drawChart();
};
try { const t = localStorage.getItem('ah-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
$('#printBtn').onclick = () => window.print();

// custom rotation builder
const cropOpts = (sel) => '<option value="">—</option>' + Object.entries(CROPS)
  .map(([k, c]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${c.emoji} ${esc(c.name)}</option>`).join('');
const defaults = ['corn', 'soybean', 'wheat', ''];
$('#builder').innerHTML = defaults.map((d, i) => `
  <div class="step"><span class="muted small">Yr ${i + 1}</span>
    <select data-i="${i}" aria-label="Year ${i + 1} crop">${cropOpts(d)}</select>
    <label title="Add cereal rye cover crop after this crop"><input type="checkbox" data-cover="${i}"> 🌱</label>
  </div>`).join('');
$('#addCustom').onclick = () => {
  const steps = [];
  for (let i = 0; i < 4; i++) {
    const c = document.querySelector(`#builder select[data-i="${i}"]`).value;
    if (!c) continue;
    steps.push(c + (document.querySelector(`#builder input[data-cover="${i}"]`).checked ? '+rye' : ''));
  }
  if (!steps.length) return;
  const name = steps.map((s) => CROPS[s.replace('+rye', '')].name.split(' (')[0] + (s.endsWith('+rye') ? ' + rye' : '')).join(' → ');
  state.custom = [{ id: 'custom-' + Date.now(), name, steps, tag: 'Your custom rotation', custom: true }];
  render();
  showTab('rotations');
  document.querySelector('.rot.custom')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ---------------- climate scenario ----------------
function renderScenarioSeg() {
  const site = state.site;
  $('#scenarioSeg').innerHTML = Object.entries(SCENARIOS).map(([k, v]) => {
    const disabled = (k === 'ssp245' || k === 'ssp585') && !site?.[k];
    return `<button type="button" role="radio" aria-checked="${state.scenario === k}" data-sc="${k}" ${disabled ? 'disabled title="NASA projections are precomputed for the preset regions. Use Custom elsewhere."' : ''}>${esc(v.label)}</button>`;
  }).join('');
  $('#customBox').hidden = state.scenario !== 'custom';
  let info = '';
  if (state.scenario === 'observed') info = 'Real NASA POWER daily weather, 1991–2025.';
  else if (state.scenario === 'custom') info = 'Every daily NASA observation is shifted by your sliders, a simple stress test.';
  else if (site?.[state.scenario]) {
    const sm = seasonalSummary(site[state.scenario].mean, state.lat);
    info = `NASA NEX-GDDP-CMIP6 climate models project the <b>2050s</b> for ${esc(site.name)}${site.km > 30 ? ` (${site.km} km away)` : ''}: growing season <b>${sm.dT >= 0 ? '+' : ''}${sm.dT.toFixed(1)} °C</b>, rain <b>${sm.rainPct >= 0 ? '+' : ''}${sm.rainPct.toFixed(0)}%</b>. We apply each model's monthly changes to the observed 35-year record.<br>${Object.keys(site[state.scenario].models).map((m) => `<span class="proj-chip">${esc(m)}</span>`).join('')}`;
  }
  if (!site && state.lat !== null) info += ' <span class="muted">2050s projections are available near the preset regions.</span>';
  $('#scenarioInfo').innerHTML = info;
}
$('#scenarioSeg').addEventListener('click', (e) => {
  const k = e.target.closest('button')?.dataset.sc;
  if (!k || e.target.disabled) return;
  state.scenario = k;
  renderScenarioSeg();
  render();
});

// ---------------- share + toast ----------------
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}
function shareUrl() {
  const u = new URL(location.href);
  u.search = '';
  if (state.lat !== null) {
    u.searchParams.set('lat', state.lat.toFixed(3));
    u.searchParams.set('lon', state.lon.toFixed(3));
    u.searchParams.set('name', state.name);
  }
  if (state.scenario !== 'observed') u.searchParams.set('scenario', state.scenario);
  return u.toString();
}
$('#shareBtn').onclick = async () => {
  const url = shareUrl();
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('Link copied. Anyone can open this field.'); }
  catch { toast('Link is in the address bar. Copy it to share.'); }
};

// ---------------- guided tour ----------------
const TOUR = [
  { sel: '#mapBlock', tab: 'map', title: 'Pick any field on Earth', text: 'Click the map, search a town or use a preset. AgriHaven downloads 35 years of daily NASA POWER weather and SoilGrids soil for that exact point. Toggle NASA satellite layers (MODIS greenness, SMAP soil moisture) to see current conditions.' },
  { sel: '#nowCard', tab: 'story', title: 'Right now on this field', text: 'Live NASA POWER data (about 3 days behind real time) compared with the same dates in every year since 1991, turned into timely advice: plant, wait, irrigate or seed a cover crop.' },
  { sel: '#story', tab: 'story', title: 'The field\'s climate story', text: 'Six chapters, generated from the data: the climate this farm was built for, the year everything went wrong, the new normal, the 2050s and a plan that holds. Switch to Spanish or have it read aloud.' },
  { sel: '#lab', tab: 'lab', title: 'Satellite lab', text: 'Live readings for this exact field, decoded from NASA satellite pixels: near-infrared and heat index, NISAR and Sentinel-1 radar backscatter, NDVI and canopy density, thermal temperature and moisture, soil moisture at three depths, the crop cycle from space, UV index and soil nutrients.' },
  { sel: '#compare', tab: 'compare', title: 'Compare, tradeoffs, risk and uncertainty', text: 'Pick up to three rotations to compare side by side, including Water Certainty Rate, nitrogen, erosion and carbon. See the tradeoff map, and how much outcomes swing today and under three NASA climate models.' },
  { sel: '#game', tab: 'game', title: 'Play the 2050s', text: 'The 2050 Farm Challenge: farm 8 seasons of 2050s weather (real NASA years warmed by NASA climate models), then compare your score and soil health with AgriHaven\'s plan on the same weather.' },
  { sel: '#headline', tab: 'rotations', mtab: 'story', title: 'The NASA story of this field', text: 'Plain-language facts: how much heat, frost-free season, downpours and hot days have changed since 1991, tested for statistical significance.' },
  { sel: '#impact', tab: 'rotations', title: 'What switching is worth', text: 'Fertilizer saved, dollars, greenhouse gas avoided and fewer bad seasons, compared with today\'s corn → soybean. Change the farm size and nitrogen price.' },
  { sel: '#rotations', tab: 'rotations', title: 'Rotations ranked for this field', text: 'Each rotation is scored on climate resilience (every crop grown in every real season), soil health and fertilizer need, and each score comes with plain-English reasons.' },
  { sel: '#scenarioCard', tab: 'rotations', mtab: 'settings', title: 'Fast-forward to the 2050s', text: 'Switch to NASA NEX-GDDP-CMIP6 projections. Three independent climate models shift the real weather record, and we show whether the ranking holds across all of them.' },
  { sel: '#tab-crops', tab: 'crops', title: 'Every crop, every season', text: 'Each square is one real growing season. Red squares line up with real disasters, like the 2012 drought, which the model finds without being told.' },
  { sel: '#tab-climate', tab: 'climate', title: 'The evidence', text: 'Nine indicators, including a FAO-56 water balance, with trend lines, Mann-Kendall p-values and Sen\'s slope. Data sources, method, validation and limitations are in Data & method.' }
];
let tourI = 0;
function tourShow() {
  document.querySelectorAll('.tour-focus').forEach((e) => e.classList.remove('tour-focus'));
  const step = TOUR[tourI];
  showTab(mobileMQ.matches && step.mtab ? step.mtab : step.tab);
  const el = $(step.sel);
  if (el) { el.classList.add('tour-focus'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  $('#tourStep').textContent = `Step ${tourI + 1} of ${TOUR.length}`;
  $('#tourTitle').textContent = step.title;
  $('#tourText').textContent = step.text;
  $('#tourPrev').disabled = tourI === 0;
  $('#tourNext').textContent = tourI === TOUR.length - 1 ? 'Finish' : 'Next';
  $('#tour').hidden = false;
}
function tourEnd() { $('#tour').hidden = true; document.querySelectorAll('.tour-focus').forEach((e) => e.classList.remove('tour-focus')); showTab('rotations'); }
$('#tourBtn').onclick = () => { tourI = 0; tourShow(); };
$('#tourNext').onclick = () => { if (tourI < TOUR.length - 1) { tourI++; tourShow(); } else tourEnd(); };
$('#tourPrev').onclick = () => { if (tourI > 0) { tourI--; tourShow(); } };
$('#tourClose').onclick = tourEnd;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#tour').hidden) tourEnd(); });

// ---------------- loading ----------------
function setStatus(html, err = false) {
  const s = $('#status');
  s.innerHTML = html;
  s.classList.toggle('err', err);
}

// ---------------- phone navigation ----------------
const mobileMQ = matchMedia('(max-width: 760px)');
function openSheet() { $('#moreSheet').hidden = false; $('#sheetBackdrop').hidden = false; $('#moreSheet button').focus(); }
function closeSheet() { $('#moreSheet').hidden = true; $('#sheetBackdrop').hidden = true; }
$('#bottomNav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-nav]');
  if (!b) return;
  if (b.dataset.nav === 'more') { openSheet(); return; }
  showTab(b.dataset.nav);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#moreSheet').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  closeSheet();
  if (b.dataset.go) { showTab(b.dataset.go); window.scrollTo({ top: 0 }); }
  else if (b.dataset.act === 'tour') $('#tourBtn').click();
  else if (b.dataset.act === 'share') $('#shareBtn').click();
  else if (b.dataset.act === 'print') $('#printBtn').click();
  else if (b.dataset.act === 'theme') $('#themeBtn').click();
});
$('#sheetClose').onclick = closeSheet;
$('#sheetBackdrop').onclick = closeSheet;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#moreSheet').hidden) closeSheet(); });
$('#fieldChip').onclick = () => { showTab('map'); window.scrollTo({ top: 0 }); };
if (mobileMQ.matches) document.querySelector('.layerbox')?.removeAttribute('open');

// ---------------- Microsoft Azure ----------------
function updateAzureUI() {
  const st = azureStatus();
  const sv = st.services || {};
  const on = st.ok;
  $('#azureFoot').innerHTML = '';
  $('#askCard').hidden = !(on && sv.openai);
  if (state.lastResult) renderMethod(state.lastResult.rows);
}
checkAzure().then(updateAzureUI);

const ASK_CHIPS = {
  en: ['Which rotation should I choose, and why?', 'How risky is corn → soybean here by the 2050s?', 'Should I plant a cover crop this fall?', 'What does my soil need most?'],
  es: ['¿Qué rotación me conviene más y por qué?', '¿Qué tan arriesgado es maíz → soja aquí en 2050?', '¿Debo sembrar un cultivo de cobertura este otoño?']
};
function renderAskChips() {
  const chips = [...ASK_CHIPS.en.slice(0, 3), ASK_CHIPS.es[0]];
  $('#askChips').innerHTML = chips.map((q) => `<button type="button">${esc(q)}</button>`).join('');
}
$('#askChips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { $('#askInput').value = b.textContent; ask(b.textContent); } });
$('#askForm').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#askInput').value.trim(); if (q) ask(q); });
renderAskChips();

/** Compact, NASA-derived summary of the current field, sent to Azure OpenAI as grounding. */
function fieldContext() {
  const lr = state.lastResult;
  if (!lr) return null;
  const r = lr.obsResult;
  const round = (x, d = 1) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
  const { recent } = periods([...lr.years.keys()]);
  const n = state.recent ? seasonNow(state.recent, lr.obs, state.lat) : null;
  const site = state.site?.ssp245, site5 = state.site?.ssp585;
  return {
    field: state.name, lat: round(state.lat, 3), lon: round(state.lon, 3),
    dataSources: 'NASA POWER daily 1991-2025, NASA NEX-GDDP-CMIP6, NASA MODIS/SMAP/NISAR, ISRIC SoilGrids',
    soil: state.soil ? { texture: state.soil.texture, pH: round(state.soil.ph), organicCarbon_gkg: round(state.soil.soc, 0), plantAvailableWater_mm: state.soil.awc, nitrogenSupply_lbPerAcre: round(soilNutrients(state.soil)?.supplyLbAc, 0) } : null,
    climateShift_1991to2005_vs_2011to2025: lr.obsSummary.map((x) => ({ indicator: x.label, unit: x.unit, before: round(x.base), recent: round(x.recent), significantTrend: x.mk.p < 0.05 })),
    rotations: r.scored.slice(0, 6).map((x) => ({
      name: x.name, overallScore: round(x.total, 0), climateResilience: round(x.climate, 0), soilHealth: round(x.soil.score, 0),
      fertilizerN_lbPerAcrePerYear: round(nitrogenBudget(x.steps, soilNutrients(state.soil)).fertilizer, 0),
      waterCertaintyRate_pct: round(waterRateFor(x, lr), 0), soilLoss_tPerAcrePerYear: round(r.cons?.byId?.[x.id]?.lossTAc),
      poorSeasonsOf15: x.badYears.length
    })),
    cropReliability_goodSeasonsPct: Object.fromEntries(Object.entries(r.rel).map(([k, v]) => [v.crop.name, { before: round(v.base.goodPct, 0), recent: round(v.recent.goodPct, 0), mainRisk: v.mainStress }])),
    future2050s: site ? { moderate: seasonalSummary(site.mean, state.lat), high: site5 ? seasonalSummary(site5.mean, state.lat) : null, models: Object.keys(site.models) } : 'not precomputed for this region',
    rightNow: n ? { asOf: n.asOf, rainLast30d_mm: round(n.rain30, 0), rainPercentile: n.rainPct, soilWetnessPercentile: n.wetPct, temperaturePercentile: n.tempPct, advice: n.advice } : null,
    farm: { acres: state.acres, nitrogenPrice_perLb: state.price },
    recentYearsAnalyzed: `${recent[0]}-${recent[recent.length - 1]}`
  };
}

async function ask(question) {
  const out = $('#askAnswer');
  const lang = /[¿¡ñáéíóú]|\b(qué|cómo|debo|mi|rotación|suelo)\b/i.test(question) ? 'es' : state.lang;
  out.innerHTML = `<div class="q">${esc(question)}</div><span class="spinner"></span>Thinking with Azure OpenAI…`;
  try {
    const r = await askAgriHaven(question, fieldContext(), lang);
    out.innerHTML = `<div class="q">${esc(question)}</div>${esc(r.answer)}<div class="meta">Answered by Azure OpenAI (${esc(r.model || 'gpt-4o-mini')}) using only this field's NASA-derived data. Decision support, not a guarantee.</div>`;
  } catch (e) {
    out.innerHTML = `<div class="q">${esc(question)}</div>⚠️ ${esc(e.message)}`;
  }
}

// ---------------- loading screen ----------------
const LOAD_STEPS = [
  ['power', '🌦️', '35 years of NASA POWER daily weather', '12 variables × 12,775 days, 1991–2025'],
  ['soil', '🟤', 'Soil profile to 1 metre', 'ISRIC SoilGrids: texture, carbon, nitrogen, pH'],
  ['proj', '🔭', 'NASA climate projections for the 2050s', 'NEX-GDDP-CMIP6, 3 climate models'],
  ['model', '🧮', 'Growing 10 crops in every season', 'Heat, water, frost and soil checks × 35 years'],
  ['place', '📍', 'Naming your field', 'OpenStreetMap']
];
const FACTS = [
  'NASA POWER blends satellite observations and the MERRA-2 reanalysis into daily weather for any point on Earth.',
  'Healthy crops reflect strongly in near-infrared light (750–1400 nm). That is how NDVI "sees" plant health from space.',
  'NASA-ISRO NISAR radar can see the ground through clouds, day or night.',
  'Cover crops can cut soil erosion by about 40% and add roughly 0.3 tonnes of carbon per hectare each year.',
  'In 2012, central Illinois had more than 50 summer days above 32 °C, and corn yields fell by over a third.',
  'SMAP measures soil moisture from 685 km up using microwave emissions from the ground.'
];
const loader = { timer: null, steps: {} };
function loaderShow(place) {
  const el = $('#loader');
  $('#loaderTitle').textContent = "Building your field's NASA profile";
  $('#loaderPlace').textContent = place || 'Locating your field…';
  $('#loaderSteps').innerHTML = LOAD_STEPS.map(([k, ic, t, sub]) => `<li data-k="${k}" class="run"><span class="st" aria-hidden="true"></span><span>${ic} ${esc(t)}<small>${esc(sub)}</small></span></li>`).join('');
  $('#loaderActions').innerHTML = '';
  loader.steps = {};
  loaderProgress();
  let f = Math.floor(Math.random() * FACTS.length);
  $('#loaderFact').textContent = '💡 ' + FACTS[f];
  clearInterval(loader.timer);
  loader.timer = setInterval(() => { f = (f + 1) % FACTS.length; $('#loaderFact').textContent = '💡 ' + FACTS[f]; }, 3500);
  el.hidden = false;
  document.body.style.overflow = 'hidden';
}
function loaderStep(k, ok = true, note) {
  loader.steps[k] = ok;
  const li = document.querySelector(`#loaderSteps [data-k="${k}"]`);
  if (!li) return;
  li.className = ok ? 'done' : 'fail';
  li.querySelector('.st').textContent = ok ? '✓' : '!';
  if (note) li.querySelector('small').textContent = note;
  loaderProgress();
}
function loaderProgress() {
  const pct = Math.round((100 * Object.keys(loader.steps).length) / LOAD_STEPS.length);
  $('#loaderBar').setAttribute('aria-valuenow', pct);
  $('#loaderBar div').style.width = Math.max(6, pct) + '%';
}
function loaderHide() {
  clearInterval(loader.timer);
  $('#loader').hidden = true;
  document.body.style.overflow = '';
}

// ---------------- landing → dashboard ----------------
function enterDashboard() {
  const first = !document.body.classList.contains('picked');
  if (!first) return;
  document.body.classList.add('picked');
  $('#landing').hidden = true;
  $('#dashboard').hidden = false;
  $('#mapTabSlot').appendChild($('#mapBlock'));
  $('#pickTitle').textContent = '📍 Change field';
  $('#pickHint').textContent = 'Click the map or search to load a different field. NASA layers and the season time-lapse are here too.';
  showTab('story');
  setTimeout(() => map.invalidateSize(), 50);
}
$('#changeField').onclick = () => { showTab('map'); $('#tab-map').scrollIntoView({ behavior: 'smooth', block: 'start' }); };

async function selectLocation(lat, lon, name) {
  lon = ((lon + 540) % 360) - 180;
  const id = ++state.loadId;
  const fromMapTab = document.body.classList.contains('picked') && state.tab === 'map';
  enterDashboard();
  if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], Math.max(map.getZoom(), 7));
  $('#locLabel').textContent = `${name || 'Selected field'} · ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
  setStatus('');
  loaderShow(name);
  try {
    const [power, soil, place] = await Promise.all([
      getPower(lat, lon).then((r) => { loaderStep('power'); return r; }),
      getSoil(lat, lon).then((r) => { loaderStep('soil', true, r ? `${r.texture}, pH ${r.ph?.toFixed(1)}` : 'Not mapped here: using typical soil'); return r; }),
      (name ? Promise.resolve(null) : reverseName(lat, lon)).then((r) => { loaderStep('place', true, r || name || 'Selected field'); if (r) $('#loaderPlace').textContent = r; return r; })
    ]);
    if (id !== state.loadId) return;
    await projReady;
    const site = nearestSite(state.proj, lat, lon);
    loaderStep('proj', true, site ? `${site.name}: 3 models ready` : 'Not precomputed here: custom what-if available');
    await new Promise((r) => setTimeout(r, 60)); // let the screen paint
    Object.assign(state, { lat, lon, raw: power.json, soil, powerUrl: power.url, soilUrl: soilUrl(lat, lon), name: name || place || 'Selected field' });
    updateSite();
    $('#locLabel').textContent = `${state.name} · ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
    $('#fieldChipName').textContent = state.name.split(',')[0];
    setStatus('');
    state.recent = null; state.recentErr = false;
    render();
    loaderStep('model', true, 'Done');
    setTimeout(loaderHide, 450);
    if (fromMapTab) toast(`NASA data loaded for ${state.name}. Open 📖 Field story to explore.`);
    getRecent(lat, lon).then((j) => { if (id === state.loadId) { state.recent = j; renderNow(); } })
      .catch(() => { if (id === state.loadId) { state.recentErr = true; renderNow(); } });
  } catch (e) {
    if (id !== state.loadId) return;
    console.error(e);
    loaderStep('power', false, `NASA POWER didn't respond (${e.message})`);
    $('#loaderTitle').textContent = "Couldn't reach NASA right now";
    $('#loaderActions').innerHTML = '<button type="button" id="useSample">Use offline sample (Champaign, IL)</button><button type="button" class="ghost" id="loaderRetry">Try again</button><button type="button" class="ghost" id="loaderBack">Back to the map</button>';
    clearInterval(loader.timer);
    $('#useSample').onclick = loadSample;
    $('#loaderRetry').onclick = () => selectLocation(lat, lon, name);
    $('#loaderBack').onclick = () => { loaderHide(); showTab('map'); };
    setStatus(`⚠️ Couldn't reach NASA POWER (${esc(e.message)}). <button type="button" id="useSample2">Use offline sample (Champaign, IL)</button>`, true);
    $('#useSample2').onclick = loadSample;
  }
}

async function loadSample() {
  enterDashboard();
  loaderShow(SAMPLE.name);
  ['power', 'soil', 'proj', 'place'].forEach((k) => loaderStep(k, true, 'Bundled offline sample'));
  const s = await getSample();
  Object.assign(state, { lat: SAMPLE.lat, lon: SAMPLE.lon, raw: s.power, soil: s.soil, name: SAMPLE.name,
    powerUrl: powerUrl(SAMPLE.lat, SAMPLE.lon, 1991, 2025), soilUrl: soilUrl(SAMPLE.lat, SAMPLE.lon) });
  await projReady;
  updateSite();
  if (marker) marker.setLatLng([SAMPLE.lat, SAMPLE.lon]); else marker = L.marker([SAMPLE.lat, SAMPLE.lon]).addTo(map);
  map.setView([SAMPLE.lat, SAMPLE.lon], 7);
  $('#locLabel').textContent = SAMPLE.name;
  $('#fieldChipName').textContent = 'Champaign County';
  setStatus('');
  loaderStep('model', true);
  setTimeout(loaderHide, 450);
  state.recent = null; state.recentErr = false;
  render();
  getRecent(SAMPLE.lat, SAMPLE.lon).then((j) => { state.recent = j; renderNow(); }).catch(() => { state.recentErr = true; renderNow(); });
}

function updateSite() {
  state.site = nearestSite(state.proj, state.lat, state.lon);
  if ((state.scenario === 'ssp245' || state.scenario === 'ssp585') && !state.site?.[state.scenario]) state.scenario = 'observed';
  renderScenarioSeg();
}

// ---------------- render ----------------
let parsedCache = { raw: null, days: null };
function render() {
  if (!state.raw) return;
  if (parsedCache.raw !== state.raw) parsedCache = { raw: state.raw, days: parsePower(state.raw, state.lat) };
  const obs = parsedCache.days;
  const sc = state.scenario;
  const proj = (sc === 'ssp245' || sc === 'ssp585') ? state.site?.[sc] : null;
  const dT = sc === 'custom' ? +$('#dT').value : 0, rain = sc === 'custom' ? +$('#rain').value : 0;
  const days = proj ? applyMonthlyDeltas(obs, proj.mean) : applyScenario(obs, dT, rain);
  const years = byYear(days);
  const rows = climateIndicators(years);
  const summary = indicatorSummary(rows);
  const weights = { climate: +$('#wClimate').value, soil: +$('#wSoil').value, inputs: +$('#wInputs').value };
  const list = [...ROTATIONS, ...state.custom];
  const result = scoreRotations(years, state.soil, weights, list);
  result.cons = conservation(result.scored, years, state.soil);
  // Robustness: re-rank under each climate model separately.
  result.robust = null;
  if (proj) {
    const ranks = {};
    for (const [model, delta] of Object.entries(proj.models)) {
      const r = scoreRotations(byYear(applyMonthlyDeltas(obs, delta)), state.soil, weights, list);
      r.scored.forEach((x, i) => { (ranks[x.id] ||= []).push(i + 1); });
    }
    result.robust = { ranks, n: Object.keys(proj.models).length };
  }
  // Observed-climate scores of the same rotations, to show how the future changes them.
  result.observedTotals = null;
  const obsYears = sc === 'observed' ? years : byYear(obs);
  const obsResult = sc === 'observed' ? result : scoreRotations(obsYears, state.soil, weights, list);
  if (sc !== 'observed') result.observedTotals = Object.fromEntries(obsResult.scored.map((x) => [x.id, x.total]));
  const obsRows = sc === 'observed' ? rows : climateIndicators(obsYears);
  const obsSummary = sc === 'observed' ? summary : indicatorSummary(obsRows);
  state.lastResult = { rows, summary, obsSummary, obsRows, obsResult, result, years, dT, rain, proj, sc, obs, weights, list };
  renderSoil();
  renderHeadline(summary, result, dT, rain);
  renderImpact(result);
  renderRotations(result);
  renderIndicators(summary);
  renderCrops(result);
  renderMethod(rows);
  renderStory();
  renderNow();
  if (!game.g) renderGame();
  if (state.tab === 'compare') renderCompare();
  if (state.tab === 'lab') renderLab();
  if (state.tab === 'climate') drawChart();
}

// ---------------- field story ----------------
let futureCache = { key: null, val: null };
function futureFor(lr) {
  const site = state.site?.ssp245;
  if (!site) return null;
  const key = `${state.lat},${state.lon},${JSON.stringify(lr.weights)},${lr.list.length},${state.soil?.awc}`;
  if (futureCache.key === key) return futureCache.val;
  const futRows = climateIndicators(byYear(applyMonthlyDeltas(lr.obs, site.mean)));
  const fs = indicatorSummary(futRows).find((x) => x.key === 'hotDays');
  const ranks = {};
  for (const delta of Object.values(site.models)) {
    scoreRotations(byYear(applyMonthlyDeltas(lr.obs, delta)), state.soil, lr.weights, lr.list).scored
      .forEach((x, i) => { (ranks[x.id] ||= []).push(i + 1); });
  }
  const sm = seasonalSummary(site.mean, state.lat);
  futureCache = { key, val: { dT: sm.dT, rainPct: sm.rainPct, hotDays: fs.recent, ranks } };
  return futureCache.val;
}

function renderStory() {
  const lr = state.lastResult;
  if (!lr) return;
  const r = lr.obsResult;
  const base = r.scored.find((x) => x.id === 'cs');
  const top = r.scored[0].id === 'cs' ? r.scored[1] : r.scored[0];
  const future = futureFor(lr);
  const rk = future?.ranks?.[top.id];
  const chapters = buildStory({
    lang: state.lang, name: state.name, soil: state.soil, rows: lr.obsRows, summary: lr.obsSummary, rel: r.rel,
    top, base, impact: impact(top, base, state.acres, state.price), acres: state.acres,
    future, robust: rk ? [Math.min(...rk), Math.max(...rk)] : null
  });
  const L = storyStrings(state.lang);
  $('#story').innerHTML = chapters.map((c, i) => `
    <article class="chapter" data-i="${i}">
      <div class="ic" aria-hidden="true">${c.icon}</div>
      <div><div class="n">${state.lang === 'es' ? 'Capítulo' : 'Chapter'} ${i + 1}</div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p>${c.chart || ''}</div>
      <div class="bigstat"><b>${esc(c.big)}</b><span>${esc(c.bigLabel)}</span></div>
    </article>`).join('');
  $('#langBtn').textContent = L.lang;
  $('#storyCta').textContent = L.cta;
  if (!speaking) $('#readBtn').textContent = L.read;
}
$('#langBtn').onclick = () => { stopSpeech(); state.lang = state.lang === 'en' ? 'es' : 'en'; renderStory(); };
// Site language (header picker). The field story has its own hand-written Spanish;
// for every other language the whole page is translated, so the story stays in English underneath.
function syncSiteLang(lang) {
  const site = lang !== 'en';
  $('#langBtn').hidden = site;
  if (site && state.lang !== 'en') { stopSpeech(); state.lang = 'en'; if ($('#story').children.length) renderStory(); }
}
document.addEventListener('agri:lang', (e) => syncSiteLang(e.detail));
syncSiteLang(currentLang());
initLanguagePicker();
$('#storyCta').onclick = () => { showTab('rotations'); $('#tab-rotations').scrollIntoView({ behavior: 'smooth', block: 'start' }); };

// read aloud (Web Speech API)
let speaking = false;
function stopSpeech() {
  speaking = false;
  try { speechSynthesis.cancel(); } catch {}
  document.querySelectorAll('.chapter.speaking').forEach((e) => e.classList.remove('speaking'));
  $('#readBtn').textContent = storyStrings(state.lang).read;
}
$('#readBtn').onclick = () => {
  if (!('speechSynthesis' in window)) { toast('Read-aloud is not supported in this browser.'); return; }
  if (speaking) { stopSpeech(); return; }
  speaking = true;
  $('#readBtn').textContent = storyStrings(state.lang).stop;
  const els = [...document.querySelectorAll('.chapter')];
  let i = 0;
  const next = () => {
    document.querySelectorAll('.chapter.speaking').forEach((e) => e.classList.remove('speaking'));
    if (!speaking || i >= els.length) { stopSpeech(); return; }
    const el = els[i++];
    el.classList.add('speaking');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const u = new SpeechSynthesisUtterance(`${el.querySelector('h3').textContent}. ${el.querySelector('p').textContent}`);
    u.lang = state.lang === 'es' ? 'es-ES' : voiceLang();
    u.rate = 1.02;
    u.onend = next;
    u.onerror = next;
    speechSynthesis.speak(u);
  };
  next();
};

// ---------------- right now (near-real-time NASA POWER) ----------------
function renderNow() {
  const el = $('#nowCard');
  if (state.recentErr) { el.innerHTML = '<p class="muted small">📡 Live season check unavailable right now (NASA POWER near-real-time service did not respond).</p>'; return; }
  if (!state.recent || !state.lastResult) { el.innerHTML = '<p class="muted small"><span class="spinner"></span>Checking this season against 35 years of NASA data…</p>'; return; }
  const n = seasonNow(state.recent, state.lastResult.obs, state.lat);
  if (!n) { el.innerHTML = ''; return; }
  const gauge = (label, val, normal, p, unit, dec = 0, lo = 'dry', hi = 'wet') => `
    <div class="gauge"><span>${label}</span><b>${fmt(val, dec)} ${unit} <span class="muted small">(normal ${fmt(normal, dec)})</span></b>
      <div class="track"><div class="dot" style="left:${p ?? 50}%"></div></div>
      <div class="scale"><span>${lo}</span><span><b>${p === null ? '' : p >= 100 ? 'record high' : p <= 0 ? 'record low' : p + 'th pct'}</b></span><span>${hi}</span></div></div>`;
  el.innerHTML = `
    <h2>📡 Right now on this field <small>NASA POWER near-real-time, through ${esc(n.asOf)}, compared with the same dates in ${n.nYears} years</small></h2>
    <div class="gauges">
      ${gauge('Rain, last 30 days', n.rain30, n.rainNormal, n.rainPct, 'mm')}
      ${gauge('Root-zone soil wetness', n.wet7, n.wetNormal, n.wetPct, '', 2)}
      ${gauge('Temperature, last 30 days', n.temp, n.tempNormal, n.tempPct, '°C', 1, 'cool', 'warm')}
    </div>
    <ul>${n.advice.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`;
}

// ---------------- 2050 Farm Challenge (game) ----------------
const game = { g: null, pick: 'corn', cover: false, key: null };
function gameYears() {
  const lr = state.lastResult;
  if (!lr) return null;
  const site = state.site?.ssp245;
  return { years: byYear(site ? applyMonthlyDeltas(lr.obs, site.mean) : applyScenario(lr.obs, 1.5, -5)), projected: !!site };
}
function renderGame() {
  const el = $('#game');
  const lr = state.lastResult;
  if (!lr) { el.innerHTML = ''; return; }
  const key = `${state.lat},${state.lon}`;
  if (game.key !== key) { game.g = null; game.key = key; }
  const g = game.g;
  if (!g) {
    el.innerHTML = `<div class="card"><h2>🎮 The 2050 Farm Challenge</h2>
      <p>It's the 2050s on <b>${esc(state.name)}</b>. You farm it for <b>${SEASON_COUNT} seasons</b>. Each season's weather is a real NASA-observed year from this field, warmed by ${gameYears()?.projected ? 'NASA NEX-GDDP-CMIP6 climate models' : '+1.5 °C'}. You won't know the weather until harvest, just like real farming.</p>
      <p class="muted small">Pick a crop each season. Repeating a crop builds up pests, legumes leave nitrogen for the next crop, and cover crops protect the soil from downpours. Soil health feeds back into your harvests. At the end, see how you compare with AgriHaven's recommended plan on the exact same weather.</p>
      <button type="button" id="gameStart">Start farming →</button></div>`;
    $('#gameStart').onclick = () => { const gy = gameYears(); game.g = newGame(gy.years); game.pick = 'corn'; game.cover = false; renderGame(); };
    return;
  }
  const meters = `<div class="meters">
    <div class="meter">Season<b>${Math.min(g.i + 1, SEASON_COUNT)} / ${SEASON_COUNT}</b></div>
    <div class="meter">Harvest points<b>${g.points}</b></div>
    <div class="meter">Soil health<b style="color:${g.soil >= 60 ? 'var(--good)' : g.soil >= 35 ? 'var(--mid)' : 'var(--bad)'}">${g.soil}/100</b></div></div>`;
  const log = `<ul class="log">${[...g.history].reverse().map((h) => `<li><b class="s">${h.score}/100 · +${h.pts} pts</b>
      <b>Season ${h.season}</b>: ${CROPS[h.crop].emoji} ${esc(CROPS[h.crop].name)}${h.cover ? ' + 🌱 rye' : ''}<br>
      <span class="muted small">Weather (based on ${h.year}, 2050s-warmed): ${h.weather.hot} hot days, ${h.weather.rain} mm growing-season rain.</span>
      ${h.stresses.length ? `<br><span class="small">⚠️ ${esc(h.stresses.slice(0, 2).map((x) => x.text).join('; '))}</span>` : '<br><span class="small">✅ Great season, no major stress.</span>'}
      ${h.notes.map((n) => `<br><span class="small">${esc(n)}</span>`).join('')}
      <br><span class="small muted">Soil ${h.dSoil >= 0 ? '+' : ''}${h.dSoil} → ${h.soil}/100</span></li>`).join('')}</ul>`;
  if (g.i < SEASON_COUNT) {
    el.innerHTML = `<div class="card"><h2>🎮 Season ${g.i + 1}: what will you plant?</h2>${meters}
      <div class="picks">${Object.entries(CROPS).map(([k, c]) => `<button type="button" data-crop="${k}" aria-pressed="${game.pick === k}">${c.emoji} ${esc(c.name)}</button>`).join('')}</div>
      <label><input type="checkbox" id="gameCover" ${game.cover ? 'checked' : ''}> 🌱 Plant a cereal rye cover crop after harvest</label>
      <p class="small muted">${esc(CROPS[game.pick].note)}</p>
      <button type="button" id="gamePlant">Plant ${esc(CROPS[game.pick].name)} →</button></div>${log}`;
    el.querySelectorAll('[data-crop]').forEach((b) => { b.onclick = () => { game.pick = b.dataset.crop; renderGame(); }; });
    $('#gameCover').onchange = (e) => { game.cover = e.target.checked; };
    $('#gamePlant').onclick = () => { playSeason(g, { crop: game.pick, cover: game.cover }, state.soil); renderGame(); };
    return;
  }
  // Final: compare with AgriHaven's plan and today's default on the same weather
  const r = scoreRotations(g.years, state.soil, lr.weights, lr.list);
  const top = r.scored[0];
  const ai = autoPlay(g.years, g.seq, top.steps, state.soil);
  const cs = autoPlay(g.years, g.seq, ['corn', 'soybean'], state.soil);
  const best = Math.max(g.points, ai.points, cs.points);
  const verdict = g.points >= ai.points ? '🏆 You beat AgriHaven\'s plan!' : g.points >= cs.points ? '👍 You beat corn → soybean, but AgriHaven\'s plan did better.' : '🌱 The 2050s were tough. Try mixing in legumes and cover crops.';
  el.innerHTML = `<div class="card final"><h2>${verdict}</h2>
    <div class="vs">
      <div class="${g.points === best ? 'win' : ''}">You<b>${g.points}</b><span class="small">soil ${g.soil}/100</span></div>
      <div class="${ai.points === best ? 'win' : ''}">AgriHaven plan<br><span class="small">${esc(top.name)}</span><b>${ai.points}</b><span class="small">soil ${ai.soil}/100</span></div>
      <div class="${cs.points === best ? 'win' : ''}">Corn → Soybean<b>${cs.points}</b><span class="small">soil ${cs.soil}/100</span></div>
    </div>
    <p class="small muted">Same ${SEASON_COUNT} seasons of 2050s weather for everyone (challenge #${g.seed}). Harvest points are a game simplification: the crop outcome score × a relative crop value × a soil-health bonus.</p>
    <button type="button" id="gameAgain">Play again</button></div>${log}`;
  $('#gameAgain').onclick = () => { game.g = null; renderGame(); };
}

// ---------------- Satellite lab (research data, read from NASA imagery) ----------------
const lab = { key: null, busy: false, data: null };
const pctFmt = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const isoDay = (d) => d.toISOString().slice(0, 10);

function waterRateFor(r, lr) {
  const { recent } = periods([...lr.years.keys()]);
  const crops = [...new Set(r.parsed.map((p) => p.crop))];
  const rates = crops.map((k) => waterCertainty(k, lr.years, state.soil, recent).rate).filter((x) => x != null);
  return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
}

function briefCard(lr) {
  const S = (k) => lr.obsSummary.find((x) => x.key === k);
  const r = lr.obsResult;
  const top = r.scored[0], cs = r.scored.find((x) => x.id === 'cs');
  const nut = soilNutrients(state.soil);
  const rad = lab.data?.radar;
  return `<div class="brief">
    <div><h4>🎯 Mission</h4><ul>
      <li><b>Compare rotations</b>: Rotation planner, Compare &amp; risk</li>
      <li><b>Reveal tradeoffs</b>: tradeoff map in Compare &amp; risk</li>
      <li><b>Understand risk</b>: poor-season odds, worst year, Water Certainty Rate</li>
      <li><b>Make uncertainty visible</b>: 10–90 % ranges, 3 climate models</li></ul></div>
    <div><h4>🌾 Factors that affect farming</h4><ul>
      <li><b>Radar analysis</b>: ${rad ? `texture ${rad.texture.toFixed(2)} (${esc(rad.sensor)})` : 'see card 2'}</li>
      <li><b>Heat shifts</b>: +${fmt(S('gdd').delta)} degree-days, hot nights ${fmt(S('hotNights').base, 1)} → ${fmt(S('hotNights').recent, 1)}</li>
      <li><b>Rainfall changes</b>: ${fmt(S('gsRain').base)} → ${fmt(S('gsRain').recent)} mm/season, downpours ${fmt(S('springDeluge').base, 1)} → ${fmt(S('springDeluge').recent, 1)}</li>
      <li><b>Water Certainty Rate</b>: ${fmt(waterRateFor(top, lr))}% (${esc(top.name.split(' → ')[0])}…) vs ${fmt(waterRateFor(cs, lr))}% (corn → soybean)</li>
      <li><b>Soil ↔ nutrients</b>: ${nut ? `${fmt(nut.supplyLbAc)} lb N/ac/yr from soil, pH ${fmt(nut.ph, 1)} (${nut.phBand}), CEC ${nut.cecClass}` : 'needs soil data'}</li></ul></div>
  </div>`;
}

async function renderLab() {
  const el = $('#lab');
  const lr = state.lastResult;
  if (!lr) { el.innerHTML = ''; return; }
  const key = `${state.lat},${state.lon}`;
  if (lab.key === key && lab.data) { drawLab(); return; }
  if (lab.busy && lab.key === key) return;
  lab.key = key; lab.busy = true; lab.data = null;
  el.innerHTML = `${briefCard(lr)}<p class="muted"><span class="spinner"></span>Reading NASA satellite imagery for this exact field (MODIS, SMAP, NISAR, Sentinel-1/OPERA)…</p>`;
  const cm = await loadColormaps();
  const { lat, lon } = state;
  const today = new Date();
  const peakY = today.getUTCMonth() >= 8 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  const peakEnd = new Date(Date.UTC(peakY, 7, 5));
  const seasonDates = [];
  for (let d = new Date(Date.UTC(peakY, 3, 1)); d <= new Date(Date.UTC(peakY, 9, 31)); d = new Date(d.getTime() + 16 * 86400000)) seasonDates.push(isoDay(d));
  const [ndviNow, ndviSeason, nir, lst, smap, nisar, opera] = await Promise.all([
    firstValid(LAB_LAYERS.ndvi, datesBack(today, 30, 2), lat, lon),
    Promise.all(seasonDates.map((d) => readPixel(LAB_LAYERS.ndvi, d, lat, lon))),
    firstValid(LAB_LAYERS.nir, datesBack(peakEnd, 20, 1), lat, lon),
    firstValid(LAB_LAYERS.lst, datesBack(today, 24, 1), lat, lon),
    firstValid(LAB_LAYERS.smap, datesBack(today, 8, 1), lat, lon),
    firstValid(LAB_LAYERS.nisar, datesBack(today, 60, 1), lat, lon, { win: 6 }),
    firstValid(LAB_LAYERS.opera, datesBack(today, 45, 1), lat, lon, { win: 6 })
  ]);
  if (lab.key !== key) return;
  const series = seasonDates.map((d, i) => ({ date: d, v: ndviSeason[i] ? decode(cm.ndvi, ndviSeason[i].rgba) : null }));
  const radarPx = nisar || opera;
  lab.data = {
    ndviNow: ndviNow && { ...ndviNow, v: decode(cm.ndvi, ndviNow.rgba) },
    ndviPeak: ndviSeason.map((p, i) => p && { ...p, v: series[i].v }).filter(Boolean).sort((a, b) => b.v - a.v)[0] || null,
    series, pheno: phenology(series), nir,
    lst: lst && { ...lst, c: decode(cm.lst, lst.rgba) != null ? decode(cm.lst, lst.rgba) - 273.15 : null },
    smap: smap && { ...smap, v: decode(cm.smap, smap.rgba) },
    nisar: nisar && { ...nisar, ...radarStats(nisar) }, opera: opera && { ...opera, ...radarStats(opera) },
    radar: radarPx ? { ...radarStats(radarPx), sensor: nisar ? 'NISAR L-band' : 'Sentinel-1 C-band' } : null,
    peakY
  };
  lab.busy = false;
  if (state.tab === 'lab') drawLab();
}

function drawLab() {
  const lr = state.lastResult, D = lab.data;
  if (!lr || !D) return;
  const recent = state.recent ? parsePower(state.recent, state.lat).filter((d) => d.wet !== null) : [];
  const last = recent[recent.length - 1];
  const last30 = recent.slice(-30);
  // heat index (using daily max temperature and mean humidity: an upper-end estimate)
  const hiNow = last && last.rh != null ? heatIndex(last.tmax, last.rh) : null;
  const obs = lr.obs;
  const summerHI = (y0, y1) => {
    const ys = obs.filter((d) => d.y >= y0 && d.y <= y1 && d.m >= 6 && d.m <= 8 && d.rh != null);
    return ys.filter((d) => heatIndex(d.tmax, d.rh) >= 32).length / (y1 - y0 + 1);
  };
  const yrs = [...lr.years.keys()];
  const yLast = Math.max(...yrs);
  const hiBase = summerHI(yrs[0], yrs[0] + 14), hiRecent = summerHI(yLast - 14, yLast);
  // UV
  const uvMean = (arr) => { const v = arr.filter((d) => d.uv != null).map((d) => d.uv); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  // NASA's CERES UV lags real time by a few months: use the latest 30 valid days available.
  const uvRecent = recent.filter((d) => d.uv != null);
  const uvSrc = uvRecent.length >= 10 ? uvRecent.slice(-30) : obs.filter((d) => d.uv != null).slice(-30);
  const uvNow = uvMean(uvSrc);
  const uvTo = uvSrc.length ? uvSrc[uvSrc.length - 1] : null;
  const uvLabel = uvTo ? `30 days to ${uvTo.y}-${String(uvTo.m).padStart(2, '0')}-${String(uvTo.d).padStart(2, '0')}` : 'Last 30 days';
  const uvSum = (y0, y1) => uvMean(obs.filter((d) => d.y >= y0 && d.y <= y1 && d.m >= 6 && d.m <= 8));
  const uvA = uvSum(2001, 2010), uvB = uvSum(yLast - 9, yLast);
  const uvCat = (u) => (u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme');
  const nut = soilNutrients(state.soil);
  const chip = (t, cls = '') => `<span class="chip ${cls}">${esc(t)}</span>`;
  const img = (p, alt) => (p ? `<img src="${p.thumb}" alt="${esc(alt)}">` : '<img alt="">');
  const hc = hiNow != null ? heatCategory(hiNow) : null;
  // stage dates for this year (current season data)
  const sy = last?.y;
  const yearDays = recent.filter((d) => d.y === sy);
  const stagesCorn = yearDays.length ? stageDates(yearDays, [5, 1], STAGES.corn) : [];
  const stagesSoy = yearDays.length ? stageDates(yearDays, [5, 15], STAGES.soybean) : [];
  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '–');
  const wetPct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
  const n = state.recent && state.lastResult ? seasonNow(state.recent, state.lastResult.obs, state.lat) : null;
  $('#lab').innerHTML = `${briefCard(lr)}
  <div class="lab-grid">
    <div class="labcard"><h3><span class="no">1</span> Infrared &amp; heat index</h3>
      <div class="spec">Near-infrared 750–1400 nm · MODIS band 2 (841–876 nm) · NWS heat index</div>
      <div class="row">${img(D.nir, 'MODIS 7-2-1 infrared composite')}
        <div class="vals"><span>Heat index now <b>${hiNow != null ? fmt(hiNow, 1) + ' °C' : '–'}</b></span>
          <span>${hc ? chip(hc.label, hc.level === 0 ? 'ok' : hc.level === 1 ? 'warn' : 'bad') : ''}</span>
          <span class="small">Summer days at "Caution" or worse: ${fmt(hiBase, 1)} → <b style="font-size:1rem">${fmt(hiRecent, 1)}</b>/yr</span></div></div>
      <p>Healthy leaves reflect strongly in near-infrared. In this MODIS bands 7-2-1 image (${esc(D.nir?.date || 'n/a')}, peak season), bright green = vigorous vegetation and pink/brown = bare soil. The heat index combines NASA POWER temperature and humidity to rate working conditions.</p>
      <div class="src">NASA GIBS MODIS Terra Corrected Reflectance (Bands 7-2-1) · NASA POWER T2M_MAX + RH2M</div></div>

    <div class="labcard"><h3><span class="no">2</span> Radar backscatter</h3>
      <div class="spec">Synthetic-aperture radar: sees through clouds, day or night</div>
      <div class="row">${img(D.nisar || D.opera, 'Radar image')}
        <div class="vals">${D.radar ? `<span>Latest pass <b style="font-size:1rem">${esc((D.nisar || D.opera).date)}</b> · ${esc(D.radar.sensor)}</span>
          <span>Backscatter brightness <b>${fmt(D.radar.brightness, 2)}</b></span>
          <span>Surface roughness index <b>${fmt(D.radar.texture, 2)}</b></span>` : '<span class="muted">No radar pass over this field in the last 60 days.</span>'}</div></div>
      <p>Radar brightness rises with surface roughness, crop structure and soil moisture. The roughness index is the speckle-texture (variation) of backscatter around the field, a relative 0–1 measure that separates smooth tilled soil from residue and standing crops. NASA's missions use <b>L-band</b> (NISAR, 24 cm waves, which pass through the canopy to the soil) and <b>C-band</b> (Sentinel-1, processed by NASA OPERA). <b>X-band</b> (3 cm) radar comes from commercial and European satellites and isn't in NASA's public archive, so AgriHaven uses NASA's L- and C-band instead.</p>
      <div class="src">NASA-ISRO NISAR L2 GCOV · NASA JPL OPERA RTC-S1 (Sentinel-1) via GIBS${D.nisar && D.opera ? ` · Sentinel-1 roughness ${fmt(D.opera.texture, 2)}` : ''}</div></div>

    <div class="labcard"><h3><span class="no">3</span> Vegetation index (NDVI)</h3>
      <div class="spec">NDVI = (NIR − Red) / (NIR + Red), MODIS Terra 8-day</div>
      <div class="row">${img(D.ndviPeak, 'NDVI at peak')}
        <div class="vals"><span>Peak ${D.peakY} NDVI <b>${D.ndviPeak?.v != null ? '+' + fmt(D.ndviPeak.v, 2) : '–'}</b> ${D.ndviPeak?.v != null ? chip('Density: ' + densityClass(D.ndviPeak.v), 'ok') : ''}</span>
          <span>Latest (${esc(D.ndviNow?.date || 'n/a')}) <b style="font-size:1rem">${D.ndviNow?.v != null ? '+' + fmt(D.ndviNow.v, 2) : '–'}</b> ${D.ndviNow?.v != null ? chip(densityClass(D.ndviNow.v)) : ''}</span></div></div>
      <p>Values above +0.6 mean dense, healthy canopy (High density); 0.2–0.4 is sparse cover or bare soil. Read pixel-by-pixel from NASA imagery for this exact field.</p>
      <div class="src">NASA GIBS MODIS_Terra_NDVI_8Day, decoded with the GIBS MODIS_NDVI colormap</div></div>

    <div class="labcard"><h3><span class="no">4</span> Thermal raster</h3>
      <div class="spec">Land surface temperature + moisture</div>
      <div class="row">${img(D.lst, 'MODIS land surface temperature')}
        <div class="vals"><span>Surface temperature <b>${D.lst?.c != null ? fmt(D.lst.c, 1) + ' °C' : '–'}</b> <span class="small muted">(${esc(D.lst?.date || 'cloudy')})</span></span>
          <span>Root-zone moisture <b>${last ? wetPct(last.wet) : '–'}</b> <span class="small muted">of saturation (NASA POWER)</span></span>
          <span>SMAP soil moisture <b style="font-size:1rem">${D.smap?.v != null ? fmt(D.smap.v, 3) + ' m³/m³' : '–'}</b></span></div></div>
      <p>MODIS measures the ground's own thermal emission (10–12 µm). Hot, dry fields run warmer than moist, transpiring crops, so temperature and moisture together flag water stress.</p>
      <div class="src">MODIS_Terra_Land_Surface_Temp_Day (colormap in kelvin) · SMAP L4 · NASA POWER GWETROOT</div></div>

    <div class="labcard"><h3><span class="no">5</span> NASA public observation data</h3>
      <div class="spec">Everything here is free and open</div>
      <div class="vals small">
        <span>${chip('✓', 'ok')} NASA POWER: 12 daily variables, ${yrs[0]}–${yLast} + near-real-time</span>
        <span>${chip(state.site ? '✓' : '–', state.site ? 'ok' : '')} NASA NEX-GDDP-CMIP6: 3 climate models, 2050s</span>
        <span>${chip(D.ndviNow || D.ndviPeak ? '✓' : '–', 'ok')} MODIS NDVI, GPP, LST, reflectance, land cover</span>
        <span>${chip(D.smap ? '✓' : '–', D.smap ? 'ok' : '')} SMAP L4 soil moisture</span>
        <span>${chip(D.nisar ? '✓' : '–', D.nisar ? 'ok' : '')} NISAR L-band radar ${chip(D.opera ? '✓' : '–', D.opera ? 'ok' : '')} OPERA Sentinel-1 radar</span>
        <span>${chip('✓', 'ok')} GPM IMERG rainfall · SEDAC croplands</span>
        <span>${chip(state.soil ? '✓' : '–', state.soil ? 'ok' : '')} ISRIC SoilGrids (partner data) to 1 m</span></div>
      <div class="src">See Data &amp; method for every request URL</div></div>

    <div class="labcard"><h3><span class="no">6</span> Soil moisture</h3>
      <div class="spec">Three depths, NASA POWER (MERRA-2) + SMAP</div>
      <div class="bars-mini">
        ${[['Surface (0–5 cm)', last?.wetTop], ['Root zone (0–100 cm)', last?.wet], ['Full profile', last?.wetProf]].map(([l, v]) => `<span>${l}</span><div><div class="bar"><div style="width:${v != null ? v * 100 : 0}%;background:var(--brand)"></div></div><span class="small">${wetPct(v)} of saturation</span></div>`).join('')}
      </div>
      <p>${n ? `Root-zone wetness is at the <b>${n.wetPct}th percentile</b> for this date across ${n.nYears} years. ` : ''}Plant-available water in this soil's 1.2 m root zone: <b>${fmt(state.soil?.awc ?? 200)} mm</b>.</p>
      <div class="src">NASA POWER GWETTOP / GWETROOT / GWETPROF (through ${esc(last ? `${last.y}-${String(last.m).padStart(2, '0')}-${String(last.d).padStart(2, '0')}` : 'n/a')}) · SMAP L4 · SoilGrids texture</div></div>

    <div class="labcard" style="grid-column: 1 / -1"><h3><span class="no">7</span> Crop cycle in phases</h3>
      <div class="spec">From space (MODIS NDVI ${D.peakY}) and from NASA heat units (${sy ?? ''} season)</div>
      <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr);gap:1rem" class="cyclegrid">
        <div><div style="position:relative;height:190px"><canvas id="ndviChart" aria-label="NDVI through the season"></canvas></div>
          ${D.pheno ? `<p>🌱 Green-up <b>${fmtDate(D.pheno.greenUp)}</b> · 🌿 Peak <b>${fmtDate(D.pheno.peak)}</b> (NDVI ${fmt(D.pheno.peakNdvi, 2)}) · 🍂 Senescence <b>${fmtDate(D.pheno.senescence)}</b></p>` : '<p class="muted">Not enough clear satellite views to trace the season.</p>'}</div>
        <div><b>🌽 Corn</b> (planted May 1)<div class="stages">${stagesCorn.map((s2) => `<span>${esc(s2.stage)}<i>${fmtDate(s2.date)}</i></span>`).join('')}</div></div>
        <div><b>🫘 Soybean</b> (planted May 15)<div class="stages">${stagesSoy.map((s2) => `<span>${esc(s2.stage)}<i>${fmtDate(s2.date)}</i></span>`).join('')}</div></div>
      </div>
      <div class="src">Phenology: 50 % NDVI-amplitude crossings · Stages: growing degree days (base 10 °C) from NASA POWER, thresholds from US extension guides</div></div>

    <div class="labcard"><h3><span class="no">8</span> UV index</h3>
      <div class="spec">CERES all-sky surface UV, via NASA POWER</div>
      <div class="vals"><span>${uvLabel} (daily average) <b>${uvNow != null ? fmt(uvNow, 1) : '–'}</b></span>
        <span>Typical midday estimate <b style="font-size:1rem">${uvNow != null ? fmt(uvNow * 2.5, 1) : '–'}</b> ${uvNow != null ? chip(uvCat(uvNow * 2.5), uvNow * 2.5 < 3 ? 'ok' : uvNow * 2.5 < 6 ? 'warn' : 'bad') : ''}</span>
        <span class="small">Summer daily-average UV: ${fmt(uvA, 2)} (2001–10) → ${fmt(uvB, 2)} (${yLast - 9}–${String(yLast).slice(2)})</span></div>
      <p>UV matters for farmworker safety (sunburn and heat stress during field work) and for crops, where strong UV-B can damage leaves. NASA reports a 24-hour average. The midday peak is roughly 2.5× that in summer (estimate).</p>
      <div class="src">NASA POWER ALLSKY_SFC_UV_INDEX (CERES SYN1deg, 2001–present)</div></div>

    <div class="labcard"><h3><span class="no">+</span> Soil ↔ nutrient relationship</h3>
      <div class="spec">SoilGrids nitrogen, carbon, pH and CEC</div>
      ${nut ? `<div class="vals"><span>Soil N released per year <b>${fmt(nut.supplyLbAc)} lb/ac</b></span>
        <span class="small">Total N stock ${fmt(nut.nStockKgHa)} kg/ha (0–30 cm) · C:N ratio ${fmt(nut.cn, 1)} · CEC ${fmt(nut.cec, 0)} (${nut.cecClass} nutrient-holding)</span></div>
      <div class="bars-mini">${Object.entries(nut.availability).map(([k, v]) => `<span>${esc(k)}</span><div class="bar"><div style="width:${v * 100}%;background:${v >= 0.9 ? 'var(--good)' : v >= 0.6 ? 'var(--mid)' : 'var(--bad)'}"></div></div>`).join('')}</div>
      <p>At pH ${fmt(nut.ph, 1)} (${nut.phBand}), the bars show relative nutrient availability. A low C:N ratio (&lt; 12) means organic matter releases nitrogen quickly. Legumes and cover crops add to soil N; heavy rain and bare soil leach it.</p>` : '<p class="muted">No soil data for this point.</p>'}
      <div class="src">ISRIC SoilGrids 2.0 · pH availability after Truog (1948) · mineralization ~1.2 %/yr</div></div>
  </div>`;
  // NDVI chart
  const c = $('#ndviChart');
  if (c) {
    if (lab.chart) lab.chart.destroy();
    const text = cssVar('--text'), grid = cssVar('--border');
    lab.chart = new Chart(c, {
      type: 'line',
      data: { labels: D.series.map((p) => fmtDate(p.date)), datasets: [{ label: 'MODIS NDVI at this field', data: D.series.map((p) => p.v), borderColor: cssVar('--brand-2'), backgroundColor: cssVar('--brand-2') + '33', fill: true, spanGaps: true, tension: 0.35, pointRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: text } } },
        scales: { y: { min: 0, max: 1, ticks: { color: text }, grid: { color: grid } }, x: { ticks: { color: text, maxRotation: 0, autoSkip: true }, grid: { display: false } } } }
    });
  }
}

// ---------------- Compare & risk (tradeoffs + uncertainty) ----------------
const cmp = { ids: null, chart1: null, chart2: null, cacheKey: null, cache: null };
const pctl = (arr, q) => { const a = [...arr].sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };

function yearlyScores(rot, rel, yearsList) {
  return yearsList.map((y) => {
    const v = rot.parsed.map((p) => rel[p.crop].results.find((r) => r.year === y)?.score).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }).filter((x) => x != null);
}

function renderCompare() {
  const el = $('#compare');
  const lr = state.lastResult;
  if (!lr) { el.innerHTML = ''; return; }
  const r = lr.obsResult;
  const all = r.scored;
  if (!cmp.ids || !cmp.ids.every((id) => all.some((x) => x.id === id))) {
    const bestSoil = [...all].sort((a, b) => b.soil.score - a.soil.score)[0];
    const bestClimate = [...all].sort((a, b) => b.climate - a.climate)[0];
    cmp.ids = [...new Set([all[0].id, 'cs', bestSoil.id, bestClimate.id, all[1].id, all[2].id])].slice(0, 3);
  }
  const sel = cmp.ids.map((id) => all.find((x) => x.id === id)).filter(Boolean);
  const { recent } = periods([...lr.years.keys()]);
  const cons = r.cons || conservation(all, lr.years, state.soil);
  const nut = soilNutrients(state.soil);
  // 2050s per-model yearly scores for selected rotations (cached)
  const site = state.site?.ssp245;
  const ck = `${state.lat},${state.lon},${cmp.ids.join('|')},${state.soil?.awc}`;
  if (cmp.cacheKey !== ck) {
    cmp.cacheKey = ck;
    cmp.cache = site ? Object.entries(site.models).map(([m, delta]) => {
      const yrs = byYear(applyMonthlyDeltas(lr.obs, delta));
      const res = scoreRotations(yrs, state.soil, lr.weights, sel);
      return { model: m, res, yrsList: periods([...yrs.keys()]).recent };
    }) : [];
  }
  const rows = sel.map((rot) => {
    const ys = yearlyScores(rot, r.rel, recent);
    const nb = nitrogenBudget(rot.steps, nut);
    const fut = cmp.cache.map((m) => {
      const fr = m.res.scored.find((x) => x.id === rot.id);
      return { model: m.model, total: fr.total, ys: yearlyScores(fr, m.res.rel, m.yrsList) };
    });
    return { rot, ys, p10: pctl(ys, 0.1), p50: pctl(ys, 0.5), p90: pctl(ys, 0.9), nb, water: waterRateFor(rot, lr),
      loss: cons.byId[rot.id]?.lossTAc, carbon: cons.byId[rot.id]?.carbonTHa, fut,
      futRange: fut.length ? [Math.min(...fut.map((f) => f.total)), Math.max(...fut.map((f) => f.total))] : null };
  });
  const metric = (label, get, fmtv, better = 'high', unit = '') => {
    const vals = rows.map(get);
    const ok = vals.filter((v) => v != null);
    const best = better === 'high' ? Math.max(...ok) : Math.min(...ok), worst = better === 'high' ? Math.min(...ok) : Math.max(...ok);
    return `<tr><td>${label}</td>${vals.map((v) => `<td class="${ok.length > 1 && v === best ? 'best' : ok.length > 1 && v === worst ? 'worst' : ''}">${v == null ? '–' : fmtv(v) + unit}</td>`).join('')}</tr>`;
  };
  el.innerHTML = `<div class="card"><h2>⚖️ Compare rotations, reveal tradeoffs, understand risk</h2>
    <p class="small muted">Pick up to 3 rotations. Green = best, red = worst in each row. Everything is computed for ${esc(state.name)} from NASA data.</p>
    <div class="pick">${all.map((x) => `<label><input type="checkbox" data-cmp="${x.id}" ${cmp.ids.includes(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}</div>
    <div class="table-wrap"><table class="ctable">
      <tr><th></th>${rows.map((x) => `<th>${esc(x.rot.name)}</th>`).join('')}</tr>
      ${metric('<b>Overall score</b>', (x) => x.rot.total, (v) => fmt(v))}
      ${metric('Climate resilience', (x) => x.rot.climate, (v) => fmt(v))}
      ${metric('Soil health', (x) => x.rot.soil.score, (v) => fmt(v))}
      ${metric('💧 Water Certainty Rate', (x) => x.water, (v) => fmt(v), 'high', '%')}
      ${metric('Fertilizer N needed (lb/ac/yr)', (x) => x.nb.fertilizer, (v) => fmt(v), 'low')}
      ${metric('Soil loss (t/ac/yr)', (x) => x.loss, (v) => fmt(v, 1), 'low')}
      ${metric('Soil carbon gain (t C/ha/yr)', (x) => x.carbon, (v) => fmt(v, 2), 'high')}
      ${metric('⚠️ Poor seasons (of 15)', (x) => x.rot.badYears.length, (v) => fmt(v), 'low')}
      ${metric('Worst single crop-season', (x) => x.rot.worst, (v) => fmt(v), 'high')}
      ${metric('Typical range (10th–90th pct)', (x) => x.p90 - x.p10, (v) => fmt(v), 'low', ' pts spread')}
      ${site ? `<tr><td>🔭 2050s overall, range across 3 NASA models</td>${rows.map((x) => `<td>${x.futRange ? `${fmt(x.futRange[0])}–${fmt(x.futRange[1])}` : '–'}</td>`).join('')}</tr>` : ''}
    </table></div></div>
    <div class="card"><h3>🔀 Tradeoff map: climate resilience vs soil health</h3>
      <p class="small muted">Up and to the right is better on both. Bubble size = fertilizer saved vs continuous corn. Selected rotations are highlighted. Rotations far apart on one axis but close on the other reveal the tradeoff you'd be making.</p>
      <div class="chart-wrap"><canvas id="tradeChart" role="img" aria-label="Scatter of rotations by climate resilience and soil health"></canvas></div></div>
    <div class="card"><h3>🎲 Uncertainty: how much do outcomes swing?</h3>
      <p class="small muted">Each bar spans the 10th–90th percentile of season outcomes (8 in 10 seasons fall inside). Taller bars mean less predictable seasons. "Today" uses the real 2011–2025 NASA weather. The 2050s bars use the same weather warmed by each NASA climate model, so the gap between models is the climate-model uncertainty.</p>
      <div class="chart-wrap tall"><canvas id="uncChart" role="img" aria-label="Range of season outcomes per rotation"></canvas></div>
      <p class="small">${rows.map((x) => `<b>${esc(x.rot.name)}</b>: a poor season about ${x.rot.badYears.length ? `1 in ${Math.round(15 / x.rot.badYears.length)} years` : 'never in the last 15 years'}${x.futRange ? `; 2050s score ${fmt(x.futRange[0])}–${fmt(x.futRange[1])} depending on the model` : ''}.`).join('<br>')}</p></div>`;
  el.querySelectorAll('[data-cmp]').forEach((cb) => {
    cb.onchange = () => {
      const id = cb.dataset.cmp;
      if (cb.checked) cmp.ids = [...cmp.ids, id].slice(-3); else cmp.ids = cmp.ids.filter((x) => x !== id);
      if (!cmp.ids.length) cmp.ids = [id];
      renderCompare();
    };
  });
  const text = cssVar('--text'), grid = cssVar('--border');
  const palette = ['#2e9e5b', '#0b3d91', '#e0a526', '#d64933'];
  if (cmp.chart1) cmp.chart1.destroy();
  const base = all.find((x) => x.id === 'cc') || all[all.length - 1];
  cmp.chart1 = new Chart($('#tradeChart'), {
    type: 'bubble',
    data: { datasets: all.map((x) => {
      const i = cmp.ids.indexOf(x.id);
      return { label: x.name, data: [{ x: x.climate, y: x.soil.score, r: 5 + Math.max(0, (base.nNeed - x.nNeed)) * 14 }],
        backgroundColor: i >= 0 ? palette[i] + 'cc' : '#9aa59d55', borderColor: i >= 0 ? palette[i] : '#9aa59d' };
    }) },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: climate ${fmt(c.raw.x)}, soil ${fmt(c.raw.y)}` } } },
      scales: { x: { title: { display: true, text: 'Climate resilience →', color: text }, ticks: { color: text }, grid: { color: grid } },
        y: { title: { display: true, text: 'Soil health →', color: text }, ticks: { color: text }, grid: { color: grid } } } }
  });
  if (cmp.chart2) cmp.chart2.destroy();
  const groups = [{ label: 'Today (2011–2025 weather)', get: (x) => [x.p10, x.p90], med: (x) => x.p50, col: '#0b3d91' },
    ...cmp.cache.map((m, mi) => ({ label: `2050s · ${m.model}`, get: (x) => { const f = x.fut[mi]; return [pctl(f.ys, 0.1), pctl(f.ys, 0.9)]; }, med: (x) => pctl(x.fut[mi].ys, 0.5), col: ['#e0a526', '#d64933', '#8e44ad'][mi] }))];
  cmp.chart2 = new Chart($('#uncChart'), {
    data: { labels: rows.map((x) => mobileMQ.matches ? wrapLabel(x.rot.name, 16) : (x.rot.name.length > 34 ? x.rot.name.slice(0, 32) + '…' : x.rot.name)),
      datasets: [
        ...groups.map((g) => ({ type: 'bar', label: g.label, data: rows.map(g.get), backgroundColor: g.col + '88', borderColor: g.col, borderWidth: 1, borderSkipped: false }))
      ] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: mobileMQ.matches ? 'bottom' : 'top', labels: { color: text, boxWidth: 12, font: { size: mobileMQ.matches ? 11 : 12 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.raw[0])}–${fmt(c.raw[1])}` } } },
      scales: { y: { min: 0, max: 100, title: { display: !mobileMQ.matches, text: 'Season outcome (0–100)', color: text }, ticks: { color: text }, grid: { color: grid } },
        x: { ticks: { color: text, maxRotation: 0, autoSkip: false, font: { size: mobileMQ.matches ? 10 : 12 } }, grid: { display: false } } } }
  });
}

// split a long label into short lines for small screens
function wrapLabel(text, max) {
  const lines = []; let cur = '';
  for (const w of text.split(' ')) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

// ---------------- sonification ----------------
let audioCtx = null;
$('#hearBtn').onclick = () => {
  const lr = state.lastResult;
  if (!lr) return;
  const vals = lr.rows.map((r) => r[state.indicator]).filter((v) => v !== null);
  const min = Math.min(...vals), max = Math.max(...vals);
  try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); } catch { toast('Audio not supported in this browser.'); return; }
  const t0 = audioCtx.currentTime + 0.05, step = 0.16;
  vals.forEach((v, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 220 * Math.pow(2, (max === min ? 0.5 : (v - min) / (max - min)) * 2); // 220-880 Hz
    g.gain.setValueAtTime(0, t0 + i * step);
    g.gain.linearRampToValueAtTime(0.18, t0 + i * step + 0.02);
    g.gain.linearRampToValueAtTime(0, t0 + i * step + step * 0.9);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0 + i * step); o.stop(t0 + (i + 1) * step);
  });
  // highlight bars as they play
  vals.forEach((_, i) => setTimeout(() => {
    if (!state.chart) return;
    state.chart.setActiveElements([{ datasetIndex: 0, index: i }]);
    state.chart.tooltip.setActiveElements([{ datasetIndex: 0, index: i }], { x: 0, y: 0 });
    state.chart.update('none');
  }, i * step * 1000));
  toast(`Playing ${vals.length} years: higher pitch = higher ${INDICATORS.find((x) => x.key === state.indicator).label.split(' (')[0].toLowerCase()}`);
};

function renderSoil() {
  const s = state.soil;
  $('#soilBox').innerHTML = s ? `
    <div>Texture<b>${esc(s.texture)}</b></div>
    <div>pH<b>${fmt(s.ph, 1)}</b></div>
    <div>Org. carbon<b>${fmt(s.soc, 0)} g/kg</b></div>
    <div>Clay<b>${fmt(s.clay, 0)}%</b></div>
    <div>Sand<b>${fmt(s.sand, 0)}%</b></div>
    <div>CEC<b>${fmt(s.cec, 0)}</b></div>
    <div>Total N<b>${fmt(s.nitrogen, 1)} g/kg</b></div>
    <div>Bulk density<b>${fmt(s.bdod, 2)} g/cm³</b></div>
    <div>Root-zone water<b>${fmt(s.awc)} mm</b></div>
    ${s.socStock ? `<div style="grid-column:1/-1">Soil carbon stock (0–30 cm)<b>${fmt(s.socStock)} t C/ha</b></div>` : ''}
    ${s.profile?.length ? `<div style="grid-column:1/-1" class="profile" title="SoilGrids profile, 0–100 cm">${s.profile.map((l) => `<span style="flex:${parseInt(l.depth.split('-')[1]) - parseInt(l.depth)}">${esc(l.depth.replace('cm', ''))} cm<br><i>${esc(l.texture)}</i></span>`).join('')}</div>` : ''}
    ${s.offsetKm ? `<p class="muted small" style="grid-column:1/-1">Nearest mapped farmland soil, about ${s.offsetKm} km away.</p>` : ''}`
    : '<p class="muted small" style="grid-column:1/-1">No SoilGrids data here (urban area, water or service offline). Using neutral soil assumptions.</p>';
}

function renderHeadline(summary, result, dT, rain) {
  const top = result.scored[0];
  const base = result.scored.find((r) => r.id === 'cs');
  const sig = summary.filter((s) => s.mk.p < 0.05);
  const pick = (k) => summary.find((s) => s.key === k);
  const bullets = [];
  const g = pick('gdd'), ff = pick('frostFree'), hd = pick('hotDays'), del = pick('springDeluge'), dry = pick('drySpell');
  const yrs = `${g.recentYears[0]}–${g.recentYears[1]} vs ${g.baseYears[0]}–${g.baseYears[1]}`;
  const ob = (k) => state.lastResult.obsSummary.find((x) => x.key === k);
  if (state.lastResult?.proj) {
    const sm = seasonalSummary(state.lastResult.proj.mean, state.lat);
    bullets.push(`<b>${esc(SCENARIOS[state.scenario].long)}</b>: the growing season warms by <b>${sm.dT.toFixed(1)} °C</b> with <b>${sm.rainPct >= 0 ? '+' : ''}${sm.rainPct.toFixed(0)}% rain</b>. Compared with today (${hd.recentYears.join('–')}), hot summer days go from <b>${fmt(ob('hotDays').recent, 1)} → ${fmt(hd.recent, 1)}</b> per year and the season water balance from <b>${fmt(ob('waterBalance').recent)} → ${fmt(pick('waterBalance').recent)} mm</b>.`);
  } else if (state.scenario === 'observed') {
    bullets.push(`Growing-season heat is <b>${g.delta >= 0 ? 'up' : 'down'} ${fmt(Math.abs(g.delta))} degree-days</b> (${yrs})${g.mk.p < 0.05 ? ', a statistically significant trend' : ''}.`);
    bullets.push(`The frost-free season is <b>${fmt(Math.abs(ff.delta))} days ${ff.delta >= 0 ? 'longer' : 'shorter'}</b>. Heavy spring downpours: <b>${fmt(del.base, 1)} → ${fmt(del.recent, 1)}</b> per year. Hot summer days: <b>${fmt(hd.base, 1)} → ${fmt(hd.recent, 1)}</b>.`);
  } else {
    bullets.push(`What-if scenario: <b>+${dT} °C</b> and <b>${rain > 0 ? '+' : ''}${rain}% rain</b> applied to every NASA observation. Hot summer days rise to <b>${fmt(hd.recent, 1)}</b> per year and the longest dry spell to <b>${fmt(dry.recent)} days</b>.`);
  }
  bullets.push(`Best match for your priorities: <b>${esc(top.name)}</b> (score ${fmt(top.total)}${base && top.id !== 'cs' ? `, ${fmt(top.total - base.total)} points ahead of corn → soybean` : ''}).`);
  $('#headline').hidden = false;
  const rb = result.robust?.ranks?.[top.id];
  if (rb) bullets.push(`Robustness: across all ${result.robust.n} NASA climate models, this rotation ranks <b>#${Math.min(...rb)}${Math.max(...rb) !== Math.min(...rb) ? '–#' + Math.max(...rb) : ''}</b>.`);
  $('#headline').innerHTML = `<h2>🛰️ What NASA data says about ${esc(state.name)}</h2><ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
    <p class="muted small" style="margin:.5rem 0 0">${state.scenario === 'observed'
      ? `${sig.length} of ${summary.length} climate indicators show a statistically significant trend since 1991 (Mann-Kendall, p &lt; 0.05).`
      : 'Scenario view: switch back to <b>Observed</b> to see the measured 1991–2025 trends.'}</p>`;
}

const color = (v) => (v >= GOOD ? 'var(--good)' : v >= 50 ? 'var(--mid)' : 'var(--bad)');
const bar = (label, v, c = 'var(--brand-2)') => `<span>${label}</span><div class="bar"><div style="width:${Math.max(2, Math.min(100, v))}%;background:${c}"></div></div><b>${fmt(v)}</b>`;

function renderRotations(result) {
  const base = result.scored.find((r) => r.id === 'cs');
  const nRecent = result.periods.recent.length;
  $('#rotations').innerHTML = result.scored.map((r, i) => {
    const lines = explain(r, result.rel, base, nRecent, state.scenario !== 'observed');
    const seq = r.parsed.map((p) => `<span>${CROPS[p.crop].emoji} ${esc(CROPS[p.crop].name.split(' (')[0])}${p.cover ? ' + 🌱rye' : ''}</span>`).join('<i>→</i>');
    return `<article class="rot ${i === 0 ? 'top1' : ''} ${r.custom ? 'custom' : ''}">
      <div class="rank">#${i + 1}</div>
      <div>
        <h3>${esc(r.name)}${i === 0 ? '<span class="badge">Best fit</span>' : ''}${r.id === 'cs' ? '<span class="badge base">Today\'s default</span>' : ''}${r.custom ? '<span class="badge">Yours</span>' : ''}</h3>
        <p class="sub">${esc(r.tag)}</p>
        <div class="seq">${seq}<i>↺</i></div>
        <div class="bars">
          ${bar('Climate resilience', r.climate, color(r.climate))}
          ${bar('Soil health', r.soil.score)}
          ${bar('Low fertilizer need', r.inputs, 'var(--brand)')}
        </div>
        ${consLine(result, r)}
        ${robustLine(result, r)}
        <ul class="why">${lines.slice(0, 3).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        ${lines.length > 3 ? `<details class="more"><summary>More detail</summary><ul class="why">${lines.slice(3).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>` : ''}
      </div>
      <div class="total"><b style="color:${color(r.total)}">${fmt(r.total)}</b><span>overall /100</span></div>
    </article>`;
  }).join('');
}

function consLine(result, r) {
  const c = result.cons?.byId?.[r.id];
  if (!c) return '';
  const over = c.lossTAc > result.cons.tolerance;
  return `<div class="robust">🟤 Soil loss ≈ <b style="color:${over ? 'var(--bad)' : 'inherit'}">${fmt(c.lossTAc, 1)} t/acre/yr</b>${over ? ' (above the 5 t/ac tolerance)' : ''} · 🌍 Soil carbon ${c.carbonTHa > 0 ? `<b>+${fmt(c.carbonTHa, 2)} t C/ha/yr</b>` : 'no gain'}</div>`;
}

function robustLine(result, r) {
  const parts = [];
  const rk = result.robust?.ranks?.[r.id];
  if (rk) {
    const lo = Math.min(...rk), hi = Math.max(...rk);
    parts.push(`Rank across ${result.robust.n} NASA climate models: <b>#${lo}${hi !== lo ? '–#' + hi : ''}</b>`);
  }
  if (result.observedTotals) {
    const d = r.total - result.observedTotals[r.id];
    parts.push(`vs today's climate: <b style="color:${d < -1 ? 'var(--bad)' : d > 1 ? 'var(--good)' : 'inherit'}">${d >= 0 ? '+' : ''}${fmt(d)}</b> pts`);
  }
  return parts.length ? `<div class="robust">${parts.join(' · ')}</div>` : '';
}

function renderImpact(result) {
  const base = result.scored.find((r) => r.id === 'cs');
  const top = result.scored[0].id === 'cs' ? result.scored[1] : result.scored[0];
  if (!base || !top) { $('#impact').innerHTML = ''; return; }
  const im = impact(top, base, state.acres, state.price);
  $('#impact').innerHTML = `
    <div class="kpi"><b>${fmt(im.savedLbPerAc)} lb</b><span>less nitrogen per acre per year with <i>${esc(top.name)}</i> vs corn → soybean</span></div>
    <div class="kpi"><b>$${fmt(im.dollars)}</b><span>fertilizer saved per year on ${fmt(state.acres)} acres</span></div>
    <div class="kpi"><b>${fmt(im.tCO2e, 0)} t CO₂e</b><span>greenhouse gas avoided per year (≈ ${fmt(im.carsEquivalent, 0)} cars off the road)</span></div>
    ${(() => {
      const cs = result.cons?.byId?.[base.id], ct = result.cons?.byId?.[top.id];
      if (!cs || !ct) return '';
      const savedT = (cs.lossTAc - ct.lossTAc) * state.acres;
      const co2 = (ct.carbonTHa - cs.carbonTHa) * 3.667 * state.acres * 0.4047;
      return `<div class="kpi"><b>${fmt(Math.max(0, savedT))} t</b><span>topsoil kept on your fields per year (${fmt(cs.lossTAc, 1)} → ${fmt(ct.lossTAc, 1)} t/acre, RUSLE with NASA rainfall)</span></div>
        <div class="kpi"><b>${fmt(Math.max(0, co2))} t CO₂</b><span>pulled into your soil per year as organic carbon (cover crops + rotation diversity)</span></div>`;
    })()}
    <div class="kpi"><b>+${fmt(top.soil.score - base.soil.score)}</b><span>soil-health points: ${top.soil.families} plant families vs ${base.soil.families}${im.climateDelta >= 1 ? `, and +${fmt(im.climateDelta)} climate resilience` : ''}${im.badYearsDelta > 0 ? `, ${im.badYearsDelta} fewer poor seasons` : ''}</span></div>
    <div class="farm">Your farm:
      <label>acres <input id="acres" type="number" min="1" step="10" value="${state.acres}"></label>
      <label>nitrogen price $/lb N <input id="price" type="number" min="0.1" step="0.05" value="${state.price}"></label>
      <span class="small">Assumes continuous corn ≈ ${N_FULL_LB} lb N/ac; IPCC EF1 = 1% N₂O-N; GWP N₂O = 273; ~4 kg CO₂e per kg N manufactured.</span>
    </div>`;
  const upd = () => {
    state.acres = Math.max(1, +$('#acres').value || 500);
    state.price = Math.max(0.05, +$('#price').value || 0.55);
    renderImpact(state.lastResult.result);
  };
  $('#acres').onchange = upd;
  $('#price').onchange = upd;
}

function renderIndicators(summary) {
  $('#indicatorSelect').innerHTML = INDICATORS.map((i) => `<option value="${i.key}" ${i.key === state.indicator ? 'selected' : ''}>${esc(i.label)}</option>`).join('');
  $('#indicators').innerHTML = summary.map((s) => {
    const arrow = s.delta > 0 ? '▲' : s.delta < 0 ? '▼' : '■';
    const cls = Math.abs(s.pct) < 2 ? '' : s.better ? 'good' : 'bad';
    return `<div class="ind ${s.key === state.indicator ? 'active' : ''}" data-k="${s.key}" tabindex="0" role="button">
      <div class="lbl">${esc(s.label)}</div>
      <div class="val">${fmt(s.recent, s.dec)} <span class="small muted">${esc(s.unit)}</span></div>
      <div class="chg ${cls}">${arrow} ${fmt(Math.abs(s.delta), s.dec)} vs ${s.baseYears[0]}–${String(s.baseYears[1]).slice(2)}
        <span class="sig ${s.mk.p < 0.05 ? 'yes' : ''}" title="Mann-Kendall trend test p-value">${s.mk.p < 0.05 ? 'significant' : 'p=' + s.mk.p.toFixed(2)}</span></div>
    </div>`;
  }).join('');
  document.querySelectorAll('.ind').forEach((el) => {
    const go = () => { state.indicator = el.dataset.k; renderIndicators(state.lastResult.summary); drawChart(); };
    el.onclick = go;
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}
$('#indicatorSelect').addEventListener('change', (e) => { state.indicator = e.target.value; renderIndicators(state.lastResult.summary); drawChart(); });

function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

function drawChart() {
  const { rows, summary } = state.lastResult;
  const ind = summary.find((s) => s.key === state.indicator);
  const xs = rows.map((r) => r.year), ys = rows.map((r) => r[ind.key]);
  const { slope, intercept } = linreg(xs, ys);
  const sen = ind.mk.sen;
  $('#chartTitle').textContent = ind.label;
  $('#chartNote').innerHTML = `${esc(ind.why)} Trend: <b>${sen >= 0 ? '+' : ''}${fmt(sen * 10, ind.dec)} ${esc(ind.unit)} per decade</b> (Sen's slope), Mann-Kendall p = ${ind.mk.p.toFixed(3)}${ind.mk.p < 0.05 ? ' (statistically significant)' : ' (not significant, could be natural variability)'}.`;
  const text = cssVar('--text'), grid = cssVar('--border'), green = cssVar('--brand-2'), blue = cssVar('--brand');
  const baseMean = xs.map((x) => (x >= ind.baseYears[0] && x <= ind.baseYears[1] ? ind.base : null));
  const recMean = xs.map((x) => (x >= ind.recentYears[0] && x <= ind.recentYears[1] ? ind.recent : null));
  const data = {
    labels: xs,
    datasets: [
      { type: 'bar', label: ind.label, data: ys, backgroundColor: green + '99', borderRadius: 3, order: 3 },
      { type: 'line', label: 'Linear trend', data: xs.map((x) => intercept + slope * x), borderColor: cssVar('--accent'), borderDash: [6, 4], pointRadius: 0, borderWidth: 2, order: 1 },
      { type: 'line', label: `Mean ${ind.baseYears.join('–')}`, data: baseMean, borderColor: blue, pointRadius: 0, borderWidth: 3, order: 2 },
      { type: 'line', label: `Mean ${ind.recentYears.join('–')}`, data: recMean, borderColor: cssVar('--text'), pointRadius: 0, borderWidth: 3, order: 2 }
    ]
  };
  const opts = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
    plugins: { legend: { labels: { color: text, boxWidth: 14 } }, tooltip: { mode: 'index', intersect: false } },
    scales: { x: { ticks: { color: text, maxRotation: 0, autoSkip: true }, grid: { display: false } },
      y: { ticks: { color: text }, grid: { color: grid }, title: { display: true, text: ind.unit, color: text } } }
  };
  if (state.chart) state.chart.destroy();
  state.chart = new Chart($('#trendChart'), { data, options: opts });
}

function renderCrops(result) {
  const rels = Object.values(result.rel).concat(
    Object.keys(CROPS).filter((k) => !result.rel[k]).map(() => null)).filter(Boolean)
    .sort((a, b) => b.recent.goodPct - a.recent.goodPct || b.recent.mean - a.recent.mean);
  const words = { heat: 'heat at flowering', dry: 'drought', cool: 'season too cool', frost: 'frost / winterkill', wet: 'waterlogging', soil: 'soil pH' };
  const { base, recent } = result.periods;
  $('#cropTable').innerHTML = rels.map((r) => {
    const first = r.results[0]?.year, last = r.results[r.results.length - 1]?.year;
    const d = r.recent.goodPct - r.base.goodPct;
    return `<div class="croprow">
      <div class="nm">${r.crop.emoji} ${esc(r.crop.name)}<small>${esc(r.crop.note)}</small></div>
      <div>
        <div class="strip">${r.results.map((x) => `<div style="background:${color(x.score)}" title="${x.year}: ${x.score}/100${x.stresses.length ? ' · ' + esc(x.stresses.map((s) => s.text).join('; ')) : ''}"></div>`).join('')}</div>
        <div class="strip-years"><span>${first}</span><span>${last}</span></div>
      </div>
      <div class="rel">Good years: <b>${fmt(r.base.goodPct)}%</b> → <b>${fmt(r.recent.goodPct)}%</b>
        <span style="color:${d < -5 ? 'var(--bad)' : d > 5 ? 'var(--good)' : 'var(--muted)'}">(${d >= 0 ? '+' : ''}${fmt(d)})</span><br>
        <span class="muted small">${base[0]}–${base[base.length - 1]} → ${recent[0]}–${recent[recent.length - 1]}${r.mainStress ? ` · main risk: ${words[r.mainStress]}` : ''}</span></div>
    </div>`;
  }).join('');
}

function azureMethodTable() {
  const st = azureStatus(), sv = st.services || {};
  const chip = (on) => (st.ok ? (on ? '<span class="chip ok">live</span>' : '<span class="chip">not configured</span>') : '<span class="chip">off on this host</span>');
  const d = st.lastData?.power;
  return `<table class="azure-table">
    <tr><th>Azure service</th><th>What it does in AgriHaven</th><th>Status</th></tr>
    <tr><td>Azure Static Web Apps</td><td>Hosts the app on Microsoft's global network, with HTTPS and GitHub deploys</td><td>${chip(true)}</td></tr>
    <tr><td>Azure Functions</td><td>Backend API (<code>/api/power</code>, <code>/recent</code>, <code>/soil</code>, <code>/places</code>, <code>/advisor</code>) that fetches NASA POWER and SoilGrids for any field</td><td>${chip(true)}</td></tr>
    <tr><td>Azure Blob Storage</td><td>Saves each field's 35-year NASA record and soil profile, so repeat visits and demos load in under a second, even when NASA is slow${d ? ` (last load: ${esc(d.cache || '')}, ${(d.ms / 1000).toFixed(1)} s)` : ''}</td><td>${chip(sv.blobStorage)}</td></tr>
    <tr><td>Azure OpenAI</td><td>"Ask AgriHaven": plain-language answers in English or Spanish, grounded only in the field's NASA-derived numbers</td><td>${chip(sv.openai)}</td></tr>
    <tr><td>Azure Maps</td><td>Search-as-you-type place suggestions (the key stays server-side)</td><td>${chip(sv.maps)}</td></tr>
  </table>
  <p class="small muted">NASA data flows: browser → Azure Functions → NASA POWER / SoilGrids → Azure Blob Storage → browser. Satellite imagery tiles come straight from NASA GIBS. Without Azure the app falls back to calling NASA directly.</p>`;
}

function renderMethod(rows) {
  const y0 = rows[0]?.year, y1 = rows[rows.length - 1]?.year;
  $('#methodText').innerHTML = `
  <h3>How it works</h3>
  <div class="pipeline">
    <div><b>1 · NASA data</b>35 years of daily POWER weather + root-zone soil wetness, SoilGrids soil, NEX-GDDP-CMIP6 projections</div>
    <div><b>2 · Climate shift</b>9 farm indicators, including a FAO-56 water balance, with Mann-Kendall significance tests</div>
    <div><b>3 · Crop simulation</b>Each of 10 crops grown in every real season: heat units, flowering heat, water, frost, pH</div>
    <div><b>4 · Rotation ranking</b>Climate resilience + soil health + fertilizer need, robust across 3 climate models</div>
  </div>
  <h3>Data sources</h3>
  <table class="srctable">
    <tr><th>Dataset</th><th>What we use</th><th>Resolution</th></tr>
    <tr><td><a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener">NASA POWER</a> (Agroclimatology), from MERRA-2 reanalysis and CERES/GEWEX satellite radiation</td><td>11 daily variables, ${y0}–${y1}: max/min air temperature, dew point, humidity, wind, solar radiation, rain, soil-surface temperature, and surface, root-zone and full-profile soil wetness (GWETTOP / GWETROOT / GWETPROF). Plus near-real-time data for the current season (~3-day latency)</td><td>Daily, ~0.5° × 0.625°</td></tr>
    <tr><td><a href="https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs" target="_blank" rel="noopener">NASA GIBS</a>: MODIS Terra NDVI, MODIS GPP (plant productivity), MODIS land surface temperature, MODIS land cover, SMAP L4 root-zone soil moisture, GPM IMERG rainfall, SEDAC croplands</td><td>Map layers, plus a season time-lapse of MODIS NDVI showing the crop greening up and drying down from space</td><td>250 m – 10 km</td></tr>
    <tr><td><a href="https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6" target="_blank" rel="noopener">NASA NEX-GDDP-CMIP6</a> v2.0 (NASA Center for Climate Simulation)</td><td>Bias-corrected, downscaled daily Tmax, Tmin and precipitation from 3 CMIP6 models (GFDL-ESM4, MRI-ESM2-0, ACCESS-CM2) under SSP2-4.5 and SSP5-8.5. Monthly change factors 2050s vs 2000s, applied to the observed record</td><td>Daily, 0.25°</td></tr>
    <tr><td><a href="https://soilgrids.org" target="_blank" rel="noopener">ISRIC SoilGrids 2.0</a></td><td>Five depths to 1 m: clay, sand, silt, organic carbon, pH, CEC, total nitrogen, bulk density. Gives root-zone plant-available water (USDA-NRCS values by texture), soil carbon stock and erodibility (EPIC K-factor)</td><td>250 m</td></tr>
    <tr><td>FAO Ecocrop / FAO-56, US land-grant extension guides</td><td>Crop thresholds: heat units, damaging temperatures, water need, pH range, nitrogen</td><td>Per crop</td></tr>
  </table>
  <p class="small muted">API calls for this field: <a href="${esc(state.powerUrl || '#')}" target="_blank" rel="noopener">NASA POWER request</a> · <a href="${esc(state.soilUrl || '#')}" target="_blank" rel="noopener">SoilGrids request</a></p>

  <p class="small">Also used: NASA-ISRO <b>NISAR</b> L-band and NASA JPL <b>OPERA</b> Sentinel-1 C-band radar, MODIS bands 7-2-1 near-infrared reflectance, MODIS land surface temperature, SMAP L4 and CERES UV index (NASA POWER). Per-field values are read from GIBS tiles and converted back to physical units using GIBS's published colormaps.</p>
  <h3>Method</h3>
  <ol>
    <li><b>Climate shift.</b> For every year we compute 8 farm-relevant indicators from daily NASA data. We compare the first 15 years (baseline) with the most recent 15 and test each trend with the non-parametric <b>Mann-Kendall test</b> and <b>Sen's slope</b>, the standard methods for climate trend detection.</li>
    <li><b>Crop outcome per year.</b> Each crop is "grown" in every year of real weather. We check whether it got enough growing degree days to mature, how many damaging-heat days hit its flowering window, whether rain plus stored soil water met its needs, frost and winterkill nights, and soil-pH fit. The result is a 0–100 outcome. A score of 70 or more counts as a good year.</li>
    <li><b>Rotation score.</b> Climate resilience blends the average crop outcome in recent years (65%) with the success rate of the rotation's <i>weakest</i> crop (35%), because a rotation is only as reliable as its weakest link. Any rotation containing a crop that meets its needs in under 10% of seasons is flagged ⛔ <i>not viable here</i> and heavily penalized. It is then penalized for years where the whole rotation struggled and for the worst single crop-year (tail risk). Soil health rewards plant-family diversity, mixing warm- and cool-season crops, legumes, living cover over winter, residue and perennials. Fertilizer need counts crop nitrogen demand minus legume credits. You set the weights.</li>
    <li><b>Farm-operations indicators.</b> Earliest planting day (5-day NASA soil-surface temperature ≥ 10°C and topsoil not saturated), spring field-work days (calibrated against USDA crop-progress norms, it picks out the record-wet 2019 spring), fungal-disease weather days (humidity ≥ 80% at 18–30°C) and hot nights.</li>
    <li><b>Soil conservation.</b> Erosion uses the USDA RUSLE equation: rainfall erosivity from NASA annual rain (Renard & Freimund 1994), soil erodibility from SoilGrids (EPIC K), crop cover factors from USDA Handbook 703, and a gently sloping field (LS 0.3). Soil-carbon gains use published rates: cover crops +0.32 t C/ha/yr (Poeplau & Don 2015) and ≥3-crop rotations +0.20 t C/ha/yr (West & Post 2002).</li>
    <li><b>Water Certainty Rate.</b> The share of recent seasons in which season rain plus plant-available water stored at sowing covered crop water demand (FAO-56 crop coefficient × Penman-Monteith ET₀).</li>
    <li><b>Nutrients.</b> Soil N supply = SoilGrids total N stock × ~1.2 %/yr mineralization. The fertilizer budget subtracts soil supply and legume credits from crop need and is calibrated to Illinois MRTN guidance. Nutrient availability by pH follows the Truog chart.</li>
    <li><b>Heat index &amp; UV.</b> NWS Rothfusz heat index from NASA POWER temperature and humidity; UV from CERES via NASA POWER.</li>
    <li><b>Water.</b> Season water supply = rain + plant-available stored water (NASA GWETROOT × soil water capacity from SoilGrids texture). Evaporative demand is FAO-56 Penman-Monteith reference evapotranspiration, computed from NASA POWER radiation, humidity, wind and temperature.</li>
    <li><b>2050s.</b> NASA NEX-GDDP-CMIP6 monthly changes in Tmax, Tmin and rain from 3 climate models shift the real 35-year record (the standard "delta method"). We rank rotations under each model separately to show whether the recommendation is robust.</li>
  </ol>

  <h3>Validation check</h3>
  <p>With no tuning to specific years, the model's worst recent corn year in central Illinois is <b>2012</b>, the historic US drought and heat year when Illinois corn yields fell by more than a third. It also flags <b>2005</b>, a severe Illinois drought year. These match the real disasters, which suggests the stress model captures the signals that matter.</p>

  <h3>Limitations (being honest)</h3>
  <ul>
    <li>NASA POWER is a ~50 km grid, so it describes the regional climate, not microclimate. Field-level decisions should add local records.</li>
    <li>Crop thresholds are generic screening values. Varieties, planting dates, irrigation and markets all change real outcomes.</li>
    <li>Scores compare options. They are not yield forecasts or economic advice.</li>
    <li>2050s projections use a sample of 3 models and 2 years per period, precomputed for the preset regions (sites within ~600 km use the nearest region). Change factors keep today's weather sequences, so they don't capture changes in variability.</li>
  </ul>`;
}

// Kick off with Champaign, Illinois (our home region) — live data, falling back to the bundled sample.
const params = new URLSearchParams(location.search);
if (params.has('scenario') && SCENARIOS[params.get('scenario')]) state.scenario = params.get('scenario');
if (params.has('lat') && params.has('lon') && Number.isFinite(+params.get('lat')) && Number.isFinite(+params.get('lon'))) {
  selectLocation(+params.get('lat'), +params.get('lon'), params.get('name') || undefined);
}
// Otherwise start on the full-screen map and wait for the user to pick a field.
document.body.dataset.tab = state.tab;
renderScenarioSeg();
