import { app } from '@azure/functions';
import { coords, recentUrl } from '../lib/sources.js';
import { cached, json } from './_shared.js';

// This season's near-real-time NASA POWER data: refresh every 6 hours.
export const handler = async (req, context) => {
    const c = coords(req.query);
    if (!c) return json(400, { error: 'lat and lon required' });
    return cached('recent', recentUrl(c.lat, c.lon), 6 * 3600 * 1000, context);
  };

app.http('recent', {
  methods: ['GET'], authLevel: 'anonymous', route: 'recent',
  handler
});
