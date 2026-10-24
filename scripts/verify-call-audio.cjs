const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
const outfile = path.resolve('dist/qa/audio-tests.cjs');
fs.mkdirSync(path.dirname(outfile), { recursive: true });
esbuild.buildSync({ entryPoints: ['src/features/calls/audio-connection.ts'], outfile, bundle: true, platform: 'node', format: 'cjs' });
const { startCallAudio } = require(outfile);
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 8000;
  while (!predicate()) { assert.ok(Date.now() < deadline, 'Timed out waiting for audio state'); await pause(10); }
}
function harness(overrides = {}) {
  const state = { remote: '', packets: 0, pendingPulls: 0, pullAttempts: 0, peers: [], created: [], closed: [], connected: false, errors: [], trackStopped: false, routeStarted: 0, routeStopped: 0 };
  const track = { enabled: true, stop: () => { state.trackStopped = true; } };
  const deps = {
    pollMs: 5,
    gateway: async (request) => {
      if (request.action === 'create_session') { const id = `session-${state.created.length}`; state.created.push(id); return { mediaSessionId: id }; }
      if (request.action === 'close_session') { state.closed.push(request.media_session_id); return {}; }
      if (request.action === 'publish') return { provider: { sessionDescription: { type: 'answer', sdp: 'v=0' } } };
      if (request.action === 'pull') {
        if (!request.inspect_only) state.pullAttempts++;
        if (!request.inspect_only && state.pendingPulls-- > 0) return { trackCount: 0, publisherKey: state.remote };
        return { trackCount: state.remote ? 1 : 0, publisherKey: state.remote, provider: { sessionDescription: { type: 'offer', sdp: 'v=0' } } };
      }
      return {};
    },
    microphone: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }),
    createPeer: () => {
      const peer = {
        connectionState: 'connected', signalingState: 'stable', iceGatheringState: 'complete',
        addTransceiver() { this.publisher = true; }, addEventListener() {},
        async createOffer() { return { type: 'offer', sdp: 'v=0' }; },
        async createAnswer() { return { type: 'answer', sdp: 'v=0' }; },
        async setLocalDescription(sdp) { this.localDescription = sdp; }, async setRemoteDescription() {},
        async getStats() { return new Map([['audio', { type: this.publisher ? 'outbound-rtp' : 'inbound-rtp', kind: 'audio', packetsSent: 100, packetsReceived: state.packets }]]); },
        close() { this.signalingState = 'closed'; this.connectionState = 'closed'; },
      };
      state.peers.push(peer); return peer;
    },
    startRoute: () => state.routeStarted++, stopRoute: () => state.routeStopped++, onTrack() {},
    onConnected: value => { state.connected = value; }, onError: value => state.errors.push(value),
    ...overrides,
  };
  return { state, deps };
}
(async () => {
  const h = harness();
  const call = startCallAudio('delayed-partner', h.deps);
  await until(() => h.state.created.length === 2);
  assert.equal(h.state.connected, false, 'A missing publisher must never count as connected');
  h.state.remote = 'brother:microphone1';
  h.state.pendingPulls = 1;
  await until(() => h.state.peers.length === 2);
  assert.equal(h.state.pullAttempts, 2, 'An empty microphone track must be retried');
  assert.equal(h.state.connected, false, 'SDP alone must not count as received audio');
  h.state.packets = 10;
  await until(() => h.state.connected);
  h.state.remote = 'brother:microphone2';
  await until(() => h.state.peers.length === 3);
  assert.equal(h.state.peers[1].connectionState, 'closed', 'A partner retry replaces only the receiver');
  assert.equal(h.state.created.length, 3, 'Polling must reuse the waiting subscriber and keep the publisher');
  await call.stop();
  assert.deepEqual(h.state.closed.sort(), h.state.created.sort(), 'Every created session must close');
  assert.equal(h.state.trackStopped, true);
  assert.equal(h.state.routeStarted, h.state.routeStopped);
  assert.deepEqual(h.state.errors, []);

  let releaseCreate;
  let releaseClose;
  const late = harness();
  const normalGateway = late.deps.gateway;
  late.deps.gateway = async body => {
    if (body.action === 'create_session') await new Promise(resolve => { releaseCreate = resolve; });
    if (body.action === 'close_session') await new Promise(resolve => { releaseClose = resolve; });
    return normalGateway(body);
  };
  const first = startCallAudio('same-call', late.deps);
  await until(() => releaseCreate);
  const stopped = first.stop();
  const next = harness();
  const retry = startCallAudio('same-call', next.deps);
  await pause(10);
  assert.equal(next.state.created.length, 0, 'Retry must wait for in-flight old session creation');
  releaseCreate();
  await until(() => releaseClose);
  assert.equal(next.state.created.length, 0, 'Retry must wait for gateway cleanup');
  releaseClose();
  await stopped;
  await until(() => next.state.created.length === 2);
  await retry.stop();
  assert.deepEqual(late.state.created, late.state.closed, 'A session created after hangup must close');
  assert.equal(late.state.peers.length, 0, 'Hangup must prevent late peer setup');
  assert.equal(late.state.trackStopped, true);
  assert.deepEqual(late.state.errors, []);
  console.log('Audio regressions passed: delayed publisher, packet readiness, partner retry, immediate hangup, serialized cleanup.');
})().catch(error => { console.error(error); process.exit(1); });
