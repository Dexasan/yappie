const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const esbuild = require('esbuild');

const outfile = path.resolve('dist/qa/visitor-counter-tests.cjs');
fs.mkdirSync(path.dirname(outfile), { recursive: true });
esbuild.buildSync({ entryPoints: ['web/yappie/visitor-counter.mjs'], outfile,
  bundle: true, platform: 'node', format: 'cjs', external: ['cloudflare:workers'] });
const load = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'cloudflare:workers') return { DurableObject: class {
    constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  } };
  return load.call(this, name, parent, isMain);
};
const { VisitorCounter, handleVisitorCounter } = require(outfile);
Module._load = load;
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const origin = 'https://yappie.test';
const secret = 'visitor-counter-test-only-secret-not-used-in-production';

function harness() {
  const db = new DatabaseSync(':memory:');
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
  } };
  let object = new VisitorCounter(ctx, {});
  const env = { WEB_CHAT_SECRET: secret, VISITOR_COUNTER: { getByName() {
    return { fetch: (input, init) => object.fetch(new Request(input, init)) };
  } } };
  async function request(route, { cookie, body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
    const request = new Request(origin + '/visitor-api/' + route, { method,
      headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 Test Browser', 'CF-Connecting-IP': '192.0.2.1',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}), ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    return handleVisitorCounter(request, env);
  }
  async function start(options = {}) {
    const response = await request('start', { body: {}, ...options });
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie')?.split(';')[0], ...await response.json() };
  }
  return { db, env, request, start, restart: () => { object = new VisitorCounter(ctx, {}); } };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('page reads and challenge starts do not increment; refresh and restart preserve the count', async h => {
  assert.equal((await (await h.request('count')).json()).count, 0);
  const visit = await h.start();
  assert.equal((await (await h.request('count')).json()).count, 0);
  assert.equal((await h.request('commit', { cookie: visit.cookie, body: { token: visit.token } })).status, 403);
  now += 8001;
  const response = await h.request('commit', { cookie: visit.cookie, body: { token: visit.token } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 1);
  const countedCookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  h.restart();
  const returning = await h.start({ cookie: countedCookie });
  assert.equal(returning.complete, true);
  assert.equal(returning.count, 1);
  assert.deepEqual(Object.keys(await (await h.request('count')).json()).sort(), ['count', 'estimate', 'since']);
});

test('concurrent commits, replayed proofs and stale cookies increment only once', async h => {
  const visit = await h.start();
  now += 8001;
  const responses = await Promise.all(Array.from({ length: 20 }, () => h.request('commit', { cookie: visit.cookie, body: { token: visit.token } })));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).count, 1);
  }
  const retry = await h.start({ cookie: visit.cookie });
  now += 8001;
  assert.equal((await (await h.request('commit', { cookie: retry.cookie, body: { token: retry.token } })).json()).count, 1);
});

test('bots, cross-origin requests and privacy opt-outs cannot register', async h => {
  for (const headers of [
    { 'User-Agent': 'Googlebot/2.1' }, { 'User-Agent': 'curl/8' },
    { Origin: 'https://unrelated.test' }, { 'Sec-Fetch-Site': 'cross-site' },
    { DNT: '1' }, { 'Sec-GPC': '1' }, { 'CF-Connecting-IP': '' },
  ]) assert.equal((await h.request('start', { body: {}, headers })).status, 403);
  assert.equal((await (await h.request('count')).json()).count, 0);
});

test('forged proofs, changed networks, missing cookies, oversized and malformed bodies are rejected', async h => {
  const visit = await h.start();
  now += 8001;
  const badToken = visit.token.slice(0, -1) + (visit.token.endsWith('0') ? '1' : '0');
  assert.equal((await h.request('commit', { cookie: visit.cookie, body: { token: badToken } })).status, 403);
  assert.equal((await h.request('commit', { body: { token: visit.token } })).status, 403);
  assert.equal((await h.request('commit', { cookie: visit.cookie, body: { token: visit.token }, headers: { 'CF-Connecting-IP': '192.0.2.2' } })).status, 403);
  assert.equal((await h.request('start', { body: '{' })).status, 400);
  assert.equal((await h.request('start', { body: JSON.stringify({ text: 'x'.repeat(600) }) })).status, 400);
  now += 10 * 60_000;
  assert.equal((await h.request('commit', { cookie: visit.cookie, body: { token: visit.token } })).status, 403);
  assert.equal((await (await h.request('count')).json()).count, 0);
});

test('cleared-cookie inflation is capped; a valid proof can cross UTC midnight', async h => {
  now = Date.UTC(2026, 10, 23, 23, 59, 59);
  const midnight = await h.start();
  now += 8001;
  assert.equal((await h.request('commit', { cookie: midnight.cookie, body: { token: midnight.token } })).status, 200);
  for (let i = 1; i < 11; i++) {
    const visit = await h.start();
    now += 8001;
    const response = await h.request('commit', { cookie: visit.cookie, body: { token: visit.token } });
    assert.equal(response.status, i < 10 ? 200 : 429);
  }
  assert.equal((await (await h.request('count')).json()).count, 10);
});

test('counter storage failures return unavailable instead of a fake zero', async h => {
  h.env.VISITOR_COUNTER.getByName = () => { throw new Error('storage unavailable'); };
  const response = await h.request('count');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).count, undefined);
});

(async () => {
  try {
    for (const { name, run } of tests) {
      now = realNow();
      const h = harness();
      try { await run(h); console.log('PASS', name); }
      finally { h.db.close(); }
    }
  } finally { Date.now = realNow; }
})().catch(error => { console.error(error); process.exitCode = 1; });
