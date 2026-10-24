import { Text } from '@/components/Typography';
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, View } from 'react-native';

import { GiftPicker } from '@/components/GiftPicker';
import { Avatar, Card, Heading, Muted, Pill, Screen } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { giftCheckoutEnabled } from '@/features/gifts/api';
import {
  endClubRoom,
  heartbeatClubRoom,
  joinClubRoom,
  leaveClubRoom,
  loadClubRoom,
  loadOwnClubRole,
  loadRoomParticipants,
  moderateRoomParticipant,
  setRoomHandRaised,
  subscribeToRoomState,
  type ClubRoom,
  type RoomParticipant,
} from '@/features/clubs/api';
import { closeRoomAudio, disconnectRoomAudio, revokeRoomAudioPublisher, useClubRoomAudio } from '@/features/clubs/audio';
import { trackEvent } from '@/features/analytics/api';
import { clubAvatarPublicUrl } from '@/features/clubs/avatar';
import { colors, radius, spacing } from '@/theme/tokens';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ClubRoomScreen() {
  const params = useLocalSearchParams<{ roomId: string }>();
  const roomId = first(params.roomId);
  const { user } = useSession();
  const checkoutEnabled = giftCheckoutEnabled();
  const [room, setRoom] = useState<ClubRoom | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState<RoomParticipant | null>(null);
  const [clubRole, setClubRole] = useState<'owner' | 'moderator' | 'member' | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const [hasJoined, setHasJoined] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      const [nextRoom, nextParticipants] = await Promise.all([loadClubRoom(roomId), loadRoomParticipants(roomId)]);
      setRoom(nextRoom);
      setParticipants(nextParticipants);
      if (user) setClubRole(await loadOwnClubRole(nextRoom.club_id, user.id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load this room.');
    } finally {
      setLoading(false);
    }
  }, [roomId, user]);

  useEffect(() => {
    if (!roomId) return;
    let active = true;
    void joinClubRoom(roomId)
      .then(() => {
        if (!active) return;
        setHasJoined(true);
        return refresh();
      })
      .catch((nextError: unknown) => {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : 'Could not join this room.');
          setLoading(false);
        }
      });
    const unsubscribe = subscribeToRoomState(roomId, () => void refresh());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refresh, roomId]);

  const ownParticipant = participants.find((participant) => participant.user_id === user?.id);
  const isHost = ownParticipant?.role === 'host';
  const canModerate = isHost || clubRole === 'owner' || clubRole === 'moderator';
  const raised = Boolean(ownParticipant?.hand_raised_at);
  const stage = participants.filter((participant) => participant.role === 'host' || participant.role === 'speaker');
  const audience = participants.filter((participant) => participant.role === 'listener');
  const audio = useClubRoomAudio(room?.status === 'live' && appIsActive ? roomId : undefined, ownParticipant?.role);
  useEffect(()=>{if(audio.error)trackEvent('audio_failed','clubs');},[audio.error]);
  const giftRecipientName = giftRecipient?.display_name || (giftRecipient?.handle ? `@${giftRecipient.handle}` : 'Speaker');

  useEffect(() => {
    if (!roomId || room?.status !== 'live' || !ownParticipant) return;
    let active = true;
    const heartbeat = () => {
      void heartbeatClubRoom(roomId).catch(() => {
        if (active) void refresh();
      });
    };
    heartbeat();
    const interval = setInterval(heartbeat, 20_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [ownParticipant?.user_id, refresh, room?.status, roomId]);

  useEffect(() => {
    if (!roomId || room?.status !== 'live') return;
    let previousState = AppState.currentState;
    let transition = Promise.resolve();
    const enqueue = (task: () => Promise<unknown>) => {
      transition = transition.then(task, task).then(() => undefined, () => undefined);
    };
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState === 'active' && nextState !== 'active') {
        setAppIsActive(false);
        enqueue(async () => {
          await disconnectRoomAudio(roomId).catch(() => undefined);
          await leaveClubRoom(roomId).catch(() => undefined);
        });
      } else if (previousState !== 'active' && nextState === 'active') {
        enqueue(async () => {
          await joinClubRoom(roomId);
          await refresh();
          setAppIsActive(true);
        });
      }
      previousState = nextState;
    });
    return () => {
      subscription.remove();
      enqueue(async () => {
        await disconnectRoomAudio(roomId).catch(() => undefined);
        await leaveClubRoom(roomId).catch(() => undefined);
      });
    };
  }, [refresh, room?.status, roomId]);

  useEffect(() => {
    if (!roomId || !hasJoined || !appIsActive || room?.status !== 'live' || ownParticipant) return;
    void disconnectRoomAudio(roomId).catch(() => undefined);
    Alert.alert('You left the room', 'A host or moderator removed you from this conversation.', [
      {
        text: 'Back to club',
        onPress: () => router.replace(room?.club_id
          ? { pathname: '/clubs/[clubId]', params: { clubId: room.club_id } }
          : '/(tabs)/clubs'),
      },
    ]);
  }, [appIsActive, hasJoined, ownParticipant, room?.club_id, room?.status, roomId]);

  const audioTitle = room?.status !== 'live'
    ? 'This room has ended'
    : !audio.isConfigured
    ? 'Voice is taking a breather'
    : audio.status === 'connecting'
      ? 'Connecting live audio…'
      : audio.status === 'connected'
        ? 'Live audio connected'
        : 'Live audio unavailable';

  const audioDescription = room?.status !== 'live'
    ? 'The conversation is closed. Head back to the club to see what is happening next.'
    : !audio.isConfigured
    ? 'Audio is temporarily unavailable. You can stay in the room or come back a little later.'
    : audio.status === 'connected'
      ? ownParticipant?.role === 'listener'
        ? 'You are listening to the room.'
        : audio.isMuted
          ? 'You are on stage with your microphone muted.'
          : 'Your microphone is live.'
      : audio.error || 'The room will continue without audio while it reconnects.';

  const leave = async () => {
    if (!roomId) return;
    setBusy(true);
    try {
      if (isHost) {
        await endClubRoom(roomId);
        await closeRoomAudio(roomId);
      }
      else {
        await disconnectRoomAudio(roomId);
        await leaveClubRoom(roomId);
      }
      router.replace(room?.club_id
        ? { pathname: '/clubs/[clubId]', params: { clubId: room.club_id } }
        : '/(tabs)/clubs');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not leave this room.');
      setBusy(false);
    }
  };

  const confirmLeave = () => {
    if (room?.status !== 'live') {
      void leave();
      return;
    }
    Alert.alert(isHost ? 'End this room?' : 'Leave this room?', isHost ? 'Everyone will be disconnected from the room.' : 'You can rejoin while it is live.', [
      { text: 'Cancel', style: 'cancel' },
      { text: isHost ? 'End room' : 'Leave', style: 'destructive', onPress: () => void leave() },
    ]);
  };

  const toggleHand = async () => {
    if (!roomId || busy) return;
    setBusy(true);
    try {
      await setRoomHandRaised(roomId, !raised);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not update your hand raise.');
    } finally {
      setBusy(false);
    }
  };

  const moderate = async (participant: RoomParticipant, action: 'invite_speaker' | 'move_listener' | 'remove') => {
    if (!roomId) return;
    setBusy(true);
    try {
      await moderateRoomParticipant(roomId, participant.user_id, action);
      if (action === 'move_listener' || action === 'remove') {
        await revokeRoomAudioPublisher(roomId, participant.user_id);
      }
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Moderation action failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" onPress={confirmLeave} style={styles.leaveButton}>
          <Text style={styles.leaveGlyph}>‹</Text><Text style={styles.leave}>{room?.status !== 'live' ? 'Back to club' : isHost ? 'End room' : 'Leave room'}</Text>
        </Pressable>
        <Pill label={room?.status === 'live' ? `Live · ${participants.length}` : 'Ended'} tone={room?.status === 'live' ? 'live' : 'default'} />
      </View>
      <View style={styles.roomHeader}>
        <View style={styles.clubIdentity}>
          <Avatar imageUrl={clubAvatarPublicUrl(room?.clubs?.avatar_path)} label={room?.clubs?.name ?? 'Club room'} size={42} />
          <Text style={styles.clubName}>{room?.clubs?.name ?? 'Club room'}</Text>
        </View>
        <Heading compact>{room?.title ?? 'Live conversation'}</Heading>
        <Text style={styles.roomMeta}>{stage.length} on stage · {audience.length} listening</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Card style={styles.audioNotice}>
        <View style={styles.audioTop}>
          <View style={[styles.audioIndicator, audio.isConnected && styles.audioIndicatorConnected]}><Text style={styles.audioWave}>≋</Text></View>
          <View style={styles.audioCopy}><Text style={styles.audioTitle}>{audioTitle}</Text><Muted>{audioDescription}</Muted></View>
        </View>
        {audio.isConnected && (ownParticipant?.role === 'host' || ownParticipant?.role === 'speaker') ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void audio.toggleMute().catch((nextError: unknown) => {
                setError(nextError instanceof Error ? nextError.message : 'Could not change the microphone.');
              });
            }}
            style={[styles.micButton, !audio.isMuted && styles.micButtonLive]}
          >
            <Text style={[styles.micButtonLabel, !audio.isMuted && styles.micButtonLabelLive]}>
              {audio.isMuted ? 'Unmute microphone' : 'Mute microphone'}
            </Text>
          </Pressable>
        ) : null}
      </Card>

      <Text style={styles.section}>On stage</Text>
      <View style={styles.peopleGrid}>
        {stage.map((participant) => {
          const name = participant.display_name || (participant.handle ? `@${participant.handle}` : 'Speaker');
          return (
            <Card key={participant.user_id} style={styles.personCard}>
              <Pressable
                accessibilityLabel={`Open ${name}'s profile`}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: participant.user_id } })}
                style={styles.stageProfile}
              >
                <View style={[styles.stageAvatar, participant.role === 'host' && styles.hostAvatar]}><Avatar label={name} path={participant.avatar_path} size={64} /></View>
                <Text style={styles.personName}>{name}</Text>
              </Pressable>
              <Pill label={participant.role} tone={participant.role === 'host' ? 'accent' : 'default'} />
              {participant.user_id !== user?.id ? (
                <Pressable accessibilityRole="button" onPress={() => setGiftRecipient(participant)} style={styles.giftButton}>
                  <Text style={styles.giftLabel}>{checkoutEnabled ? '✦ Gift' : '✦ Preview'}</Text>
                </Pressable>
              ) : null}
              {canModerate && participant.role === 'speaker' ? (
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void moderate(participant, 'move_listener')}>
                  <Text style={styles.moderateAction}>Move to audience</Text>
                </Pressable>
              ) : null}
            </Card>
          );
        })}
      </View>

      <Text style={styles.section}>Audience</Text>
      {audience.length === 0 ? <Muted>No listeners yet.</Muted> : null}
      <View style={styles.audienceList}>
        {audience.map((participant) => {
          const name = participant.display_name || (participant.handle ? `@${participant.handle}` : 'Listener');
          return (
            <View key={participant.user_id} style={styles.audienceRow}>
              <Pressable
                accessibilityLabel={`Open ${name}'s profile`}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: participant.user_id } })}
                style={styles.audienceProfile}
              >
                <Avatar label={name} path={participant.avatar_path} size={42} />
                <View style={styles.audienceCopy}>
                  <Text style={[styles.personName, { textAlign: 'left' }]}>{name}</Text>
                  {participant.hand_raised_at ? <Text style={styles.hand}>Hand raised</Text> : <Muted>Listening</Muted>}
                </View>
              </Pressable>
              {canModerate && participant.hand_raised_at ? (
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void moderate(participant, 'invite_speaker')} style={styles.inviteButton}>
                  <Text style={styles.inviteLabel}>Invite</Text>
                </Pressable>
              ) : null}
              {canModerate ? (
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void moderate(participant, 'remove')} style={styles.removeButton}>
                  <Text style={styles.removeLabel}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      {ownParticipant?.role === 'listener' && room?.status === 'live' ? (
        <Pressable accessibilityRole="button" accessibilityState={{ selected: raised, disabled: busy }} disabled={busy} onPress={() => void toggleHand()} style={[styles.handButton, raised && styles.handButtonRaised]}>
          <Text style={[styles.handButtonLabel, raised && styles.handButtonLabelRaised]}>{raised ? 'Lower hand' : 'Raise hand'}</Text>
        </Pressable>
      ) : null}
      {giftRecipient && roomId ? (
        <GiftPicker
          contextId={roomId}
          contextKind="club_room"
          onClose={() => setGiftRecipient(null)}
          recipientId={giftRecipient.user_id}
          recipientName={giftRecipientName}
          visible
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 120 },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  leaveButton: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 7 },
  leaveGlyph: { color: colors.textMuted, fontSize: 20, fontWeight: '400', lineHeight: 20 },
  leave: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
  roomHeader: { gap: spacing.sm, marginTop: spacing.xl },
  clubIdentity: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  clubName: { color: colors.link, fontSize: 13, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
  roomMeta: { color: colors.textSubtle, fontSize: 12, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md, textAlign: 'center' },
  audioNotice: { backgroundColor: colors.surfaceSoft, gap: spacing.md, marginTop: spacing.xl },
  audioTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  audioIndicator: { alignItems: 'center', backgroundColor: colors.warningSoft, borderRadius: radius.md, height: 46, justifyContent: 'center', width: 46 },
  audioIndicatorConnected: { backgroundColor: colors.successSoft },
  audioWave: { color: colors.text, fontSize: 24, fontWeight: '900', transform: [{ rotate: '90deg' }] },
  audioCopy: { flex: 1, gap: 2 },
  audioTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  micButton: { alignItems: 'center', backgroundColor: colors.cobaltSoft, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm, padding: spacing.md },
  micButtonLive: { backgroundColor: colors.accentSoft, borderColor: colors.border },
  micButtonLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  micButtonLabelLive: { color: colors.accent },
  section: { color: colors.text, fontSize: 17, fontWeight: '900', letterSpacing: -0.35, marginBottom: spacing.md, marginTop: spacing.xl },
  peopleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  personCard: { alignItems: 'center', backgroundColor: colors.surfaceSoft, gap: spacing.sm, paddingVertical: spacing.xl, width: '47%' },
  stageAvatar: { backgroundColor: colors.surfaceRaised, borderRadius: 46, padding: 5 },
  stageProfile: { alignItems: 'center', gap: spacing.sm },
  hostAvatar: { backgroundColor: colors.primarySoft },
  personName: { color: colors.text, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  giftButton: { backgroundColor: colors.warningSoft, borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 7 },
  giftLabel: { color: colors.warning, fontSize: 13, fontWeight: '900' },
  moderateAction: { color: colors.warning, fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
  audienceList: { gap: spacing.sm },
  audienceRow: { alignItems: 'center', backgroundColor: colors.surfaceSoft, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  audienceCopy: { flex: 1 },
  audienceProfile: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md },
  hand: { color: colors.warning, fontSize: 13, fontWeight: '800' },
  inviteButton: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  inviteLabel: { color: colors.primaryInk, fontSize: 14, fontWeight: '800' },
  removeButton: { paddingHorizontal: spacing.sm, paddingVertical: 8 },
  removeLabel: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  handButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.lg, elevation: 5, marginTop: spacing.xl, padding: spacing.lg },
  handButtonRaised: { backgroundColor: colors.signalSoft, borderColor: colors.border, borderWidth: 1 },
  handButtonLabel: { color: colors.primaryInk, fontSize: 15, fontWeight: '800' },
  handButtonLabelRaised: { color: colors.text },
});
