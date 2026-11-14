import { app } from '@azure/functions';
import { mapsUrl, mapsToPlaces, fetchJson } from '../lib/sources.js';
import { cacheGet, cacheSet, cacheKey } from '../lib/cache.js';
import { json } from './_shared.js';

// Search-as-you-type place suggestions from Azure Maps (key stays server-side).
export const handler = async (req) => {
    const key = process.env.AZURE_MAPS_KEY;
    if (!key) return json(503, { error: 'Azure Maps not configured' });
    const q = (req.query.get('q') || '').trim().slice(0, 80);
    if (q.length < 2) return json(400, { error: 'q too short' });
    const ck = cacheKey('places', q.toLowerCase());
    const hit = await cacheGet(ck, 7 * 86400 * 1000);
    if (hit) return json(200, { places: hit.value, source: 'Azure Maps (cached)' });
    try {
      const places = mapsToPlaces(await fetchJson(mapsUrl(q, key), 8000));
      await cacheSet(ck, places);
      return json(200, { places, source: 'Azure Maps' });
    } catch (e) {
      return json(502, { error: `Azure Maps unavailable (${e.message})` });
    }
  };

app.http('places', {
  methods: ['GET'], authLevel: 'anonymous', route: 'places',
  handler
});
