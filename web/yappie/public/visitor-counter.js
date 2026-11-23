// An engaged-browser estimate, not proof of a unique human or a live user count.
// No message content, interests, identity, referrer or typed text is collected.
const counter = document.getElementById('visitor-counter');
const value = document.getElementById('visitor-count');
const status = document.getElementById('visitor-count-status');
const since = document.getElementById('visitor-count-since');
const events = ['pointerdown', 'keydown', 'wheel'];
const format = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

function display(stats) {
  if (!Number.isSafeInteger(stats?.count) || stats.count < 0) throw new Error('Unavailable');
  if (value) {
    value.textContent = format.format(stats.count);
    value.setAttribute('aria-label', `${stats.count.toLocaleString()} estimated visitors`);
    value.title = stats.count.toLocaleString();
  }
  counter?.querySelector('summary')?.setAttribute('aria-label', `${stats.count.toLocaleString()} estimated website visitors. How counting works`);
  if (status) status.textContent = 'Counts active browsers, not page loads or people currently online.';
  if (since && Number.isFinite(stats.since)) since.textContent = `Counting since ${new Date(stats.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.`;
  counter?.removeAttribute('aria-busy');
}

async function api(path, body) {
  const response = await fetch('/visitor-api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: body === undefined ? 'omit' : 'same-origin',
    cache: 'no-store', signal: AbortSignal.timeout(10000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error('Unavailable');
  return response.json();
}

function unavailable() {
  if (value?.textContent === '…') value.textContent = '—';
  if (status && value?.textContent === '—') status.textContent = 'The visitor total is temporarily unavailable.';
  counter?.removeAttribute('aria-busy');
}

let optedOut = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
try { optedOut ||= localStorage.getItem('yappie.visitor.exclude') === '1'; } catch { /* Storage can be disabled. */ }
const embedded = document.body.dataset.appSession === 'true' || location.pathname === '/chat-app';
let running = false;
let finished = optedOut || navigator.webdriver === true || embedded;
let retryAfter = 0;

function stopListening() {
  for (const name of events) window.removeEventListener(name, interact, true);
}

function visibleTime(milliseconds) {
  return new Promise(resolve => {
    let active = 0;
    let previous = performance.now();
    const started = previous;
    let wasVisible = document.visibilityState === 'visible' && document.hasFocus();
    function tick() {
      const now = performance.now();
      const visible = document.visibilityState === 'visible' && document.hasFocus();
      // A throttled/background timer must not turn into counted foreground time.
      if (visible && wasVisible) active += Math.min(now - previous, 1000);
      previous = now;
      wasVisible = visible;
      if (active >= milliseconds) resolve(true);
      else if (now - started >= 9 * 60_000) resolve(false);
      else setTimeout(tick, 250);
    }
    setTimeout(tick, 250);
  });
}

async function interact(event) {
  if (finished || running || Date.now() < retryAfter || !event.isTrusted || document.visibilityState !== 'visible' || !document.hasFocus()) return;
  if (event.type === 'keydown' && (event.ctrlKey || event.metaKey || event.altKey || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key))) return;
  running = true;
  try {
    const start = () => api('start', {});
    // Serialize first-cookie creation across tabs when Web Locks is available.
    const challenge = navigator.locks ? await navigator.locks.request('yappie-visitor-cookie', start) : await start();
    if (challenge.complete) display(challenge);
    else {
      if (typeof challenge.token !== 'string' || !await visibleTime(8000)) throw new Error('Expired');
      display(await api('commit', { token: challenge.token }));
    }
    finished = true;
    stopListening();
  } catch {
    // No fake zero and no effect on matching if storage/network/rate limits fail.
    retryAfter = Date.now() + 60_000;
  } finally { running = false; }
}

if (!embedded) {
  api('count').then(display).catch(unavailable);
  counter?.addEventListener('toggle', () => {
    if (counter.open) api('count').then(display).catch(unavailable);
  });
  if (!finished) for (const name of events) window.addEventListener(name, interact, { capture: true, passive: true });
}
