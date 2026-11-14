// Tests for the Azure Functions backend (run: npm run test:api).
// Upstream services (NASA POWER, Azure OpenAI, Azure Maps) are mocked.
import assert from 'node:assert/strict';

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };
const req = (params = {}, body = null, headers = {}) => ({
  query: new URLSearchParams(params),
  headers: new Map(Object.entries(headers)),
  json: async () => body
});
const ctx = { log: () => {} };

let calls = [];
let mode = 'ok';
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), opts });
  if (mode === 'down') throw new Error('network down');
  const u = String(url);
  if (u.includes('power.larc.nasa.gov')) return { ok: true, json: async () => ({ properties: { parameter: { T2M_MAX: { 20250101: 1.5 } } } }) };
  if (u.includes('rest.isric.org')) return { ok: true, json: async () => ({ properties: { layers: [] } }) };
  if (u.includes('atlas.microsoft.com')) return { ok: true, json: async () => ({ results: [
    { position: { lat: 40.11, lon: -88.24 }, address: { municipality: 'Champaign', countrySecondarySubdivision: 'Champaign County', countrySubdivisionName: 'Illinois', countrySubdivisionCode: 'IL', country: 'United States', countryCode: 'US' } }
  ] }) };
  if (u.includes('openai.azure.com')) return { ok: true, json: async () => ({ model: 'gpt-4o-mini', choices: [{ message: { content: 'Your Water Certainty Rate is 82%.' } }], usage: { total_tokens: 120 } }) };
  return { ok: false, status: 404, json: async () => ({}) };
};

const { handler: power } = await import('../api/src/functions/power.js');
const { handler: soil } = await import('../api/src/functions/soil.js');
const { handler: health } = await import('../api/src/functions/health.js');
const { handler: advisor } = await import('../api/src/functions/advisor.js');
const { handler: places } = await import('../api/src/functions/places.js');
const { buildMessages, parseAdvisorRequest, allow, SYSTEM_PROMPT } = await import('../api/src/lib/advisor.js');
const { mapsToPlaces, coords } = await import('../api/src/lib/sources.js');

await test('power: validates coordinates', async () => {
  assert.equal((await power(req({ lat: 'x', lon: '1' }), ctx)).status, 400);
  assert.equal(coords(new URLSearchParams({ lat: '95', lon: '0' })), null);
});

await test('power: first call fetches NASA POWER (miss), second is served from the cache (hit)', async () => {
  calls = [];
  const a = await power(req({ lat: '40.2', lon: '-88.4' }), ctx);
  assert.equal(a.status, 200);
  assert.equal(a.jsonBody._agrihaven.cache, 'miss');
  assert.ok(calls[0].url.includes('power.larc.nasa.gov') && calls[0].url.includes('ALLSKY_SFC_UV_INDEX'));
  const b = await power(req({ lat: '40.2', lon: '-88.4' }), ctx);
  assert.equal(b.jsonBody._agrihaven.cache, 'hit');
  assert.equal(calls.length, 1, 'cache hit must not call NASA again');
  assert.ok(b.jsonBody.properties.parameter.T2M_MAX);
});

await test('soil: falls back to a stored copy when SoilGrids is down', async () => {
  mode = 'ok';
  await soil(req({ lat: '41', lon: '-90' }), ctx);
  mode = 'down';
  const r = await soil(req({ lat: '41', lon: '-90' }), ctx);
  assert.equal(r.status, 200); // served from cache (hit) even with upstream down
  const fresh = await soil(req({ lat: '10', lon: '10' }), ctx);
  assert.equal(fresh.status, 502);
  mode = 'ok';
  const remembered = await soil(req({ lat: '10', lon: '10' }), ctx);
  assert.equal(remembered.status, 502, 'a failed point is remembered, so the next visit does not wait');
  assert.equal(remembered.headers['X-AgriHaven-Cache'], 'negative');
  mode = 'ok';
});

await test('health reports which Azure services are configured', async () => {
  const r = await health(req());
  assert.equal(r.jsonBody.platform, 'Microsoft Azure');
  assert.equal(r.jsonBody.services.functions, true);
  assert.equal(r.jsonBody.services.openai, false);
});

await test('advisor: 503 without Azure OpenAI settings, grounded answer with them', async () => {
  const body = { question: '¿Qué rotación me conviene?', lang: 'es', context: { field: 'Champaign', waterCertainty: { top: 82 } } };
  assert.equal((await advisor(req({}, body), ctx)).status, 503);
  process.env.AZURE_OPENAI_ENDPOINT = 'https://demo.openai.azure.com/';
  process.env.AZURE_OPENAI_KEY = 'test-key';
  calls = [];
  const r = await advisor(req({}, body, { 'x-forwarded-for': '1.2.3.4' }), ctx);
  assert.equal(r.status, 200);
  assert.match(r.jsonBody.answer, /82%/);
  const call = calls.find((c) => c.url.includes('openai.azure.com'));
  assert.ok(call.url.includes('/openai/deployments/gpt-4o-mini/chat/completions?api-version='));
  assert.equal(call.opts.headers['api-key'], 'test-key');
  const sent = JSON.parse(call.opts.body);
  assert.equal(sent.messages[0].content, SYSTEM_PROMPT);
  assert.ok(sent.messages[1].content.includes('"waterCertainty"') && sent.messages[1].content.includes('Spanish'));
});

await test('advisor: rejects empty questions and missing field data', async () => {
  assert.throws(() => parseAdvisorRequest({ question: '', context: {} }));
  assert.throws(() => parseAdvisorRequest({ question: 'What should I plant?' }));
  const m = buildMessages(parseAdvisorRequest({ question: 'What should I plant?', context: { a: 1 } }));
  assert.equal(m.length, 2);
});

await test('advisor: per-client rate limit', async () => {
  const t = 1e12;
  for (let i = 0; i < 3; i++) assert.ok(allow('x', 3, 1000, t + i));
  assert.equal(allow('x', 3, 1000, t + 5), false);
  assert.ok(allow('x', 3, 1000, t + 2000));
});

await test('places: Azure Maps results become AgriHaven suggestions', async () => {
  assert.equal((await places(req({ q: 'cham' }))).status, 503);
  process.env.AZURE_MAPS_KEY = 'maps-key';
  calls = [];
  const r = await places(req({ q: 'champaign' }));
  assert.equal(r.status, 200);
  assert.equal(r.jsonBody.places[0].main, 'Champaign');
  assert.equal(r.jsonBody.places[0].detail, 'Champaign County, Illinois, United States');
  assert.ok(calls[0].url.includes('typeahead=true') && calls[0].url.includes('subscription-key=maps-key'));
  assert.deepEqual(mapsToPlaces({}), []);
});

console.log(`\n${passed} Azure API tests passed`);
