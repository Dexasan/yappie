import { Text } from '@/components/Typography';
import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Pill, SignalBars } from '@/components/ui';
import { InkDrawing } from '@/components/InkArtwork';
import { useSession } from '@/context/SessionContext';
import { disconnectDirectCallAudio, useDirectCallAudio } from '@/features/calls/audio';
import {
  endDirectCall,
  heartbeatDirectCall,
  loadCallPartner,
  loadDirectCall,
  subscribeToDirectCall,
  type CallPartner,
  type CallStatus,
  type DirectCall,
} from '@/features/calls/api';
import { blockProfile, reportProfile } from '@/features/quick-chat/api';
import { colors, fonts, radius, shadows, spacing } from '@/theme/tokens';
import { trackEvent } from '@/features/analytics/api';

const terminalStatuses: CallStatus[] = ['declined', 'cancelled', 'missed', 'ended'];

function statusCopy(status: CallStatus, partnerName: string) {
  if (status === 'requested') return `Calling ${partnerName}…`;
  if (status === 'accepted') return 'Private audio call';
  if (status === 'declined') return `${partnerName} declined the call`;
  if (status === 'missed') return 'No answer';
  if (status === 'cancelled') return 'Call cancelled';
  return 'Call ended';
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function DirectCallScreen() {
  const params = useLocalSearchParams<{ callId: string }>();
  const callId = Array.isArray(params.callId) ? params.callId[0] : params.callId;
  const { user } = useSession();
  const [call, setCall] = useState<DirectCall | null>(null);
  const [partner, setPartner] = useState<CallPartner | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const callStatusRef = useRef<CallStatus | null>(null);
  const leavingRef = useRef(false);
  const audio = useDirectCallAudio(callId, call?.status === 'accepted');
  useEffect(()=>{if(audio.error)trackEvent('audio_failed','calls');},[audio.error]);

  useEffect(() => {
    if (!callId || !user || !appIsActive) return;
    let active = true;
    let latestUpdate = '';
    const applyCall = async (nextCall: DirectCall) => {
      if (!active || nextCall.updated_at < latestUpdate) return;
      latestUpdate = nextCall.updated_at;
      callStatusRef.current = nextCall.status;
      setCall(nextCall);
      if (!partner) {
        const nextPartner = await loadCallPartner(nextCall, user.id).catch(() => null);
        if (active) setPartner(nextPartner);
      }
      setLoading(false);
    };
    void loadDirectCall(callId).then(applyCall).catch((nextError: unknown) => {
      if (active) {
        setError(nextError instanceof Error ? nextError.message : 'Could not load this call.');
        setLoading(false);
      }
    });
    const unsubscribe = subscribeToDirectCall(callId, (nextCall) => void applyCall(nextCall));
    const poll = setInterval(() => { void loadDirectCall(callId).then(applyCall).catch(() => undefined); }, 5000);
    return () => { active = false; clearInterval(poll); unsubscribe(); };
  }, [appIsActive, callId, user]);

  useEffect(() => {
    if (call?.status !== 'accepted' || !call.accepted_at) {
      setElapsed(0);
      return;
    }
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(call.accepted_at!).getTime()) / 1_000)));
    update();
    const interval = setInterval(update, 1_000);
    return () => clearInterval(interval);
  }, [call?.accepted_at, call?.status]);

  useEffect(() => {
    if (!callId || call?.status !== 'accepted') return;
    let active = true;
    const heartbeat = () => {
      void heartbeatDirectCall(callId).then((connected) => {
        if (active && !connected) setError('The other person disconnected.');
      }).catch(() => {
        if (active) setError('Call connection is unstable.');
      });
    };
    heartbeat();
    const interval = setInterval(heartbeat, 6_000);
    return () => { active = false; clearInterval(interval); };
  }, [call?.status, callId]);

  useEffect(() => {
    if (!callId) return;
    const close = async (reason: string) => {
      if (leavingRef.current || !callStatusRef.current || terminalStatuses.includes(callStatusRef.current)) return;
      leavingRef.current = true;
      await disconnectDirectCallAudio(callId).catch(() => undefined);
      await endDirectCall(callId, reason).catch(() => undefined);
    };
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppIsActive(nextState === 'active');
      if (nextState === 'background') void close('App closed');
    });
    return () => {
      subscription.remove();
      void close('Left call');
    };
  }, [callId]);

  const partnerName = partner?.display_name || (partner?.handle ? `@${partner.handle}` : 'YAPPIE member');
  const endCall = async () => {
    if (!callId || busy) return;
    setBusy(true);
    leavingRef.current = true;
    try {
      await disconnectDirectCallAudio(callId).catch(() => undefined);
      await endDirectCall(callId, call?.status === 'requested' ? 'Cancelled' : 'Hung up');
      router.replace('/(tabs)/quick-chat');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not end this call.');
      leavingRef.current = false;
      setBusy(false);
    }
  };

  const blockCaller = () => {
    if (!user || !partner) return;
    Alert.alert(`Block ${partnerName}?`, 'They will no longer be able to find, message, or call you.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => void blockProfile(user.id, partner.id).then(() => endCall()) },
    ]);
  };

  const reportCaller = () => {
    if (!user || !partner) return;
    Alert.alert(`Report ${partnerName}?`, 'This ends the call and sends a safety report for review.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: () => void reportProfile(user.id, partner.id, 'Reported from a direct audio call.').then(() => endCall()) },
    ]);
  };

  if (loading) {
    return <SafeAreaView style={styles.screen}><ActivityIndicator color={colors.signal} style={styles.loading} /></SafeAreaView>;
  }

  const isActive = call?.status === 'accepted';
  const isTerminal = call ? terminalStatuses.includes(call.status) : true;
  return (
    <SafeAreaView style={styles.screen}>
      <View pointerEvents="none" style={styles.glowOne} />
      <View pointerEvents="none" style={styles.glowTwo} />
      <View style={styles.topRow}>
        <Pill label={isActive ? audio.isConnected ? 'Connected' : audio.error ? 'Audio interrupted' : 'Connecting audio' : call?.status ?? 'Call'} tone={audio.isConnected ? 'success' : 'default'} />
        <View style={styles.safetyRow}>
          <Pressable onPress={reportCaller} style={styles.smallAction}><Text style={styles.smallActionText}>Report</Text></Pressable>
          <Pressable onPress={blockCaller} style={styles.smallAction}><Text style={styles.smallActionText}>Block</Text></Pressable>
        </View>
      </View>

      <View style={styles.callStage}>
        <View style={[styles.avatarHalo, isActive && styles.avatarHaloLive]}><Avatar label={partnerName} path={partner?.avatar_path} size={132} /></View>
        <Text style={styles.partnerName}>{partnerName}</Text>
        <Text style={styles.partnerMeta}>{partner?.country_code ?? 'Worldwide'} · {partner?.languages?.slice(0, 2).join(', ') || 'YAPPIE member'}</Text>
        <Text style={styles.status}>{call ? statusCopy(call.status, partnerName) : 'Call unavailable'}</Text>
        {isActive && audio.isConnected ? (
          <View style={styles.durationRow}><SignalBars /><Text style={styles.duration}>{formatDuration(elapsed)}</Text></View>
        ) : isActive && !audio.error ? <><ActivityIndicator color={colors.signal} /><Text style={styles.partnerMeta}>{audio.isConfigured ? 'Waiting for both microphones…' : 'Audio is unavailable in this build.'}</Text></> : call?.status === 'requested' ? <ActivityIndicator color={colors.signal} /> : null}
        {audio.error || error ? <Text style={styles.error}>{audio.error || error}</Text> : null}
        {isActive && audio.error ? <Pressable accessibilityRole="button" onPress={audio.retry} style={styles.smallAction}><Text style={styles.smallActionText}>Retry audio ↗</Text></Pressable> : null}
      </View>

      <View style={styles.controls}>
        {isActive ? (
          <Pressable accessibilityLabel={audio.isMuted ? 'Unmute microphone' : 'Mute microphone'} onPress={() => void audio.toggleMute()} style={styles.controlButton}>
            <InkDrawing motif={audio.isMuted ? 'plus' : 'sound'} size={32} color={colors.text} />
            <Text style={styles.controlLabel}>{audio.isMuted ? 'Unmute' : 'Mute'}</Text>
          </Pressable>
        ) : null}
        {isActive ? <Pressable accessibilityRole="button" accessibilityLabel={audio.isSpeaker ? 'Use earpiece' : 'Use speaker'} accessibilityState={{ selected: audio.isSpeaker }} onPress={audio.toggleSpeaker} style={styles.controlButton}>
          <InkDrawing motif="sound" size={32} color={audio.isSpeaker ? colors.signal : colors.textMuted} /><Text style={styles.controlLabel}>{audio.isSpeaker ? 'Speaker on' : 'Speaker'}</Text>
        </Pressable> : null}
        {!isTerminal ? (
          <Pressable accessibilityLabel="End call" disabled={busy} onPress={() => void endCall()} style={[styles.endButton, busy && styles.disabled]}>
            <Text style={styles.endGlyph}>⌕</Text><Text style={styles.endLabel}>{call?.status === 'requested' ? 'Cancel' : 'Hang up'}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => router.replace('/(tabs)/quick-chat')} style={styles.backButton}><Text style={styles.backLabel}>Back to YAP</Text></Pressable>
        )}
      </View>
      <Text style={styles.privacy}>Private audio · phone numbers are never shared</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1, overflow: 'hidden', padding: spacing.xl },
  glowOne: { borderColor: colors.accent, borderWidth: 3, borderRadius: 160, height: 320, position: 'absolute', right: -230, top: 70, width: 320, transform: [{ rotate: '-20deg' }] },
  glowTwo: { borderColor: colors.primary, borderWidth: 2, borderRadius: 120, bottom: -80, height: 240, left: -180, position: 'absolute', width: 240 },
  loading: { flex: 1 },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  safetyRow: { flexDirection: 'row', gap: spacing.sm },
  smallAction: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 9 },
  smallActionText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  callStage: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center' },
  avatarHalo: { ...shadows.floating, backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: 84, borderWidth: 1, marginBottom: spacing.lg, padding: 10 },
  avatarHaloLive: { backgroundColor: colors.signal, borderColor: colors.signal },
  partnerName: { fontFamily: fonts.display, color: colors.text, fontSize: 52, lineHeight: 56, letterSpacing: -0.5, textAlign: 'center', textTransform: 'uppercase' },
  partnerMeta: { color: colors.textMuted, fontSize: 16, textAlign: 'center' },
  status: { color: colors.text, fontFamily: fonts.italic, fontSize: 30, marginTop: spacing.lg, textAlign: 'center' },
  durationRow: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  duration: { color: colors.signal, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '900' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, maxWidth: 300, textAlign: 'center' },
  controls: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', minHeight: 100 },
  controlButton: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: 8, borderWidth: 1, height: 86, justifyContent: 'center', width: 86 },
  controlGlyph: { color: colors.text, fontSize: 28, fontWeight: '900', lineHeight: 28 },
  controlLabel: { color: colors.text, fontSize: 13, fontWeight: '900' },
  endButton: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: 8, height: 86, justifyContent: 'center', width: 106 },
  endGlyph: { color: colors.primaryInk, fontSize: 29, fontWeight: '900', lineHeight: 30, transform: [{ rotate: '-45deg' }] },
  endLabel: { color: colors.primaryInk, fontSize: 13, fontWeight: '700' },
  backButton: { alignItems: 'center', backgroundColor: colors.signal, borderRadius: 8, minHeight: 62, justifyContent: 'center', paddingHorizontal: spacing.xxl },
  backLabel: { color: colors.primaryInk, fontSize: 17, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  privacy: { color: colors.textSubtle, fontSize: 12, fontWeight: '700', paddingBottom: spacing.sm, textAlign: 'center' },
});
