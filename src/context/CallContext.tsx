import { Text } from '@/components/Typography';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import {
  endDirectCall,
  loadCallPartner,
  loadPendingIncomingCall,
  respondDirectCall,
  setCallAvailability,
  subscribeToIncomingCalls,
  type CallPartner,
  type DirectCall,
} from '@/features/calls/api';
import { colors, fonts, radius, shadows, spacing } from '@/theme/tokens';

const availabilityPreferenceKey = 'yappie:available-for-calls';

type CallContextValue = {
  isAvailable: boolean;
  isAvailabilityBusy: boolean;
  refreshAvailability: () => Promise<void>;
  setAvailable: (available: boolean) => Promise<void>;
};

const CallContext = createContext<CallContextValue | null>(null);

function IncomingCallSheet({
  call,
  partner,
  busy,
  onAccept,
  onDecline,
}: {
  call: DirectCall | null;
  partner: CallPartner | null;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const name = partner?.display_name || (partner?.handle ? `@${partner.handle}` : 'Someone new');
  return (
    <Modal animationType="fade" onRequestClose={onDecline} transparent visible={Boolean(call)}>
      <View style={styles.scrim}>
        <View style={styles.incomingCard}>
          <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>Incoming audio call</Text></View>
          <Avatar label={name} path={partner?.avatar_path} size={94} />
          <Text style={styles.callerName}>{name}</Text>
          <Text style={styles.callerMeta}>
            {partner?.country_code ?? 'Worldwide'} · {partner?.languages?.slice(0, 2).join(', ') || 'YAPPIE member'}
          </Text>
          <Text style={styles.privateNote}>Private 1:1 audio · your number stays hidden</Text>
          {busy ? <ActivityIndicator color={colors.signal} /> : (
            <View style={styles.answerRow}>
              <Pressable accessibilityLabel="Decline call" onPress={onDecline} style={[styles.answerButton, styles.declineButton]}>
                <Text style={styles.answerGlyph}>×</Text><Text style={styles.answerLabel}>Decline</Text>
              </Pressable>
              <Pressable accessibilityLabel="Accept call" onPress={onAccept} style={[styles.answerButton, styles.acceptButton]}>
                <Text style={[styles.answerGlyph, styles.acceptGlyph]}>⌕</Text><Text style={[styles.answerLabel, styles.acceptLabel]}>Answer</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export function CallProvider({ children }: PropsWithChildren) {
  const { user } = useSession();
  const [desiredAvailability, setDesiredAvailability] = useState(false);
  const [isAvailable, setIsAvailableState] = useState(false);
  const [isAvailabilityBusy, setIsAvailabilityBusy] = useState(true);
  const [incomingCall, setIncomingCall] = useState<DirectCall | null>(null);
  const [incomingPartner, setIncomingPartner] = useState<CallPartner | null>(null);
  const [incomingBusy, setIncomingBusy] = useState(false);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppIsActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  const syncAvailability = useCallback(async (available = desiredAvailability) => {
    if (!user) {
      setIsAvailableState(false);
      return;
    }
    const enabled = AppState.currentState === 'active' && available;
    try {
      const result = await setCallAvailability(enabled);
      setIsAvailableState(result);
    } catch {
      setIsAvailableState(false);
    }
  }, [desiredAvailability, user]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(availabilityPreferenceKey).then((stored) => {
      if (!active) return;
      setDesiredAvailability(stored === 'true');
      setIsAvailabilityBusy(false);
    }).catch(() => { if (active) setIsAvailabilityBusy(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (isAvailabilityBusy || !user) return;
    void syncAvailability();
    const heartbeat = setInterval(() => {
      if (AppState.currentState === 'active') void syncAvailability();
    }, 8_000);
    const appStateSubscription = AppState.addEventListener('change', () => void syncAvailability());
    return () => {
      clearInterval(heartbeat);
      appStateSubscription.remove();
      void setCallAvailability(false).catch(() => undefined);
    };
  }, [isAvailabilityBusy, syncAvailability, user]);

  useEffect(() => {
    if (!user || !appIsActive || !desiredAvailability) {
      setIncomingCall(null);
      setIncomingPartner(null);
      return;
    }
    let active = true;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    const present = async (call: DirectCall | null) => {
      if (expiryTimer) clearTimeout(expiryTimer);
      if (!call || call.status !== 'requested') {
        if (active) {
          setIncomingCall(null);
          setIncomingPartner(null);
        }
        return;
      }
      const age = Date.now() - new Date(call.created_at).getTime();
      if (age >= 35_000) {
        void respondDirectCall(call.id, false).catch(() => undefined);
        return;
      }
      const partner = await loadCallPartner(call, user.id).catch(() => null);
      if (!active) return;
      setIncomingCall(call);
      setIncomingPartner(partner);
      expiryTimer = setTimeout(() => {
        void respondDirectCall(call.id, false).catch(() => undefined);
        if (active) {
          setIncomingCall(null);
          setIncomingPartner(null);
        }
      }, Math.max(500, 35_250 - age));
    };
    void loadPendingIncomingCall(user.id).then(present).catch(() => undefined);
    const unsubscribe = subscribeToIncomingCalls(user.id, (call) => void present(call));
    const poll = setInterval(() => { void loadPendingIncomingCall(user.id).then(present).catch(() => undefined); }, 5_000);
    return () => {
      active = false;
      clearInterval(poll);
      if (expiryTimer) clearTimeout(expiryTimer);
      unsubscribe();
    };
  }, [appIsActive, desiredAvailability, user]);

  const setAvailable = async (available: boolean) => {
    setIsAvailabilityBusy(true);
    setDesiredAvailability(available);
    try {
      await AsyncStorage.setItem(availabilityPreferenceKey, String(available));
      const result = await setCallAvailability(available && AppState.currentState === 'active');
      setIsAvailableState(result);
    } catch (error) {
      setDesiredAvailability(!available);
      setIsAvailableState(false);
      Alert.alert('Could not update calls', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsAvailabilityBusy(false);
    }
  };

  const acceptIncoming = async () => {
    if (!incomingCall || incomingBusy) return;
    setIncomingBusy(true);
    try {
      // WebRTC is one of the heaviest native modules in the app. Load it only
      // when a person actually answers a call, not during every app launch.
      const { ensureDirectCallMicrophonePermission } = await import('@/features/calls/audio');
      const microphoneAllowed = await ensureDirectCallMicrophonePermission();
      if (!microphoneAllowed) {
        await respondDirectCall(incomingCall.id, false);
        setIncomingCall(null);
        setIncomingPartner(null);
        return;
      }
      const status = await respondDirectCall(incomingCall.id, true);
      if (status !== 'accepted') throw new Error('This call has already ended.');
      const callId = incomingCall.id;
      setIncomingCall(null);
      setIncomingPartner(null);
      router.push(`/calls/${callId}` as never);
    } catch (error) {
      Alert.alert('Could not answer', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIncomingBusy(false);
    }
  };

  const declineIncoming = async () => {
    if (!incomingCall || incomingBusy) return;
    setIncomingBusy(true);
    try {
      await respondDirectCall(incomingCall.id, false).catch(() => endDirectCall(incomingCall.id, 'Declined'));
      setIncomingCall(null);
      setIncomingPartner(null);
    } catch (error) {
      Alert.alert('Could not decline', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIncomingBusy(false);
    }
  };

  const value = useMemo<CallContextValue>(() => ({
    isAvailable,
    isAvailabilityBusy,
    refreshAvailability: syncAvailability,
    setAvailable,
  }), [isAvailable, isAvailabilityBusy, syncAvailability]);

  return (
    <CallContext.Provider value={value}>
      {children}
      <IncomingCallSheet
        busy={incomingBusy}
        call={incomingCall}
        onAccept={() => void acceptIncoming()}
        onDecline={() => void declineIncoming()}
        partner={incomingPartner}
      />
    </CallContext.Provider>
  );
}

export function useCalls() {
  const value = useContext(CallContext);
  if (!value) throw new Error('useCalls must be used inside CallProvider');
  return value;
}

const styles = StyleSheet.create({
  scrim: { alignItems: 'center', backgroundColor: colors.scrim, flex: 1, justifyContent: 'center', padding: spacing.xl },
  incomingCard: { ...shadows.floating, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: radius.xl, borderWidth: 1, gap: spacing.md, maxWidth: 420, padding: spacing.xl, width: '100%' },
  liveBadge: { alignItems: 'center', backgroundColor: colors.signalSoft, borderRadius: radius.pill, flexDirection: 'row', gap: 8, marginBottom: spacing.sm, paddingHorizontal: 13, paddingVertical: 8 },
  liveDot: { backgroundColor: colors.success, borderRadius: 5, height: 9, width: 9 },
  liveText: { color: colors.success, fontSize: 13, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  callerName: { fontFamily: fonts.display, color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -1, marginTop: spacing.xs },
  callerMeta: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  privateNote: { color: colors.textSubtle, fontSize: 13, marginBottom: spacing.md, textAlign: 'center' },
  answerRow: { flexDirection: 'row', gap: spacing.lg, width: '100%' },
  answerButton: { alignItems: 'center', borderRadius: 8, flex: 1, gap: 4, justifyContent: 'center', minHeight: 76 },
  declineButton: { backgroundColor: colors.dangerSoft, borderColor: colors.border, borderWidth: 1 },
  acceptButton: { backgroundColor: colors.signal },
  answerGlyph: { color: colors.danger, fontSize: 28, fontWeight: '900', lineHeight: 30 },
  acceptGlyph: { color: colors.primaryInk, transform: [{ rotate: '-45deg' }] },
  answerLabel: { color: colors.danger, fontSize: 14, fontWeight: '900' },
  acceptLabel: { color: colors.primaryInk },
});
