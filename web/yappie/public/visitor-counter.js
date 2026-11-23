// One visit per page load after five visible seconds. No cookie or interaction needed.
const counter = document.getElementById('visitor-counter');
const value = document.getElementById('visitor-count');
const status = document.getElementById('visitor-count-status');
const since = document.getElementById('visitor-count-since');
const format = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

function display(stats) {
  if (!Number.isSafeInteger(stats?.count) || stats.count < 0) throw new Error('Unavailable');
  if (value) {
    value.textContent = format.format(stats.count);
    value.setAttribute('aria-label', `${stats.count.toLocaleString()} visits`);
    value.title = stats.count.toLocaleString();
  }
  counter?.querySelector('summary')?.setAttribute('aria-label', `${stats.count.toLocaleString()} website visits. How counting works`);
  if (status) status.textContent = 'Visits lasting at least five visible seconds.';
  if (since && Number.isFinite(stats.since)) since.textContent = `Counting since ${new Date(stats.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.`;
  counter?.removeAttribute('aria-busy');
}

async function api(path, body) {
  const response = await fetch('/visitor-api/' + path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'omit',
    cache: 'no-store', signal: AbortSignal.timeout(10000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error('Unavailable');
  return response.json();
}

function unavailable() {
  if (value?.textContent === '…') value.textContent = '—';
  if (status && value?.textContent === '—') status.textContent = 'The visit total is temporarily unavailable.';
  counter?.removeAttribute('aria-busy');
}

function fiveVisibleSeconds() {
  return new Promise(resolve => {
    let remaining = 5000;
    let visibleSince = null;
    let timer;
    function changed() {
      clearTimeout(timer);
      if (visibleSince !== null) remaining -= Math.max(0, performance.now() - visibleSince);
      visibleSince = null;
      if (remaining <= 0) {
        document.removeEventListener('visibilitychange', changed);
        resolve();
      } else if (document.visibilityState === 'visible') {
        visibleSince = performance.now();
        timer = setTimeout(changed, remaining);
      }
    }
    document.addEventListener('visibilitychange', changed);
    changed();
  });
}

async function register() {
  // A page load starts once. Network retries reuse its token and cannot add visits.
  let challenge;
  for (let attempt = 0; attempt < 3 && !challenge; attempt++) {
    try { challenge = await api('start', {}); }
    catch { if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 2000)); }
  }
  if (typeof challenge?.token !== 'string') return;
  await fiveVisibleSeconds();
  for (let attempt = 0; attempt < 3; attempt++) {
    try { display(await api('commit', { token: challenge.token })); return; }
    catch { if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 2000)); }
  }
}

if (document.body.dataset.appSession !== 'true' && location.pathname !== '/chat-app') {
  api('count').then(display).catch(unavailable);
  counter?.addEventListener('toggle', () => {
    if (counter.open) api('count').then(display).catch(unavailable);
  });
  register().catch(() => { /* Counting must never interfere with chat. */ });
}
