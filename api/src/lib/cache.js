// Azure Blob Storage cache for NASA and soil responses.
//
// NASA POWER can take 10+ seconds for a 35-year daily request. AgriHaven stores
// each response as a JSON blob in Azure Blob Storage, so the next visit to the
// same field (and every demo) loads from Azure in well under a second.
// Without a connection string (local dev, tests) it falls back to memory.

import { createHash } from 'node:crypto';

const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || 'nasa-cache';
const memory = new Map();
let containerPromise = null;

async function container() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) return null;
  if (!containerPromise) {
    containerPromise = (async () => {
      const { BlobServiceClient } = await import('@azure/storage-blob');
      const c = BlobServiceClient.fromConnectionString(conn).getContainerClient(CONTAINER);
      await c.createIfNotExists();
      return c;
    })().catch((e) => { containerPromise = null; throw e; });
  }
  return containerPromise;
}

export function cacheKey(kind, url) {
  return `${kind}/${createHash('sha256').update(url).digest('hex').slice(0, 40)}.json`;
}

export function backend() {
  return process.env.AZURE_STORAGE_CONNECTION_STRING ? 'azure-blob' : 'memory';
}

/** Get a cached JSON value; returns { value, storedAt } or null. ttlMs = max age (Infinity = forever). */
export async function cacheGet(key, ttlMs = Infinity) {
  const c = await container().catch(() => null);
  if (!c) {
    const hit = memory.get(key);
    return hit && Date.now() - hit.storedAt <= ttlMs ? hit : null;
  }
  try {
    const blob = c.getBlockBlobClient(key);
    const props = await blob.getProperties();
    const storedAt = props.lastModified ? props.lastModified.getTime() : 0;
    if (Date.now() - storedAt > ttlMs) return null;
    const buf = await blob.downloadToBuffer();
    return { value: JSON.parse(buf.toString('utf8')), storedAt };
  } catch {
    return null; // not found or unreadable
  }
}

export async function cacheSet(key, value) {
  const c = await container().catch(() => null);
  if (!c) { memory.set(key, { value, storedAt: Date.now() }); return; }
  const body = JSON.stringify(value);
  await c.getBlockBlobClient(key).upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json', blobCacheControl: 'public, max-age=86400' }
  }).catch(() => {});
}

export function _resetMemory() { memory.clear(); }
