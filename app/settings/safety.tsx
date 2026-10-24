import { InkDrawing } from '@/components/InkArtwork';
import { Text } from '@/components/Typography';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Card, EmptyState, Muted, Pill, Screen, SectionHeader } from '@/components/ui';
import { loadSafetySettings, unblockProfile, updateMessagePermission, type BlockedProfile, type MessagePermission } from '@/features/safety/api';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const permissionChoices: Array<{ description: string; label: string; value: MessagePermission }> = [
  { value: 'everyone', label: 'Everyone', description: 'Any unblocked member can start a conversation.' },
  { value: 'followers', label: 'People who follow me', description: 'Only your followers can start or continue a DM.' },
  { value: 'following', label: 'People I follow', description: 'Only people you chose to follow can message you.' },
];

export default function SafetySettingsScreen() {
  const [permission, setPermission] = useState<MessagePermission>('everyone');
  const [blockedProfiles, setBlockedProfiles] = useState<BlockedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<MessagePermission | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const data = await loadSafetySettings();
      setPermission(data.messagePermission);
      setBlockedProfiles(data.blockedProfiles);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load your safety settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const choosePermission = async (nextPermission: MessagePermission) => {
    if (saving || nextPermission === permission) return;
    const previous = permission;
    setPermission(nextPermission);
    setSaving(nextPermission);
    setError('');
    try {
      setPermission(await updateMessagePermission(nextPermission));
    } catch (nextError) {
      setPermission(previous);
      setError(nextError instanceof Error ? nextError.message : 'Could not update your message permission.');
    } finally {
      setSaving(null);
    }
  };

  const unblock = async (profile: BlockedProfile) => {
    if (unblockingId) return;
    setUnblockingId(profile.user_id);
    setError('');
    try {
      await unblockProfile(profile.user_id);
      setBlockedProfiles((current) => current.filter((item) => item.user_id !== profile.user_id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not unblock this account.');
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.backButton}><Text style={styles.backGlyph}>‹</Text></Pressable>
        <Text style={styles.topTitle}>Safety & privacy</Text>
        <View style={styles.topSpacer} />
      </View>

      <SectionHeader title="Who can message me" />
      <Card style={styles.choiceCard}>
        {permissionChoices.map((choice, index) => {
          const selected = permission === choice.value;
          const busy = saving === choice.value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: Boolean(saving) }}
              disabled={Boolean(saving)}
              onPress={() => void choosePermission(choice.value)}
              style={[styles.choice, index > 0 && styles.choiceBorder]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
              <View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{busy ? 'Saving…' : choice.label}</Text><Muted>{choice.description}</Muted></View>
            </Pressable>
          );
        })}
      </Card>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}

      {!loading ? <SectionHeader action={<Pill label={`${blockedProfiles.length}`} />} title="Blocked accounts" /> : null}
      {!loading && blockedProfiles.length === 0 ? <EmptyState description="Accounts you block will be kept out of your feed, matches, rooms, and inbox." glyph="○" title="Your block list is empty" /> : null}
      <View style={styles.blockList}>
        {blockedProfiles.map((profile) => {
          const name = profile.display_name || (profile.handle ? `@${profile.handle}` : 'Community member');
          const busy = unblockingId === profile.user_id;
          return (
            <View key={profile.user_id} style={styles.blockedRow}>
              <Avatar label={name} path={profile.avatar_path} size={46} />
              <View style={styles.blockedCopy}><Text style={styles.blockedName}>{name}</Text><Muted>@{profile.handle ?? 'member'} · {profile.country_code || 'Worldwide'}</Muted></View>
              <Pressable accessibilityRole="button" disabled={Boolean(unblockingId)} onPress={() => void unblock(profile)} style={[styles.unblockButton, Boolean(unblockingId) && !busy && styles.inactive]}><Text style={styles.unblockLabel}>{busy ? '…' : 'Unblock'}</Text></Pressable>
            </View>
          );
        })}
      </View>

      <Card style={styles.noteCard}>
        <Text style={styles.noteTitle}>Reports stay private</Text>
        <Muted>The person you report is never told who submitted it. Blocking also removes any follow relationship in both directions.</Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  backButton: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
  backGlyph: { color: colors.text, fontSize: 30, fontWeight: '500', lineHeight: 32 },
  topTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  topSpacer: { width: 42 },
  hero: { alignItems: 'flex-start', borderBottomColor: colors.primary, borderBottomWidth: 1.5, gap: 8, marginTop: 24, paddingBottom: 24 },
  heroTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 42, lineHeight: 46, textTransform: 'uppercase' },
  heroCopy: { maxWidth: 340, textAlign: 'left' },
  choiceCard: { backgroundColor: colors.surfaceSoft, paddingVertical: 0 },
  choice: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.lg },
  choiceBorder: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  radio: { alignItems: 'center', borderColor: colors.borderStrong, borderRadius: 11, borderWidth: 2, height: 22, justifyContent: 'center', width: 22 },
  radioSelected: { borderColor: colors.primary },
  radioDot: { backgroundColor: colors.primary, borderRadius: 5, height: 10, width: 10 },
  choiceCopy: { flex: 1, gap: 2 },
  choiceTitle: { color: colors.text, fontFamily: fonts.editorial, fontSize: 23 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md, textAlign: 'center' },
  loading: { marginTop: spacing.xl },
  blockList: { gap: spacing.sm },
  blockedRow: { alignItems: 'center', backgroundColor: colors.surfaceSoft, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  blockedCopy: { flex: 1 },
  blockedName: { color: colors.text, fontSize: 14, fontWeight: '900', marginBottom: 2 },
  unblockButton: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 8 },
  unblockLabel: { color: colors.text, fontSize: 14, fontWeight: '900' },
  inactive: { opacity: 0.5 },
  noteCard: { backgroundColor: colors.cobaltSoft, borderColor: colors.border, gap: spacing.xs, marginTop: spacing.xl },
  noteTitle: { color: colors.text, fontFamily: fonts.italic, fontSize: 27 },
});
