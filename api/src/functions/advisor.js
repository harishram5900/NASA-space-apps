import { app } from '@azure/functions';
import { parseAdvisorRequest, buildMessages, callAzureOpenAI, allow } from '../lib/advisor.js';

// "Ask AgriHaven": Azure OpenAI answers grounded in the field's NASA-derived numbers.
export const handler = async (req, context) => {
    const client = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!allow(client)) return { status: 429, jsonBody: { error: 'Too many questions, please wait a few minutes.' } };
    let parsed;
    try { parsed = parseAdvisorRequest(await req.json()); }
    catch (e) { return { status: 400, jsonBody: { error: e.message } }; }
    try {
      const out = await callAzureOpenAI(buildMessages(parsed));
      return { status: 200, headers: { 'Cache-Control': 'no-store' }, jsonBody: { ...out, platform: 'Azure OpenAI' } };
    } catch (e) {
      context.log(`advisor failed: ${e.message}`);
      return { status: e.status || 500, jsonBody: { error: e.message } };
    }
  };

app.http('advisor', {
  methods: ['POST'], authLevel: 'anonymous', route: 'advisor',
  handler
});
