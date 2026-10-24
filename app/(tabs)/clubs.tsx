import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { Text, TextInput } from '@/components/Typography';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState, RetroGlyph, RetroHeader, Screen, SkeletonRows } from '@/components/ui';
import { ClubCover } from '@/components/ClubCover';
import { joinClub, leaveClub, loadClubs, startClubRoom, type ClubSummary } from '@/features/clubs/api';
import { clubAvatarPublicUrl } from '@/features/clubs/avatar';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function ClubsScreen() {
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyClubId, setBusyClubId] = useState<string | null>(null);
  const [hostingClubId, setHostingClubId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [membersOnly, setMembersOnly] = useState(false);
  const [hasMore,setHasMore]=useState(false);
  const [loadingMore,setLoadingMore]=useState(false);
  const generation=useRef(0);

  const refresh = useCallback(async () => {
    const request=++generation.current;
    setError('');
    try {
      const rows=await loadClubs(query,0,membersOnly);
      if(request!==generation.current)return;
      setClubs(rows);setHasMore(rows.length===30);
    } catch (nextError) {
      if(request!==generation.current)return;
      setError(nextError instanceof Error ? nextError.message : 'Could not load clubs.');
    } finally {
      if(request===generation.current)setLoading(false);
    }
  }, [query,membersOnly]);

  useFocusEffect(useCallback(() => { const timer=setTimeout(()=>void refresh(),200);return ()=>{clearTimeout(timer);++generation.current;}; }, [refresh]));
  const loadMore=async()=>{
    if(loadingMore)return;setLoadingMore(true);const request=generation.current;
    try{const rows=await loadClubs(query,clubs.length,membersOnly);if(request!==generation.current)return;setClubs(old=>[...old,...rows.filter(row=>!old.some(c=>c.club_id===row.club_id))]);setHasMore(rows.length===30);}
    catch(e){if(request===generation.current)setError(e instanceof Error?e.message:'Could not load more clubs.');}
    finally{setLoadingMore(false);}
  };

  const toggleMembership = async (club: ClubSummary) => {
    setBusyClubId(club.club_id);
    setError('');
    try {
      if (club.is_member) await leaveClub(club.club_id);
      else await joinClub(club.club_id);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not update this membership.');
    } finally {
      setBusyClubId(null);
    }
  };

  const startRoom = async (club: ClubSummary) => {
    if (!roomTitle.trim()) return;
    setBusyClubId(club.club_id);
    setError('');
    try {
      const roomId = await startClubRoom(club.club_id, roomTitle);
      setHostingClubId(null);
      setRoomTitle('');
      router.push({ pathname: '/clubs/room/[roomId]', params: { roomId } });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not start this room.');
    } finally {
      setBusyClubId(null);
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const searchedClubs = normalizedQuery
    ? clubs.filter((club) => [club.name, club.description, club.topic].some((value) => value.toLowerCase().includes(normalizedQuery)))
    : clubs;
  const visibleClubs = searchedClubs.filter((club) => !membersOnly || club.is_member);
  const liveClubs = visibleClubs.filter((club) => club.live_room_id);
  const hostingClub = clubs.find((club) => club.club_id === hostingClubId) ?? null;

  return (
    <Screen>
      <RetroHeader compact
        action={<Pressable accessibilityLabel="Create a club" accessibilityRole="button" onPress={() => router.push('/clubs/create')} style={styles.createButton}><RetroGlyph glyph="＋" tone="accent" /></Pressable>}
        title="Clubs"
        tone="warning"
      />

      <View style={styles.searchWrap}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput accessibilityLabel="Search clubs" autoCapitalize="none" onChangeText={setQuery} placeholder="Search clubs" placeholderTextColor={colors.textSubtle} style={styles.searchInput} value={query} />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clearButton}><Text style={styles.clearSearch}>×</Text></Pressable> : null}
      </View>
      <View style={styles.filters}>{[false, true].map((onlyMine) => <Pressable key={String(onlyMine)} accessibilityRole="tab" accessibilityState={{ selected: membersOnly === onlyMine }} onPress={() => setMembersOnly(onlyMine)} style={[styles.filter, membersOnly === onlyMine && styles.filterSelected]}><Text style={[styles.filterText, membersOnly === onlyMine && styles.filterTextSelected]}>{onlyMine ? 'My clubs' : 'Explore'}</Text></Pressable>)}</View>

      {loading ? <SkeletonRows /> : null}
      {error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); void refresh(); }} style={styles.retryButton}><Text style={styles.filterText}>Try again</Text></Pressable></> : null}

      {liveClubs.length > 0 ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.liveScroller}>
            <View style={styles.liveRow}>
              {liveClubs.map((club) => (
                <Pressable
                  key={club.club_id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/clubs/room/[roomId]', params: { roomId: club.live_room_id! } })}
                  style={({ pressed }) => [styles.liveCard, pressed && styles.pressed]}
                ><PaperSurface variant="ticket" color={colors.accentSoft} ink={colors.accentSolid} />
                  <View style={styles.liveTop}><View style={styles.liveLabel}><View style={styles.liveDot} /><Text style={styles.liveLabelText}>LIVE</Text></View><Text numberOfLines={1} style={styles.liveClubName}>{club.name}</Text></View>
                  <Text numberOfLines={1} style={styles.roomTitle}>{club.live_room_title}</Text>
                  <View style={styles.listenerRow}><Text style={styles.listenerCopy}>{club.live_listener_count} listening</Text><Text style={styles.enterArrow}>→</Text></View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </>
      ) : null}

      {!loading ? <View style={styles.sectionLine}><View style={styles.sectionLead}><RetroGlyph glyph="✦" size="sm" /><Text style={styles.sectionTitle}>{query ? 'Search results' : membersOnly ? 'My clubs' : 'All clubs'}</Text></View><Text style={styles.sectionCount}>{visibleClubs.length} clubs</Text></View> : null}
      {!loading && !error && visibleClubs.length === 0 ? <EmptyState description={membersOnly ? 'Join a club from the Explore tab.' : 'Try another search or create a club.'} glyph="⌕" title={membersOnly ? 'No clubs joined' : 'No clubs found'} /> : null}

      <View style={styles.clubGrid}>
        {visibleClubs.map((club, index) => (
          <View key={club.club_id} style={styles.clubTile}>
            <View style={[styles.coverShell, { transform: [{ rotate: index % 2 ? '1.5deg' : '-1.5deg' }] }]}>
              <ClubCover height={88} label={club.name} uri={clubAvatarPublicUrl(club.avatar_path)} width={88} />
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/clubs/[clubId]', params: { clubId: club.club_id } })} style={styles.clubLink}>
              <View style={styles.clubHeading}><Text numberOfLines={2} style={styles.clubName}>{club.name}</Text></View>
              <Text numberOfLines={1} style={styles.clubTopic}>{club.topic}</Text>
              <Text style={styles.memberCount}>{club.member_count} {club.member_count === 1 ? 'member' : 'members'}</Text>
            </Pressable>
            <View style={styles.tileActions}>
              {club.is_member && !club.live_room_id ? <Pressable accessibilityRole="button" accessibilityLabel={"Start a room in " + club.name} onPress={() => { setHostingClubId(club.club_id); setRoomTitle(''); }} style={styles.micButton}><InkDrawing motif="sound" size={30} color={colors.cobalt} /></Pressable> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={(club.is_member ? 'Leave ' : 'Join ') + club.name} disabled={Boolean(busyClubId)} onPress={() => void toggleMembership(club)} style={[styles.joinButton, club.is_member && styles.joinedButton]}>
                <Text style={[styles.joinLabel, club.is_member && styles.joinedLabel]}>{busyClubId === club.club_id ? '…' : club.is_member ? 'Joined' : 'Join'}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {hasMore?<Pressable disabled={loadingMore} onPress={()=>void loadMore()} style={{padding:16}}><Text style={{color:colors.accent}}>{loadingMore?'Loading…':'Show more clubs'}</Text></Pressable>:null}
      {hostingClub ? (
        <View style={styles.hostPanel}>
          <View style={styles.hostPanelTop}><View><Text style={styles.hostTitle}>Start a room in {hostingClub.name}</Text><Text style={styles.hostHint}>Enter a room title.</Text></View><Pressable onPress={() => setHostingClubId(null)}><Text style={styles.hostClose}>×</Text></Pressable></View>
          <TextInput autoFocus maxLength={80} onChangeText={setRoomTitle} placeholder="What are you talking about?" placeholderTextColor={colors.textSubtle} style={styles.roomInput} value={roomTitle} />
          <Pressable disabled={!roomTitle.trim() || busyClubId === hostingClub.club_id} onPress={() => void startRoom(hostingClub)} style={[styles.startButton, (!roomTitle.trim() || busyClubId === hostingClub.club_id) && styles.disabled]}>
            <Text style={styles.startLabel}>{busyClubId === hostingClub.club_id ? 'Starting…' : 'Start live room'}</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  clubHeading: {flexDirection:'row',alignItems:'center',gap:7},
  searchGlyph: { color: colors.textSubtle, fontSize: 25 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 6 },
  filter: { borderRadius: 40, paddingHorizontal: 22, minHeight: 44, justifyContent: 'center' },
  filterSelected: { backgroundColor: colors.primary, transform: [{rotate:'-3deg'}] },
  filterText: { color: colors.textSubtle, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  filterTextSelected: { color: colors.primaryInk, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  retryButton: { alignSelf: 'center', padding: 16 },
  clearButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: 32 },
  createButton: { borderRadius: 10 },
  searchWrap: { alignItems: 'center', borderColor: colors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', gap: 10, marginTop: 2, paddingHorizontal: 2 },
  searchInput: { color: colors.text, flex: 1, fontSize: 14, minHeight: 44 },
  clearSearch: { color: colors.textMuted, fontSize: 23, paddingHorizontal: spacing.xs },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21, marginTop: spacing.md, textAlign: 'center' },
  sectionLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, marginTop: 10 },
  sectionLead: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.display, color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.5 },
  sectionCount: { color: colors.textSubtle, fontSize: 12, fontWeight: '500' },
  liveDot: { backgroundColor: colors.accent, borderRadius: 4, height: 8, width: 8 },
  liveScroller: { marginHorizontal: -22, marginTop: 10 },
  liveRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 22 },
  liveCard: { gap: 2, minHeight: 94, paddingHorizontal: 20, paddingVertical: 12, width: 264 },
  liveTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  liveLabel: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  liveLabelText: { color: colors.white, fontSize: 9, fontWeight: '700', letterSpacing: 1.8 },
  roomTitle: { color: colors.white, fontFamily: fonts.editorial, fontSize: 25, lineHeight: 28 },
  liveClubName: { color: colors.textMuted, fontSize: 11, flexShrink: 1, marginLeft: 8 },
  listenerRow: { alignItems: 'center', flexDirection: 'row', marginTop: 'auto' },
  listenerCopy: { color: colors.textMuted, fontSize: 11 },
  enterArrow: { color: colors.white, fontSize: 22, marginLeft: 'auto' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  clubGrid: { gap: 8 },
  clubTile: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 112, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 2, paddingVertical: 11 },
  coverShell: { marginLeft: 2 },
  clubLink: { flex: 1, minHeight: 64, justifyContent: 'center' },
  clubName: { color: colors.text, fontFamily: fonts.display, fontSize: 25, lineHeight: 26, textTransform: 'uppercase', flex: 1 },
  clubTopic: { color: colors.textMuted, fontFamily: fonts.italic, fontSize: 19, lineHeight: 22, marginTop: 2 },
  memberCount: { color: colors.textSubtle, fontSize: 11, marginTop: 4 },
  tileActions: { alignItems: 'center', gap: 2, width: 76 },
  joinButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 40, minWidth: 76, minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, transform: [{rotate:'-3deg'}] },
  joinedButton: { backgroundColor: colors.surfaceRaised },
  joinLabel: { color: colors.primaryInk, fontFamily: fonts.display, fontSize: 18, textTransform: 'uppercase', letterSpacing: 0.5 },
  joinedLabel: { color: colors.text },
  micButton: { alignItems:'center',justifyContent:'center',height:44,width:44 },
  hostPanel: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 16, marginTop: 16, padding: 20 },
  hostPanelTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  hostTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  hostHint: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  hostClose: { color: colors.textMuted, fontSize: 25, lineHeight: 25 },
  roomInput: { backgroundColor: colors.surfaceSoft, borderColor: colors.borderStrong, borderRadius: 9, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 54, paddingHorizontal: spacing.lg },
  startButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 4, minHeight: 52, justifyContent: 'center' },
  startLabel: { color: colors.primaryInk, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
