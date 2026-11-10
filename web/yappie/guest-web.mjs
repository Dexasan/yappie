const cookieName = '__Host-yappie_guest';
const lifetime = 8 * 60 * 60;
const encoder = new TextEncoder();

export function webChatEnabled(env) {
  return env.WEB_CHAT_ENABLED === 'true' && env.WEB_CHAT_SECRET?.length >= 32 && env.WEB_CHAT_MODERATOR_TOKEN?.length >= 32;
}

export function voiceEnabled(env) {
  return Boolean(env.WEB_CHAT_TURN_KEY && env.WEB_CHAT_TURN_TOKEN);
}

export function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...headers } });
}

async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(key, value) {
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readSession(request, key) {
  const cookie = request.headers.get('Cookie')?.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${cookieName}=`));
  const token = cookie?.slice(cookieName.length + 1) ?? '';
  const match = /^([a-f0-9-]{36})\.(\d{10,13})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return null;
  const [, guest, expires, signature] = match;
  if (Number(expires) <= Date.now()) return null;
  const bytes = Uint8Array.from(signature.match(/../g), (pair) => Number.parseInt(pair, 16));
  if (!await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`guest:${guest}.${expires}`))) return null;
  return { guest, expires: Number(expires) };
}

async function adultAcknowledged(request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json' || !request.body) return false;
  const reader = request.body.getReader();
  const buffer = new Uint8Array(128);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(new TextDecoder().decode(buffer.subarray(0, length)))?.adult === true;
      if (length + value.length > buffer.length) {
        await reader.cancel();
        return false;
      }
      buffer.set(value, length);
      length += value.length;
    }
  } catch { return false; }
}

export async function handleWebChat(request, env) {
  if (!webChatEnabled(env)) return json({ message: 'Web chat is coming soon.' }, 404);
  const url = new URL(request.url);
  const pool = env.WEB_CHAT_POOL.getByName('web-v1');
  if (url.pathname === '/chat-api/moderation') {
    const supplied = encoder.encode(request.headers.get('Authorization') ?? '');
    const expected = encoder.encode(`Bearer ${env.WEB_CHAT_MODERATOR_TOKEN}`);
    if (supplied.length !== expected.length || !crypto.subtle.timingSafeEqual(supplied, expected)) return json({ message: 'Not found.' }, 404);
    return pool.fetch('https://internal/moderation', { method: request.method, body: request.body });
  }
  if (request.headers.get('Origin') !== url.origin) return json({ message: 'Open Yappie directly to start chatting.' }, 403);
  const key = await signingKey(env.WEB_CHAT_SECRET);
  const session = await readSession(request, key);
  const network = await sign(key, `network:${request.headers.get('CF-Connecting-IP') ?? 'local'}`);
  if (url.pathname === '/chat-api/session' && request.method === 'POST') {
    if (!await adultAcknowledged(request)) return json({ message: 'Confirm you’re 18 or older and accept the chat rules.' }, 400);
    if (session) return json({ ready: true });
    const permitted = await pool.fetch('https://internal/admit', { headers: { 'X-Network': network } });
    if (!permitted.ok) return permitted;
    const unsigned = `${crypto.randomUUID()}.${Date.now() + lifetime * 1000}`;
    const signature = await sign(key, `guest:${unsigned}`);
    return json({ ready: true }, 200, {
      'Set-Cookie': `${cookieName}=${unsigned}.${signature}; Path=/; Max-Age=${lifetime}; HttpOnly; Secure; SameSite=Strict`,
    });
  }
  if (url.pathname === '/chat-api/socket' && request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    if (!session) return json({ message: 'Start a new guest session.' }, 401);
    return pool.fetch('https://internal/socket', {
      headers: { Upgrade: 'websocket', 'X-Guest': session.guest, 'X-Expires': String(session.expires), 'X-Network': network },
    });
  }
  return json({ message: 'Not found.' }, 404);
}

export async function serveWebPage(request, env, pathname) {
  if (pathname === '/chat' && !webChatEnabled(env)) return Response.redirect(new URL('/', request.url), 302);
  if (pathname !== '/') return env.ASSETS.fetch(request);
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const asset = await env.ASSETS.fetch(new Request(request, { headers }));
  if (!asset.ok) return asset;
  const response = new Response(asset.body, asset);
  response.headers.delete('ETag');
  response.headers.delete('Last-Modified');
  response.headers.set('Cache-Control', 'no-store');
  if (!webChatEnabled(env)) return response;
  const voice = voiceEnabled(env);
  const description = `Yappie is an Omegle alternative for one-to-one text chat${voice ? ' and voice calls' : ''} in your browser. No sign-up or download required.`;
  return new HTMLRewriter()
    .on('meta[name="description"]', { element: (element) => element.setAttribute('content', description) })
    .on('[data-chat-status]', { element: (element) => element.setInnerContent('Browser chat · 18+') })
    .on('[data-chat-summary]', { element: (element) => {
      element.setInnerContent(description);
      element.after('<a class="button" href="/chat">Start chat</a>', { html: true });
    } })
    .on('[data-voice-feature]', { element: (element) => { if (!voice) element.remove(); } })
    .transform(response);
}
