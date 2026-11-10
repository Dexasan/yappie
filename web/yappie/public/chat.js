import { createVoiceCall } from './chat-voice.js';

const byId = (id) => document.getElementById(id);
const start = byId('start');
const status = byId('status');
const interest = byId('interest');
const interestPicks = [...start.querySelectorAll('[data-interest]')];
const startButton = start.querySelector('button[type="submit"]');
const options = byId('options');
const compose = byId('compose');
const message = byId('message');
const sendButton = compose.querySelector('button');
const transcript = byId('transcript');
const leaveDialog = byId('leave-dialog');
const reportDialog = byId('report-dialog');
const messageError = byId('message-error');
const seenMessages = new Set();

let socket;
let phase = 'start';
let room;
let pending;
let matchingTimer;
let heartbeat;
let sessionRequest;
let attempt = 0;
let reporting = false;
let voiceAvailable = false;
let usedInterest = '';
const viewport = window.visualViewport;

viewport?.addEventListener('resize', () => {
  if (viewport.scale === 1) document.body.style.setProperty('--chat-height', `${viewport.height}px`);
  else document.body.style.removeProperty('--chat-height');
});

function send(type, payload = {}) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ type, ...payload }));
  return true;
}

const voice = createVoiceCall(send);

function show(id, visible) { byId(id).hidden = !visible; }

function setPhase(next, text) {
  phase = next;
  const active = next === 'active';
  const ended = next === 'ended';
  const waiting = next === 'waiting';
  const inConversation = active || ended;
  const hasSafetyActions = Boolean(room && inConversation && socket?.readyState === WebSocket.OPEN);
  document.body.dataset.phase = next;
  for (const id of ['match-header', 'match-hero', 'match-panel', 'match-footer']) show(id, !inConversation);
  show('start', next === 'start');
  show('waiting', waiting);
  show('conversation', inConversation);
  show('leave', active);
  show('compose', active);
  show('options', hasSafetyActions);
  if (!hasSafetyActions) options.open = false;
  show('new-chat', ended);
  byId('match-title').textContent = waiting ? 'Finding a match…' : 'Choose an interest';
  const statusHost = byId(inConversation ? 'conversation-status' : 'matching-status');
  if (status.parentElement !== statusHost) statusHost.append(status);
  voice.setAvailable(active && voiceAvailable);
  status.textContent = text;
}

function resetMessages() {
  transcript.replaceChildren();
  seenMessages.clear();
  message.value = '';
  messageError.hidden = true;
  clearTimeout(pending?.timeout);
  pending = undefined;
  sendButton.disabled = false;
}

function addMessage(event) {
  const atBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 48;
  const item = document.createElement('li');
  const author = document.createElement('span');
  author.className = 'sr-only';
  author.textContent = event.own ? 'You: ' : 'Stranger: ';
  item.classList.toggle('own', event.own);
  item.append(author, document.createTextNode(event.text));
  transcript.append(item);
  if (atBottom || event.own) transcript.scrollTop = transcript.scrollHeight;
}

function ended(text) {
  if (leaveDialog.open) leaveDialog.close();
  voice.stop();
  clearTimeout(pending?.timeout);
  pending = undefined;
  sendButton.disabled = false;
  setPhase('ended', text);
  if (!reportDialog.open) byId('new-chat').focus();
}

function showWait(text = 'Looking for someone to chat with…') {
  setPhase('waiting', text);
  show('anyone', false);
  status.focus();
  clearTimeout(matchingTimer);
  if (socket?.readyState !== WebSocket.OPEN) return;
  matchingTimer = setTimeout(() => {
    if (phase !== 'waiting') return;
    status.textContent = usedInterest ? 'Still looking for someone with your interest.' : 'Still looking. You can wait here or try again later.';
    show('anyone', Boolean(usedInterest));
  }, 10000);
}

function receive(event) {
  const packet = JSON.parse(event.data);
  switch (packet.type) {
    case 'ready':
      voiceAvailable = packet.voice;
      if (phase === 'waiting') send('join', { interest: usedInterest });
      break;
    case 'matched':
      if (phase !== 'waiting') break;
      clearTimeout(matchingTimer);
      room = packet.room;
      reporting = false;
      resetMessages();
      setPhase('active', 'Connected now');
      if (matchMedia('(pointer: fine)').matches) message.focus();
      else status.focus();
      break;
    case 'cancelled':
      room = undefined;
      setPhase('start', 'Search cancelled.');
      startButton.focus();
      break;
    case 'ended':
      if (room && packet.room === room && !reporting) {
        ended(packet.reason === 'peer' ? 'The stranger left.' : 'You left the chat.');
      }
      break;
    case 'reported':
    case 'blocked':
      reporting = false;
      room = undefined;
      ended(packet.type === 'reported' ? 'Report sent.' : 'Stranger blocked.');
      break;
    case 'message':
      if (packet.room !== room) break;
      if (packet.own && pending?.id === packet.id) {
        clearTimeout(pending.timeout);
        if (message.value.trim() === pending.text) message.value = '';
        pending = undefined;
        sendButton.disabled = false;
        messageError.hidden = true;
      }
      if (!seenMessages.has(packet.id)) {
        seenMessages.add(packet.id);
        addMessage(packet);
      }
      break;
    case 'error':
      reporting = false;
      if (packet.action === 'message') {
        clearTimeout(pending?.timeout);
        sendButton.disabled = false;
        messageError.textContent = packet.message;
        messageError.hidden = false;
      } else if (packet.action === 'join' || packet.action === 'connect') {
        setPhase('start', packet.message);
        status.focus();
      } else {
        status.textContent = packet.message;
      }
      break;
    default:
      if (packet.type.startsWith('voice-') && packet.room === room && phase === 'active') voice.receive(packet);
  }
}

