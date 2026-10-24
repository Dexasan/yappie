import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { Text, TextInput } from '@/components/Typography';
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { AppState, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Avatar, EmptyState, PrimaryButton, RetroGlyph, RetroHeader, Screen, SkeletonRows } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { listDirectConversations, subscribeToInbox, type DirectConversation } from '@/features/messages/api';
import { colors, fonts, spacing } from '@/theme/tokens';

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function MessagesScreen() {
  const { user } = useSession();
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppIsActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  const refresh = useCallback(async (showIndicator = false) => {
    if (showIndicator) setRefreshing(true);
    setError('');
    try {
      setConversations(await listDirectConversations());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load messages.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  useFocusEffect(useCallback(() => {
    if (!user || !appIsActive) return;
    const unsubscribe = subscribeToInbox(user.id, () => void refresh());
    const presenceRefresh = setInterval(() => void refresh(), 15_000);
    return () => {
      clearInterval(presenceRefresh);
      unsubscribe();
    };
  }, [appIsActive, refresh, user]));

  const totalUnread = conversations.reduce((total, conversation) => total + conversation.unread_count, 0);
  const visibleConversations = conversations.filter((chat) => (!unreadOnly || chat.unread_count > 0) &&
    [chat.partner_display_name, chat.partner_handle, chat.last_message_body].some((value) => value?.toLowerCase().includes(query.trim().toLowerCase())));

  return (
    <Screen refreshControl={<RefreshControl colors={[colors.accent]} tintColor={colors.accent} onRefresh={() => void refresh(true)} progressBackgroundColor={colors.surfaceRaised} refreshing={refreshing} />}>
      <RetroHeader compact
        action={<Pressable accessibilityLabel="Start a new message" accessibilityRole="button" onPress={() => router.push('/messages/new')}><RetroGlyph glyph="＋" tone="accent" /></Pressable>}
        title="Inbox"
        tone="signal"
      />
      <View style={styles.artIntro}><InkDrawing motif="letter" size={36} color={colors.accent} /><View style={{flex:1}}><Text style={styles.artCaption}>For your eyes only.</Text></View></View>
      <View style={styles.searchWrap}><Text style={styles.searchGlyph}>⌕</Text><TextInput accessibilityLabel="Search conversations" autoCapitalize="none" onChangeText={setQuery} placeholder="Find a person or a conversation" placeholderTextColor={colors.textSubtle} style={styles.searchInput} value={query} />{query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear conversation search" onPress={() => setQuery('')} style={styles.clearSearch}><Text style={styles.searchGlyph}>×</Text></Pressable> : null}</View>
      <View style={styles.filters}>{[false, true].map((onlyUnread) => <Pressable key={String(onlyUnread)} accessibilityRole="tab" accessibilityState={{ selected: unreadOnly === onlyUnread }} onPress={() => setUnreadOnly(onlyUnread)} style={[styles.filter, unreadOnly === onlyUnread && styles.filterSelected]}><Text style={[styles.filterText, unreadOnly === onlyUnread && styles.filterTextSelected]}>{onlyUnread ? 'Unread' + (totalUnread ? '  ' + totalUnread : '') : 'All messages'}</Text></Pressable>)}</View>
      {loading ? <SkeletonRows count={4} /> : null}
      {error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void refresh(true)} style={styles.retryButton}><Text style={styles.filterText}>Try again</Text></Pressable></> : null}
      {!loading && !error && conversations.length === 0 ? (
        <EmptyState action={<PrimaryButton label="Match with strangers" onPress={() => router.push('/(tabs)/quick-chat')} />} description="Start a new message or match with someone in Yap." glyph="⌁" title="No messages yet" />
      ) : null}
      {!loading && !error && conversations.length > 0 && visibleConversations.length === 0 ? <EmptyState description={query ? 'Try a different name or a word from your chat.' : 'You’re all caught up. Your conversations are in All messages.'} glyph={query ? '⌕' : '✓'} title={query ? 'No conversations found' : 'A clean slate'} /> : null}
      <View style={styles.list}>
        {visibleConversations.map((chat, index) => {
          const name = chat.partner_display_name || (chat.partner_handle ? `@${chat.partner_handle}` : 'Connection');
          return (
            <Pressable
              key={chat.conversation_id}
              accessibilityRole="button"
              onPress={() => router.push({
                pathname: '/messages/[conversationId]',
                params: { conversationId: chat.conversation_id, partnerId: chat.partner_id, partnerName: name },
              })}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <View style={[styles.chat, {marginLeft: index % 2 ? 8 : 0, marginRight: index % 2 ? 0 : 8}]}><PaperSurface variant="letter" color={chat.unread_count > 0 ? colors.accentSoft : colors.surfaceSoft} ink={chat.unread_count > 0 ? colors.accentSolid : colors.borderStrong} />
                <View><Avatar label={name} path={chat.partner_avatar_path} size={40} />{chat.partner_is_online ? <View accessibilityLabel="Online now" style={styles.presence} /> : null}</View>
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={styles.name}>{name}</Text>
                  <Text numberOfLines={1} style={[styles.preview, chat.unread_count > 0 && styles.unreadPreview]}>{chat.last_message_body ?? 'Start your conversation'}</Text>
                </View>
                <View style={styles.trailing}>
                  <Text style={styles.time}>{relativeTime(chat.last_message_at)}</Text>
                  {chat.unread_count > 0 ? <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{chat.unread_count > 99 ? '99+' : chat.unread_count}</Text></View> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  artIntro: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 0 },
  artCaption: { fontFamily: fonts.italic, color: colors.text, fontSize: 23, lineHeight: 28 },
  searchGlyph: { color: colors.textSubtle, fontSize: 25 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 6 },
  filter: { borderRadius: 40, paddingHorizontal: 20, minHeight: 44, justifyContent: 'center' },
  filterSelected: { backgroundColor: colors.primary, transform: [{rotate:'-3deg'}] },
  filterText: { color: colors.textSubtle, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  filterTextSelected: { color: colors.primaryInk, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  retryButton: { alignSelf: 'center', padding: 16 },
  searchWrap: { alignItems: 'center', borderColor: colors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', gap: 10, marginTop: 2, paddingHorizontal: 2 },
  searchInput: { color: colors.text, flex: 1, fontSize: 13, minHeight: 44 },
  clearSearch: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: 32 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21, marginTop: spacing.lg, textAlign: 'center' },
  list: { gap: 7, marginTop: 12 },
  chat: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 84, paddingHorizontal: 18, paddingVertical: 12 },
  copy: { flex: 1, gap: 3 },
  name: { color: colors.text, fontFamily: fonts.editorial, fontSize: 23, lineHeight: 26 },
  preview: { color: colors.textSubtle, fontSize: 13, lineHeight: 19 },
  unreadPreview: { color: colors.textMuted, fontWeight: '600' },
  presence: { backgroundColor: colors.success, borderColor: colors.surfaceSoft, borderRadius: 5, borderWidth: 2, bottom: 0, height: 11, position: 'absolute', right: 0, width: 11 },
  trailing: { alignItems: 'center', gap: 5 },
  time: { color: colors.textSubtle, fontSize: 11, fontWeight: '500' },
  unreadBadge: { alignItems: 'center', backgroundColor: colors.accentSolid, borderRadius: 12, height: 22, justifyContent: 'center', minWidth: 22, paddingHorizontal: 6 },
  unreadBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
