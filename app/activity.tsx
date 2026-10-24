import { useCallback, useRef, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Avatar, EmptyState, Screen, SkeletonRows } from '@/components/ui';
import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { FeatureHeader, FeatureNotice, InkAction } from '@/components/EngagementUI';
import { useActivity } from '@/context/ActivityContext';
import { useSession } from '@/context/SessionContext';
import { ActivityEvent, loadActivity, markActivityRead } from '@/features/activity/api';
import { colors, fonts } from '@/theme/tokens';

const descriptions: Record<string, string> = { follow: 'followed you', post_like: 'liked your post', post_reply: 'replied to a conversation', gift: 'sent you a gift' };

export default function ActivityScreen() {
  const { user, isLoading } = useSession();
  const { refresh: refreshBadges } = useActivity();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const generation=useRef(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    ++generation.current;
    setEvents([]);setError('');setBusy(false);
    setLoading(true);
    void loadActivity().then(data => { if (active) { setEvents(data); setHasMore(data.length === 30); setError(''); } })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; ++generation.current; };
  }, [user?.id]));
  if (!isLoading && !user) return <Redirect href="/auth" />;

  const reload = async (more = false) => {
    if (busy) return;
    const request=generation.current;
    setBusy(true);
    try {
      const data = await loadActivity(more ? events.at(-1)?.created_at : undefined);
      if(request!==generation.current)return;
      setEvents(old => more ? [...old, ...data.filter(e => !old.some(o => o.activity_id === e.activity_id))] : data);
      setHasMore(data.length === 30);
      setError('');
      await refreshBadges();
    } catch (e) { if(request===generation.current)setError(e instanceof Error ? e.message : 'Could not load activity.'); }
    finally { if(request===generation.current)setBusy(false); }
  };
  const open = async (event: ActivityEvent) => {
    const request=generation.current;
    try {
      await markActivityRead(event.activity_id);
      if(request!==generation.current)return;
      setEvents(old => old.map(e => e.activity_id === event.activity_id ? { ...e, read_at: new Date().toISOString() } : e));
      void refreshBadges();
      if (event.post_id) router.push({ pathname: '/post/[postId]', params: { postId: event.post_id } });
      else router.push({ pathname: '/people/[userId]', params: { userId: event.actor_id } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open activity.'); }
  };
  const markVisibleRead = async () => {
    if (busy) return;
    const request=generation.current;
    const ids=new Set(events.filter(e=>!e.read_at).map(e=>e.activity_id));
    setBusy(true);
    try {
      // Only acknowledge loaded events; never clear events arriving during this request.
      await Promise.all([...ids].map(id=>markActivityRead(id)));
      if(request===generation.current)setEvents(old=>old.map(e=>ids.has(e.activity_id)?{...e,read_at:e.read_at??new Date().toISOString()}:e));
    } catch (e) { if(request===generation.current)setError(e instanceof Error ? e.message : 'Could not mark activity read.'); }
    finally { if(request===generation.current)setBusy(false); await refreshBadges(); }
  };
  return <Screen refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void reload()} tintColor={colors.accent} />}>
    <FeatureHeader title="Activity" motif="bell" />
    <View style={styles.listHeading}><Pressable disabled={busy || !events.some(e => !e.read_at)} accessibilityRole="button" accessibilityLabel="Mark shown activity read" onPress={() => void markVisibleRead()} style={styles.readAction}><Text style={styles.readLabel}>{busy ? 'One moment…' : 'Mark as read ✓'}</Text></Pressable></View>
    {loading ? <SkeletonRows /> : null}
    {error ? <FeatureNotice error>{error}</FeatureNotice> : null}
    {!loading && !error && !events.length ? <EmptyState title="You're caught up" description="Replies, likes, follows, and gifts will appear here." glyph="✓" /> : null}
    {events.map(event => <Pressable key={event.activity_id} accessibilityRole="button" accessibilityLabel={`${event.actor_display_name ?? event.actor_handle ?? 'Someone'} ${descriptions[event.kind] ?? 'interacted with you'}${event.read_at ? '' : ', unread'}`} onPress={() => void open(event)} style={({ pressed }) => [styles.event, pressed && { opacity: 0.7 }]}>
      <View style={styles.eventTop}><Avatar label={event.actor_display_name ?? event.actor_handle ?? 'Someone'} size={42} /><View style={styles.eventCopy}><Text style={styles.actor}>{event.actor_display_name ?? event.actor_handle ?? 'Someone'}</Text><Text style={styles.description}>{descriptions[event.kind] ?? 'interacted with you'}</Text></View><InkDrawing motif={event.kind === 'post_like' ? 'heart' : event.kind === 'gift' ? 'gift' : event.kind === 'follow' ? 'spark' : 'letter'} size={30} color={event.read_at ? colors.textSubtle : colors.accent} /></View>
      {event.post_body ? <View style={styles.quote}><PaperSurface variant="letter" color={event.read_at ? colors.surfaceSoft : colors.accentSoft} ink={colors.border} /><Text numberOfLines={3} style={styles.quoteText}>{event.post_body}</Text></View> : null}
      <View style={styles.eventMeta}><Text style={styles.date}>{new Date(event.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {new Date(event.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>{!event.read_at ? <View style={styles.newLabel}><View style={styles.dot} /><Text style={styles.newText}>UNREAD</Text></View> : null}</View>
    </Pressable>)}
    {hasMore ? <InkAction disabled={busy} onPress={() => void reload(true)} label="More activity" /> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  kicker: { color: colors.textSubtle, fontSize: 10, letterSpacing: 1.3 },
  readAction: { minHeight: 44, justifyContent: 'center' },
  readLabel: { color: colors.accent, fontFamily: fonts.italic, fontSize: 19 },
  event: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  eventTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eventCopy: { flex: 1 },
  actor: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  description: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  quote: { marginTop: 14, padding: 18 },
  quoteText: { color: colors.text, fontFamily: fonts.italic, fontSize: 21, lineHeight: 27 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  date: { color: colors.textSubtle, fontSize: 11 },
  newLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { backgroundColor: colors.accent, height: 5, width: 5, borderRadius: 3 },
  newText: { color: colors.accent, fontSize: 9, letterSpacing: 1 },
});
