import { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { EmptyState, Screen, SkeletonRows } from '@/components/ui';
import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { FeatureHeader, FeatureNotice } from '@/components/EngagementUI';
import { useSession } from '@/context/SessionContext';
import { listSavedPosts, setPostPreference } from '@/features/feed/preferences';
import { colors, fonts } from '@/theme/tokens';

export default function SavedScreen() {
  const { user, isLoading } = useSession();
  const [posts, setPosts] = useState<Awaited<ReturnType<typeof listSavedPosts>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setPosts(await listSavedPosts()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load bookmarks.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    let active=true;setPosts([]);setLoading(true);setError('');
    if(user)void listSavedPosts().then(data=>{if(active)setPosts(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  }, [user?.id]));
  if (!isLoading && !user) return <Redirect href="/auth" />;
  return <Screen><FeatureHeader title="Saved posts" motif="bookmark" tone={colors.warning} />
    {loading ? <SkeletonRows /> : null}{error ? <FeatureNotice error>{error}</FeatureNotice> : null}
    {!loading && !posts.length ? <EmptyState title="No saved posts" description="Save posts from their options menu to find them here." glyph="▤" /> : null}
    {posts.map(post => <View key={post.post_id} style={styles.post}><PaperSurface variant="note" color={colors.surfaceSoft} ink={colors.border} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Open saved post: ${post.body}`} onPress={() => router.push({ pathname: '/post/[postId]', params: {postId:post.post_id} })} style={styles.postLink}>
        <View style={styles.postTop}><InkDrawing motif="bookmark" size={28} color={colors.warning} /></View>
        <Text style={styles.body}>{post.body}</Text><Text style={styles.open}>Open post ↗</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove bookmark" onPress={() => void setPostPreference(post.post_id,'saved',false).then(refresh).catch(e => setError(e.message))} style={styles.remove}><Text style={styles.removeText}>Remove bookmark</Text></Pressable>
    </View>)}
  </Screen>;
}
const styles = StyleSheet.create({
  post: { marginVertical: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 },
  postLink: { paddingVertical: 6 },
  postTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  kicker: { color: colors.warning, fontSize: 9, letterSpacing: 1.1 },
  body: { color: colors.text, fontFamily: fonts.editorial, fontSize: 26, lineHeight: 32, marginVertical: 14 },
  open: { color: colors.accent, fontFamily: fonts.italic, fontSize: 18 },
  remove: { minHeight: 44, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 10 },
  removeText: { color: colors.textSubtle, fontSize: 11 },
});
