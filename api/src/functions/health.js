import { app } from '@azure/functions';
import { backend } from '../lib/cache.js';

export const handler = async () => ({
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
    jsonBody: {
      ok: true,
      platform: 'Microsoft Azure',
      services: {
        staticWebApps: true,
        functions: true,
        blobStorage: backend() === 'azure-blob',
        openai: Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY),
        maps: Boolean(process.env.AZURE_MAPS_KEY)
      },
      region: process.env.REGION_NAME || null,
      time: new Date().toISOString()
    }
  });

app.http('health', {
  methods: ['GET'], authLevel: 'anonymous', route: 'health',
  handler
});
