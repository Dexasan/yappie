import { WALL_CAPACITY, WALL_REMOVE_AT, WALL_MAX_WORDS, WALL_MAX_LENGTH, WALL_COLORS, cleanWallText, wallWordCount } from './wall-text.js';

const root = document.getElementById('sticky-wall');
if (root && document.body.dataset.appSession !== 'true') setupWall(root);

function setupWall(root) {
  // Static UI only. Public note text is always inserted as text nodes, never HTML.
  root.innerHTML = `
    <div class="wall-sides" id="wall-sides">
      <aside class="wall-side wall-side-left" aria-labelledby="wall-title">
        <div class="wall-tools"><h2 id="wall-title">Leave a note</h2><button class="wall-add" type="button" aria-label="Write a sticky note" title="Loading the wall" disabled>+</button></div>
        <p class="wall-status sr-only" role="status" aria-live="polite">Loading the wall…</p>
        <button class="wall-retry" type="button" hidden>Try loading again</button>
        <div class="wall-grid wall-left" role="list" aria-label="Left wall notes"></div>
      </aside>
      <aside class="wall-side wall-side-right" aria-label="Right sticky-note wall"><div class="wall-grid wall-right" role="list" aria-label="Right wall notes"></div></aside>
    </div>
    <dialog class="wall-dialog" id="wall-write-dialog" aria-labelledby="wall-write-title">
      <form class="wall-write-form">
        <div class="wall-dialog-heading"><h2 id="wall-write-title">Leave a note</h2><button class="wall-close" type="button" aria-label="Close note editor">×</button></div>
        <p class="wall-public-hint">This is public. Share a handle or link, not private information.</p>
        <div class="wall-draft" data-color="chalk"><svg class="wall-paper" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><use href="/assets/chat-ink.svg#sticky-note" width="100" height="100"/></svg><label class="sr-only" for="wall-text">Your public note</label><textarea id="wall-text" name="text" rows="3" maxlength="120" required placeholder="I was here. Find me at @yourhandle" aria-describedby="wall-word-count wall-text-hint"></textarea></div>
        <div class="wall-draft-meta"><span id="wall-text-hint">Up to 9 words · 120 characters</span><output id="wall-word-count" for="wall-text" aria-live="polite">0/9 words</output></div>
        <fieldset class="wall-colors"><legend>Paper colour</legend>
          <label class="wall-color" data-color="chalk"><input type="radio" name="color" value="chalk" checked><span class="sr-only">Chalk</span></label>
          <label class="wall-color" data-color="coral"><input type="radio" name="color" value="coral"><span class="sr-only">Coral</span></label>
          <label class="wall-color" data-color="sage"><input type="radio" name="color" value="sage"><span class="sr-only">Sage</span></label>
          <label class="wall-color" data-color="lilac"><input type="radio" name="color" value="lilac"><span class="sr-only">Lilac</span></label>
        </fieldset>
        <label class="wall-ack"><input name="adult" type="checkbox" required><span>I’m 18 or older and this note follows the <a href="/chat-rules" target="_blank" rel="noopener">chat rules</a>.</span></label>
        <p class="wall-form-status" role="status"></p>
        <button class="match-button wall-post" type="submit" disabled>Post note <svg aria-hidden="true"><use href="/assets/chat-ink.svg#arrow"/></svg></button>
      </form>
    </dialog>
    <dialog class="wall-dialog" id="wall-report-dialog" aria-labelledby="wall-report-title">
      <form class="wall-report-form"><div class="wall-dialog-heading"><h2 id="wall-report-title">Report a note</h2><button class="wall-close" type="button" aria-label="Close note report">×</button></div>
        <blockquote class="wall-report-preview"></blockquote><p>This sends the note and your reason for moderator review.</p>
        <label for="wall-report-reason">Reason</label><select id="wall-report-reason" name="reason" required><option value="">Select a reason</option><option value="spam">Spam or scam</option><option value="harassment">Harassment or hate</option><option value="sexual">Sexual or underage content</option><option value="personal">Private personal information</option><option value="other">Other safety issue</option></select>
        <p class="wall-report-status" role="status"></p><button class="match-button wall-report-submit" type="submit">Send report</button>
      </form>
    </dialog>`;
  root.hidden = false;
  const find = selector => root.querySelector(selector);
  const add = find('.wall-add');
  const status = find('.wall-status');
  status.tabIndex = -1;
  const retry = find('.wall-retry');
  const writeDialog = find('#wall-write-dialog');
  const writeForm = find('.wall-write-form');
  const textarea = find('#wall-text');
  const wordCount = find('#wall-word-count');
  const post = find('.wall-post');
  const formStatus = find('.wall-form-status');
  const reportDialog = find('#wall-report-dialog');
  const reportForm = find('.wall-report-form');
  const reportStatus = find('.wall-report-status');
  const pendingRemovals = new Set();
  const reported = new Set();
  const desktopWall = window.matchMedia('(min-width: 1000px)');
  const canvases = [find('.wall-left'), find('.wall-right')];
  const layouts = new WeakMap();
  const arrivals = new Set();
  const arrivalOrigins = new Map();
  let state = null, draftId, postBusy = false, reportBusy = false;
  let reportNote, opener, refreshPromise, pollTimer;
  let layoutFrame, wallInView = false;
  const resizeObserver = new ResizeObserver(() => scheduleLayout());

  const slots = Array.from({ length: WALL_CAPACITY }, (_, slot) => {
    const element = document.createElement('div');
    element.className = 'wall-slot';
    element.dataset.slot = String(slot);
    element.setAttribute('role', 'listitem');
    (slot < WALL_CAPACITY / 2 ? find('.wall-left') : find('.wall-right')).append(element);
    emptySlot(element);
    return element;
  });

  function announce(message, error = false) {
    status.textContent = message;
    status.classList.toggle('wall-error', error);
    status.classList.toggle('sr-only', !error);
  }

  async function api(path, body) {
    const response = await fetch('/wall-api/' + path, { method: body === undefined ? 'GET' : 'POST',
      credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000),
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('Could not reach the wall. Try again.'); }
    if (!response.ok) {
      const error = new Error(data.message || 'Could not update the wall. Try again.');
      error.wall = data.wall;
      error.code = data.code;
      throw error;
    }
    return data;
  }

  function emptySlot(element) {
    const previous = element.querySelector('.wall-note');
    if (previous) resizeObserver.unobserve(previous);
    arrivals.delete(element.dataset.noteId);
    arrivalOrigins.delete(element.dataset.noteId);
    delete element.dataset.noteId;
    element.hidden = true;
    element.replaceChildren();
  }

  // Each note keeps its own seeded scatter rather than following a row or column.
  // Collision checks keep the paper and its controls reachable on narrow walls.
  function randomFor(id) {
    let seed = 2166136261;
    for (const char of id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    return () => {
      seed += 0x6D2B79F5;
      let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function scheduleLayout() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = undefined;
      for (const canvas of canvases) layoutCanvas(canvas);
    });
  }

  function layoutCanvas(canvas) {
    const width = canvas.clientWidth;
    if (width < 40 || !canvas.getClientRects().length) return;
    const elements = [...canvas.querySelectorAll('.wall-slot[data-note-id]')]
      .sort((a, b) => Number(a.dataset.created) - Number(b.dataset.created) || a.dataset.noteId.localeCompare(b.dataset.noteId));
    if (!elements.length) { canvas.style.height = '0px'; layouts.delete(canvas); return; }
    const noteWidth = width >= 300 ? Math.min(174, (width - 30) / 2) : Math.min(180, width - 24);
    for (const element of elements) element.style.width = `${noteWidth}px`;
    const sizes = new Map(elements.map(element => [element.dataset.noteId, element.offsetHeight]));
    let layout = layouts.get(canvas);
    if (!layout || Math.abs(layout.width - width) > 1 || [...layout.places].some(([id, place]) => sizes.has(id) && Math.abs(sizes.get(id) - place.height) > 1)) {
      layout = { width, places: new Map() }; layouts.set(canvas, layout);
    }
    for (const id of layout.places.keys()) if (!sizes.has(id)) layout.places.delete(id);
    const baseHeight = desktopWall.matches ? Math.max(300, innerHeight - 210) : 420;
    let areaHeight = Math.max(baseHeight, [...sizes.values()].reduce((sum, height) => sum + noteWidth * height, 0) / (width * .58));
    const landing = [];
    for (const element of elements) {
      const id = element.dataset.noteId, height = sizes.get(id), article = element.querySelector('.wall-note');
      let place = layout.places.get(id);
      if (!place) {
        const random = randomFor(id);
        const maxTilt = Math.min(8, Math.atan2(Math.max(0, width - noteWidth - 24), height) * 180 / Math.PI);
        const tilt = (random() * 2 - 1) * maxTilt;
        const radians = Math.abs(tilt) * Math.PI / 180;
        const boxWidth = noteWidth * Math.cos(radians) + height * Math.sin(radians);
        const boxHeight = height * Math.cos(radians) + noteWidth * Math.sin(radians);
        let candidate;
        // Grow the scrollable wall if necessary instead of covering another note.
        for (let round = 0; !candidate && round < 8; round++) {
          const bottom = Math.max(areaHeight, ...[...layout.places.values()].map(p => p.y + p.boxHeight));
          for (let attempt = 0; attempt < 160; attempt++) {
            const x = 6 + random() * Math.max(0, width - boxWidth - 12);
            const y = 12 + random() * Math.max(0, bottom - boxHeight - 24);
            if ([...layout.places.values()].every(p => x + boxWidth + 10 <= p.x || p.x + p.boxWidth + 10 <= x || y + boxHeight + 14 <= p.y || p.y + p.boxHeight + 14 <= y)) {
              candidate = { x, y }; break;
            }
          }
          if (!candidate) areaHeight = bottom + boxHeight + 30;
        }
        candidate ??= { x: (width - boxWidth) / 2, y: Math.max(12, ...[...layout.places.values()].map(p => p.y + p.boxHeight + 24)) };
        place = { ...candidate, height, boxWidth, boxHeight, tilt };
        layout.places.set(id, place);
      }
      element.style.left = `${place.x + (place.boxWidth - noteWidth) / 2}px`;
      element.style.top = `${place.y + (place.boxHeight - height) / 2}px`;
      element.style.setProperty('--note-tilt', `${place.tilt}deg`);
      if (arrivals.delete(id)) landing.push({ article, id });
    }
    canvas.style.height = `${Math.ceil(Math.max(...[...layout.places.values()].map(p => p.y + p.boxHeight)) + 24)}px`;
    for (const { article, id } of landing) land(article, id);
  }

  function land(article, id) {
    const origin = arrivalOrigins.get(id);
    arrivalOrigins.delete(id);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (origin) {
      if (desktopWall.matches) {
        const side = article.closest('.wall-side');
        const bounds = side.getBoundingClientRect(), note = article.getBoundingClientRect();
        const heading = side.querySelector('.wall-tools')?.offsetHeight || 0;
        if (note.top < bounds.top + heading + 12) side.scrollTop += note.top - bounds.top - heading - 12;
        else if (note.bottom > bounds.bottom - 12) side.scrollTop += note.bottom - bounds.bottom + 12;
      } else article.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
    if (reducedMotion) return;
    const rect = article.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    const start = origin || { x: innerWidth / 2, y: Math.min(innerHeight / 2, rect.top - 100) };
    const ghost = article.cloneNode(true);
    ghost.classList.add('wall-flying', 'wall-arriving');
    ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    ghost.style.left = `${rect.left + (rect.width - article.offsetWidth) / 2}px`;
    ghost.style.top = `${rect.top + (rect.height - article.offsetHeight) / 2}px`;
    ghost.style.width = `${article.offsetWidth}px`; ghost.style.height = `${article.offsetHeight}px`;
    ghost.style.setProperty('--note-tilt', getComputedStyle(article).getPropertyValue('--note-tilt'));
    ghost.style.setProperty('--arrive-x', `${start.x - rect.left - rect.width / 2}px`);
    ghost.style.setProperty('--arrive-y', `${start.y - rect.top - rect.height / 2}px`);
    article.classList.add('wall-landing-pending');
    document.body.append(ghost);
    const finish = () => { ghost.remove(); article.classList.remove('wall-landing-pending'); };
    ghost.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 1100);
  }

  function paper() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('wall-paper');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '/assets/chat-ink.svg#sticky-note');
    use.setAttribute('width', '100'); use.setAttribute('height', '100');
    svg.append(use);
    return svg;
  }

  function noteText(element, text) {
    // Only explicit HTTP(S) links are clickable. Everything else stays plain text.
    for (const part of text.split(/(https?:\/\/[^\s]+)/giu)) {
      let link;
      if (/^https?:\/\//iu.test(part)) {
        try {
          const url = new URL(part);
          if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
            link = document.createElement('a');
            link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer nofollow ugc';
            link.textContent = part;
          }
        } catch { /* Keep malformed links as text. */ }
      }
      element.append(link || document.createTextNode(part));
    }
  }

  function noteElement(note) {
    const article = document.createElement('article');
    article.className = 'wall-note';
    article.dataset.color = note.color;
    article.setAttribute('aria-label', `Sticky note: ${note.text}`);
    const text = document.createElement('p');
    text.className = 'wall-note-text'; noteText(text, note.text);
    const actions = document.createElement('div');
    actions.className = 'wall-note-actions';
    const flag = document.createElement('button');
    flag.type = 'button'; flag.className = 'wall-flag';
    flag.setAttribute('aria-label', 'Report this note'); flag.title = 'Report this note';
    flag.innerHTML = '<svg aria-hidden="true"><use href="/assets/chat-ink.svg#shield"/></svg>';
    flag.addEventListener('click', () => openReport(note, flag));
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'wall-remove'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove note: ${note.text}`);
    remove.addEventListener('click', () => removeNote(note));
    actions.append(flag, remove);
    article.append(paper(), text, actions);
    return article;
  }

  function fall(article) {
    if (!article || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = article.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ghost = article.cloneNode(true);
    ghost.classList.remove('wall-arriving', 'wall-landing-pending'); ghost.classList.add('wall-falling');
    ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    ghost.style.left = `${rect.left}px`; ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${article.offsetWidth}px`; ghost.style.height = `${article.offsetHeight}px`;
    ghost.style.setProperty('--note-tilt', getComputedStyle(article).getPropertyValue('--note-tilt'));
    ghost.style.setProperty('--fall-drift', `${Math.round((Math.random() - .5) * 200)}px`);
    document.body.append(ghost);
    ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
    setTimeout(() => ghost.remove(), 1200);
  }

  function render(next) {
    if (!next || next.capacity !== WALL_CAPACITY || !Array.isArray(next.notes) || next.notes.length > WALL_CAPACITY ||
        next.count !== next.notes.length || next.removeAt !== WALL_REMOVE_AT || next.removable !== (next.count >= WALL_REMOVE_AT) || !Number.isSafeInteger(next.revision) ||
        next.notes.some(note => !Number.isInteger(note.slot) || note.slot < 0 || note.slot >= WALL_CAPACITY ||
          typeof note.id !== 'string' || typeof note.text !== 'string' || note.text.length > WALL_MAX_LENGTH || !WALL_COLORS.includes(note.color)) ||
        new Set(next.notes.map(note => note.slot)).size !== next.notes.length ||
        new Set(next.notes.map(note => note.id)).size !== next.notes.length) throw new Error('Could not read the wall. Reload to try again.');
    if (state && next.revision < state.revision) return;
    const initial = !state;
    let restoreSlot = null;
    state = next;
    add.disabled = state.count >= WALL_CAPACITY;
    add.title = add.disabled ? 'Remove a note to make space' : 'Write a sticky note';
    root.dataset.removable = String(state.removable);
    const bySlot = new Map(state.notes.map(note => [note.slot, note]));
    for (const [slot, element] of slots.entries()) {
      const note = bySlot.get(slot);
      if (element.dataset.noteId !== note?.id) {
        if (element.contains(document.activeElement)) restoreSlot = slot;
        if (element.dataset.noteId && !initial) fall(element.querySelector('.wall-note'));
        if (note) {
          const previous = element.querySelector('.wall-note');
          if (previous) resizeObserver.unobserve(previous);
          element.dataset.noteId = note.id; element.dataset.created = String(note.created);
          element.hidden = false;
          const article = noteElement(note);
          element.replaceChildren(article); resizeObserver.observe(article);
          if (!initial) arrivals.add(note.id);
        } else emptySlot(element);
      }
      const remove = element.querySelector('.wall-remove');
      if (remove) {
        remove.disabled = !state.removable || pendingRemovals.has(note.id);
        remove.title = state.removable ? 'Peel this note off the wall' : 'Removing opens when 12 of 20 spaces are full';
      }
      const flag = element.querySelector('.wall-flag');
      if (flag) { flag.disabled = reported.has(note.id); flag.title = reported.has(note.id) ? 'You reported this note' : 'Report this note'; }
    }
    updateDraft();
    scheduleLayout();
    if (initial) announce(state.count ? 'Wall loaded.' : 'The wall is empty. Use the plus button to leave a note.');
    if (restoreSlot !== null && !writeDialog.open && !reportDialog.open) {
      const target = slots[restoreSlot].querySelector('button:not(:disabled), a[href]') || (add.disabled ? status : add);
      target.focus();
    }
  }

  function openEditor(button) {
    if (!state || state.count >= WALL_CAPACITY || writeDialog.open) return;
    draftId = crypto.randomUUID(); opener = button;
    formStatus.textContent = '';
    updateDraft(); writeDialog.showModal(); textarea.focus();
  }
  function updateDraft() {
    const text = cleanWallText(textarea.value);
    const count = wallWordCount(text);
    const invalid = count > WALL_MAX_WORDS || text.length > WALL_MAX_LENGTH;
    wordCount.textContent = `${count}/${WALL_MAX_WORDS} words`;
    wordCount.classList.toggle('wall-error', invalid);
    textarea.setAttribute('aria-invalid', String(invalid));
    find('.wall-draft').dataset.color = writeForm.querySelector('input[name="color"]:checked')?.value || 'chalk';
    post.disabled = postBusy || !state || state.count >= WALL_CAPACITY || !count || invalid || !writeForm.elements.adult.checked;
  }
  writeForm.addEventListener('input', updateDraft);
  add.addEventListener('click', () => openEditor(add));

  writeForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (postBusy || !writeForm.reportValidity()) return;
    const text = cleanWallText(textarea.value);
    if (!text || wallWordCount(text) > WALL_MAX_WORDS || text.length > WALL_MAX_LENGTH) { formStatus.textContent = 'Use 1–9 words, up to 120 characters.'; return; }
    const payload = { id: draftId, text, color: new FormData(writeForm).get('color'), adult: writeForm.elements.adult.checked };
    const draftRect = textarea.getBoundingClientRect();
    const origin = { x: draftRect.left + draftRect.width / 2, y: draftRect.top + draftRect.height / 2 };
    postBusy = true; updateDraft(); formStatus.textContent = 'Posting…';
    for (const control of writeForm.querySelectorAll('input, textarea')) control.disabled = true;
    const close = writeDialog.querySelector('.wall-close'); close.disabled = true;
    try {
      const next = await api('notes', payload);
      arrivalOrigins.set(payload.id, origin);
      render(next);
      writeForm.reset(); writeDialog.close(); announce('Your note is on the wall.');
    } catch (error) {
      if (error.wall) render(error.wall);
      formStatus.textContent = error.message;
    } finally {
      postBusy = false; close.disabled = false;
      for (const control of writeForm.querySelectorAll('input, textarea')) control.disabled = false;
      updateDraft();
    }
  });

  async function removeNote(note) {
    if (!state?.removable || pendingRemovals.has(note.id)) return;
    pendingRemovals.add(note.id); render(state);
    try {
      render(await api('remove', { id: note.id }));
      announce('Note removed. There’s room for another.');
      (add.disabled ? status : add).focus();
    } catch (error) {
      if (error.wall) render(error.wall);
      announce(error.message, true);
    } finally { pendingRemovals.delete(note.id); if (state) render(state); }
  }

  function openReport(note, button) {
    if (reportDialog.open || reported.has(note.id)) return;
    reportNote = note; opener = button; reportForm.reset(); reportStatus.textContent = '';
    find('.wall-report-preview').textContent = note.text; reportDialog.showModal();
  }
  reportForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (reportBusy || !reportNote || !reportForm.reportValidity()) return;
    reportBusy = true;
    const reason = reportForm.elements.reason.value;
    reportForm.elements.reason.disabled = true;
    const submit = find('.wall-report-submit'), close = reportDialog.querySelector('.wall-close');
    submit.disabled = true; close.disabled = true; reportStatus.textContent = 'Sending report…';
    try {
      await api('report', { id: reportNote.id, reason });
      reported.add(reportNote.id); if (state) render(state);
      reportDialog.close(); announce('Note reported for review.');
    } catch (error) { if (error.wall) render(error.wall); reportStatus.textContent = error.message; }
    finally { reportBusy = false; submit.disabled = false; close.disabled = false; reportForm.elements.reason.disabled = false; }
  });

  for (const dialog of [writeDialog, reportDialog]) {
    dialog.querySelector('.wall-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { if (postBusy || reportBusy) event.preventDefault(); });
    dialog.addEventListener('close', () => {
      const target = opener?.isConnected && !opener.disabled ? opener : add;
      if (!target.disabled) target.focus(); else status.focus();
    });
  }
  function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = api('notes').then(next => {
      render(next); retry.hidden = true;
      if (status.classList.contains('wall-error')) announce('Wall updated.');
    }).catch(error => {
      if (!state) add.title = 'Wall unavailable';
      announce(error.message, true); retry.hidden = false;
    }).finally(() => { refreshPromise = undefined; });
    return refreshPromise;
  }
  function wallVisible() {
    return document.visibilityState === 'visible' && !['active', 'ended'].includes(document.body.dataset.phase) &&
      (desktopWall.matches || wallInView);
  }
  function schedulePoll(delay = 15000) {
    clearTimeout(pollTimer);
    if (wallVisible()) pollTimer = setTimeout(async () => { await refresh(); schedulePoll(); }, delay);
  }
  retry.addEventListener('click', () => refresh());
  desktopWall.addEventListener('change', () => { scheduleLayout(); schedulePoll(0); });
  for (const canvas of canvases) resizeObserver.observe(canvas);
  new IntersectionObserver(entries => {
    wallInView = entries.some(entry => entry.isIntersecting);
    schedulePoll(0);
  }).observe(root);
  window.addEventListener('resize', scheduleLayout);
  document.fonts.ready.then(scheduleLayout);
  document.addEventListener('visibilitychange', () => schedulePoll(0));
  new MutationObserver(() => schedulePoll(0)).observe(document.body, { attributes: true, attributeFilter: ['data-phase'] });
  window.addEventListener('pagehide', () => clearTimeout(pollTimer));
  window.addEventListener('pageshow', () => schedulePoll(0));
  refresh().then(() => schedulePoll());
}
