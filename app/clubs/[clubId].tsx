import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { Text, TextInput } from '@/components/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Avatar, Card, EmptyState, Heading, Muted, Pill, PrimaryButton, Screen, SectionHeader } from '@/components/ui';
import { ClubCover } from '@/components/ClubCover';
import { useSession } from '@/context/SessionContext';
import {
  createClubPost,
  joinClub,
  leaveClub,
  loadClubDetail,
  loadClubMembers,
  loadClubPosts,
  manageClubMember,
  startClubRoom,
  type ClubDetail,
  type ClubMember,
  type ClubPost,
} from '@/features/clubs/api';
import { setPostLiked } from '@/features/feed/api';
import { chooseClubAvatar, clubAvatarPublicUrl, uploadClubAvatar } from '@/features/clubs/avatar';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { ClubSessions } from '@/components/ClubSessions';
import { ContentMenu } from '@/components/ContentMenu';
import { useDraft } from '@/lib/use-draft';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function ClubDetailScreen() {
  const params = useLocalSearchParams<{ clubId: string }>();
  const clubId = first(params.clubId);
  const { profile, user } = useSession();
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [postBody, setPostBody] = useDraft(user?.id, `club:${clubId}`);
  const [roomTitle, setRoomTitle] = useState('');
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imageBusy, setImageBusy] = useState(false);

  const refresh = useCallback(async (showIndicator = false) => {
    if (!clubId) return;
    if (showIndicator) setRefreshing(true);
    setError('');
    try {
      const [nextClub, nextMembers, nextPosts] = await Promise.all([
        loadClubDetail(clubId),
        loadClubMembers(clubId),
        loadClubPosts(clubId),
      ]);
      setClub(nextClub);
      setMembers(nextMembers);
      setPosts(nextPosts);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load this club.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clubId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const canHost = useMemo(() => Boolean(
    club?.is_member && (club.allow_member_rooms || club.member_role === 'owner' || club.member_role === 'moderator'),
  ), [club]);
  const canEditImage = Boolean(user && club?.owner_id === user.id);

  const changeClubImage = async () => {
    if (!clubId || !club || !canEditImage || imageBusy) return;
    setImageBusy(true);
    setError('');
    try {
      const asset = await chooseClubAvatar();
      if (!asset) return;
      await uploadClubAvatar(clubId, asset, club.avatar_path);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not update the Club picture.');
    } finally {
      setImageBusy(false);
    }
  };

  const toggleMembership = async () => {
    if (!clubId || !club || busy || club.member_role === 'owner') return;
    setBusy(true);
    setError('');
    try {
      if (club.is_member) await leaveClub(clubId);
      else await joinClub(clubId);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not update membership.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!clubId || !postBody.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await createClubPost(clubId, postBody);
      setPostBody('');
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not share this post.');
    } finally {
      setBusy(false);
    }
  };

  const toggleLike = async (post: ClubPost) => {
    if (!user) return;
    const nextLiked = !post.liked_by_me;
    setPosts((current) => current.map((item) => item.post_id === post.post_id
      ? { ...item, liked_by_me: nextLiked, like_count: item.like_count + (nextLiked ? 1 : -1) }
      : item));
    try {
      await setPostLiked(post.post_id, user.id, nextLiked);
    } catch (nextError) {
      setPosts((current) => current.map((item) => item.post_id === post.post_id ? post : item));
      setError(nextError instanceof Error ? nextError.message : 'Could not update this like.');
    }
  };

  const goLive = async () => {
    if (!clubId || !roomTitle.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const roomId = await startClubRoom(clubId, roomTitle);
      setRoomTitle('');
      setShowRoomForm(false);
      router.push({ pathname: '/clubs/room/[roomId]', params: { roomId } });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not start this room.');
      setBusy(false);
    }
  };

  const manageMember = (member: ClubMember) => {
    if (!clubId || club?.member_role !== 'owner' || member.role === 'owner') return;
    const roleAction = member.role === 'moderator' ? 'demote' : 'promote';
    Alert.alert(
      member.display_name || member.handle || 'Club member',
      'Choose how to manage this member.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: member.role === 'moderator' ? 'Remove moderator' : 'Make moderator',
          onPress: () => void runMemberAction(member, roleAction),
        },
        { text: 'Remove from club', style: 'destructive', onPress: () => void runMemberAction(member, 'remove') },
      ],
    );
  };

  const runMemberAction = async (member: ClubMember, action: 'promote' | 'demote' | 'remove') => {
    if (!clubId) return;
    setBusy(true);
    setError('');
    try {
      await manageClubMember(clubId, member.user_id, action);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not manage this member.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Screen><ActivityIndicator color={colors.primary} style={styles.loading} /></Screen>;
  }

  if (!club) {
    return (
      <Screen>
        <Pressable onPress={() => router.back()}><Text style={styles.backLabel}>‹ Clubs</Text></Pressable>
        <EmptyState description={error || 'This club may no longer exist.'} glyph="◎" title="Club unavailable" />
      </Screen>
    );
  }

  return (
    <Screen refreshControl={<RefreshControl colors={[colors.primary]} onRefresh={() => void refresh(true)} progressBackgroundColor={colors.surfaceRaised} refreshing={refreshing} />}>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backGlyph}>‹</Text><Text style={styles.backLabel}>Clubs</Text>
        </Pressable>
        <Pill label={club.topic} tone="accent" />
      </View>

      <View style={styles.clubHero}>
      <Pressable accessibilityLabel={canEditImage ? 'Change Club cover' : `${club.name} cover`} disabled={!canEditImage || imageBusy} onPress={() => void changeClubImage()} style={styles.heroImageAction}>
        <ClubCover height={226} label={club.name} uri={clubAvatarPublicUrl(club.avatar_path)} width="100%" />
        {canEditImage ? <View style={styles.imageEditBadge}>{imageBusy ? <ActivityIndicator color={colors.primaryInk} size="small" /> : <><Text style={styles.imageEditGlyph}>＋</Text><Text style={styles.imageEditText}>EDIT COVER</Text></>}</View> : null}
      </Pressable>
      <Heading compact>{club.name}</Heading>
      <Muted style={styles.description}>{club.description}</Muted>
      <View style={styles.statsRow}>
        <Text style={styles.memberCount}>{club.member_count}</Text><Text style={styles.memberLabel}> members</Text>
        <View style={styles.dot} />
        <Text style={styles.ownerLabel}>Created by </Text>
        {club.owner_id ? (
          <Pressable onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: club.owner_id! } })}>
            <Text style={styles.ownerName}>{club.owner_display_name || `@${club.owner_handle}`}</Text>
          </Pressable>
        ) : <Text style={styles.ownerName}>Community</Text>}
      </View>

      </View>
      <View style={styles.primaryActions}>
        <View style={styles.actionFlex}>
          <PrimaryButton
            disabled={busy || club.member_role === 'owner'}
            label={club.member_role === 'owner' ? 'You own this club' : club.is_member ? 'Leave club' : 'Join club'}
            onPress={() => void toggleMembership()}
          />
        </View>
        {canHost && !club.live_room_id ? (
          <Pressable accessibilityRole="button" onPress={() => setShowRoomForm((current) => !current)} style={styles.liveButton}>
            <Text style={styles.liveButtonText}>≋ Go live</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      {club.live_room_id ? (
        <Card style={styles.liveCard}>
          <View style={styles.liveTop}><Pill label={`Live · ${club.live_listener_count}`} tone="live" /><Text style={styles.liveClub}>Happening now</Text></View>
          <Text style={styles.liveTitle}>{club.live_room_title}</Text>
          <PrimaryButton label="Join the conversation" onPress={() => router.push({ pathname: '/clubs/room/[roomId]', params: { roomId: club.live_room_id! } })} />
        </Card>
      ) : null}

      {showRoomForm ? (
        <Card style={styles.roomForm}>
          <Text style={styles.cardTitle}>Start a live conversation</Text>
          <TextInput
            accessibilityLabel="Live room title"
            maxLength={120}
            onChangeText={setRoomTitle}
            placeholder="What should people talk about?"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
            value={roomTitle}
          />
          <PrimaryButton disabled={roomTitle.trim().length < 3 || busy} label={busy ? 'Starting…' : 'Open the room'} onPress={() => void goLive()} />
        </Card>
      ) : null}

      {clubId ? <ClubSessions clubId={clubId} canHost={canHost} isMember={club.is_member} /> : null}
      <SectionHeader title="Club conversation" />
      {club.is_member ? (
        <Card style={styles.composer}>
          <View style={styles.composeRow}>
            <Avatar label={profile?.displayName || 'You'} path={profile?.avatarPath} size={40} />
            <TextInput
              accessibilityLabel="New club post"
              maxLength={500}
              multiline
              onChangeText={setPostBody}
              placeholder={`Share something with ${club.name}…`}
              placeholderTextColor={colors.textSubtle}
              style={styles.postInput}
              value={postBody}
            />
          </View>
          <View style={styles.composerFooter}>
            <Text style={styles.counter}>{postBody.length}/500</Text>
            <Pressable disabled={!postBody.trim() || busy} onPress={() => void publish()} style={[styles.postButton, (!postBody.trim() || busy) && styles.disabled]}>
              <Text style={styles.postButtonLabel}>{busy ? 'Sharing…' : 'Post to club'}</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <Pressable onPress={() => void toggleMembership()} style={styles.joinPrompt}>
          <Text style={styles.joinPromptTitle}>Join to take part</Text>
          <Text style={styles.joinPromptCopy}>Club posts are public to read. Members can post, reply, and host rooms.</Text>
        </Pressable>
      )}

      <View style={styles.postList}>
        {posts.map((post) => {
          const authorName = post.author_display_name || (post.author_handle ? `@${post.author_handle}` : 'Club member');
          return (
            <Card key={post.post_id}>
              <Pressable onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: post.author_id } })} style={styles.authorRow}>
                <Avatar label={authorName} path={post.author_avatar_path} size={40} />
                <View style={styles.authorCopy}><Text style={styles.authorName}>{authorName}</Text><Text style={styles.meta}>@{post.author_handle || 'member'} · {relativeTime(post.created_at)}</Text></View>
              </Pressable>
              <Text style={styles.postBody}>{post.body}</Text>
              <View style={styles.postActions}>
                <ContentMenu id={post.post_id} authorId={post.author_id} onChanged={() => void refresh()} />
                <Pressable onPress={() => void toggleLike(post)} style={[styles.postAction, post.liked_by_me && styles.likedAction]}>
                  <Text style={[styles.postActionLabel, post.liked_by_me && styles.likedLabel]}>{post.liked_by_me ? '♥' : '♡'} {post.like_count}</Text>
                </Pressable>
                <Pressable onPress={() => router.push({ pathname: '/post/[postId]', params: { postId: post.post_id, body: post.body, author: authorName, authorId: post.author_id } })} style={styles.postAction}>
                  <Text style={styles.postActionLabel}>◌ {post.reply_count}</Text>
                </Pressable>
              </View>
            </Card>
          );
        })}
      </View>
      {posts.length === 0 ? <EmptyState description="Start the first conversation for this community." glyph="✦" title="This club is ready for its first post" /> : null}

      <SectionHeader action={<Pill label={`${members.length} shown`} />} title="People" />
      <View style={styles.memberList}>
        {members.map((member) => {
          const name = member.display_name || (member.handle ? `@${member.handle}` : 'Member');
          return (
            <Pressable
              key={member.user_id}
              onLongPress={() => manageMember(member)}
              onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: member.user_id } })}
              style={styles.memberRow}
            >
              <Avatar label={name} path={member.avatar_path} size={38} />
              <View style={styles.memberCopy}><Text style={styles.memberName}>{name}</Text><Text style={styles.memberMeta}>{member.country_code || 'Worldwide'}</Text></View>
              {member.role !== 'member' ? <Pill label={member.role} tone={member.role === 'owner' ? 'accent' : 'success'} /> : null}
              {club.member_role === 'owner' && member.role !== 'owner' ? <Text style={styles.manageHint}>•••</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {club.member_role === 'owner' && members.length > 1 ? <Text style={styles.ownerHint}>Long-press a member to promote or remove them.</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 120 },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  backButton: { alignItems: 'center', flexDirection: 'row', gap: 4, paddingVertical: spacing.sm },
  backGlyph: { color: colors.text, fontSize: 28, lineHeight: 28 },
  backLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  clubHero: { gap: spacing.md, marginTop: spacing.xl },
  heroImageAction: { marginBottom: spacing.sm, position: 'relative', transform: [{ rotate: '-1deg' }], width: '100%' },
  imageEditBadge: { alignItems: 'center', backgroundColor: colors.signal, borderColor: colors.background, borderRadius: 4, borderWidth: 3, bottom: 10, flexDirection: 'row', gap: 5, minHeight: 38, paddingHorizontal: 11, position: 'absolute', right: 10 },
  imageEditGlyph: { color: colors.black, fontSize: 17, fontWeight: '900', lineHeight: 20 },
  imageEditText: { color: colors.black, fontFamily: fonts.display, fontSize: 13, letterSpacing: 0.8 },
  description: { fontSize: 15, lineHeight: 23, marginTop: spacing.md },
  statsRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg },
  memberCount: { color: colors.text, fontSize: 13, fontWeight: '900' },
  memberLabel: { color: colors.textMuted, fontSize: 13 },
  dot: { backgroundColor: colors.textSubtle, borderRadius: 2, height: 3, marginHorizontal: spacing.sm, width: 3 },
  ownerLabel: { color: colors.textMuted, fontSize: 13 },
  ownerName: { color: colors.link, fontSize: 13, fontWeight: '800' },
  primaryActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  actionFlex: { flex: 1 },
  liveButton: { alignItems: 'center', backgroundColor: colors.accentSoft, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minWidth: 104, paddingHorizontal: spacing.md },
  liveButtonText: { color: colors.accent, fontSize: 13, fontWeight: '900' },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.lg, textAlign: 'center' },
  liveCard: { backgroundColor: colors.accentSoft, gap: spacing.lg, marginTop: spacing.xl },
  liveTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  liveClub: { color: colors.textMuted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  liveTitle: { fontFamily: fonts.display, color: colors.text, fontSize: 21, fontWeight: '900', lineHeight: 27 },
  roomForm: { gap: spacing.md, marginTop: spacing.lg },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  input: { backgroundColor: colors.surfaceSoft, borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, color: colors.text, minHeight: 52, paddingHorizontal: spacing.lg },
  composer: { backgroundColor: colors.surfaceSoft, gap: spacing.md },
  composeRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  postInput: { color: colors.text, flex: 1, fontSize: 15, lineHeight: 22, minHeight: 72, paddingTop: spacing.sm, textAlignVertical: 'top' },
  composerFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  counter: { color: colors.textSubtle, fontSize: 12, fontWeight: '700' },
  postButton: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  postButtonLabel: { color: colors.primaryInk, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  joinPrompt: { backgroundColor: colors.cobaltSoft, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: 4, padding: spacing.lg },
  joinPromptTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  joinPromptCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  postList: { gap: spacing.md, marginTop: spacing.md },
  authorRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  authorCopy: { flex: 1 },
  authorName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  meta: { color: colors.textSubtle, fontSize: 13, marginTop: 2 },
  postBody: { color: colors.text, fontSize: 16, lineHeight: 24, marginVertical: spacing.lg },
  postActions: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  postAction: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  likedAction: { backgroundColor: colors.accentSoft },
  postActionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  likedLabel: { color: colors.accent },
  memberList: { gap: spacing.sm },
  memberRow: { alignItems: 'center', backgroundColor: colors.surfaceSoft, borderColor: colors.border, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  memberCopy: { flex: 1 },
  memberName: { color: colors.text, fontSize: 13, fontWeight: '900' },
  memberMeta: { color: colors.textSubtle, fontSize: 12, marginTop: 2 },
  manageHint: { color: colors.textSubtle, fontSize: 15, fontWeight: '900' },
  ownerHint: { color: colors.textSubtle, fontSize: 12, lineHeight: 18, marginTop: spacing.md, textAlign: 'center' },
});
