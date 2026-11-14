import { app } from '@azure/functions';
import { coords, powerUrl } from '../lib/sources.js';
import { cached, json } from './_shared.js';

// 35 years of daily NASA POWER data. Past years never change, so cache forever.
export const handler = async (req, context) => {
    const c = coords(req.query);
    if (!c) return json(400, { error: 'lat and lon required' });
    const end = Number(req.query.get('end')) || new Date().getUTCFullYear() - 1;
    return cached('power', powerUrl(c.lat, c.lon, 1991, end), Infinity, context);
  };

app.http('power', {
  methods: ['GET'], authLevel: 'anonymous', route: 'power',
  handler
});
