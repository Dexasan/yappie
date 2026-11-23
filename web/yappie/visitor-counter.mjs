import { DurableObject } from 'cloudflare:workers';
import { json, sign, signingKey } from './guest-web.mjs';

const cookieName = '__Host-yappie_visitor';
const day = 86_400_000;
const lifetime = 365 * day;
const proofLifetime = 10 * 60_000;
const encoder = new TextEncoder();
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const cookiePattern = new RegExp(`^(${uuid})\\.(\\d{13})\\.([01])\\.([a-f0-9]{64})$`);
const proofPattern = new RegExp(`^(${uuid})\\.(\\d{13})\\.(${uuid})\\.([a-f0-9]{64})$`);
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

async function validSignature(key, value, signature) {
  const bytes = Uint8Array.from(signature.match(/../g), pair => Number.parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(value));
}

async function visitorCookie(request, key, now) {
  const raw = request.headers.get('Cookie')?.split(';').map(entry => entry.trim())
    .find(entry => entry.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const match = cookiePattern.exec(raw ?? '');
  if (!match) return null;
  const [, id, expires, counted, signature] = match;
  if (+expires <= now || +expires > now + lifetime + 60_000 ||
      !await validSignature(key, `visitor-cookie:${id}.${expires}.${counted}`, signature)) return null;
  return { id, expires: +expires, counted: counted === '1' };
}

async function setVisitorCookie(key, visitor, counted, now) {
  const value = `${visitor.id}.${visitor.expires}.${counted ? '1' : '0'}`;
  const signature = await sign(key, `visitor-cookie:${value}`);
  return `${cookieName}=${value}.${signature}; Path=/; Max-Age=${Math.max(0, Math.floor((visitor.expires - now) / 1000))}; HttpOnly; Secure; SameSite=Strict`;
}

function obviousAutomation(request) {
  const ua = request.headers.get('User-Agent') ?? '';
  const bot = request.cf?.botManagement;
  return !ua || /bot\b|crawler|spider|headless|lighthouse|curl\b|wget\b|python|httpclient|go-http-client|playwright|puppeteer|selenium/i.test(ua) ||
    bot?.verifiedBot === true || (typeof bot?.score === 'number' && bot.score < 30);
}

async function smallJson(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 512) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

export async function handleVisitorCounter(request, env) {
  const { pathname, origin } = new URL(request.url);
  if (!['/visitor-api/count', '/visitor-api/start', '/visitor-api/commit'].includes(pathname)) return json({ message: 'Not found.' }, 404);
  if (!env.VISITOR_COUNTER || env.WEB_CHAT_SECRET?.length < 32 || !env.WEB_CHAT_SECRET) return json({ message: 'Visitor count unavailable.' }, 503);
  try {
    const counter = env.VISITOR_COUNTER.getByName('public-visitors-v1');
    if (pathname === '/visitor-api/count') {
      if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405, { Allow: 'GET' });
      return await counter.fetch('https://internal/count');
    }
    if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405, { Allow: 'POST' });
    if (request.headers.get('Origin') !== origin ||
        (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin') ||
        request.headers.get('Content-Type')?.split(';')[0] !== 'application/json' ||
        request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1' || obviousAutomation(request)) {
      return json({ message: 'Visit not counted.' }, 403);
    }
    const body = await smallJson(request);
    if (!body || typeof body !== 'object') return json({ message: 'Invalid visit.' }, 400);
    const now = Date.now();
    const key = await signingKey(env.WEB_CHAT_SECRET);
    const existing = await visitorCookie(request, key, now);
    // Daily, counter-specific HMACs are not linkable to chat network identifiers.
    // Neither raw IP addresses nor user agents are persisted by this counter.
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) return json({ message: 'Visit not counted.' }, 403);
    const network = await sign(key, `visitor-network:${new Date(now).toISOString().slice(0, 10)}:${ip}`);
    if (pathname === '/visitor-api/start') {
      if (existing?.counted) {
        const stats = await counter.fetch('https://internal/count');
        if (!stats.ok) return stats;
        return json({ ...await stats.json(), complete: true });
      }
      const allowed = await counter.fetch('https://internal/start', { method: 'POST', headers: { 'X-Network': network } });
      if (!allowed.ok) return allowed;
      const visitor = existing ?? { id: crypto.randomUUID(), expires: now + lifetime };
      const unsigned = `${visitor.id}.${now}.${crypto.randomUUID()}`;
      // Bind the short-lived proof to this browser cookie and its starting network.
      const signature = await sign(key, `visitor-proof:${unsigned}:${ip}`);
      return json({ token: `${unsigned}.${signature}` }, 200, {
        'Set-Cookie': await setVisitorCookie(key, visitor, false, now),
      });
    }
    const proof = proofPattern.exec(typeof body.token === 'string' ? body.token : '');
    if (!existing || !proof || proof[1] !== existing.id || now - +proof[2] < 8000 || now - +proof[2] > proofLifetime ||
        !await validSignature(key, `visitor-proof:${proof[1]}.${proof[2]}.${proof[3]}:${ip}`, proof[4])) {
      return json({ message: 'Visit not counted.' }, 403);
    }
    const response = await counter.fetch('https://internal/commit', {
      method: 'POST', headers: { 'X-Network': network, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: existing.id, expires: existing.expires }),
    });
    if (!response.ok) return response;
    return json(await response.json(), 200, { 'Set-Cookie': await setVisitorCookie(key, existing, true, now) });
  } catch {
    return json({ message: 'Visitor count unavailable.' }, 503);
  }
}

