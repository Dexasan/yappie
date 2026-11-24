import { DurableObject } from 'cloudflare:workers';
import { json, sign, signingKey } from './guest-web.mjs';
import { WALL_CAPACITY, WALL_REMOVE_AT, WALL_MAX_WORDS, WALL_MAX_LENGTH, WALL_COLORS, cleanWallText, wallWordCount } from './public/wall-text.js';

const hour = 3_600_000;
const day = 24 * hour;
const reportRetention = 30 * day;
const isId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const reasons = new Set(['spam', 'harassment', 'sexual', 'personal', 'other']);
const encoder = new TextEncoder();

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let text = '', size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2048) { await reader.cancel(); return null; }
    text += decoder.decode(value, { stream: true });
  }
  try {
    const body = JSON.parse(text + decoder.decode());
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

export async function handleStickyWall(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.slice('/wall-api'.length);
  if (!['/notes', '/remove', '/report', '/moderation'].includes(path)) return json({ message: 'Not found.' }, 404);
  if (!env.STICKY_WALL || !env.WEB_CHAT_SECRET || env.WEB_CHAT_SECRET.length < 32) return json({ message: 'The wall is temporarily unavailable.' }, 503);
  try {
    const wall = env.STICKY_WALL.getByName('public-wall-v1');
    if (path === '/moderation') {
      if (!env.WEB_CHAT_MODERATOR_TOKEN || env.WEB_CHAT_MODERATOR_TOKEN.length < 32) return json({ message: 'Not found.' }, 404);
      const supplied = encoder.encode(request.headers.get('Authorization') ?? '');
      const expected = encoder.encode(`Bearer ${env.WEB_CHAT_MODERATOR_TOKEN}`);
      if (supplied.length !== expected.length || !crypto.subtle.timingSafeEqual(supplied, expected)) return json({ message: 'Not found.' }, 404);
      if (request.method === 'GET') return await wall.fetch('https://internal/moderation');
      if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);
      const body = await readBody(request);
      if (body?.action !== 'remove' || !isId(body.id)) return json({ message: 'Invalid moderation action.' }, 400);
      return await wall.fetch('https://internal/moderation', { method: 'POST', body: JSON.stringify(body) });
    }
    if (path === '/notes' && request.method === 'GET') return await wall.fetch('https://internal/notes');
    if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405, { Allow: path === '/notes' ? 'GET, POST' : 'POST' });
    if (request.headers.get('Origin') !== url.origin ||
        (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin') ||
        request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return json({ message: 'Open Yappie directly to use the wall.' }, 403);
    const body = await readBody(request);
    if (!body || !isId(body.id)) return json({ message: 'Invalid note.' }, 400);
    if (path === '/notes') {
      body.text = cleanWallText(body.text);
      if (body.adult !== true) return json({ message: 'Confirm you are 18 or older and accept the chat rules.' }, 400);
      if (!body.text || body.text.length > WALL_MAX_LENGTH || wallWordCount(body.text) > WALL_MAX_WORDS) return json({ message: 'Use 1–9 words, up to 120 characters.' }, 400);
      if (!WALL_COLORS.includes(body.color) || (body.slot !== null && body.slot !== undefined && (!Number.isInteger(body.slot) || body.slot < 0 || body.slot >= WALL_CAPACITY))) return json({ message: 'Choose a note colour and a free space.' }, 400);
    }
    if (path === '/report' && !reasons.has(body.reason)) return json({ message: 'Choose a report reason.' }, 400);
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) return json({ message: 'The wall is temporarily unavailable.' }, 503);
    const key = await signingKey(env.WEB_CHAT_SECRET);
    const network = await sign(key, `wall-network:${new Date().toISOString().slice(0, 10)}:${ip}`);
    return await wall.fetch('https://internal' + path, { method: 'POST',
      headers: { 'X-Network': network, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch {
    return json({ message: 'Could not reach the wall. Try again shortly.' }, 503);
  }
}

export class StickyWall extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS wall_meta (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO wall_meta VALUES (1, 0);
      CREATE TABLE IF NOT EXISTS wall_notes (id TEXT PRIMARY KEY, slot INTEGER NOT NULL UNIQUE CHECK(slot >= 0 AND slot < 20), text TEXT NOT NULL, color TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS wall_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS wall_limit_expiry ON wall_limits(expires);
      CREATE TABLE IF NOT EXISTS wall_reports (id TEXT PRIMARY KEY, note TEXT NOT NULL, text TEXT NOT NULL, reason TEXT NOT NULL, network TEXT NOT NULL, created INTEGER NOT NULL, reviewed INTEGER NOT NULL DEFAULT 0, UNIQUE(note, network));
      CREATE INDEX IF NOT EXISTS wall_report_age ON wall_reports(created);`);
  }

  row(query, ...args) { return this.sql.exec(query, ...args).toArray()[0]; }
  snapshot() {
    const notes = this.sql.exec('SELECT id, slot, text, color, created FROM wall_notes ORDER BY slot').toArray();
    return { notes, count: notes.length, capacity: WALL_CAPACITY, removeAt: WALL_REMOVE_AT,
      removable: notes.length >= WALL_REMOVE_AT, revision: this.row('SELECT revision FROM wall_meta WHERE id = 1').revision };
  }
  fail(message, status, code) { return json({ message, code, wall: this.snapshot() }, status); }
  revise() { this.sql.exec('UPDATE wall_meta SET revision = revision + 1 WHERE id = 1'); }
  take(key, maximum, now) {
    const result = this.row(`INSERT INTO wall_limits VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires <= ? THEN 1 ELSE MIN(count + 1, ?) END,
      expires = CASE WHEN expires <= ? THEN excluded.expires ELSE expires END RETURNING count`, key, now + hour, now, maximum + 1, now);
    return result.count <= maximum;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/notes' && request.method === 'GET') return json(this.snapshot());
    if (path === '/moderation' && request.method === 'GET') return json({ wall: this.snapshot(),
      reports: this.sql.exec('SELECT id, note, text, reason, created, reviewed FROM wall_reports WHERE created > ? ORDER BY reviewed, created DESC LIMIT 100', Date.now() - reportRetention).toArray() });
    if (request.method !== 'POST' || !['/notes', '/remove', '/report', '/moderation'].includes(path)) return json({ message: 'Not found.' }, 404);
    let body;
    try { body = await request.json(); } catch { return json({ message: 'Invalid note.' }, 400); }
    if (!body || !isId(body.id)) return json({ message: 'Invalid note.' }, 400);
    const network = request.headers.get('X-Network');
    if (path !== '/moderation' && !/^[a-f0-9]{64}$/.test(network ?? '')) return json({ message: 'Invalid request.' }, 400);
    const now = Date.now();
    const response = this.ctx.storage.transactionSync(() => {
      if (path === '/notes') {
        const text = cleanWallText(body.text);
        if (body.adult !== true || !text || text.length > WALL_MAX_LENGTH || wallWordCount(text) > WALL_MAX_WORDS || !WALL_COLORS.includes(body.color)) return this.fail('Use 1–9 words, up to 120 characters, and confirm the chat rules.', 400);
        const existing = this.row('SELECT text, color FROM wall_notes WHERE id = ?', body.id);
        if (existing) return existing.text === text && existing.color === body.color ? json(this.snapshot()) : this.fail('Your earlier note was posted. Close this editor to start another.', 409, 'already_posted');
        const occupied = new Set(this.sql.exec('SELECT slot FROM wall_notes').toArray().map(note => note.slot));
        if (occupied.size >= WALL_CAPACITY) return this.fail('The wall is full. Remove a note to make space.', 409, 'full');
        const slot = body.slot ?? Array.from({ length: WALL_CAPACITY }, (_, index) => index).find(index => !occupied.has(index));
        if (!Number.isInteger(slot) || slot < 0 || slot >= WALL_CAPACITY) return this.fail('Choose a free space.', 400);
        if (occupied.has(slot)) return this.fail('That space was just taken. Post again to use another free space.', 409, 'slot_taken');
        if (!this.take('post:' + network, 3, now)) return this.fail('Three notes per hour from this network. Come back later.', 429);
        this.sql.exec('INSERT INTO wall_notes VALUES (?, ?, ?, ?, ?)', body.id, slot, text, body.color, now);
        this.revise();
        return json(this.snapshot(), 201);
      }
      const note = this.row('SELECT id, text FROM wall_notes WHERE id = ?', body.id);
      if (path === '/moderation') {
        if (body.action !== 'remove') return this.fail('Invalid moderation action.', 400);
        if (note) { this.sql.exec('DELETE FROM wall_notes WHERE id = ?', note.id); this.revise(); }
        this.sql.exec('UPDATE wall_reports SET reviewed = 1 WHERE note = ?', body.id);
        return json(this.snapshot());
      }
      if (path === '/report') {
        if (!reasons.has(body.reason)) return this.fail('Choose a report reason.', 400);
        if (!note) return this.fail('That note has already been removed.', 404);
        if (this.row('SELECT id FROM wall_reports WHERE note = ? AND network = ?', note.id, network)) return json({ reported: true });
        if (!this.take('report:' + network, 10, now)) return this.fail('Too many reports from this network. Try again later.', 429);
        this.sql.exec('INSERT INTO wall_reports (id, note, text, reason, network, created) VALUES (?, ?, ?, ?, ?, ?)', crypto.randomUUID(), note.id, note.text, body.reason, network, now);
        return json({ reported: true });
      }
      if (!note) return json(this.snapshot());
      if (this.row('SELECT COUNT(*) AS count FROM wall_notes').count < WALL_REMOVE_AT) return this.fail('Removing notes opens when the wall is at least 60% full (12 of 20 notes).', 403, 'locked');
      if (!this.take('remove:' + network, 30, now)) return this.fail('Too many removals from this network. Try again later.', 429);
      this.sql.exec('DELETE FROM wall_notes WHERE id = ?', note.id);
      this.revise();
      return json(this.snapshot());
    });
    await this.scheduleCleanup();
    return response;
  }

  async scheduleCleanup() {
    const next = this.row(`SELECT MIN(at) AS at FROM (
      SELECT MIN(expires) AS at FROM wall_limits UNION ALL SELECT MIN(created) + ? AS at FROM wall_reports
    )`, reportRetention).at;
    if (next !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next));
  }
  async alarm() {
    const now = Date.now();
    this.sql.exec('DELETE FROM wall_limits WHERE expires <= ?', now);
    this.sql.exec('DELETE FROM wall_reports WHERE created <= ?', now - reportRetention);
    await this.scheduleCleanup();
  }
}
