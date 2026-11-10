import { handleWebChat, serveWebPage } from './guest-web.mjs';
export { GuestChatPool } from './guest-chat-pool.mjs';

const upstream = 'https://fzpehebwhsfrrgdugxpr.supabase.co';
const appCallback = 'socialdiscovery://auth/callback';
const origin = 'https://yappie.site';
const actions = {
  '/auth/confirm': { types: ['signup', 'email'], title: 'Confirm your email', button: 'Confirm email' },
  '/auth/reset': { types: ['recovery'], title: 'Reset your password', button: 'Continue to reset' },
};

const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function page(title, body, status = 200, responseHeaders = headers) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Yappie</title><link rel="stylesheet" href="/style.css"></head><body class="auth"><main class="auth-card"><a class="brand" href="/"><img src="/assets/yappie-mark.png" alt="" width="54" height="54">YAPPIE</a><h1>${title}</h1>${body}</main></body></html>`, { status, headers: responseHeaders });
}

function invalid(status = 400) {
  return page('This link can’t be used', '<p>It may have expired or already been used. Open Yappie and request a fresh email.</p><a class="button secondary" href="/support">Get help</a>', status);
}

async function readSmallBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  let size = 0;
  let result = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return result + decoder.decode();
    size += value.length;
    if (size > 4096) { await reader.cancel(); return ''; }
    result += decoder.decode(value, { stream: true });
  }
}

export async function handle(request, env, verify = fetch) {
  const { pathname } = new URL(request.url);
  const action = Object.hasOwn(actions, pathname) ? actions[pathname] : null;
  if (!action) {
    if (pathname.startsWith('/auth/')) return invalid(404);
    if (pathname.startsWith('/chat-api/')) return handleWebChat(request, env);
    if (pathname === '/chat.html' || pathname === '/chat/') return Response.redirect(new URL('/chat', request.url), 308);
    if (pathname === '/' || pathname === '/chat') return serveWebPage(request, env, pathname);
    return env.ASSETS.fetch(request);
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    return page(action.title, `<p>Continue on the same device where you requested this email.</p>
      <form method="post" action="${pathname}"><input type="hidden" name="link"><button class="button" disabled>${action.button}</button></form>
      <p class="note" id="link-status" role="status">If the button stays disabled, open the full link from your latest Yappie email.</p>
      <script src="/email-link.js" defer></script>`, 200, {
        ...headers,
        // A normal form POST sends Origin: null under no-referrer.
        // Only this page needs same-origin; cross-origin referrers stay blocked.
        'Referrer-Policy': 'same-origin',
      });
  }
  if (request.method !== 'POST') return invalid(405);
  if (request.headers.get('Origin') !== origin ||
    request.headers.get('Content-Type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
    return page('Open the email link again', '<p>This browser did not allow the confirmation form to submit. Reopen the original email link in your phone’s main browser and try again.</p><a class="button secondary" href="/support">Get help</a>', 403);
  }

  try {
    const supplied = new URL(new URLSearchParams(await readSmallBody(request)).get('link') ?? '');
    const token = supplied.searchParams.get('token') ?? '';
    const type = supplied.searchParams.get('type') ?? '';
    if (supplied.origin !== upstream || supplied.pathname !== '/auth/v1/verify' ||
        supplied.username || supplied.password || !action.types.includes(type) ||
        !/^pkce_[A-Za-z0-9_-]{32,256}$/.test(token)) return invalid();
    const target = new URL('/auth/v1/verify', upstream);
    target.searchParams.set('token', token);
    target.searchParams.set('type', type);
    const recovery = type === 'recovery';
    target.searchParams.set('redirect_to', recovery ? `${appCallback}?intent=recovery` : appCallback);
    // Keep the installed client's PKCE exchange. Never request or relay session tokens.
    const response = await verify(target, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (response.status < 300 || response.status >= 400) return invalid();
    const redirect = new URL(response.headers.get('Location') ?? '');
    const code = redirect.searchParams.get('code') ?? '';
    if (redirect.protocol !== 'socialdiscovery:' || redirect.host !== 'auth' ||
        redirect.pathname !== '/callback' || redirect.username || redirect.password || redirect.hash ||
        redirect.searchParams.has('error') || !/^[A-Za-z0-9_-]{16,256}$/.test(code)) return invalid();
    const next = `${appCallback}?code=${encodeURIComponent(code)}${recovery ? '&amp;intent=recovery' : ''}`;
    return page(recovery ? 'Finish in Yappie' : 'Email confirmed', `<p>${recovery ? 'Open Yappie to choose a new password.' : 'Open Yappie to finish signing in.'}</p><a class="button" href="${next}">Open Yappie</a><p class="note">Use the same device where you started.</p>`);
  } catch {
    return invalid();
  }
}

export default { fetch: (request, env) => handle(request, env) };
