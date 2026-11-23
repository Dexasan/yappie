import { json, sign, signingKey, webChatEnabled } from './guest-web.mjs';

const supabaseOrigin = 'https://fzpehebwhsfrrgdugxpr.supabase.co';
const lifetime = 8 * 60 * 60;

async function reviewBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return body + decoder.decode();
    size += value.length;
    if (size > 512) { await reader.cancel(); return null; }
    body += decoder.decode(value, { stream: true });
  }
}

async function accountRequest(path, headers, body) {
  const response = await fetch(supabaseOrigin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Your account could not be verified. Reopen the chat to try again.');
  return response.json();
}

export async function handleAppReports(request, env) {
  if (!webChatEnabled(env) || !['GET', 'POST'].includes(request.method)) return json({ message: 'Unavailable.' }, 404);
  const authorization = request.headers.get('Authorization') ?? '';
  const apikey = request.headers.get('apikey') ?? '';
  if (!authorization.startsWith('Bearer ') || authorization.length > 8192 || !apikey || apikey.length > 2048) {
    return json({ message: 'Moderator access required.' }, 401);
  }
  try {
    const headers = { Authorization: authorization, apikey };
    const user = await accountRequest('/auth/v1/user', headers);
    const allowed = await accountRequest('/rest/v1/rpc/is_moderator', headers, {});
    if (allowed !== true) return json({ message: 'Moderator access required.' }, 403);
    const pool = env.WEB_CHAT_POOL.getByName('web-v1');
    if (request.method === 'POST') {
      const body = await reviewBody(request);
      if (body === null) return json({ message: 'Invalid review action.' }, 400);
      const key = await signingKey(env.WEB_CHAT_SECRET);
      return pool.fetch('https://internal/moderation', { method: 'POST', body,
        headers: { 'X-Reviewer': await accountIdentity(key, user.id) } });
    }
    const response = await pool.fetch('https://internal/moderation');
    if (!response.ok) return json({ message: 'Could not load stranger reports.' }, 503);
    const { reports } = await response.json();
    return json({ reports: reports.map(report => ({
      id: report.id, reason: report.reason, evidence: JSON.parse(report.evidence),
      created: report.created, reviewed: Boolean(report.reviewed),
    })) });
  } catch {
    return json({ message: 'Could not verify moderator access. Try again.' }, 503);
  }
}

async function accountIdentity(key, userId) {
  const hash = await sign(key, 'account:' + userId);
  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-');
}

// Only the Worker sends trusted account metadata to the private Durable Object.
// Account IDs, access tokens, and block lists are never included in the page.
export async function serveAppChat(request, env) {
  if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405);
  if (!webChatEnabled(env)) return json({ message: 'Stranger chat is temporarily unavailable.' }, 503);
  const authorization = request.headers.get('Authorization') ?? '';
  const apikey = request.headers.get('apikey') ?? '';
  if (!authorization.startsWith('Bearer ') || authorization.length > 8192 || !apikey || apikey.length > 2048) {
    return json({ message: 'Open stranger chat from the Yappie app.' }, 401);
  }
  const key = await signingKey(env.WEB_CHAT_SECRET);
  const network = await sign(key, 'network:' + (request.headers.get('CF-Connecting-IP') ?? 'local'));
  const pool = env.WEB_CHAT_POOL.getByName('web-v1');
  const admission = await pool.fetch('https://internal/admit', { headers: { 'X-Network': network } });
  if (!admission.ok) return admission;
  try {
    const headers = { Authorization: authorization, apikey };
    const user = await accountRequest('/auth/v1/user', headers);
    if (!/^[a-f0-9-]{36}$/i.test(user.id ?? '')) return json({ message: 'Sign in again to start matching.' }, 401);
    const idFilter = encodeURIComponent(user.id);
    const [profiles, settings] = await Promise.all([
      accountRequest('/rest/v1/profiles?select=languages&id=eq.' + idFilter, headers),
      accountRequest('/rest/v1/user_settings?select=onboarding_completed_at,age_verified_at,terms_accepted_at,community_guidelines_accepted_at&id=eq.' + idFilter, headers),
    ]);
    const profile = profiles[0];
    const eligibility = settings[0];
    if (!eligibility?.onboarding_completed_at || !eligibility.age_verified_at ||
        !eligibility.terms_accepted_at || !eligibility.community_guidelines_accepted_at ||
        !Array.isArray(profile?.languages) || !profile.languages.length || profile.languages.length > 8 ||
        !profile.languages.every(value => typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 32)) {
      return json({ message: 'Complete your age-verified profile before matching.' }, 403);
    }
    const blocked = [];
    // Read every page so a large block list cannot silently lose protection.
    for (let offset = 0; ; offset += 500) {
      if (offset >= 10000) throw new Error('Your block list could not be loaded completely.');
      const page = await accountRequest('/rest/v1/blocks?select=blocked_id&blocker_id=eq.' + idFilter +
        '&order=blocked_id&limit=501&offset=' + offset, headers);
      blocked.push(...await Promise.all(page.slice(0, 500).map(row => accountIdentity(key, row.blocked_id))));
      if (page.length <= 500) break;
    }
    const id = await accountIdentity(key, user.id);
    const expires = Date.now() + lifetime * 1000;
    const registered = await pool.fetch('https://internal/account', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, profileId: user.id, expires, languages: profile.languages.map(value => value.trim().toLowerCase()), blocked }),
    });
    if (!registered.ok) throw new Error('Could not prepare shared matching.');
    const unsigned = id + '.' + expires;
    const signature = await sign(key, 'guest:' + unsigned);
    const asset = await env.ASSETS.fetch(new URL('/chat', request.url));
    if (!asset.ok) return json({ message: 'Could not load stranger chat.' }, 503);
    const page = new HTMLRewriter()
      .on('body', { element(element) {
        element.setAttribute('data-app-session', 'true');
        element.setAttribute('class', 'chat-page app-embedded');
      } })
      .transform(new Response(asset.body, asset));
    page.headers.set('Set-Cookie', '__Host-yappie_guest=' + unsigned + '.' + signature +
      '; Path=/; Max-Age=' + lifetime + '; HttpOnly; Secure; SameSite=Strict');
    page.headers.set('Cache-Control', 'no-store');
    page.headers.set('Referrer-Policy', 'no-referrer');
    return page;
  } catch (error) {
    return json({ message: error.message || 'Could not open shared matching.' }, 503);
  }
}
