import { WALL_CAPACITY, WALL_REMOVE_AT, WALL_MAX_WORDS, WALL_MAX_LENGTH, WALL_COLORS, cleanWallText, wallWordCount } from './wall-text.js';

const root = document.getElementById('sticky-wall');
if (root && document.body.dataset.appSession !== 'true') setupWall(root);

function setupWall(root) {
  // Static UI only. Public note text is always inserted as text nodes, never HTML.
  root.innerHTML = `
    <button class="wall-toggle" type="button" aria-expanded="false" aria-controls="wall-sides"><span>Sticky wall</span><span class="wall-mobile-count">Loading…</span><span aria-hidden="true">+</span></button>
    <div class="wall-sides" id="wall-sides">
      <aside class="wall-side wall-side-left" aria-labelledby="wall-title">
        <div class="wall-tools"><div><h2 id="wall-title">Leave a note</h2><p class="wall-meter">Loading the wall…</p></div><button class="wall-add" type="button" aria-label="Write a sticky note" title="Write a sticky note" disabled>+</button></div>
        <p class="wall-rule">Under 10 words. A handle or link is welcome.</p>
        <p class="wall-removal-rule">Anyone can remove notes once 12 of 20 spaces are full.</p>
        <p class="wall-status" role="status" aria-live="polite"></p>
        <button class="wall-retry" type="button" hidden>Try loading again</button>
        <div class="wall-grid wall-left" role="list" aria-label="Left wall notes"></div>
      </aside>
      <aside class="wall-side wall-side-right" aria-label="Right sticky-note wall"><div class="wall-right-heading"><span>Sticky notes</span><span aria-hidden="true">↙</span></div><div class="wall-grid wall-right" role="list" aria-label="Right wall notes"></div></aside>
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
  const mobileToggle = find('.wall-toggle');
  const add = find('.wall-add');
  const meter = find('.wall-meter');
  const mobileCount = find('.wall-mobile-count');
  const removalRule = find('.wall-removal-rule');
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
  let state = null, selectedSlot = null, draftId, postBusy = false, reportBusy = false;
  let reportNote, opener, refreshPromise, pollTimer;

  const slots = Array.from({ length: WALL_CAPACITY }, (_, slot) => {
    const element = document.createElement('div');
    element.className = 'wall-slot';
    element.dataset.slot = String(slot);
    element.setAttribute('role', 'listitem');
    (slot < WALL_CAPACITY / 2 ? find('.wall-left') : find('.wall-right')).append(element);
    emptySlot(element, slot);
    return element;
  });

  function announce(message, error = false) {
    status.textContent = message;
    status.classList.toggle('wall-error', error);
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

  function emptySlot(element, slot) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wall-empty';
    button.setAttribute('aria-label', `Leave a note in space ${slot + 1}`);
    button.title = 'Leave a note here';
    button.disabled = !state;
    const mark = document.createElement('span');
    mark.textContent = '+';
    mark.setAttribute('aria-hidden', 'true');
    button.append(mark);
    button.addEventListener('click', () => openEditor(slot, button));
    delete element.dataset.noteId;
    element.replaceChildren(button);
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
    article.className = 'wall-note wall-arriving';
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
    ghost.classList.remove('wall-arriving'); ghost.classList.add('wall-falling');
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
    const percent = Math.round(state.count / WALL_CAPACITY * 100);
    meter.textContent = `${state.count}/${WALL_CAPACITY} notes · ${percent}% full`;
    mobileCount.textContent = `${state.count}/${WALL_CAPACITY}`;
    add.disabled = state.count >= WALL_CAPACITY;
    add.title = add.disabled ? 'Remove a note to make space' : 'Write a sticky note';
    root.dataset.removable = String(state.removable);
    removalRule.textContent = state.removable ? '60% full. Anyone can peel off any note.' : 'Removing opens at 60% full (12 of 20 notes).';
    const bySlot = new Map(state.notes.map(note => [note.slot, note]));
    for (const [slot, element] of slots.entries()) {
      const note = bySlot.get(slot);
      if (element.dataset.noteId !== note?.id) {
        if (element.contains(document.activeElement)) restoreSlot = slot;
        if (element.dataset.noteId && !initial) fall(element.querySelector('.wall-note'));
        if (note) { element.dataset.noteId = note.id; element.replaceChildren(noteElement(note)); }
        else emptySlot(element, slot);
      }
      const empty = element.querySelector('.wall-empty');
      if (empty) empty.disabled = false;
      const remove = element.querySelector('.wall-remove');
      if (remove) {
        remove.disabled = !state.removable || pendingRemovals.has(note.id);
        remove.title = state.removable ? 'Peel this note off the wall' : 'Removing opens when 12 of 20 spaces are full';
      }
      const flag = element.querySelector('.wall-flag');
      if (flag) { flag.disabled = reported.has(note.id); flag.title = reported.has(note.id) ? 'You reported this note' : 'Report this note'; }
    }
    updateDraft();
    if (initial && !state.count) announce('The wall is empty. Pick a space to leave a note.');
    if (restoreSlot !== null && !writeDialog.open && !reportDialog.open) {
      const target = slots[restoreSlot].querySelector('button:not(:disabled), a[href]') || (add.disabled ? status : add);
      target.focus();
    }
  }

  function openEditor(slot, button) {
    if (!state || state.count >= WALL_CAPACITY || writeDialog.open) return;
    selectedSlot = slot; draftId = crypto.randomUUID(); opener = button;
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
  add.addEventListener('click', () => openEditor(null, add));

  writeForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (postBusy || !writeForm.reportValidity()) return;
    const text = cleanWallText(textarea.value);
    if (!text || wallWordCount(text) > WALL_MAX_WORDS || text.length > WALL_MAX_LENGTH) { formStatus.textContent = 'Use 1–9 words, up to 120 characters.'; return; }
    const payload = { id: draftId, text, color: new FormData(writeForm).get('color'), slot: selectedSlot, adult: writeForm.elements.adult.checked };
    postBusy = true; updateDraft(); formStatus.textContent = 'Posting…';
    for (const control of writeForm.querySelectorAll('input, textarea')) control.disabled = true;
    const close = writeDialog.querySelector('.wall-close'); close.disabled = true;
    try {
      render(await api('notes', payload));
      writeForm.reset(); writeDialog.close(); announce('Your note is on the wall.');
    } catch (error) {
      if (error.wall) render(error.wall);
      if (error.code === 'slot_taken') selectedSlot = null;
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
      slots[note.slot].querySelector('.wall-empty')?.focus();
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
  mobileToggle.addEventListener('click', () => {
    const expanded = root.classList.toggle('wall-open');
    mobileToggle.setAttribute('aria-expanded', String(expanded));
    if (expanded) refresh();
    schedulePoll();
  });

  function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = api('notes').then(next => {
      render(next); retry.hidden = true;
      if (status.classList.contains('wall-error')) announce('Wall updated.');
    }).catch(error => {
      if (!state) { meter.textContent = 'Wall unavailable'; mobileCount.textContent = 'Unavailable'; }
      announce(error.message, true); retry.hidden = false;
    }).finally(() => { refreshPromise = undefined; });
    return refreshPromise;
  }
  function wallVisible() {
    return document.visibilityState === 'visible' && !['active', 'ended'].includes(document.body.dataset.phase) &&
      (desktopWall.matches || root.classList.contains('wall-open'));
  }
  function schedulePoll(delay = 15000) {
    clearTimeout(pollTimer);
    if (wallVisible()) pollTimer = setTimeout(async () => { await refresh(); schedulePoll(); }, delay);
  }
  retry.addEventListener('click', () => refresh());
  desktopWall.addEventListener('change', () => schedulePoll(0));
  document.addEventListener('visibilitychange', () => schedulePoll(0));
  new MutationObserver(() => schedulePoll(0)).observe(document.body, { attributes: true, attributeFilter: ['data-phase'] });
  window.addEventListener('pagehide', () => clearTimeout(pollTimer));
  window.addEventListener('pageshow', () => schedulePoll(0));
  refresh().then(() => schedulePoll());
}
