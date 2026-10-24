import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { Text, TextInput } from '@/components/Typography';
import { useCallback, useRef, useState } from 'react';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, PixelRule, RetroGlyph, RetroHeader, Screen } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { createReply, loadPost, loadPostReplies, subscribeToPost, type FeedPost, type FeedReply } from '@/features/feed/api';
import { colors, fonts, spacing } from '@/theme/tokens';
import { ContentMenu } from '@/components/ContentMenu';
import { useDraft } from '@/lib/use-draft';
import { trackEvent } from '@/features/analytics/api';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId: string; body?: string; author?: string; authorId?: string }>();
  const postId = first(params.postId);
  const [post, setPost] = useState<FeedPost | null>(null);
  const body = post?.body ?? '';
  const author = post?.author_display_name ?? post?.author_handle ?? 'Community member';
  const authorId = post?.author_id;
  const { profile, user, isLoading } = useSession();
  const [replies, setReplies] = useState<FeedReply[]>([]);
  const [draft, setDraft] = useDraft(user?.id, `reply:${postId}`);
  const [replyTarget, setReplyTarget] = useState<FeedReply | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const authorAvatarPath = post?.author_avatar_path;
  const request = useRef(0);

  const refresh = useCallback(async () => {
    if (!postId) return;
    const generation = ++request.current;
    try {
      const [nextReplies, nextPost] = await Promise.all([
        loadPostReplies(postId),
        loadPost(postId),
      ]);
      if (generation !== request.current) return;
      setReplies(nextReplies);
      setPost(nextPost);
      setError('');
    } catch (nextError) {
      if (generation !== request.current) return;
      setError(nextError instanceof Error ? nextError.message : 'Could not load replies.');
    } finally {
      if (generation === request.current) setLoading(false);
    }
  }, [postId]);

  useFocusEffect(useCallback(() => {
    if (!user || !postId) return;
    setPost(null);
    setReplies([]);
    setLoading(true);
    void refresh();
    const unsubscribe = subscribeToPost(postId, () => void refresh());
    return () => { ++request.current; unsubscribe(); };
  }, [refresh, user?.id, postId]));

  if (!isLoading && !user) return <Redirect href={{ pathname: '/auth', params: { returnTo: `/post/${postId}` } }} />;
  if (!loading && !post) return <Screen><RetroHeader title="Conversation" eyebrow="DISCOVER" /><Text style={{ color: colors.text }}>{error || 'This post is no longer available.'}</Text><Pressable onPress={() => void refresh()} style={{ padding: 16 }}><Text style={{ color: colors.accent }}>Try again</Text></Pressable><Pressable onPress={() => router.replace('/(tabs)/feed')} style={{ padding: 16 }}><Text style={{ color: colors.accent }}>Back to Discover</Text></Pressable></Screen>;

  const reply = async () => {
    if (!postId || !user || !draft.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await createReply(postId, user.id, draft, replyTarget?.reply_id ?? null);
      trackEvent('reply_sent','post');
      setDraft('');
      setReplyTarget(null);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not publish this reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const composer = (targetName: string, inline = false) => (
    <View style={styles.composerWrap}>
      {inline ? <View style={styles.replyingBar}><Text style={styles.replyingText}>Replying to {targetName}</Text><Pressable accessibilityRole="button" accessibilityLabel="Cancel reply to comment" disabled={submitting} onPress={() => setReplyTarget(null)} style={styles.cancelReply}><Text style={styles.replyingText}>×</Text></Pressable></View> : null}
      <View style={styles.composer}>
        <Avatar label={profile?.displayName || 'You'} path={profile?.avatarPath} size={32} />
        <TextInput accessibilityLabel={inline ? `Reply to ${targetName}'s comment` : 'Reply'} autoFocus={inline} editable={!submitting} maxLength={500} multiline onChangeText={setDraft} placeholder={`Reply to ${targetName}`} placeholderTextColor={colors.textMuted} style={styles.input} value={draft} />
        <Pressable accessibilityLabel="Send reply" accessibilityRole="button" accessibilityState={{disabled: !draft.trim() || submitting}} disabled={!draft.trim() || submitting} onPress={() => void reply()} style={[styles.sendButton, (!draft.trim() || submitting) && styles.sendButtonDisabled]}>
          {submitting ? <ActivityIndicator color={colors.primaryInk} size="small" /> : <Text style={styles.sendGlyph}>↑</Text>}
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen>
      <RetroHeader
        action={<View style={styles.replyBadge}><Text style={styles.replyBadgeText}>{String(replies.length).padStart(2, '0')} REPLIES</Text></View>}
        eyebrow="PUBLIC THREAD"
        glyph="▤"
        title="Conversation"
        tone="cobalt"
      />
      <Pressable accessibilityLabel="Back to feed" accessibilityRole="button" onPress={() => router.back()} style={styles.backStrip}>
        <RetroGlyph glyph="‹" size="sm" tone="neutral" /><Text style={styles.backLabel}>BACK TO DISCOVER</Text><View style={styles.backPixels}><View style={styles.backPixel} /><View style={styles.backPixel} /></View>
      </Pressable>

      <View style={styles.postCard}><PaperSurface variant="note" color={colors.cobaltSoft} ink={colors.borderStrong} /><InkDrawing motif="eye" size={60} color={colors.cobalt} />
        <Text style={styles.originalLabel}>ORIGINAL YAP / 01</Text>
        <Pressable
          accessibilityLabel={`Open ${author}'s profile`}
          accessibilityRole="button"
          disabled={!authorId}
          onPress={() => authorId && router.push({ pathname: '/people/[userId]', params: { userId: authorId } })}
          style={styles.authorRow}
        >
          <Avatar label={author} path={authorAvatarPath} size={42} />
          <Text style={styles.author}>{author}</Text>
        </Pressable>
        <Text style={styles.body}>{body}</Text>
        {post ? <ContentMenu id={post.post_id} authorId={post.author_id} onChanged={() => void refresh()} /> : null}
        <View style={styles.threadStem} />
      </View>

      {!replyTarget ? composer(author) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      <PixelRule label={replies.length ? `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'replies'} />
      {!loading && replies.length === 0 ? <View style={styles.empty}><RetroGlyph glyph="⌁" tone="neutral" /><View><Text style={styles.emptyTitle}>NO REPLIES YET</Text><Text style={styles.emptyText}>Be the first reply.</Text></View></View> : null}
      <View style={styles.replies}>
        {replies.map((item, index) => {
          const name = item.author_display_name || (item.author_handle ? `@${item.author_handle}` : 'Community member');
          return (
            <View key={item.reply_id}><View style={styles.replyCard}><PaperSurface variant="note" />
              <Text style={styles.replySerial}>R/{String(index + 1).padStart(2, '0')}</Text>
              <Pressable
                accessibilityLabel={`Open ${name}'s profile`}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: item.author_id } })}
              >
                <Avatar label={name} path={item.author_avatar_path} size={38} />
              </Pressable>
              <View style={styles.replyCopy}>
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: item.author_id } })}>
                  <Text style={styles.author}>{name}</Text>
                </Pressable>
                {item.parent_reply_id ? <View style={styles.parentQuote}><Text style={styles.replyingText}>↳ {item.parent_author_name ? `Reply to ${item.parent_author_name}` : 'Reply to a comment'}</Text><Text numberOfLines={2} style={styles.quoteText}>{item.parent_body_preview ?? 'Comment no longer available'}</Text></View> : null}
                <Text style={styles.replyBody}>{item.body}</Text>
                <ContentMenu kind="reply" id={item.reply_id} authorId={item.author_id} onChanged={() => void refresh()} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${name}'s comment`} disabled={submitting} onPress={() => { setError(''); setReplyTarget(item); }} style={styles.replyAction}><InkDrawing motif="arrow" size={20} color={colors.accent} /><Text style={styles.replyActionText}>Reply</Text></Pressable>
              </View>
            </View>
            {replyTarget?.reply_id === item.reply_id ? composer(name, true) : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  composerWrap: { marginTop: 12 },
  replyingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12 },
  replyingText: { color: colors.cobalt, fontSize: 12 },
  cancelReply: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  replyAction: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  replyActionText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  parentQuote: { borderLeftWidth: 2, borderLeftColor: colors.cobalt, paddingLeft: 10, gap: 4 },
  quoteText: { color: colors.textSubtle, fontSize: 12, lineHeight: 17 },
  replyBadge: { backgroundColor: colors.cobaltSoft, borderColor: colors.border, borderRadius: 7, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 },
  replyBadgeText: { color: colors.cobalt, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  backStrip: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  backLabel: { color: colors.textSubtle, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  backPixels: { flexDirection: 'row', gap: 3, marginLeft: 'auto' },
  backPixel: { backgroundColor: colors.accent, height: 4, width: 4 },
  postCard: { gap: 18, marginTop: 20, padding: 28, position: 'relative' },
  originalLabel: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, position: 'absolute', right: 8, top: 7 },
  authorRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  author: { color: colors.text, fontSize: 14, fontWeight: '800' },
  body: { color: colors.text, fontFamily: fonts.editorial, fontSize: 30, lineHeight: 37 },
  threadStem: { backgroundColor: colors.borderStrong, bottom: -34, height: 34, left: 39, position: 'absolute', width: 2 },
  composer: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, minHeight: 66, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.text, flex: 1, fontSize: 14.5, maxHeight: 86, minHeight: 42, paddingHorizontal: spacing.md, paddingVertical: 10, textAlignVertical: 'center' },
  sendButton: { alignItems: 'center', backgroundColor: colors.accent, borderColor: colors.primary, borderRadius: 7, borderWidth: 2, height: 40, justifyContent: 'center', width: 40 },
  sendButtonDisabled: { opacity: 0.35 },
  sendGlyph: { color: colors.primaryInk, fontSize: 22, fontWeight: '700', lineHeight: 24 },
  error: { color: colors.danger, fontSize: 13, marginVertical: spacing.md, textAlign: 'center' },
  loading: { marginVertical: spacing.xl },
  empty: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.border, borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  emptyText: { color: colors.textSubtle, fontSize: 13, marginTop: 3 },
  replies: { gap: spacing.sm },
  replyCard: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, padding: 20, position: 'relative', marginTop: 12 },
  replySerial: { color: colors.borderStrong, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, position: 'absolute', right: 6, top: 5 },
  replyCopy: { flex: 1, gap: spacing.sm },
  replyBody: { color: colors.text, fontSize: 15, lineHeight: 21 },
});
