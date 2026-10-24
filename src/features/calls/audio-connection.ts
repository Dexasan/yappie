import type { MediaStream, MediaStreamTrack, RTCPeerConnection } from '@cloudflare/react-native-webrtc';

export type AudioDescription = { sdp: string; type: 'offer' | 'answer' };
export type AudioGatewayResponse = {
  mediaSessionId?: string;
  provider?: { sessionDescription?: AudioDescription } | null;
  trackCount?: number;
  publisherKey?: string;
};
type Dependencies = {
  gateway: (body: Record<string, unknown>) => Promise<AudioGatewayResponse | null>;
  createPeer: () => RTCPeerConnection;
  microphone: () => Promise<MediaStream>;
  startRoute: () => void;
  stopRoute: () => void;
  onTrack: (track: MediaStreamTrack | null) => void;
  onConnected: (connected: boolean) => void;
  onError: (message: string) => void;
  pollMs?: number;
};

// A remount/retry must finish closing the previous gateway sessions before
// create_session can reuse an active session belonging to the old peer.
const lifetimes = new Map<string, Promise<void>>();

function description(value: { sdp?: string; type?: string | null } | null | undefined): AudioDescription {
  if (!value?.sdp || (value.type !== 'offer' && value.type !== 'answer')) throw new Error('The audio service returned an invalid connection.');
  return { sdp: value.sdp, type: value.type };
}

async function localDescription(peer: RTCPeerConnection, kind: 'offer' | 'answer') {
  await peer.setLocalDescription(description(kind === 'offer' ? await peer.createOffer({}) : await peer.createAnswer()));
  const deadline = Date.now() + 3000;
  while (peer.iceGatheringState !== 'complete' && peer.signalingState !== 'closed' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return description(peer.localDescription);
}

export async function audioPackets(peer: RTCPeerConnection, direction: 'inbound' | 'outbound') {
  const stats = await peer.getStats();
  let count = 0;
  stats.forEach((stat: { type: string; kind?: string; mediaType?: string; packetsReceived?: number; packetsSent?: number }) => {
    if (stat.type === `${direction}-rtp` && (stat.kind === 'audio' || stat.mediaType === 'audio')) {
      count += (direction === 'inbound' ? stat.packetsReceived : stat.packetsSent) ?? 0;
    }
  });
  return count;
}

export function startCallAudio(callId: string, deps: Dependencies) {
  let stopped = false;
  let stream: MediaStream | null = null;
  let publisher: RTCPeerConnection | null = null;
  let subscriber: RTCPeerConnection | null = null;
  let publisherId: string | null = null;
  let subscriberId: string | null = null;
  let routeStarted = false;
  let wake: (() => void) | undefined;
  const previous = lifetimes.get(callId);
  const requireActive = () => { if (stopped) throw new Error('Call stopped'); };
  const closeSession = async (id: string | null) => {
    if (id) await deps.gateway({ action: 'close_session', media_session_id: id });
  };
  const stopLocalMedia = () => {
    stream?.getTracks().forEach((track) => track.stop());
    publisher?.close();
    subscriber?.close();
  };
  const createSession = async (kind: 'publisher' | 'subscriber') => {
    const result = await deps.gateway({ action: 'create_session', call_id: callId, session_kind: kind });
    if (!result?.mediaSessionId) throw new Error('The audio service could not start the call.');
    return result.mediaSessionId;
  };

  const done = (async () => {
    try {
      await previous;
      requireActive();
      stream = await deps.microphone();
      requireActive();
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('No microphone was found. Check microphone access and try again.');
      track.enabled = true;
      deps.startRoute();
      routeStarted = true;
      deps.onTrack(track);
      publisherId = await createSession('publisher');
      requireActive();
      publisher = deps.createPeer();
      publisher.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
      const offer = await localDescription(publisher, 'offer');
      requireActive();
      const published = await deps.gateway({ action: 'publish', media_session_id: publisherId, session_description: offer });
      requireActive();
      await publisher.setRemoteDescription(description(published?.provider?.sessionDescription));

      let remoteKey = '';
      let inspectAt = 0;
      let lastReceived = 0;
      let receivedAt = 0;
      let waitingSince = Date.now();
      while (!stopped) {
        if (Date.now() >= inspectAt) {
          // Polling also recovers a missed realtime event or a partner retry.
          if (!subscriberId) subscriberId = await createSession('subscriber');
          requireActive();
          const available = await deps.gateway({ action: 'pull', media_session_id: subscriberId, inspect_only: true });
          requireActive();
          const nextKey = available?.publisherKey ?? '';
          if (nextKey !== remoteKey) {
            deps.onConnected(false);
            subscriber?.close();
            subscriber = null;
            if (remoteKey) {
              await closeSession(subscriberId);
              subscriberId = null;
              requireActive();
              subscriberId = await createSession('subscriber');
              requireActive();
            }
            remoteKey = '';
            lastReceived = receivedAt = 0;
            waitingSince = Date.now();
            if (nextKey) {
              const pulled = await deps.gateway({ action: 'pull', media_session_id: subscriberId });
              requireActive();
              if (pulled?.trackCount) {
                subscriber = deps.createPeer();
                const events = subscriber as unknown as { addEventListener: (name: string, callback: (event: { track: MediaStreamTrack | null }) => void) => void };
                events.addEventListener('track', (event) => { if (event.track) event.track.enabled = true; });
                await subscriber.setRemoteDescription(description(pulled.provider?.sessionDescription));
                const answer = await localDescription(subscriber, 'answer');
                requireActive();
                await deps.gateway({ action: 'renegotiate', media_session_id: subscriberId, session_description: answer });
                requireActive();
                remoteKey = pulled.publisherKey ?? nextKey;
              }
            }
          }
          inspectAt = Date.now() + 1500;
        }
        const sent = await audioPackets(publisher, 'outbound');
        const received = subscriber ? await audioPackets(subscriber, 'inbound') : 0;
        requireActive();
        if (received > lastReceived) receivedAt = Date.now();
        lastReceived = received;
        const peersConnected = publisher.connectionState === 'connected' && subscriber?.connectionState === 'connected';
        const flowing = Boolean(peersConnected && sent > 0 && receivedAt && Date.now() - receivedAt < 15000);
        deps.onConnected(flowing);
        if (publisher.connectionState === 'failed' || subscriber?.connectionState === 'failed') throw new Error('Audio lost its connection. Tap Retry audio to reconnect.');
        if (!flowing && Date.now() - (receivedAt || waitingSince) > 30000) throw new Error('No audio is arriving. Check your connection, then tap Retry audio.');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, deps.pollMs ?? 1000);
          wake = () => { clearTimeout(timer); resolve(); };
        });
      }
    } catch (error) {
      if (!stopped) deps.onError(error instanceof Error ? error.message : 'Audio could not connect. Try again.');
    } finally {
      stopLocalMedia();
      if (routeStarted) deps.stopRoute();
      deps.onTrack(null);
      if (!stopped) deps.onConnected(false);
      // Includes sessions whose creation completed after the user hung up.
      await Promise.allSettled([closeSession(publisherId), closeSession(subscriberId)]);
    }
  })();
  lifetimes.set(callId, done);
  void done.then(() => { if (lifetimes.get(callId) === done) lifetimes.delete(callId); });
  return { done, stop: () => { stopped = true; stopLocalMedia(); wake?.(); return done; } };
}
