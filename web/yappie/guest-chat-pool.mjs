import { DurableObject } from 'cloudflare:workers';
import { json, voiceEnabled } from './guest-web.mjs';

const minute = 60_000;
const day = 24 * 60 * minute;
const idleLimit = 75_000;
const reportWindow = 15 * minute;
const reportRetention = 30 * day;
const reasons = new Set(['harassment', 'sexual', 'underage', 'spam', 'other']);
const isId = (value) => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);

function push(socket, type, data = {}) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  try { socket.send(JSON.stringify({ type, ...data })); } catch { /* The close handler cleans up the room. */ }
}

function error(socket, action, message) { push(socket, 'error', { action, message }); }

async function turnServers(env) {
  const endpoint = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.WEB_CHAT_TURN_KEY)}/credentials/generate-ice-servers`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WEB_CHAT_TURN_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 3600 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('TURN credentials unavailable');
  const { iceServers } = await response.json();
  const servers = iceServers.map(({ urls, username, credential }) => ({
    urls: [urls].flat().filter((url) => /^turns?:/.test(url) && !/:53(?:\?|$)/.test(url)), username, credential,
  })).filter(({ urls }) => urls.length);
  if (!servers.length) throw new Error('TURN relay unavailable');
  return servers;
}

export class GuestChatPool extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, a TEXT, b TEXT, network_a TEXT, network_b TEXT, expires INTEGER, a_spoke INTEGER DEFAULT 0, b_spoke INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY, room TEXT NOT NULL, id TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, UNIQUE (room, id));
      CREATE TABLE IF NOT EXISTS blocks (a TEXT, b TEXT, expires INTEGER, PRIMARY KEY (a, b));
      CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, room TEXT, guest TEXT, network TEXT, reason TEXT, evidence TEXT, created INTEGER, reviewed INTEGER DEFAULT 0, UNIQUE (room, guest));
      CREATE TABLE IF NOT EXISTS bans (network TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS stats (date TEXT, metric TEXT, count INTEGER, PRIMARY KEY (date, metric));`);
  }

  row(query, ...params) { return this.sql.exec(query, ...params).toArray()[0]; }

  count(metric) {
    this.sql.exec('INSERT INTO stats VALUES (?, ?, 1) ON CONFLICT (date, metric) DO UPDATE SET count = count + 1', new Date().toISOString().slice(0, 10), metric);
  }

  take(key, maximum, window, now = Date.now()) {
    const result = this.row(`INSERT INTO limits VALUES (?, 1, ?)
      ON CONFLICT (key) DO UPDATE SET count = CASE WHEN expires <= ? THEN 1 ELSE MIN(count + 1, ?) END,
      expires = CASE WHEN expires <= ? THEN excluded.expires ELSE expires END RETURNING count`, key, now + window, now, maximum + 1, now);
    return result.count <= maximum;
  }

  banned(network) { return Boolean(this.row('SELECT 1 FROM bans WHERE network = ? AND expires > ?', network, Date.now())); }

  live(guest) {
    return this.ctx.getWebSockets(guest).find((socket) => socket.readyState === WebSocket.OPEN);
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/moderation') return this.moderation(request);
    const network = request.headers.get('X-Network');
    const now = Date.now();
    if (path === '/admit') {
      if (this.banned(network) || !this.take(`session:${network}`, 12, 15 * minute, now)) {
        return json({ message: 'Guest access is temporarily limited. Try again later.' }, 429);
      }
      if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(now + minute);
      return json({ allowed: true });
    }
    if (path !== '/socket') return json({ message: 'Not found.' }, 404);
    const id = request.headers.get('X-Guest');
    const expires = Number(request.headers.get('X-Expires'));
    const [client, server] = Object.values(new WebSocketPair());
    const duplicate = this.live(id);
    const capacity = this.ctx.getWebSockets().length >= 500;
    const allowed = !this.banned(network) && this.take(`socket:${network}`, 20, minute, now);
    if (duplicate || capacity || !allowed) {
      server.accept();
      error(server, 'connect', duplicate ? 'Chat is already open in another tab.' : 'Chat is temporarily unavailable. Try again shortly.');
      server.close(1008, 'Guest access limited');
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, expires, network, seen: now });
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(now + minute);
    push(server, 'ready', { voice: voiceEnabled(this.env) });
    return new Response(null, { status: 101, webSocket: client });
  }

  async moderation(request) {
    if (request.method === 'GET') return json({
      reports: this.sql.exec('SELECT * FROM reports WHERE created > ? ORDER BY reviewed, created DESC LIMIT 50', Date.now() - reportRetention).toArray(),
      stats: this.sql.exec('SELECT * FROM stats ORDER BY date DESC, metric').toArray(),
    });
    if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);
    let packet;
    try { packet = await request.json(); } catch { return json({ message: 'Invalid request.' }, 400); }
    const { id, action } = packet ?? {};
    if (!isId(id) || !['review', 'ban'].includes(action)) return json({ message: 'Invalid report or action.' }, 400);
    const report = this.row('SELECT network FROM reports WHERE id = ? AND created > ?', id, Date.now() - reportRetention);
    if (!report) return json({ message: 'Report not found.' }, 404);
    this.ctx.storage.transactionSync(() => {
      if (action === 'ban') this.sql.exec('INSERT OR REPLACE INTO bans VALUES (?, ?)', report.network, Date.now() + 7 * day);
      this.sql.exec('UPDATE reports SET reviewed = 1 WHERE id = ?', id);
    });
    if (action === 'ban') {
      for (const socket of this.ctx.getWebSockets()) {
        const guest = socket.deserializeAttachment();
        if (guest?.network !== report.network) continue;
        this.end(socket, guest);
        socket.close(1008, 'Guest access limited');
      }
    }
    return json({ reviewed: true });
  }

  match(socket, guest, preference, now) {
    if (guest.room) return;
    if (!guest.queuedAt && !this.take(`join:${guest.network}`, 16, minute, now)) {
      error(socket, 'join', 'You’ve started several chats quickly. Wait a minute and try again.');
      return;
    }
    const wasQueued = Boolean(guest.queuedAt);
    guest.queuedAt ??= now;
    guest.interest = preference;
    socket.serializeAttachment(guest);
    if (!wasQueued) this.count('queue_joined');
    const candidates = [];
    for (const other of this.ctx.getWebSockets()) {
      if (other === socket || other.readyState !== WebSocket.OPEN) continue;
      const peer = other.deserializeAttachment();
      if (!peer?.queuedAt || peer.room || peer.expires <= now || now - peer.seen > idleLimit) continue;
      if (preference && peer.interest !== preference) continue;
      if (peer.interest && preference !== peer.interest) continue;
      candidates.push({ other, peer });
    }
    candidates.sort((left, right) => left.peer.queuedAt - right.peer.queuedAt);
    const match = candidates.find(({ peer }) => !this.row(
      'SELECT 1 FROM blocks WHERE a = ? AND b = ? AND expires > ?', ...[guest.id, peer.id].sort(), now,
    ));
    if (!match) return;
    const { other, peer } = match;
    const room = crypto.randomUUID();
    const expires = Math.min(guest.expires, peer.expires) + reportWindow;
    this.sql.exec('INSERT INTO rooms (id, a, b, network_a, network_b, expires) VALUES (?, ?, ?, ?, ?, ?)', room, guest.id, peer.id, guest.network, peer.network, expires);
    for (const [member, state, partner] of [[socket, guest, peer], [other, peer, guest]]) {
      const seconds = Math.min(120, Math.ceil((now - state.queuedAt) / 5000) * 5);
      this.count(`wait_seconds_${seconds}`);
      delete state.queuedAt;
      state.room = room;
      state.partner = partner.id;
      member.serializeAttachment(state);
      push(member, 'matched', { room });
    }
    this.count('rooms_matched');
  }

  end(socket, guest) {
    if (guest.queuedAt) {
      delete guest.queuedAt;
      socket.serializeAttachment(guest);
      this.count('queue_abandoned');
    }
    if (!guest.room) return;
    const room = guest.room;
    const other = this.live(guest.partner);
    const peer = other?.deserializeAttachment();
    this.sql.exec('UPDATE rooms SET expires = MIN(expires, ?) WHERE id = ?', Date.now() + reportWindow, room);
    for (const [member, state, reason] of [[socket, guest, 'self'], [other, peer, 'peer']]) {
      if (state?.room !== room) continue;
      delete state.room;
      delete state.partner;
      delete state.call;
      delete state.callState;
      delete state.voiceConnected;
      member.serializeAttachment(state);
      push(member, 'ended', { room, reason });
    }
  }

  message(socket, guest, packet) {
    const text = typeof packet.text === 'string' ? packet.text.trim() : '';
    if (!guest.room || !isId(packet.id) || !text || text.length > 1000) return error(socket, 'message', 'The message couldn’t be sent.');
    const old = this.row('SELECT sender, text FROM messages WHERE room = ? AND id = ?', guest.room, packet.id);
    if (old) {
      if (old.sender === guest.id) push(socket, 'message', { room: guest.room, id: packet.id, text: old.text, own: true });
      return;
    }
    if (!this.take(`message:${guest.id}`, 8, 5000)) return error(socket, 'message', 'You’re sending quickly. Wait a moment, then press Send to retry.');
    const other = this.live(guest.partner);
    if (!other) return this.end(socket, guest);
    const room = guest.room;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('INSERT INTO messages (room, id, sender, text) VALUES (?, ?, ?, ?)', room, packet.id, guest.id, text);
      this.sql.exec('DELETE FROM messages WHERE room = ? AND seq NOT IN (SELECT seq FROM messages WHERE room = ? ORDER BY seq DESC LIMIT 30)', room, room);
      const state = this.row('SELECT a, a_spoke, b_spoke FROM rooms WHERE id = ?', room);
      const first = state.a === guest.id;
      if (first && !state.a_spoke) this.sql.exec('UPDATE rooms SET a_spoke = 1 WHERE id = ?', room);
      if (!first && !state.b_spoke) this.sql.exec('UPDATE rooms SET b_spoke = 1 WHERE id = ?', room);
      if ((first && !state.a_spoke && state.b_spoke) || (!first && !state.b_spoke && state.a_spoke)) this.count('two_way_chats');
    });
    push(other, 'message', { room, id: packet.id, text, own: false });
    push(socket, 'message', { room, id: packet.id, text, own: true });
  }

  safety(socket, guest, packet) {
    if (!isId(packet.room)) return error(socket, packet.type, 'This chat is no longer available.');
    const room = this.row('SELECT * FROM rooms WHERE id = ? AND (a = ? OR b = ?) AND expires > ?', packet.room, guest.id, guest.id, Date.now());
    if (!room) return error(socket, packet.type, 'This chat is no longer available.');
    const first = room.a === guest.id;
    if (packet.type === 'report') {
      if (!reasons.has(packet.reason)) return error(socket, 'report', 'Select a reason for the report.');
      if (!this.take(`report:${guest.network}`, 10, 15 * minute)) return error(socket, 'report', 'Too many reports from this network. Try again later.');
      const evidence = this.sql.exec('SELECT sender, text FROM messages WHERE room = ? ORDER BY seq', room.id).toArray()
        .map(({ sender, text }) => ({ from: sender === guest.id ? 'reporter' : 'reported', text }));
      this.sql.exec('INSERT OR IGNORE INTO reports (id, room, guest, network, reason, evidence, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(), room.id, guest.id, first ? room.network_b : room.network_a, packet.reason, JSON.stringify(evidence), Date.now());
    }
    this.sql.exec('INSERT OR REPLACE INTO blocks VALUES (?, ?, ?)', ...[room.a, room.b].sort(), Date.now() + day);
    if (guest.room === room.id) this.end(socket, guest);
    push(socket, packet.type === 'report' ? 'reported' : 'blocked');
  }

  stopVoice(socket, guest, other, peer, message = 'Voice call ended.') {
    const call = guest.call;
    for (const [member, state] of [[socket, guest], [other, peer]]) {
      if (!state?.call || state.call !== call) continue;
      push(member, 'voice-ended', { room: state.room, call: state.call, message });
      delete state.call;
      delete state.callState;
      delete state.voiceConnected;
      member.serializeAttachment(state);
    }
  }

  async voice(socket, guest, packet) {
    if (!guest.room || !voiceEnabled(this.env)) return;
    const other = this.live(guest.partner);
    const peer = other?.deserializeAttachment();
    if (peer?.room !== guest.room) return;
    if (packet.type === 'voice-invite') {
      if (guest.call || peer.call) return;
      if (!this.take(`voice:${guest.network}`, 6, 15 * minute)) {
        push(socket, 'voice-ended', { room: guest.room, message: 'Voice call unavailable. Try again shortly.' });
        return;
      }
      guest.call = peer.call = crypto.randomUUID();
      guest.callState = 'outgoing';
      peer.callState = 'incoming';
      socket.serializeAttachment(guest);
      other.serializeAttachment(peer);
      push(socket, 'voice-ringing', { room: guest.room, call: guest.call });
      push(other, 'voice-incoming', { room: guest.room, call: guest.call });
      return;
    }
    if (!guest.call || packet.call !== guest.call || peer.call !== guest.call) return;
    if (packet.type === 'voice-end') return this.stopVoice(socket, guest, other, peer);
    if (packet.type === 'voice-accept' && guest.callState === 'incoming') {
      const { call, room } = guest;
      guest.callState = peer.callState = 'connecting';
      socket.serializeAttachment(guest);
      other.serializeAttachment(peer);
      const latest = () => [socket.deserializeAttachment(), other.deserializeAttachment()];
      try {
        const [localServers, remoteServers] = await Promise.all([turnServers(this.env), turnServers(this.env)]);
        const [current, partner] = latest();
        if (current?.call !== call || partner?.call !== call || current.room !== room || partner.room !== room) return;
        current.callState = partner.callState = 'active';
        socket.serializeAttachment(current);
        other.serializeAttachment(partner);
        push(socket, 'voice-start', { room, call, offerer: false, iceServers: localServers });
        push(other, 'voice-start', { room, call, offerer: true, iceServers: remoteServers });
      } catch {
        const [current, partner] = latest();
        if (current?.call === call) this.stopVoice(socket, current, other, partner, 'Voice connection unavailable.');
      }
      return;
    }
    if (guest.callState !== 'active') return;
    if (packet.type === 'voice-connected' && !guest.voiceConnected) {
      guest.voiceConnected = true;
      socket.serializeAttachment(guest);
      if (peer.voiceConnected) this.count('voice_connected');
    }
    if (packet.type === 'voice-signal' && this.take(`signal:${guest.id}`, 120, minute)) {
      const { description, candidate } = packet;
      if (['offer', 'answer'].includes(description?.type) && typeof description.sdp === 'string' && description.sdp.length < 12000) {
        const sdp = description.sdp.replace(/^a=(?:candidate:.*|end-of-candidates)\r?\n/gm, '');
        push(other, 'voice-signal', { room: guest.room, call: guest.call, description: { type: description.type, sdp } });
      } else if (typeof candidate?.candidate === 'string' && / typ relay(?: |$)/.test(candidate.candidate) && candidate.candidate.length < 1024) {
        push(other, 'voice-signal', { room: guest.room, call: guest.call, candidate });
      }
    }
  }

  async webSocketMessage(socket, raw) {
    const guest = socket.deserializeAttachment();
    if (!guest) return;
    const now = Date.now();
    if (guest.expires <= now || now - guest.seen > idleLimit) {
      this.end(socket, guest);
      socket.close(1008, 'Guest session expired');
      return;
    }
    if (now - (guest.burstAt ?? 0) >= 1000) {
      guest.burstAt = now;
      guest.burst = 0;
    }
    guest.burst++;
    if (guest.burst > 40 || typeof raw !== 'string' || raw.length > 16000) {
      this.end(socket, guest);
      socket.close(1008, 'Message limit exceeded');
      return;
    }
    socket.serializeAttachment(guest);
    let packet;
    try { packet = JSON.parse(raw); } catch { return; }
    if (typeof packet?.type !== 'string') return;
    guest.seen = now;
    socket.serializeAttachment(guest);
    switch (packet.type) {
      case 'ping': push(socket, 'pong'); return;
      case 'join': {
        const preference = typeof packet.interest === 'string' ? packet.interest.trim().slice(0, 40).toLowerCase() : '';
        return this.match(socket, guest, preference, now);
      }
      case 'broaden': if (guest.queuedAt) return this.match(socket, guest, '', now); return;
      case 'cancel': this.end(socket, guest); push(socket, 'cancelled'); return;
      case 'leave': return this.end(socket, guest);
      case 'message': return this.message(socket, guest, packet);
      case 'report':
      case 'block': return this.safety(socket, guest, packet);
      default: if (packet.type.startsWith('voice-')) return this.voice(socket, guest, packet);
    }
  }

  webSocketClose(socket) {
    const guest = socket.deserializeAttachment();
    if (guest) this.end(socket, guest);
  }

  webSocketError(socket) {
    this.webSocketClose(socket);
    socket.close(1011, 'Connection closed');
  }

  async alarm() {
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const guest = socket.deserializeAttachment();
      if (!guest || (guest.expires > now && now - guest.seen <= idleLimit)) continue;
      this.end(socket, guest);
      socket.close(1008, 'Guest session expired');
    }
    this.sql.exec('DELETE FROM messages WHERE room IN (SELECT id FROM rooms WHERE expires <= ?)', now);
    this.sql.exec('DELETE FROM rooms WHERE expires <= ?', now);
    this.sql.exec('DELETE FROM limits WHERE expires <= ?', now);
    this.sql.exec('DELETE FROM blocks WHERE expires <= ?', now);
    this.sql.exec('DELETE FROM bans WHERE expires <= ?', now);
    this.sql.exec('DELETE FROM reports WHERE created <= ?', now - reportRetention);
    this.sql.exec('DELETE FROM stats WHERE date < ?', new Date(now - reportRetention).toISOString().slice(0, 10));
    const expires = this.row(`WITH deadlines(at) AS (VALUES
      ((SELECT MIN(expires) FROM rooms)), ((SELECT MIN(expires) FROM limits)),
      ((SELECT MIN(expires) FROM blocks)), ((SELECT MIN(expires) FROM bans)),
      ((SELECT MIN(created) + ? FROM reports)), ((SELECT unixepoch(MIN(date)) * 1000 + ? FROM stats))
    ) SELECT MIN(at) AS at FROM deadlines`, reportRetention, reportRetention + day).at;
    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(now + minute);
    else if (expires !== null) await this.ctx.storage.setAlarm(Math.max(now + 1000, expires));
  }
}
