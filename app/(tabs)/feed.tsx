import { InkDrawing } from '@/components/InkArtwork';
import { Text, TextInput } from '@/components/Typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Animated, AppState, PanResponder, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Avatar, EmptyState, Screen, SkeletonRows } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { useActivity } from '@/context/ActivityContext';
import { ActivityButton } from '@/components/ActivityButton';
import { ContentMenu } from '@/components/ContentMenu';
import * as Linking from 'expo-linking';
import { useDraft } from '@/lib/use-draft';
import { trackEvent } from '@/features/analytics/api';
import { acknowledgeFeed, loadEngagementSummary } from '@/features/activity/api';
import { createPost, loadDiscoverFeed, loadFollowingFeed, setPostLiked, type FeedPost } from '@/features/feed/api';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

type FeedMode = 'global' | 'following';


function relativeTime(value: string) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function FeedScreen() {
  const { profile, user } = useSession();
  const { summary, refresh: refreshBadges } = useActivity();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [body, setBody] = useDraft(user?.id, 'feed');
  const [composerOpen, setComposerOpen] = useState(false);
  const [feedMode, setFeedMode] = useState<FeedMode>('global');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const likesInFlight = useRef(new Set<string>());
  const refreshGeneration = useRef(0);
  const discoverySnapshot = useRef('');
  const scrollView = useRef<ScrollView>(null);
  const atTop = useRef(true);
  const isFocused = useRef(false);
  const pendingAcknowledgement = useRef<{mode:FeedMode;through:string;generation:number}|null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const feedSlideX = useRef(new Animated.Value(0)).current;
  const feedIsSwitching = useRef(false);

  const switchFeedMode = useCallback((nextMode: FeedMode) => {
    if (nextMode === feedMode || feedIsSwitching.current) return;
    feedIsSwitching.current = true;
    const exitDirection = nextMode === 'following' ? -1 : 1;
    Animated.timing(feedSlideX, {
      duration: 120,
      toValue: exitDirection * 48,
      useNativeDriver: true,
    }).start(() => {
      setLoading(true);
      setPosts([]);
      setFeedMode(nextMode);
      feedSlideX.setValue(exitDirection * -48);
      Animated.spring(feedSlideX, {
        damping: 18,
        mass: 0.7,
        stiffness: 210,
        toValue: 0,
        useNativeDriver: true,
      }).start(() => {
        feedIsSwitching.current = false;
      });
    });
  }, [feedMode, feedSlideX]);

  const feedSwipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
    ),
    onPanResponderGrant: () => feedSlideX.stopAnimation(),
    onPanResponderMove: (_, gesture) => {
      const swipingPastStart = feedMode === 'global' && gesture.dx > 0;
      const swipingPastEnd = feedMode === 'following' && gesture.dx < 0;
      const resistance = swipingPastStart || swipingPastEnd ? 0.16 : 1;
      feedSlideX.setValue(Math.max(-96, Math.min(96, gesture.dx * resistance)));
    },
    onPanResponderRelease: (_, gesture) => {
      const committed = Math.abs(gesture.dx) >= 58 || Math.abs(gesture.vx) >= 0.55;
      const nextMode: FeedMode = gesture.dx < 0 ? 'following' : 'global';
      if (committed && nextMode !== feedMode) {
        switchFeedMode(nextMode);
        return;
      }
      Animated.spring(feedSlideX, {
        damping: 18,
        mass: 0.7,
        stiffness: 220,
        toValue: 0,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(feedSlideX, {
        damping: 18,
        mass: 0.7,
        stiffness: 220,
        toValue: 0,
        useNativeDriver: true,
      }).start();
    },
  }), [feedMode, feedSlideX, switchFeedMode]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppIsActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  const refresh = useCallback(async (showRefreshIndicator = false) => {
    const generation = ++refreshGeneration.current;
    setLoadingMore(false);
    if (showRefreshIndicator) setRefreshing(true);
    setError('');
    try {
      const snapshot = await loadEngagementSummary();
      const nextPosts = await (feedMode === 'following' ? loadFollowingFeed() : loadDiscoverFeed(snapshot.checked_at));
      if (generation !== refreshGeneration.current) return;
      scrollView.current?.scrollTo({y:0,animated:false});
      atTop.current=true;
      pendingAcknowledgement.current={mode:feedMode,through:snapshot.checked_at,generation};
      setPosts(nextPosts);
      discoverySnapshot.current = snapshot.checked_at;
      setHasMore(nextPosts.length === 30);
    } catch (nextError) {
      if (generation !== refreshGeneration.current) return;
      setError(nextError instanceof Error ? nextError.message : 'Could not load the feed.');
    } finally {
      if (generation === refreshGeneration.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [feedMode, refreshBadges]);

  useEffect(()=>{
    const pending=pendingAcknowledgement.current;
    if(!pending || !isFocused.current || !appIsActive || !atTop.current || pending.generation!==refreshGeneration.current)return;
    pendingAcknowledgement.current=null;
    void acknowledgeFeed(pending.mode,pending.through).then(refreshBadges).catch(()=>{});
  },[posts,appIsActive,refreshBadges]);

  useFocusEffect(useCallback(() => {
    isFocused.current=true;
    if (appIsActive && atTop.current) void refresh();
    return () => { isFocused.current=false; ++refreshGeneration.current; };
  }, [appIsActive, refresh]));

  const publish = async () => {
    if (!user || !body.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await createPost(user.id, body);
      trackEvent('post_published','feed');
      setBody('');
      setComposerOpen(false);
      if (feedMode !== 'global') setFeedMode('global');
      else await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not publish this post.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLike = async (post: FeedPost) => {
    if (!user || likesInFlight.current.has(post.post_id)) return;
    likesInFlight.current.add(post.post_id);
    const nextLiked = !post.liked_by_me;
    setPosts((current) => current.map((item) => item.post_id === post.post_id
      ? { ...item, liked_by_me: nextLiked, like_count: item.like_count + (nextLiked ? 1 : -1) }
      : item));
    try {
      await setPostLiked(post.post_id, user.id, nextLiked);
    } catch (nextError) {
      setPosts((current) => current.map((item) => item.post_id === post.post_id ? post : item));
      setError(nextError instanceof Error ? nextError.message : 'Could not update this like.');
    } finally {
      likesInFlight.current.delete(post.post_id);
    }
  };

  const loadMore = async () => {
    const oldestPost = posts.at(-1);
    if (!oldestPost || !hasMore || loadingMore) return;
    setLoadingMore(true);
    const generation = refreshGeneration.current;
    setError('');
    try {
      const olderPosts = await (feedMode === 'following' ? loadFollowingFeed(oldestPost.created_at) : loadDiscoverFeed(discoverySnapshot.current, oldestPost));
      if (generation !== refreshGeneration.current) return;
      setPosts((current) => {
        const existingIds = new Set(current.map((item) => item.post_id));
        return [...current, ...olderPosts.filter((item) => !existingIds.has(item.post_id))];
      });
      setHasMore(olderPosts.length === 30);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load older posts.');
    } finally {
      if (generation === refreshGeneration.current) setLoadingMore(false);
    }
  };

  const sharePost = async (post: FeedPost, authorName: string) => {
    try {
      await Share.share({ message: `${post.body}\n\n— ${authorName} on YAPPIE\n${Linking.createURL(`/post/${post.post_id}`)}` });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not open the share menu.');
    }
  };

  const openPost = (post: FeedPost, authorName: string) => router.push({
    pathname: '/post/[postId]',
    params: { postId: post.post_id, body: post.body, author: authorName, authorId: post.author_id },
  });

  return (
    <Screen scrollViewRef={scrollView} onScroll={event=>{atTop.current=event.nativeEvent.contentOffset.y<24;}} contentStyle={{paddingTop:0}} refreshControl={<RefreshControl colors={[colors.accent]} onRefresh={() => void refresh(true)} progressBackgroundColor={colors.surfaceRaised} refreshing={refreshing} tintColor={colors.accent} />}>
<View style={styles.compactHeader}><View style={{flexDirection:"row",alignItems:"center",gap:10}}><InkDrawing motif="eye" size={36} /><Text style={styles.compactTitle}>DISCOVER</Text></View><View style={{ flexDirection: 'row', alignItems: 'center' }}><ActivityButton compact /><Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.push('/(tabs)/profile')}><Avatar label={profile?.displayName || 'You'} path={profile?.avatarPath} size={34} /></Pressable></View></View>
      <View style={styles.topBar}>
        <View style={styles.feedModeRow}>
          {(['global', 'following'] as const).map((mode) => (
            <Pressable
              key={mode}
              accessibilityRole="tab"
              accessibilityState={{ selected: feedMode === mode }}
              onPress={() => switchFeedMode(mode)}
              style={[styles.feedModeButton, feedMode === mode && styles.feedModeSelected]}
            >
              <Text style={[styles.feedModeLabel, feedMode === mode && styles.feedModeLabelSelected]}>{mode === 'global' ? 'For you' : 'Following'}{(mode === 'global' ? summary?.global_new : summary?.following_new) ? ' •' : ''}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {(feedMode === 'global' ? summary?.global_new : summary?.following_new) ? <Pressable accessibilityRole="button" accessibilityLabel="Show new posts" onPress={() => void refresh(true)} style={styles.newPostsButton}><Text style={styles.newPostsLabel}>↑  New conversations · Tap to refresh</Text></Pressable> : null}

      <Animated.View
        {...feedSwipeResponder.panHandlers}
        accessibilityLabel={`${feedMode === 'global' ? 'For you' : 'Following'} feed. Swipe horizontally to switch feeds.`}
        style={[styles.feedPane, { transform: [{ translateX: feedSlideX }] }]}
      >
      <View style={[styles.composer, composerOpen && styles.composerOpen]}>
        <Avatar label={profile?.displayName || 'You'} path={profile?.avatarPath} size={32} />
        <View style={styles.composerMain}>
          <TextInput
            accessibilityLabel="New post"
            maxLength={500}
            multiline
            onChangeText={setBody}
            onFocus={() => setComposerOpen(true)}
            placeholder="What’s on your mind?"
            placeholderTextColor={colors.textMuted}
            style={[styles.composeInput, composerOpen && styles.composeInputOpen]}
            value={body}
          />
          {composerOpen ? (
            <View style={styles.publishRow}>
              <Text style={styles.counter}>{body.length}/500</Text>
              <Pressable accessibilityRole="button" disabled={!body.trim() || submitting} onPress={() => void publish()} style={[styles.publishButton, (!body.trim() || submitting) && styles.disabled]}>
                <Text style={styles.publishLabel}>{submitting ? 'Posting…' : 'Post'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <SkeletonRows /> : null}
      {!loading && error && posts.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void refresh(); }} style={styles.retryButton}><Text style={styles.retryLabel}>Try again</Text></Pressable>
      ) : null}
      {!loading && !error && posts.length === 0 ? (
        <EmptyState description={feedMode === 'following' ? 'Follow people from Quick Chat or Clubs to build your timeline.' : 'Break the silence with the first thought.'} glyph="✦" title={feedMode === 'following' ? 'Your people will show up here' : 'Nothing here yet'} />
      ) : null}

      <View style={styles.timeline}>
        {posts.map((post) => {
          const authorName = post.author_display_name || (post.author_handle ? `@${post.author_handle}` : 'Community member');
          return (
            <View key={post.post_id} style={styles.post}>
              <Pressable accessibilityRole="button" accessibilityLabel={`View ${authorName}’s profile`} onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: post.author_id } })}>
                <Avatar label={authorName} path={post.author_avatar_path} size={36} />
              </Pressable>
              <View style={styles.postMain}>
                <Pressable accessibilityLabel={`Open post and ${post.reply_count} replies`} accessibilityRole="button" onPress={() => openPost(post, authorName)} style={styles.postTapArea}>
                  <View style={styles.authorLine}>
                    <Text numberOfLines={1} style={styles.name}>{authorName}</Text>
                    <Text numberOfLines={1} style={styles.meta}>{relativeTime(post.created_at)}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.handle}>@{post.author_handle ?? 'member'}</Text>
                  <Text style={styles.postBody}>{post.body}</Text>
                </Pressable>
                <View style={styles.actions}>
                  <ContentMenu id={post.post_id} authorId={post.author_id} onChanged={() => void refresh()} />
                  <Pressable accessibilityRole="button" hitSlop={3} accessibilityState={{ selected: post.liked_by_me }} accessibilityLabel={post.liked_by_me ? 'Unlike post' : 'Like post'} onPress={() => void toggleLike(post)} style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}>
                    <InkDrawing motif="heart" size={25} color={post.liked_by_me ? colors.accent : colors.textMuted} /><Text style={[styles.actionText, post.liked_by_me && styles.actionLiked]}>{post.like_count}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="View replies" hitSlop={3} onPress={() => openPost(post, authorName)} style={styles.actionButton}>
                    <InkDrawing motif="letter" size={26} color={colors.textMuted} /><Text style={styles.actionText}>{post.reply_count}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Share post" hitSlop={3} onPress={() => void sharePost(post, authorName)} style={styles.shareButton}><InkDrawing motif="arrow" size={26} color={colors.textMuted} /></Pressable>
                </View>
              </View>
            </View>
          );
        })}
      </View>
      {posts.length > 0 && hasMore ? (
        <Pressable disabled={loadingMore} onPress={() => void loadMore()} style={styles.loadMoreButton}>
          {loadingMore ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={styles.loadMoreLabel}>Show more</Text>}
        </Pressable>
      ) : null}
      {posts.length > 0 && !hasMore ? <Text style={styles.feedEnd}>You’re all caught up.</Text> : null}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  compactHeader: { flexDirection:'row',justifyContent:'space-between',alignItems:'center',minHeight:58 },
  compactTitle: {fontFamily:fonts.display,fontSize:32,color:colors.text,letterSpacing:0.3},
  handle: { color: colors.textSubtle, fontSize: 11, marginTop: 1 },
  actionPressed: { transform: [{ scale: 0.9 }] },
  newPostsButton: { alignSelf: 'center', backgroundColor: colors.cobaltSoft, borderRadius: 8, marginTop: 10, paddingHorizontal: 18, paddingVertical: 14 },
  newPostsLabel: { color: colors.cobalt, fontSize: 12, fontWeight: '700' },
  feedPane: { width: '100%' },
  topBar: { marginBottom: 0, marginTop: 0 },
  feedModeRow: { flexDirection: 'row', gap: 6 },
  feedModeButton: { flex: 1, paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth:2, borderBottomColor:'transparent' },
  feedModeSelected: { borderBottomColor: colors.accent },
  feedModeLabel: { color: colors.textSubtle, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  feedModeLabelSelected: { color: colors.accent },
  composer: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 10 },
  composerOpen: { paddingBottom: spacing.lg },
  composerMain: { flex: 1, gap: spacing.md },
  composeInput: { color: colors.text, fontFamily: fonts.italic, fontSize: 23, lineHeight: 28, minHeight: 34, paddingHorizontal: 0, paddingTop: 2, textAlignVertical:'top' },
  composeInputOpen: { minHeight: 74 },
  publishRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  counter: { color: colors.textSubtle, fontSize: 12 },
  publishButton: { backgroundColor: colors.primary, borderRadius: 4, paddingHorizontal: 24, paddingVertical: 12 },
  publishLabel: { color: colors.primaryInk, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  disabled: { opacity: 0.4 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21, marginTop: spacing.md, textAlign: 'center' },
  retryButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primary, borderRadius: radius.md, marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  retryLabel: { color: colors.primaryInk, fontSize: 15, fontWeight: '900' },
  timeline: { gap: 0, marginTop: 0 },
  post: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  postMain: { flex: 1 },
  postTapArea: { borderRadius: 6, minHeight: 42 },
  authorLine: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  name: { color: colors.text, flex: 1, fontFamily: fonts.bold, fontSize: 14 },
  meta: { color: colors.textSubtle, fontSize: 11 },
  postBody: { color: colors.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, marginTop: 6 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 22, marginTop: 1 },
  actionButton: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 38, minWidth: 44 },
  actionText: { color: colors.textSubtle, fontSize: 12, fontWeight: '600' },
  actionLiked: { color: colors.danger },
  shareButton: { alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', minHeight: 38, minWidth: 44 },
  loadMoreButton: { alignItems: 'center', alignSelf: 'center', borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, marginTop: spacing.lg, minWidth: 150, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  loadMoreLabel: { color: colors.text, fontSize: 14, fontWeight: '900' },
  feedEnd: { color: colors.textSubtle, fontSize: 13, marginTop: spacing.lg, textAlign: 'center' },
});
