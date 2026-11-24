const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const { timingSafeEqual } = require('node:crypto');
const esbuild = require('esbuild');

const outfile = path.resolve('dist/qa/sticky-wall-tests.cjs');
fs.mkdirSync(path.dirname(outfile), { recursive: true });
esbuild.buildSync({ entryPoints: ['web/yappie/sticky-wall.mjs'], outfile,
  bundle: true, platform: 'node', format: 'cjs', external: ['cloudflare:workers'] });
const load = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'cloudflare:workers') return { DurableObject: class {
    constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  } };
  return load.call(this, name, parent, isMain);
};
const { StickyWall, handleStickyWall } = require(outfile);
Module._load = load;
crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(a, b);
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const origin = 'https://yappie.test';
const moderator = 'sticky-wall-local-moderator-test-only-secret';

function harness() {
  const db = new DatabaseSync(':memory:');
  let alarm;
  const ctx = { storage: {
    sql: { exec(query, ...values) {
      if (/^CREATE /i.test(query.trim())) { db.exec(query); return { toArray: () => [] }; }
      const rows = db.prepare(query).all(...values);
      return { toArray: () => rows };
    } },
    transactionSync(callback) {
      db.exec('BEGIN');
      try { const value = callback(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async setAlarm(at) { alarm = at; },
  } };
  let object = new StickyWall(ctx, {});
  const env = { WEB_CHAT_SECRET: 'sticky-wall-test-secret-not-used-in-production',
    WEB_CHAT_MODERATOR_TOKEN: moderator, STICKY_WALL: { getByName() {
      return { fetch: (input, init) => object.fetch(new Request(input, init)) };
    } } };
  async function request(route, { body, ip = '192.0.2.1', headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
    return handleStickyWall(new Request(origin + '/wall-api/' + route, { method,
      headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': ip,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }), env);
  }
  const snapshot = async () => (await request('notes')).json();
  const post = (overrides = {}, options = {}) => request('notes', { body: {
    id: crypto.randomUUID(), text: 'I was here', color: 'chalk', adult: true, ...overrides,
  }, ...options });
  async function seed(count) {
    for (let i = 0; i < count; i++) assert.equal((await post({}, { ip: `192.0.2.${i + 10}` })).status, 201);
    return snapshot();
  }
  return { db, env, request, snapshot, post, seed, restart() { object = new StickyWall(ctx, {}); },
    cleanup: () => object.alarm(), alarm: () => alarm };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('notes persist across object restarts; retries cannot duplicate or overwrite them', async h => {
  assert.equal((await h.snapshot()).count, 0);
  const id = crypto.randomUUID();
  const first = await h.post({ id, text: '  Hi\u200b @dexasan  ', slot: 4, color: 'coral' });
  assert.equal(first.status, 201);
  h.restart();
  const snapshot = await h.snapshot();
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.notes[0].text, 'Hi @dexasan');
  assert.equal(snapshot.notes[0].slot, 4);
  assert.equal(snapshot.removable, false);
  assert.equal((await h.post({ id, text: 'Hi @dexasan', color: 'coral' })).status, 200);
  assert.equal((await h.post({ id, text: 'overwritten', color: 'coral' })).status, 409);
  assert.equal((await h.snapshot()).revision, snapshot.revision);
  assert.equal(Object.keys(snapshot.notes[0]).sort().join(','), 'color,created,id,slot,text');
});

test('word, character, age and payload limits are enforced at the public API', async h => {
  assert.equal((await h.post({ text: 'one two three four five six seven eight nine' })).status, 201);
  for (const body of [{ text: 'one two three four five six seven eight nine ten' },
    { text: 'x'.repeat(121) }, { text: ' \n\t' }, { text: null }, { adult: false },
    { color: 'unknown' }, { slot: 20 }, { slot: -1 }, { slot: 1.5 }, { id: 'invalid' }]) {
    assert.equal((await h.post(body)).status, 400, JSON.stringify(body));
  }
  for (const body of ['{', '[]', JSON.stringify({ value: 'x'.repeat(2100) })]) {
    assert.equal((await h.request('notes', { body })).status, 400);
  }
  assert.equal((await h.post({ text: 'x'.repeat(120) })).status, 201);
});

test('cross-site writes, missing IP and invalid methods fail safely', async h => {
  for (const headers of [{ Origin: 'https://other.test' }, { 'Sec-Fetch-Site': 'cross-site' },
    { 'Content-Type': 'text/plain' }]) assert.equal((await h.post({}, { headers })).status, 403);
  assert.equal((await h.post({}, { ip: '' })).status, 503);
  assert.equal((await h.request('remove')).status, 405);
  assert.equal((await h.request('unknown')).status, 404);
  assert.equal((await h.snapshot()).count, 0);
  h.env.STICKY_WALL.getByName = () => { throw new Error('unavailable'); };
  assert.equal((await h.request('notes')).status, 503);
});

test('60 percent threshold is atomic and relocks as soon as occupancy drops below 12', async h => {
  let wall = await h.seed(11);
  assert.equal((await h.request('remove', { body: { id: wall.notes[0].id } })).status, 403);
  assert.equal((await h.post({}, { ip: '192.0.2.90' })).status, 201);
  wall = await h.snapshot();
  assert.equal(wall.removable, true);
  const removals = await Promise.all(wall.notes.slice(0, 2).map(note => h.request('remove', { body: { id: note.id } })));
  assert.deepEqual(removals.map(r => r.status).sort(), [200, 403]);
  wall = await h.snapshot();
  assert.equal(wall.count, 11);
  assert.equal(wall.removable, false);
});

test('concurrent slot claims and a full wall never exceed capacity', async h => {
  const claims = await Promise.all([h.post({ slot: 0 }), h.post({ slot: 0 }, { ip: '192.0.2.2' })]);
  assert.deepEqual(claims.map(r => r.status).sort(), [201, 409]);
  await h.seed(19);
  const full = await h.post({}, { ip: '192.0.2.99' });
  assert.equal(full.status, 409);
  assert.equal((await full.json()).code, 'full');
  const wall = await h.snapshot();
  assert.equal(wall.count, 20);
  assert.equal(new Set(wall.notes.map(note => note.slot)).size, 20);
});

test('hourly posting limits expire; repeat successful requests consume no extra allowance', async h => {
  const id = crypto.randomUUID();
  assert.equal((await h.post({ id })).status, 201);
  for (let i = 0; i < 5; i++) assert.equal((await h.post({ id })).status, 200);
  assert.equal((await h.post()).status, 201);
  assert.equal((await h.post()).status, 201);
  assert.equal((await h.post()).status, 429);
  assert.ok(h.alarm() > now);
  now += 3_600_001;
  await h.cleanup();
  assert.equal((await h.post()).status, 201);
});

test('reports work below threshold, remain private, deduplicate and expire after 30 days', async h => {
  await h.post({ text: 'https://example.com @handle' });
  const note = (await h.snapshot()).notes[0];
  const body = { id: note.id, reason: 'spam' };
  assert.equal((await h.request('report', { body })).status, 200);
  assert.equal((await h.request('report', { body })).status, 200);
  assert.equal((await h.request('report', { body: { ...body, reason: 'invalid' } })).status, 400);
  assert.equal((await h.request('moderation')).status, 404);
  const headers = { Authorization: `Bearer ${moderator}` };
  let queue = await (await h.request('moderation', { headers })).json();
  assert.equal(queue.reports.length, 1);
  assert.equal(queue.reports[0].text, note.text);
  assert.equal(queue.reports[0].network, undefined);
  const removed = await h.request('moderation', { headers, body: { action: 'remove', id: note.id } });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).count, 0);
  queue = await (await h.request('moderation', { headers })).json();
  assert.equal(queue.reports[0].reviewed, 1);
  now += 30 * 86_400_000 + 1;
  await h.cleanup();
  queue = await (await h.request('moderation', { headers })).json();
  assert.equal(queue.reports.length, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM wall_reports').get().n, 0);
});

(async () => {
  try {
    for (const { name, run } of tests) {
      now = realNow();
      const h = harness();
      try { await run(h); console.log('PASS ' + name); }
      finally { h.db.close(); }
    }
    console.log(`${tests.length} sticky wall checks passed.`);
  } finally { Date.now = realNow; }
})().catch(error => { console.error(error); process.exitCode = 1; });
