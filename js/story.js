// "Field story": the data for one field told as six short chapters, in English or
// Spanish, with tiny charts. Every number is computed from the NASA data
// already loaded for the field.

const T = {
  en: {
    ch1: 'Meet the field', ch2: 'The climate it was built for', ch3: 'The year everything went wrong',
    ch4: 'The new normal', ch5: 'Fast-forward to the 2050s', ch6: 'A plan that holds',
    meet: (c) => `${c.name} sits on ${c.texture} soil (pH ${c.ph}, ${c.soc} g/kg organic carbon). Every number in this story comes from NASA satellites and models for this exact point on Earth: ${c.days.toLocaleString()} days of weather, from ${c.y0} to ${c.y1}.`,
    meetNoSoil: (c) => `Every number in this story comes from NASA satellites and models for this exact point on Earth: ${c.days.toLocaleString()} days of weather, from ${c.y0} to ${c.y1}.`,
    built: (c) => `From ${c.b0} to ${c.b1}, the growing season here averaged ${c.gdd} degree-days of heat, ${c.ff} frost-free days and ${c.hot} hot days (≥ 32 °C) each summer. That is the climate most farm habits were built on.`,
    worst: (c) => `In ${c.year}, ${c.hot} summer days topped 32 °C, the growing season got ${c.rain} mm of rain, and the longest dry spell lasted ${c.dry} days. Using only NASA data, our model scores ${c.crop} at just ${c.score}/100 that year, one of its worst seasons in ${c.n} years.`,
    newNormal: (c) => `Since ${c.r0}, growing-season heat is ${c.dGdd >= 0 ? 'up' : 'down'} ${Math.abs(c.dGdd)} degree-days and the frost-free season is ${Math.abs(c.dFf)} days ${c.dFf >= 0 ? 'longer' : 'shorter'}. Heavy spring downpours went from ${c.del0} to ${c.del1} a year${c.plant != null ? `, soil warms enough to plant about ${Math.abs(c.plant)} days ${c.plant <= 0 ? 'earlier' : 'later'}, and hot summer nights went from ${c.n0} to ${c.n1}` : ''}. ${c.sig} of ${c.nInd} climate indicators show a statistically significant trend.`,
    future: (c) => `Three NASA climate models (NEX-GDDP-CMIP6, moderate emissions) project the growing season here to warm by ${c.dT} °C by the 2050s, with ${c.rain >= 0 ? '+' : ''}${c.rain}% rain. Hot summer days would go from ${c.hot0} to about ${c.hot1} a year.`,
    plan: (c) => `For this field, ${c.top} scores ${c.score}/100, ${c.diff} points ahead of ${c.base}. ${c.robust}On ${c.acres} acres it would save about ${c.lb} lb of nitrogen per acre, $${c.usd} and ${c.co2} tonnes of CO₂e every year.`,
    robust: (lo, hi) => `Under all three NASA climate models for the 2050s it still ranks #${lo}${hi !== lo ? '–#' + hi : ''}. `,
    big: { degdays: 'degree-days', hot: 'hot days', yr: 'year', pts: 'points better', warmer: 'warmer' },
    read: '🔊 Read aloud', stop: '⏹ Stop', lang: '🌐 Español', cta: 'See all rotations →'
  },
  es: {
    ch1: 'Conozca el campo', ch2: 'El clima para el que fue hecho', ch3: 'El año en que todo salió mal',
    ch4: 'La nueva normalidad', ch5: 'Adelantemos a la década de 2050', ch6: 'Un plan que resiste',
    meet: (c) => `${c.name} tiene un suelo ${es(c.texture)} (pH ${c.ph}, ${c.soc} g/kg de carbono orgánico). Cada número de esta historia proviene de satélites y modelos de la NASA para este punto exacto de la Tierra: ${c.days.toLocaleString('es')} días de clima, de ${c.y0} a ${c.y1}.`,
    meetNoSoil: (c) => `Cada número de esta historia proviene de satélites y modelos de la NASA para este punto exacto de la Tierra: ${c.days.toLocaleString('es')} días de clima, de ${c.y0} a ${c.y1}.`,
    built: (c) => `De ${c.b0} a ${c.b1}, la temporada de cultivo tuvo en promedio ${c.gdd} grados-día de calor, ${c.ff} días sin heladas y ${c.hot} días calurosos (≥ 32 °C) cada verano. Ese es el clima sobre el que se construyeron la mayoría de las costumbres agrícolas.`,
    worst: (c) => `En ${c.year}, ${c.hot} días de verano superaron los 32 °C, la temporada recibió ${c.rain} mm de lluvia y la racha seca más larga duró ${c.dry} días. Usando solo datos de la NASA, nuestro modelo le da al ${esCrop(c.crop)} apenas ${c.score}/100 ese año, una de sus peores temporadas en ${c.n} años.`,
    newNormal: (c) => `Desde ${c.r0}, el calor de la temporada ${c.dGdd >= 0 ? 'subió' : 'bajó'} ${Math.abs(c.dGdd)} grados-día y el período sin heladas es ${Math.abs(c.dFf)} días más ${c.dFf >= 0 ? 'largo' : 'corto'}. Los aguaceros fuertes de primavera pasaron de ${c.del0} a ${c.del1} por año${c.plant != null ? `, el suelo se calienta lo suficiente para sembrar unos ${Math.abs(c.plant)} días ${c.plant <= 0 ? 'antes' : 'después'} y las noches calurosas de verano pasaron de ${c.n0} a ${c.n1}` : ''}. ${c.sig} de ${c.nInd} indicadores climáticos muestran una tendencia estadísticamente significativa.`,
    future: (c) => `Tres modelos climáticos de la NASA (NEX-GDDP-CMIP6, emisiones moderadas) proyectan que la temporada de cultivo aquí se calentará ${c.dT} °C para la década de 2050, con ${c.rain >= 0 ? '+' : ''}${c.rain}% de lluvia. Los días calurosos de verano pasarían de ${c.hot0} a unos ${c.hot1} por año.`,
    plan: (c) => `Para este campo, ${c.top} obtiene ${c.score}/100, ${c.diff} puntos más que ${c.base}. ${c.robust}En ${c.acres} acres ahorraría unas ${c.lb} libras de nitrógeno por acre, $${c.usd} y ${c.co2} toneladas de CO₂e cada año.`,
    robust: (lo, hi) => `Con los tres modelos climáticos de la NASA para 2050 sigue en el puesto #${lo}${hi !== lo ? '–#' + hi : ''}. `,
    big: { degdays: 'grados-día', hot: 'días calurosos', yr: 'año', pts: 'puntos mejor', warmer: 'más cálido' },
    read: '🔊 Leer en voz alta', stop: '⏹ Detener', lang: '🌐 English', cta: 'Ver todas las rotaciones →'
  }
};

