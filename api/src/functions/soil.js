import { app } from '@azure/functions';
import { coords, soilUrl } from '../lib/sources.js';
import { cached, json } from './_shared.js';

// ISRIC SoilGrids profile to 1 m. Soil maps change rarely: cache forever.
export const handler = async (req, context) => {
    const c = coords(req.query);
    if (!c) return json(400, { error: 'lat and lon required' });
    return cached('soil', soilUrl(c.lat, c.lon), Infinity, context, 8000, 6 * 3600 * 1000);
  };

app.http('soil', {
  methods: ['GET'], authLevel: 'anonymous', route: 'soil',
  handler
});
