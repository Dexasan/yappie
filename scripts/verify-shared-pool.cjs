const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const esbuild = require('esbuild');
const Module = require('node:module');

const outfile = path.resolve('dist/qa/shared-pool-tests.cjs');
fs.mkdirSync(path.dirname(outfile), { recursive: true });
esbuild.buildSync({
  entryPoints: ['web/yappie/guest-chat-pool.mjs'], outfile,
  bundle: true, platform: 'node', format: 'cjs', external: ['cloudflare:workers'],
});
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'cloudflare:workers') return { DurableObject: class {
    constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  } };
  return originalLoad.call(this, name, parent, isMain);
};
const { GuestChatPool } = require(outfile);
Module._load = originalLoad;
const previousWebSocket = global.WebSocket;
global.WebSocket = { OPEN: 1 };

function harness() {
  const db = new DatabaseSync(':memory:');
  const sockets = [];
  const ctx = {
    getWebSockets: id => sockets.filter(socket => !id || socket.state.id === id),
    storage: {
      sql: {
        exec(query, ...values) {
          if (/^CREATE /i.test(query.trim())) { db.exec(query); return { toArray: () => [] }; }
          const rows = db.prepare(query).all(...values);
          return { toArray: () => rows };
        },
      },
      transactionSync(task) {
        db.exec('BEGIN');
        try { const value = task(); db.exec('COMMIT'); return value; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
  };
  const pool = new GuestChatPool(ctx, {});
  function guest(number, interests, account = false, languages = ['english']) {
    const now = Date.now();
    const state = {
      id: '00000000-0000-0000-0000-' + String(number).padStart(12, '0'),
      expires: now + 3600000, network: 'network-' + number, seen: now, account, languages,
    };
    const socket = {
      state, readyState: 1, packets: [],
      profileId: '00000000-0000-0000-0000-' + String(number + 100).padStart(12, '0'),
      serializeAttachment(value) { this.state = structuredClone(value); },
      deserializeAttachment() { return structuredClone(this.state); },
      send(value) { this.packets.push(JSON.parse(value)); },
      close() { this.readyState = 3; },
    };
    sockets.push(socket);
    if (account) db.prepare('INSERT INTO accounts(id,expires,languages,blocked,profile_id) VALUES (?,?,?,?,?)').run(state.id, state.expires, JSON.stringify(languages), '[]', socket.profileId);
    if (interests) pool.match(socket, socket.deserializeAttachment(), interests, now);
    return socket;
  }
  return { db, pool, guest, sockets };
}
function test(name, task) {
  const state = harness();
  try { task(state); console.log('PASS', name); }
  finally { state.db.close(); }
}
try {
  test('a browser and app user enter the same room and exchange messages', ({ pool, guest }) => {
    const browser = guest(1, ['music']);
    const app = guest(2, ['music'], true);
    assert.equal(app.state.room, browser.state.room);
    assert.ok(app.state.room);
    assert.equal(browser.packets.find(packet => packet.type === 'matched').peerProfileId, undefined);
    const message = { id: '00000000-0000-0000-0000-000000000010', text: 'Hello from Android' };
    pool.message(app, app.deserializeAttachment(), message);
    pool.message(app, app.deserializeAttachment(), message);
    assert.equal(browser.packets.filter(packet => packet.type === 'message').length, 1);
    assert.equal(app.packets.filter(packet => packet.type === 'message').length, 2);
    assert.equal(browser.packets.find(packet => packet.type === 'message').own, false);
    assert.equal(app.packets.find(packet => packet.type === 'message').own, true);
  });
  test('app-to-app and browser-to-browser matching share the same protocol', ({ guest, pool }) => {
    const first = guest(1, ['music'], true);
    const second = guest(2, ['music'], true);
    assert.equal(first.state.room, second.state.room);
    assert.equal(second.packets.find(packet => packet.type === 'matched').peerProfileId, first.profileId);
    pool.end(first, first.deserializeAttachment());
    const third = guest(3, ['gaming']);
    const fourth = guest(4, ['gaming']);
    assert.ok(third.state.room);
    assert.equal(third.state.room, fourth.state.room);
  });
  test('two different interests fall back across platforms', ({ guest }) => {
    const browser = guest(1, ['music']);
    const app = guest(2, ['gaming'], true);
    assert.equal(app.state.room, browser.state.room);
    assert.deepEqual(app.packets.find(packet => packet.type === 'matched').interests, []);
  });
  test('a native interest array finds an overlapping browser interest', ({ guest }) => {
    const browser = guest(1, ['gaming']);
    const app = guest(2, ['music', 'gaming'], true);
    assert.equal(app.state.room, browser.state.room);
    assert.deepEqual(app.packets.find(packet => packet.type === 'matched').interests, ['gaming']);
  });
  test('fallback protects a candidate’s preferred third-party match', ({ guest, pool }) => {
    const browser = guest(1, null);
    const preferredPeer = guest(2, null, true);
    const app = guest(3, null, true);
    browser.state.interests = ['gaming']; browser.state.queuedAt = Date.now() - 1000;
    preferredPeer.state.interests = ['gaming']; preferredPeer.state.queuedAt = Date.now() - 500;
    pool.match(app, app.deserializeAttachment(), ['music'], Date.now());
    assert.equal(app.state.room, undefined);
    pool.match(preferredPeer, preferredPeer.deserializeAttachment(), ['gaming'], Date.now());
    assert.equal(preferredPeer.state.room, browser.state.room);
  });
  test('language compatibility is enforced across platforms', ({ guest }) => {
    const browser = guest(1, ['music']);
    const app = guest(2, ['music'], true, ['italian']);
    assert.equal(browser.state.room, undefined);
    assert.equal(app.state.room, undefined);
  });
  test('existing account blocks are honored in either direction', ({ guest, db, pool }) => {
    const blocked = guest(1, ['music'], true);
    const blocker = guest(2, null, true);
    db.prepare('UPDATE accounts SET blocked=? WHERE id=?').run(JSON.stringify([blocked.state.id]), blocker.state.id);
    pool.match(blocker, blocker.deserializeAttachment(), ['music'], Date.now());
    assert.equal(blocker.state.room, undefined);
    assert.equal(blocked.state.room, undefined);
  });
  test('leaving closes the room for both participants', ({ guest, pool }) => {
    const browser = guest(1, ['music']);
    const app = guest(2, ['music'], true);
    pool.end(app, app.deserializeAttachment());
    assert.equal(app.state.room, undefined);
    assert.equal(browser.state.room, undefined);
    assert.equal(browser.packets.at(-1).type, 'ended');
    assert.equal(browser.packets.at(-1).reason, 'peer');
  });
  test('reports preserve correctly attributed evidence and block the pair', ({ guest, pool, db }) => {
    const browser = guest(1, ['music']);
    const app = guest(2, ['music'], true);
    const room = app.state.room;
    pool.message(browser, browser.deserializeAttachment(), { id: '00000000-0000-0000-0000-000000000011', text: 'Reported message' });
    pool.message(app, app.deserializeAttachment(), { id: '00000000-0000-0000-0000-000000000012', text: 'Please stop' });
    pool.safety(app, app.deserializeAttachment(), { type: 'report', room, reason: 'harassment' });
    const report = db.prepare('SELECT * FROM reports').get();
    assert.equal(report.network, browser.state.network);
    assert.deepEqual(JSON.parse(report.evidence), [{ from: 'reported', text: 'Reported message' }, { from: 'reporter', text: 'Please stop' }]);
    assert.equal(db.prepare('SELECT count(*) AS count FROM blocks').get().count, 1);
    assert.equal(app.state.room, undefined);
    assert.equal(browser.state.room, undefined);
    pool.match(app, app.deserializeAttachment(), ['music'], Date.now());
    pool.match(browser, browser.deserializeAttachment(), ['music'], Date.now());
    assert.equal(app.state.room, undefined);
    assert.equal(browser.state.room, undefined);
  });
} finally {
  global.WebSocket = previousWebSocket;
}

(async () => {
  const { pool, guest, db } = harness();
  try {
    const browser = guest(1, ['music']);
    const app = guest(2, ['music'], true);
    pool.safety(app, app.deserializeAttachment(), { type: 'report', room: app.state.room, reason: 'spam' });
    const report = db.prepare('SELECT id FROM reports').get();
    const action = name => pool.moderation(new Request('https://internal/moderation', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Reviewer': 'test-moderator' },
      body: JSON.stringify({ id: report.id, action: name }),
    }));
    assert.equal((await action('review')).status, 200);
    assert.equal((await action('review')).status, 200);
    assert.equal(db.prepare('SELECT count(*) AS count FROM moderation_actions').get().count, 1);
    assert.equal(db.prepare('SELECT reviewer FROM moderation_actions').get().reviewer, 'test-moderator');
    assert.equal(db.prepare('SELECT reviewed FROM reports').get().reviewed, 1);
    assert.equal((await action('ban')).status, 200);
    assert.equal(db.prepare('SELECT network FROM bans').get().network, browser.state.network);
    assert.equal(browser.readyState, 3);
    assert.equal(db.prepare('SELECT count(*) AS count FROM moderation_actions').get().count, 2);
    console.log('PASS shared report review, idempotency, audit, and reported-network limit');
  } finally { db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
