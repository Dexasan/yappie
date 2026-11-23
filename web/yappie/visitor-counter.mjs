import { DurableObject } from 'cloudflare:workers';
import { json, sign, signingKey } from './guest-web.mjs';

const day = 86_400_000;
const proofLifetime = 10 * 60_000;
const encoder = new TextEncoder();
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const proofPattern = new RegExp(`^(${uuid})\\.(\\d{13})\\.([a-f0-9]{64})$`);
const publicPages = /^\/(?:about|conversation-starters|chat-safety|chat-rules|privacy|support)(?:\.html|\/)?$/;

export function withVisitorCounter(request, response) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' || response.status !== 200 ||
      !response.headers.get('Content-Type')?.includes('text/html') ||
      (path !== '/' && !publicPages.test(path))) return response;
  return new HTMLRewriter().on('head', {
    element: element => element.append('<script type="module" src="/visitor-counter.js"></script>', { html: true }),
  }).transform(response);
}

async function smallJson(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let body = '';
  let size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 512) { await reader.cancel(); return null; }
    body += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(body + decoder.decode()); } catch { return null; }
}

export async function handleVisitorCounter(request, env) {
  const { pathname, origin } = new URL(request.url);
  if (!['/visitor-api/count', '/visitor-api/start', '/visitor-api/commit'].includes(pathname)) return json({ message: 'Not found.' }, 404);
  if (!env.VISITOR_COUNTER || !env.WEB_CHAT_SECRET || env.WEB_CHAT_SECRET.length < 32) return json({ message: 'Visit count unavailable.' }, 503);
  try {
    const counter = env.VISITOR_COUNTER.getByName('public-visitors-v1');
    if (pathname === '/visitor-api/count') {
      if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405, { Allow: 'GET' });
      return await counter.fetch('https://internal/count');
    }
    if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405, { Allow: 'POST' });
    if (request.headers.get('Origin') !== origin ||
        (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin') ||
        request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return json({ message: 'Visit not counted.' }, 403);
    const body = await smallJson(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ message: 'Invalid visit.' }, 400);
    const key = await signingKey(env.WEB_CHAT_SECRET);
    const now = Date.now();
    if (pathname === '/visitor-api/start') {
      const unsigned = `${crypto.randomUUID()}.${now}`;
      const signature = await sign(key, `page-visit-v2:${unsigned}`);
      return json({ token: `${unsigned}.${signature}` });
    }
    const proof = proofPattern.exec(typeof body.token === 'string' ? body.token : '');
    if (!proof || now - +proof[2] < 5000 || now - +proof[2] >= proofLifetime) return json({ message: 'Visit not counted.' }, 403);
    const signature = Uint8Array.from(proof[3].match(/../g), pair => Number.parseInt(pair, 16));
    if (!await crypto.subtle.verify('HMAC', key, signature, encoder.encode(`page-visit-v2:${proof[1]}.${proof[2]}`))) return json({ message: 'Visit not counted.' }, 403);
    return await counter.fetch('https://internal/commit', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: proof[1], expires: +proof[2] + proofLifetime }),
    });
  } catch {
    return json({ message: 'Visit count unavailable.' }, 503);
  }
}

export class VisitorCounter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS visitor_totals (id INTEGER PRIMARY KEY CHECK(id = 1), total INTEGER NOT NULL, since INTEGER NOT NULL, cleaned INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS recorded_visits (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS recorded_visit_expiry ON recorded_visits(expires);
      CREATE TABLE IF NOT EXISTS counted_visitors (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS visitor_expiry ON counted_visitors(expires);
      CREATE TABLE IF NOT EXISTS visitor_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, counted INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS visitor_limit_expiry ON visitor_limits(expires);`);
    this.sql.exec('INSERT OR IGNORE INTO visitor_totals VALUES (1, 0, ?, ?)', Date.now(), Date.now());
  }

  row(query, ...args) { return this.sql.exec(query, ...args).toArray()[0]; }
  stats() {
    const { total, since } = this.row('SELECT total, since FROM visitor_totals WHERE id = 1');
    return { count: total, since, metric: 'visits', minimumSeconds: 5 };
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/count' && request.method === 'GET') return json(this.stats());
    if (path !== '/commit' || request.method !== 'POST') return json({ message: 'Not found.' }, 404);
    const { id, expires } = await request.json();
    const now = Date.now();
    if (!new RegExp(`^${uuid}$`).test(id ?? '') || !Number.isSafeInteger(expires) || expires <= now || expires > now + proofLifetime) return json({ message: 'Invalid visit.' }, 400);
    return this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM recorded_visits WHERE expires <= ?', now);
      const added = this.row('INSERT OR IGNORE INTO recorded_visits VALUES (?, ?) RETURNING id', id, expires);
      if (added) this.sql.exec('UPDATE visitor_totals SET total = total + 1 WHERE id = 1');
      // Legacy cookie/network rows no longer affect counting; retain expiry cleanup.
      if (this.row('SELECT cleaned FROM visitor_totals WHERE id = 1').cleaned < now - day) {
        this.sql.exec('DELETE FROM counted_visitors WHERE expires <= ?', now);
        this.sql.exec('DELETE FROM visitor_limits WHERE expires <= ?', now);
        this.sql.exec('UPDATE visitor_totals SET cleaned = ? WHERE id = 1', now);
      }
      return json(this.stats());
    });
  }
}
