// Microsoft Azure integration.
//
// When AgriHaven runs on Azure Static Web Apps, its Azure Functions backend at /api
// provides: NASA POWER + SoilGrids data through an Azure Blob Storage cache,
// "Ask AgriHaven" on Azure OpenAI, and place search on Azure Maps.
// /api/health says which of those are configured. Anywhere else (local files,
// another host) every call falls back to the public APIs, so the app always works.

const BASE = (typeof window !== 'undefined' && window.AGRIHAVEN_API) || 'api';
const status = { checked: false, ok: false, services: {}, region: null, lastData: null };
let probe = null;

export function azureStatus() { return status; }

export function checkAzure(timeoutMs = 2500) {
  if (probe) return probe;
  probe = (async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE}/health`, { signal: ctl.signal, cache: 'no-store' });
      const j = res.ok ? await res.json() : null;
      if (j && j.ok && j.platform === 'Microsoft Azure') Object.assign(status, { ok: true, services: j.services || {}, region: j.region });
    } catch { /* not on Azure */ }
    clearTimeout(t);
    status.checked = true;
    return status;
  })();
  return probe;
}

async function getAzureJson(path, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(`${BASE}/${path}`, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Azure ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** NASA data via Azure Functions (cached in Blob Storage). Returns null if Azure isn't available. */
export async function azureData(kind, lat, lon, ms = 70000) {
  await checkAzure();
  if (!status.ok) return null;
  const t0 = performance.now();
  try {
    const json = await getAzureJson(`${kind}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, ms);
    const meta = json._agrihaven || {};
    status.lastData = { ...status.lastData, [kind]: { cache: meta.cache, backend: meta.backend, ms: Math.round(performance.now() - t0) } };
    return json;
  } catch {
    return null;
  }
}

export async function azurePlaces(q, signal) {
  await checkAzure();
  if (!status.ok || !status.services.maps) return null;
  const res = await fetch(`${BASE}/places?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) return null;
  return (await res.json()).places;
}

export async function askAgriHaven(question, context, lang) {
  const res = await fetch(`${BASE}/advisor`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context, lang })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Azure OpenAI error ${res.status}`);
  return j;
}
