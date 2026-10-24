import { Text, TextInput } from '@/components/Typography';
import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, EmptyState, Muted, Pill, Screen } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import {
  followProfile,
  loadProfileConnections,
  unfollowProfile,
  type ConnectionMode,
  type ConnectionProfile,
} from '@/features/social/api';
import { colors, radius, spacing } from '@/theme/tokens';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ProfileConnectionsScreen() {
  const params = useLocalSearchParams<{ userId: string; mode?: string; name?: string }>();
  const profileId = first(params.userId);
  const mode: ConnectionMode = first(params.mode) === 'following' ? 'following' : 'followers';
  const ownerName = first(params.name) || 'Profile';
  const { user } = useSession();
  const [connections, setConnections] = useState<ConnectionProfile[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!profileId || !user) {
      setError('This connection list could not be opened.');
      setLoading(false);
      return;
    }
    setError('');
    try {
      setConnections(await loadProfileConnections(profileId, user.id, mode));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load these connections.');
    } finally {
      setLoading(false);
    }
  }, [mode, profileId, user]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const visibleConnections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return connections;
    return connections.filter((profile) =>
      profile.display_name?.toLowerCase().includes(normalized) ||
      profile.handle?.toLowerCase().includes(normalized) ||
      profile.country_code?.toLowerCase().includes(normalized),
    );
  }, [connections, query]);

  const toggleFollow = async (profile: ConnectionProfile) => {
    if (!user || profile.id === user.id || busyId) return;
    const previous = profile.viewer_follows;
    const previousConnections = connections;
    setBusyId(profile.id);
    setError('');
    setConnections((current) => mode === 'following' && profileId === user.id && previous
      ? current.filter((item) => item.id !== profile.id)
      : current.map((item) => item.id === profile.id ? { ...item, viewer_follows: !previous } : item));
    try {
      if (previous) await unfollowProfile(user.id, profile.id);
      else await followProfile(user.id, profile.id);
    } catch (nextError) {
      setConnections(previousConnections);
      setError(nextError instanceof Error ? nextError.message : 'Could not update this follow.');
    } finally {
      setBusyId(null);
    }
  };

  const title = mode === 'followers' ? 'Followers' : 'Following';
  const isOwnList = profileId === user?.id;

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.backButton}><Text style={styles.backGlyph}>‹</Text></Pressable>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.owner}>{ownerName}</Text>
        </View>
        <Pill label={`${connections.length}`} tone="accent" />
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput
          accessibilityLabel={`Search ${title.toLowerCase()}`}
          autoCapitalize="none"
          onChangeText={setQuery}
          placeholder={`Search ${title.toLowerCase()}…`}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          value={query}
        />
        {query ? <Pressable accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setQuery('')}><Text style={styles.clear}>×</Text></Pressable> : null}
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {!loading && error && connections.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void refresh(); }} style={styles.retryButton}><Text style={styles.retryLabel}>Try again</Text></Pressable>
      ) : null}
      {!loading && !error && connections.length === 0 ? (
        <EmptyState
          description={mode === 'followers'
            ? isOwnList ? 'New followers will show up here.' : `New people who follow ${ownerName} will show up here.`
            : isOwnList ? 'People you follow will show up here.' : `People ${ownerName} follows will show up here.`}
          glyph="◎"
          title={mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
        />
      ) : null}
      {!loading && !error && connections.length > 0 && visibleConnections.length === 0 ? (
        <EmptyState description="Try a different name, username, or country." glyph="⌕" title="No matches" />
      ) : null}

      <View style={styles.list}>
        {visibleConnections.map((profile) => {
          const name = profile.display_name || (profile.handle ? `@${profile.handle}` : 'Community member');
          const isSelf = profile.id === user?.id;
          const isBusy = busyId === profile.id;
          return (
            <View key={profile.id} style={styles.personRow}>
              <Pressable
                accessibilityLabel={`Open ${name}'s profile`}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: profile.id } })}
                style={styles.personLink}
              >
                <Avatar label={name} path={profile.avatar_path} size={50} />
                <View style={styles.personCopy}>
                  <Text numberOfLines={1} style={styles.name}>{name}</Text>
                  <Text numberOfLines={1} style={styles.handle}>@{profile.handle ?? 'member'} · {profile.country_code || 'Worldwide'}</Text>
                  <Muted style={styles.bio} >{profile.bio || profile.languages.join(' · ') || 'Open to conversation'}</Muted>
                </View>
              </Pressable>
              {isSelf ? (
                <Pill label="You" />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: profile.viewer_follows, disabled: Boolean(busyId) }}
                  disabled={Boolean(busyId)}
                  onPress={() => void toggleFollow(profile)}
                  style={[styles.followButton, profile.viewer_follows && styles.followingButton, Boolean(busyId) && !isBusy && styles.inactiveButton]}
                >
                  <Text style={[styles.followLabel, profile.viewer_follows && styles.followingLabel]}>{isBusy ? '…' : profile.viewer_follows ? 'Following' : 'Follow'}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  backButton: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
  backGlyph: { color: colors.text, fontSize: 30, fontWeight: '500', lineHeight: 32 },
  titleCopy: { alignItems: 'center', flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: -0.35 },
  owner: { color: colors.textSubtle, fontSize: 13, fontWeight: '700' },
  searchBox: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, minHeight: 50, paddingHorizontal: spacing.md },
  searchGlyph: { color: colors.textMuted, fontSize: 22, fontWeight: '700' },
  searchInput: { color: colors.text, flex: 1, fontSize: 15, minHeight: 48 },
  clear: { color: colors.textMuted, fontSize: 24, lineHeight: 26, paddingHorizontal: spacing.xs },
  loading: { marginTop: spacing.xxl },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md, textAlign: 'center' },
  list: { gap: spacing.sm, marginTop: spacing.xl },
  personRow: { alignItems: 'center', backgroundColor: colors.surfaceSoft, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  personLink: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md },
  personCopy: { flex: 1 },
  name: { color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },
  handle: { color: colors.textSubtle, fontSize: 13, marginTop: 2 },
  bio: { fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  followButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.pill, minHeight: 46, minWidth: 92, paddingHorizontal: spacing.md, paddingVertical: 11 },
  followingButton: { backgroundColor: colors.successSoft, borderColor: colors.border, borderWidth: 1 },
  inactiveButton: { opacity: 0.55 },
  followLabel: { color: colors.primaryInk, fontSize: 14, fontWeight: '900' },
  followingLabel: { color: colors.success },
  retryButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primary, borderRadius: radius.md, marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  retryLabel: { color: colors.primaryInk, fontSize: 13, fontWeight: '900' },
});