async function join() {
  if (phase === 'waiting' || phase === 'active' || phase === 'leaving') return;
  const currentAttempt = ++attempt;
  usedInterest = interest.value.trim();
  room = undefined;
  showWait('Connecting…');
  if (send('join', { interest: usedInterest })) {
    showWait();
    return;
  }
  try {
    if (!sessionRequest) {
      sessionRequest = fetch('/chat-api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adult: byId('agree').checked }),
      }).then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).message);
      }).catch((error) => {
        sessionRequest = undefined;
        throw error;
      });
    }
    await sessionRequest;
    if (currentAttempt !== attempt || phase !== 'waiting') return;
    const url = new URL('/chat-api/socket', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new WebSocket(url);
    socket = connection;
    let lastResponse = Date.now();
    const connectionTimeout = setTimeout(() => connection.close(), 12000);
    connection.addEventListener('message', (event) => {
      if (socket !== connection) return;
      lastResponse = Date.now();
      receive(event);
    });
    connection.addEventListener('open', () => {
      if (socket !== connection) return;
      clearTimeout(connectionTimeout);
      showWait();
      heartbeat = setInterval(() => {
        if (Date.now() - lastResponse > 45000) connection.close(4000, 'Connection timed out');
        else send('ping');
      }, 20000);
    });
    connection.addEventListener('close', () => {
      clearTimeout(connectionTimeout);
      if (socket !== connection) return;
      socket = undefined;
      sessionRequest = undefined;
      reporting = false;
      clearInterval(heartbeat);
      if (phase === 'active' || phase === 'ended') ended('Connection closed. Start a new chat to reconnect.');
      if (phase === 'waiting' || phase === 'leaving') setPhase('start', 'Couldn’t connect. Try starting a chat again.');
    });
  } catch (error) {
    if (currentAttempt === attempt && phase === 'waiting') setPhase('start', error.message || 'Couldn’t connect. Try again.');
  }
}

function cancelSearch() {
  attempt++;
  clearTimeout(matchingTimer);
  if (send('cancel')) {
    setPhase('leaving', 'Cancelling…');
  } else {
    const connection = socket;
    socket = undefined;
    connection?.close();
    setPhase('start', 'Search cancelled.');
    startButton.focus();
  }
}

function updateInterestPicks() {
  const selection = interest.value.trim().toLowerCase();
  for (const pick of interestPicks) pick.setAttribute('aria-pressed', String(pick.dataset.interest.toLowerCase() === selection));
}

for (const pick of interestPicks) {
  pick.addEventListener('click', () => {
    interest.value = pick.getAttribute('aria-pressed') === 'true' ? '' : pick.dataset.interest;
    updateInterestPicks();
  });
}
interest.addEventListener('input', updateInterestPicks);

start.addEventListener('submit', (event) => { event.preventDefault(); join(); });
byId('new-chat').addEventListener('click', join);
byId('cancel').addEventListener('click', cancelSearch);
byId('anyone').addEventListener('click', () => {
  if (send('broaden')) {
    usedInterest = '';
    showWait();
  }
});
byId('leave').addEventListener('click', () => leaveDialog.showModal());
leaveDialog.addEventListener('close', () => {
  if (leaveDialog.returnValue === 'leave' && phase === 'active') {
    if (!send('leave')) ended('Connection closed.');
  }
  leaveDialog.returnValue = '';
});

byId('report').addEventListener('click', () => {
  options.open = false;
  byId('report-form').reset();
  reportDialog.showModal();
});
reportDialog.addEventListener('close', () => {
  if (reportDialog.returnValue === 'report' && room && !reporting) {
    reporting = send('report', { room, reason: byId('reason').value });
    status.textContent = reporting ? 'Sending report…' : 'Connection closed. The report could not be sent.';
  }
  reportDialog.returnValue = '';
  if (!options.hidden) options.querySelector('summary').focus();
});
byId('block').addEventListener('click', () => {
  options.open = false;
  if (room && !reporting) reporting = send('block', { room });
});

document.addEventListener('click', (event) => {
  if (options.open && !options.contains(event.target)) options.open = false;
});

compose.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = message.value.trim();
  if (phase !== 'active' || !text || sendButton.disabled) return;
  const id = pending?.text === text ? pending.id : crypto.randomUUID();
  if (!send('message', { id, text })) return;
  messageError.hidden = true;
  sendButton.disabled = true;
  const timeout = setTimeout(() => {
    sendButton.disabled = false;
    messageError.textContent = 'Delivery unconfirmed. Press Send to retry.';
    messageError.hidden = false;
  }, 5000);
  pending = { id, text, timeout };
});

document.addEventListener('keydown', (event) => {
  if (event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Enter' && event.target === message && !event.shiftKey) {
    event.preventDefault();
    if (!event.repeat) compose.requestSubmit();
  }
  if (event.key !== 'Escape' || reportDialog.open) return;
  if (options.open) {
    event.preventDefault();
    if (!event.repeat) {
      options.open = false;
      options.querySelector('summary').focus();
    }
    return;
  }
  if (!leaveDialog.open && phase !== 'active' && phase !== 'waiting') return;
  event.preventDefault();
  if (event.repeat) return;
  if (leaveDialog.open) leaveDialog.close('leave');
  else if (phase === 'active') leaveDialog.showModal();
  else cancelSearch();
});

window.addEventListener('pagehide', () => socket?.close());
