import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { mediaDevices, RTCPeerConnection, type MediaStreamTrack } from '@cloudflare/react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import { supabase } from '@/lib/supabase';
import { startCallAudio, type AudioGatewayResponse } from './audio-connection';

export type DirectCallAudioState = {
  error: string;
  isConfigured: boolean;
  isConnected: boolean;
  isMuted: boolean;
  isSpeaker: boolean;
  status: 'unavailable' | 'connecting' | 'connected' | 'error';
  toggleMute: () => Promise<void>;
  toggleSpeaker: () => void;
  retry: () => void;
};
const isCloudflareConfigured = process.env.EXPO_PUBLIC_CLOUDFLARE_REALTIME_ENABLED === 'true';
async function gateway(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke<AudioGatewayResponse>('cloudflare-room-audio', { body });
  if (error) throw new Error('The audio service could not connect. Please retry.');
  return data;
}
export async function disconnectDirectCallAudio(callId: string) {
  if (isCloudflareConfigured) await gateway({ action: 'disconnect', call_id: callId });
}
export async function ensureDirectCallMicrophonePermission() {
  if (Platform.OS !== 'android') return true;
  if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone access', message: 'YAPPIE needs microphone access for your private audio call.',
    buttonPositive: 'Allow', buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
export function useDirectCallAudio(callId: string | undefined, enabled: boolean): DirectCallAudioState {
  const track = useRef<MediaStreamTrack | null>(null);
  const [isConnected, setConnected] = useState(false);
  const [isMuted, setMuted] = useState(false);
  const [isSpeaker, setSpeaker] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setConnected(false); setMuted(false); setSpeaker(false); setError('');
    if (!callId || !enabled || !isCloudflareConfigured) return;
    let active = true;
    const connection = startCallAudio(callId, {
      gateway,
      createPeer: () => new RTCPeerConnection({ bundlePolicy: 'max-bundle', iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }),
      microphone: async () => {
        if (!(await ensureDirectCallMicrophonePermission())) throw new Error('Allow microphone access to use audio calls.');
        return mediaDevices.getUserMedia({ audio: true, video: false });
      },
      startRoute: () => InCallManager.start({ media: 'audio' }),
      stopRoute: () => InCallManager.stop(),
      onTrack: (next) => { if (active) track.current = next; },
      onConnected: (next) => { if (active) setConnected(next); },
      onError: (next) => { if (active) setError(next); },
    });
    return () => { active = false; track.current = null; void connection.stop(); };
  }, [callId, enabled, attempt]);
  return {
    error, isConfigured: isCloudflareConfigured, isConnected: enabled && isConnected, isMuted, isSpeaker,
    status: !isCloudflareConfigured ? 'unavailable' : error ? 'error' : isConnected ? 'connected' : 'connecting',
    toggleMute: async () => {
      if (!track.current) return;
      track.current.enabled = !track.current.enabled;
      setMuted(!track.current.enabled);
    },
    toggleSpeaker: () => {
      InCallManager.setForceSpeakerphoneOn(!isSpeaker);
      setSpeaker(!isSpeaker);
    },
    retry: () => setAttempt((value) => value + 1),
  };
}
