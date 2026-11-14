// Helpers shared by the HTTP functions.
import { cacheGet, cacheSet, cacheKey, backend } from '../lib/cache.js';
import { fetchJson } from '../lib/sources.js';

export const json = (status, body, extra = {}) => ({
  status,
  jsonBody: body,
  headers: { 'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store', ...extra }
});

/** Serve an upstream JSON URL through the Azure Blob Storage cache. */
export async function cached(kind, url, ttlMs, context, upstreamMs = 60000, negativeTtlMs = 0) {
  const t0 = Date.now();
  const key = cacheKey(kind, url);
  const negKey = key.replace('.json', '.unavailable.json');
  const hit = await cacheGet(key, ttlMs);
  if (!hit && negativeTtlMs && (await cacheGet(negKey, negativeTtlMs))) {
    return json(502, { error: 'Upstream recently unavailable for this point (remembered by AgriHaven on Azure)' }, { 'X-AgriHaven-Cache': 'negative' });
  }
  if (hit) {
    return json(200, { ...hit.value, _agrihaven: { cache: 'hit', backend: backend(), ms: Date.now() - t0, storedAt: new Date(hit.storedAt).toISOString() } },
      { 'X-AgriHaven-Cache': 'hit' });
  }
  try {
    const value = await fetchJson(url, upstreamMs);
    await cacheSet(key, value);
    return json(200, { ...value, _agrihaven: { cache: 'miss', backend: backend(), ms: Date.now() - t0 } }, { 'X-AgriHaven-Cache': 'miss' });
  } catch (e) {
    context?.log?.(`upstream failed for ${kind}: ${e.message}`);
    // Serve a stale copy if we have one rather than failing the farmer.
    const stale = await cacheGet(key, Infinity);
    if (stale) return json(200, { ...stale.value, _agrihaven: { cache: 'stale', backend: backend(), ms: Date.now() - t0 } }, { 'X-AgriHaven-Cache': 'stale' });
    if (negativeTtlMs) await cacheSet(negKey, { unavailable: true, reason: e.message });
    return json(502, { error: `Upstream data source unavailable (${e.message})` });
  }
}