export class VisitorCounter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS visitor_totals (id INTEGER PRIMARY KEY CHECK(id = 1), total INTEGER NOT NULL, since INTEGER NOT NULL, cleaned INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS counted_visitors (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS visitor_expiry ON counted_visitors(expires);
      CREATE TABLE IF NOT EXISTS visitor_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, counted INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS visitor_limit_expiry ON visitor_limits(expires);`);
    this.sql.exec('INSERT OR IGNORE INTO visitor_totals VALUES (1, 0, ?, ?)', Date.now(), Date.now());
  }

  row(query, ...args) { return this.sql.exec(query, ...args).toArray()[0]; }
  stats() {
    const { total, since } = this.row('SELECT total, since FROM visitor_totals WHERE id = 1');
    return { count: total, since, estimate: true };
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/count' && request.method === 'GET') return json(this.stats());
    const network = request.headers.get('X-Network');
    if (request.method !== 'POST' || !/^[a-f0-9]{64}$/.test(network ?? '')) return json({ message: 'Invalid visit.' }, 400);
    const now = Date.now();
    if (path === '/start') {
      const limit = this.row(`INSERT INTO visitor_limits VALUES (?, 1, 0, ?)
        ON CONFLICT(key) DO UPDATE SET attempts = MIN(attempts + 1, 61) RETURNING attempts`, network, now + 2 * day);
      return limit.attempts <= 60 ? json({ ready: true }) : json({ message: 'Visit not counted.' }, 429);
    }
    if (path !== '/commit') return json({ message: 'Not found.' }, 404);
    const { id, expires } = await request.json();
    if (!new RegExp(`^${uuid}$`).test(id ?? '') || !Number.isSafeInteger(expires) || expires <= now || expires > now + lifetime + 60_000) return json({ message: 'Invalid visit.' }, 400);
    return this.ctx.storage.transactionSync(() => {
      if (this.row('SELECT id FROM counted_visitors WHERE id = ?', id)) return json(this.stats());
      // A valid proof can cross UTC midnight, when the daily network HMAC changes.
      this.sql.exec('INSERT OR IGNORE INTO visitor_limits VALUES (?, 0, 0, ?)', network, now + 2 * day);
      const limit = this.row('SELECT counted FROM visitor_limits WHERE key = ?', network);
      // Limit cleared-cookie inflation without counting IP addresses as visitors.
      // Shared networks may be undercounted; this remains an estimate.
      if (limit.counted >= 10) return json({ message: 'Visit not counted.' }, 429);
      this.sql.exec('INSERT INTO counted_visitors VALUES (?, ?)', id, expires);
      this.sql.exec('UPDATE visitor_limits SET counted = counted + 1 WHERE key = ?', network);
      this.sql.exec('UPDATE visitor_totals SET total = total + 1 WHERE id = 1');
      if (this.row('SELECT cleaned FROM visitor_totals WHERE id = 1').cleaned < now - day) {
        this.sql.exec('DELETE FROM counted_visitors WHERE expires <= ?', now);
        this.sql.exec('DELETE FROM visitor_limits WHERE expires <= ?', now);
        this.sql.exec('UPDATE visitor_totals SET cleaned = ? WHERE id = 1', now);
      }
      return json(this.stats());
    });
  }
}