const TEXTURE_ES = { clay: 'arcilloso', 'silty clay loam': 'franco arcillo limoso', 'clay loam': 'franco arcilloso', sand: 'arenoso',
  'loamy sand': 'arenoso franco', silt: 'limoso', 'silt loam': 'franco limoso', 'sandy loam': 'franco arenoso', loam: 'franco', unknown: 'desconocido' };
const es = (t) => TEXTURE_ES[t] || t;
const CROP_ES = { 'corn (maize)': 'maíz', soybean: 'soja', 'winter wheat': 'trigo de invierno', 'spring wheat': 'trigo de primavera',
  'grain sorghum': 'sorgo', sunflower: 'girasol', 'field pea': 'arveja', canola: 'canola', 'oats (spring)': 'avena', 'alfalfa (hay)': 'alfalfa' };
const esCrop = (c) => CROP_ES[c.toLowerCase()] || c;
const ROT_ES = (name) => name.replace(/Corn/g, 'Maíz').replace(/Soybean/g, 'Soja').replace(/Winter wheat/g, 'Trigo de invierno')
  .replace(/Spring wheat/g, 'Trigo de primavera').replace(/Sorghum/g, 'Sorgo').replace(/Sunflower/g, 'Girasol')
  .replace(/Field pea/g, 'Arveja').replace(/Oats \+ alfalfa/g, 'Avena + alfalfa').replace(/Alfalfa/g, 'Alfalfa')
  .replace(/Canola/g, 'Canola').replace(/Continuous corn/g, 'Maíz continuo').replace(/, with a cereal rye cover/g, ', con cultivo de cobertura de centeno');

export const storyStrings = (lang) => T[lang];

