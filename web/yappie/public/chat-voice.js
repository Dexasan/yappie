export function createVoiceCall(send) {
  const button = document.getElementById('call');
  const controls = document.getElementById('call-controls');
  const status = document.getElementById('call-status');
  const accept = document.getElementById('accept-call');
  const mute = document.getElementById('mute');
  const hangUp = document.getElementById('hang-up');
  const audio = document.getElementById('remote-audio');
  const playAudio = document.getElementById('play-audio');
  const supported = Boolean(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia);
  let available = false;
  let current;

  function render(text = '', phase) {
    controls.hidden = !text;
    status.textContent = text;
    button.hidden = !available || Boolean(current);
    accept.hidden = phase !== 'incoming';
    mute.hidden = phase !== 'connected';
    hangUp.hidden = !current;
    hangUp.textContent = phase === 'incoming' ? 'Decline' : 'Hang up';
  }

  function stop(text = '') {
    const previous = current;
    current = undefined;
    clearTimeout(previous?.timer);
    previous?.stream?.getTracks().forEach((track) => track.stop());
    previous?.peer?.close();
    audio.srcObject = null;
    playAudio.hidden = true;
    mute.textContent = 'Mute';
    render(text);
  }

  function end(text) {
    if (current?.id) send('voice-end', { call: current.id });
    stop(text);
  }

  function deadline(call, text, milliseconds) {
    clearTimeout(call.timer);
    call.timer = setTimeout(() => { if (current === call) end(text); }, milliseconds);
  }

  async function play(call) {
    try { await audio.play(); } catch {
      if (current === call) playAudio.hidden = false;
    }
  }

  async function connect(call, packet) {
    render('Connecting voice…', 'connecting');
    deadline(call, 'Couldn’t connect the voice call.', 30000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== call) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      call.stream = stream;
      const peer = new RTCPeerConnection({ iceServers: packet.iceServers, iceTransportPolicy: 'relay' });
      call.peer = peer;
      peer.onicecandidate = ({ candidate }) => {
        if (current === call && candidate?.type === 'relay') send('voice-signal', { call: call.id, candidate: candidate.toJSON() });
      };
      peer.ontrack = ({ track, streams }) => {
        if (current !== call || track.kind !== 'audio') return;
        audio.srcObject = streams[0] ?? new MediaStream([track]);
        play(call);
      };
      peer.onconnectionstatechange = () => {
        if (current !== call) return;
        if (peer.connectionState === 'connected') {
          clearTimeout(call.timer);
          render('Voice connected.', 'connected');
          send('voice-connected', { call: call.id });
        } else if (peer.connectionState === 'failed') end('Voice connection lost.');
        else if (peer.connectionState === 'disconnected') {
          render('Reconnecting voice…', 'connected');
          deadline(call, 'Voice connection lost.', 8000);
        }
      };
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
      if (packet.offerer) {
        await peer.setLocalDescription(await peer.createOffer());
        if (current === call) send('voice-signal', { call: call.id, description: peer.localDescription.toJSON() });
      }
      for (const signal of call.waiting) await signalPeer(call, signal);
      call.waiting = [];
    } catch (error) {
      if (current !== call) return;
      end(error.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Couldn’t connect the voice call.');
    }
  }

  async function signalPeer(call, { description, candidate }) {
    if (current !== call) return;
    const peer = call.peer;
    if (description) {
      await peer.setRemoteDescription(description);
      for (const waiting of call.candidates.splice(0)) await peer.addIceCandidate(waiting);
      if (description.type === 'offer') {
        await peer.setLocalDescription(await peer.createAnswer());
        if (current === call) send('voice-signal', { call: call.id, description: peer.localDescription.toJSON() });
      }
    } else if (candidate && peer.remoteDescription) await peer.addIceCandidate(candidate);
    else if (candidate) call.candidates.push(candidate);
  }

  function receive(packet) {
    if (packet.type === 'voice-ended') {
      if (current && (!packet.call || current.id === packet.call)) stop(packet.message);
      return;
    }
    if (packet.type === 'voice-incoming' || packet.type === 'voice-ringing') {
      const incoming = packet.type === 'voice-incoming';
      if (incoming && !supported) {
        send('voice-end', { call: packet.call });
        return;
      }
      clearTimeout(current?.timer);
      current = { id: packet.call, waiting: [], candidates: [], work: Promise.resolve() };
      render(incoming ? 'Stranger is requesting a voice call.' : 'Waiting for the stranger to accept…', incoming ? 'incoming' : 'ringing');
      deadline(current, 'Voice request expired.', 30000);
      return;
    }
    const call = current;
    if (!call || packet.call !== call.id) return;
    if (packet.type === 'voice-start') {
      call.work = connect(call, packet);
    } else if (packet.type === 'voice-signal') {
      if (!call.peer) call.waiting.push(packet);
      else call.work = call.work.then(() => signalPeer(call, packet)).catch(() => {
        if (current === call) end('Voice connection lost.');
      });
    }
  }

  button.addEventListener('click', () => {
    if (current || !send('voice-invite')) return;
    current = {};
    render('Sending voice request…', 'ringing');
    deadline(current, 'Voice request expired.', 10000);
  });
  accept.addEventListener('click', () => {
    if (current?.id && send('voice-accept', { call: current.id })) render('Connecting voice…', 'connecting');
  });
  hangUp.addEventListener('click', () => end('Voice call ended.'));
  mute.addEventListener('click', () => {
    const track = current?.stream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    mute.textContent = track.enabled ? 'Mute' : 'Unmute';
  });
  playAudio.addEventListener('click', () => {
    playAudio.hidden = true;
    if (current) play(current);
  });

  return {
    receive,
    stop,
    setAvailable(enabled) {
      available = enabled && supported;
      button.hidden = !available || Boolean(current);
    },
  };
}
