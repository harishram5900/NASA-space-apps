// Local stand-in for Azure Static Web Apps: serves the site and routes /api/* to the
// real Azure Functions handlers in api/src/functions. Point AZURE_STORAGE_CONNECTION_STRING
// at Azurite (Microsoft's storage emulator) to exercise the Blob Storage cache.
//   node tools/azure-local.mjs   →  http://localhost:4280
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fns = {};
for (const name of ['health', 'power', 'recent', 'soil', 'places', 'advisor']) {
  fns[name] = (await import(path.join(root, 'api/src/functions', `${name}.js`))).handler;
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const fn = fns[url.pathname.slice(5)];
    if (!fn) { res.writeHead(404); return res.end(); }
    let body = '';
    for await (const chunk of req) body += chunk;
    const out = await fn({ query: url.searchParams, headers: new Map(Object.entries(req.headers)), json: async () => JSON.parse(body || '{}') }, { log: console.log });
    res.writeHead(out.status || 200, { 'Content-Type': 'application/json', ...(out.headers || {}) });
    return res.end(JSON.stringify(out.jsonBody ?? {}));
  }
  let file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(Number(process.env.PORT || 4280), () => console.log(`AgriHaven + Azure Functions (local) on http://localhost:${process.env.PORT || 4280}`));