/** Small inline SVG chart: bars for values, highlighted indices. */
export function sparkBars(values, { highlight = [], color = 'var(--brand-2)', hi = 'var(--accent)', split = null } = {}) {
  const w = 300, h = 60, n = values.length, max = Math.max(...values.filter((v) => v !== null)), min = Math.min(0, ...values);
  const bw = w / n;
  const bars = values.map((v, i) => {
    const bh = max === min ? 0 : ((v - min) / (max - min)) * (h - 4);
    return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="${highlight.includes(i) ? hi : color}" opacity="${split !== null && i < split ? 0.45 : 1}"/>`;
  }).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-hidden="true">${bars}</svg>`;
}

/**
 * Build chapters. ctx = { lang, name, soil, rows, summary, rel, top, base, impact, robust, future, acres }
 */
export function buildStory(ctx) {
  const L = T[ctx.lang];
  const { rows, summary } = ctx;
  const S = (k) => summary.find((s) => s.key === k);
  const years = rows.map((r) => r.year);
  const g = S('gdd'), ff = S('frostFree'), hd = S('hotDays'), del = S('springDeluge');
  const r0 = (n, d = 0) => Number(n.toFixed(d));
  const chapters = [];

  const soil = ctx.soil;
  const meetC = { name: ctx.name, texture: soil?.texture, ph: soil?.ph?.toFixed(1), soc: Math.round(soil?.soc || 0),
    days: rows.length * 365, y0: years[0], y1: years[years.length - 1] };
  chapters.push({ icon: '📍', title: L.ch1, big: `${years.length}`, bigLabel: ctx.lang === 'es' ? 'años de datos NASA' : 'years of NASA data',
    text: soil ? L.meet(meetC) : L.meetNoSoil(meetC) });

  const baseIdx = years.map((y, i) => (y <= g.baseYears[1] ? i : -1)).filter((i) => i >= 0);
  chapters.push({ icon: '🕰️', title: L.ch2, big: `${r0(g.base)}`, bigLabel: L.big.degdays,
    text: L.built({ b0: g.baseYears[0], b1: g.baseYears[1], gdd: r0(g.base), ff: r0(ff.base), hot: r0(hd.base, 1) }),
    chart: sparkBars(rows.map((r) => r.gdd), { highlight: [], split: null, color: 'var(--brand)' }).replace('<svg', `<svg data-base="${baseIdx.length}"`) });

  // Worst season for the main cash crop (corn if evaluated, else the crop of the base rotation)
  const cropKey = ctx.rel.corn ? 'corn' : Object.keys(ctx.rel)[0];
  const rel = ctx.rel[cropKey];
  const worst = [...rel.results].sort((a, b) => a.score - b.score)[0];
  const wr = rows.find((r) => r.year === worst.year);
  chapters.push({ icon: '💥', title: L.ch3, big: `${worst.year}`, bigLabel: `${worst.score}/100`,
    text: L.worst({ year: worst.year, hot: wr.hotDays, rain: Math.round(wr.gsRain), dry: wr.drySpell, crop: rel.crop.name.toLowerCase(), score: worst.score, n: rel.results.length }),
    chart: sparkBars(rows.map((r) => r.hotDays), { highlight: [years.indexOf(worst.year)], color: 'var(--mid)' }) });

  const sig = summary.filter((s) => s.mk.p < 0.05).length;
  chapters.push({ icon: '📈', title: L.ch4, big: `${g.delta >= 0 ? '+' : ''}${r0(g.delta)}`, bigLabel: L.big.degdays,
    text: L.newNormal({ r0: g.recentYears[0], dGdd: r0(g.delta), dFf: r0(ff.delta), del0: r0(del.base, 1), del1: r0(del.recent, 1), sig, nInd: summary.length,
      plant: S('plantDate') && !Number.isNaN(S('plantDate').delta) ? Math.round(S('plantDate').delta) : null,
      n0: S('hotNights') ? r0(S('hotNights').base, 1) : null, n1: S('hotNights') ? r0(S('hotNights').recent, 1) : null }),
    chart: sparkBars(rows.map((r) => r.gdd), { split: years.length - (g.recentYears[1] - g.recentYears[0] + 1), color: 'var(--brand-2)' }) });

  if (ctx.future) {
    const f = ctx.future;
    chapters.push({ icon: '🔭', title: L.ch5, big: `+${f.dT.toFixed(1)} °C`, bigLabel: '2050s',
      text: L.future({ dT: f.dT.toFixed(1), rain: Math.round(f.rainPct), hot0: r0(hd.recent, 1), hot1: Math.round(f.hotDays) }) });
  }

  const top = ctx.top, base = ctx.base, im = ctx.impact;
  const topName = ctx.lang === 'es' ? ROT_ES(top.name) : top.name;
  const baseName = ctx.lang === 'es' ? ROT_ES(base.name) : base.name;
  chapters.push({ icon: '🌱', title: L.ch6, big: `${Math.round(top.total)}/100`, bigLabel: topName,
    text: L.plan({ top: topName, score: Math.round(top.total), diff: Math.round(top.total - base.total), base: baseName,
      robust: ctx.robust ? L.robust(ctx.robust[0], ctx.robust[1]) : '', acres: ctx.acres,
      lb: Math.round(im.savedLbPerAc), usd: Math.round(im.dollars).toLocaleString(), co2: Math.round(im.tCO2e) }) });
  return chapters;
}
