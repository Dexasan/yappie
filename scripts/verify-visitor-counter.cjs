const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const esbuild = require('esbuild');
const vm = require('node:vm');

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

test('visits count at five seconds without cookies; a refreshed page counts again', async h => {
  assert.equal((await (await h.request('count')).json()).count, 0);
  const visit = await h.start();
  assert.equal((await (await h.request('count')).json()).count, 0);
  assert.equal((await h.request('commit', { cookie: visit.cookie, body: { token: visit.token } })).status, 403);
  now += 5000;
  const response = await h.request('commit', { cookie: visit.cookie, body: { token: visit.token } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 1);
  assert.equal(response.headers.get('set-cookie'), null);
  h.restart();
  assert.equal((await (await h.request('count')).json()).count, 1);
  const returning = await h.start();
  now += 5000;
  assert.equal((await (await h.request('commit', { body: { token: returning.token } })).json()).count, 2);
  const stats = await (await h.request('count')).json();
  assert.equal(stats.metric, 'visits');
  assert.equal(stats.minimumSeconds, 5);
});

test('concurrent commits and network retries count the same page only once', async h => {
  const visit = await h.start();
  now += 5000;
  const responses = await Promise.all(Array.from({ length: 20 }, () => h.request('commit', { cookie: visit.cookie, body: { token: visit.token } })));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).count, 1);
  }
  assert.equal((await (await h.request('count')).json()).count, 1);
});

test('cross-origin requests are rejected; anonymous visits work without browser or network gates', async h => {
  for (const headers of [
    { Origin: 'https://unrelated.test' }, { 'Sec-Fetch-Site': 'cross-site' },
  ]) assert.equal((await h.request('start', { body: {}, headers })).status, 403);
  const visit = await h.start({ headers: { DNT: '1', 'Sec-GPC': '1', 'CF-Connecting-IP': '', 'User-Agent': '' } });
  now += 5000;
  assert.equal((await h.request('commit', { body: { token: visit.token } })).status, 200);
});

test('forged, missing and expired proofs, oversized and malformed bodies are rejected', async h => {
  const visit = await h.start();
  now += 5000;
  const badToken = visit.token.slice(0, -1) + (visit.token.endsWith('0') ? '1' : '0');
  assert.equal((await h.request('commit', { cookie: visit.cookie, body: { token: badToken } })).status, 403);
  assert.equal((await h.request('commit', { body: {} })).status, 403);
  assert.equal((await h.request('start', { body: '{' })).status, 400);
  assert.equal((await h.request('start', { body: JSON.stringify({ text: 'x'.repeat(600) }) })).status, 400);
  now += 10 * 60_000;
  assert.equal((await h.request('commit', { cookie: visit.cookie, body: { token: visit.token } })).status, 403);
  assert.equal((await (await h.request('count')).json()).count, 0);
});

test('separate visits keep counting on the same network across UTC midnight', async h => {
  now = Date.UTC(2026, 10, 23, 23, 59, 59);
  const midnight = await h.start();
  now += 5000;
  assert.equal((await h.request('commit', { cookie: midnight.cookie, body: { token: midnight.token } })).status, 200);
  for (let i = 1; i < 11; i++) {
    const visit = await h.start();
    now += 5000;
    const response = await h.request('commit', { cookie: visit.cookie, body: { token: visit.token } });
    assert.equal(response.status, 200);
  }
  assert.equal((await (await h.request('count')).json()).count, 11);
});

test('counter storage failures return unavailable instead of a fake zero', async h => {
  h.env.VISITOR_COUNTER.getByName = () => { throw new Error('storage unavailable'); };
  const response = await h.request('count');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).count, undefined);
});

test('the browser counts automatically after five visible seconds, with no focus, cookie or input requirement', async () => {
  const timers = new Map();
  const listeners = new Map();
  let timerId = 0;
  let commits = 0;
  const elements = Object.fromEntries(['visitor-counter', 'visitor-count', 'visitor-count-status', 'visitor-count-since']
    .map(id => [id, { textContent: '…', setAttribute() {}, removeAttribute() {}, querySelector() { return this; }, addEventListener() {} }]));
  const document = { body: { dataset: {} }, visibilityState: 'visible',
    getElementById: id => elements[id],
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    hasFocus: () => { throw new Error('Window focus must not be required'); },
  };
  Object.defineProperty(document, 'cookie', { get() { throw new Error('Cookies must not be required'); } });
  const sandbox = { document, location: { pathname: '/' }, Intl, Date, AbortSignal,
    performance: { now: () => now },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      assert.equal(options.credentials, 'omit');
      if (url.endsWith('/start')) return Response.json({ token: 'test-page-token' });
      if (url.endsWith('/commit')) commits++;
      return Response.json({ count: commits, since: now, metric: 'visits', minimumSeconds: 5 });
    },
  };
  const settle = async condition => {
    const deadline = realNow() + 1000;
    while (!condition() && realNow() < deadline) await new Promise(resolve => setImmediate(resolve));
    assert.ok(condition(), 'Browser script did not reach the expected state');
  };
  const advance = milliseconds => {
    now += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  };
  vm.runInNewContext(fs.readFileSync('web/yappie/public/visitor-counter.js', 'utf8'), sandbox);
  await settle(() => timers.size > 0);
  advance(2000);
  assert.equal(commits, 0);
  document.visibilityState = 'hidden'; listeners.get('visibilitychange')();
  advance(30000);
  assert.equal(commits, 0, 'Hidden time must not count');
  document.visibilityState = 'visible'; listeners.get('visibilitychange')();
  advance(2999);
  assert.equal(commits, 0, 'Four visible seconds must not qualify');
  advance(1);
  await settle(() => elements['visitor-count'].textContent === '1');
  assert.equal(commits, 1);
  advance(60000);
  assert.equal(commits, 1, 'The page must count only once');
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
