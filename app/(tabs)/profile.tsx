import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { Text } from '@/components/Typography';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';

import { GiftArtwork } from '@/components/GiftArtwork';
import { Avatar, RetroGlyph, RetroHeader, Screen } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { isModerator } from '@/features/safety/moderation';
import { formatUsd, giftCheckoutEnabled, loadEarningsWallet, loadProfileGifts, type EarningsWallet, type ProfileGift } from '@/features/gifts/api';
import { loadOwnSocialStats, type SocialStats } from '@/features/social/api';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

function formatDate(value: string | null | undefined, includeDay = true) {
  if (!value) return 'Not set';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString(undefined, includeDay
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { month: 'short', year: 'numeric' });
}

export default function ProfileScreen() {
  const { profile, signOut, user } = useSession();
  const checkoutEnabled = giftCheckoutEnabled();
  const [stats, setStats] = useState<SocialStats | null>(null);
  const [moderator,setModerator]=useState(false);
  const [wallet, setWallet] = useState<EarningsWallet | null>(null);
  const [receivedGifts, setReceivedGifts] = useState<ProfileGift[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setModerator(false);
    void isModerator().then(value=>{if(active)setModerator(value);}).catch(()=>{});
    if (!user || !isSupabaseConfigured) {
      setStats({ followers: 0, following: 0, posts: 0 });
      setReceivedGifts([]);
      return () => { active = false; };
    }
    void loadOwnSocialStats(user.id).then((nextStats) => { if (active) setStats(nextStats); }).catch(() => { if (active) setStats({ followers: 0, following: 0, posts: 0 }); });
    if (checkoutEnabled) {
      void loadEarningsWallet().then((nextWallet) => { if (active) setWallet(nextWallet); }).catch(() => { if (active) setWallet(null); });
    } else {
      setWallet(null);
    }
    void loadProfileGifts(user.id).then((gifts) => { if (active) setReceivedGifts(gifts); }).catch(() => { if (active) setReceivedGifts([]); });
    return () => { active = false; };
  }, [checkoutEnabled, user]));

  if (!profile) return null;

  const metadata = [
    { glyph: '✦', label: 'Birthday', value: formatDate(profile.birthDate) },
    { glyph: '⌁', label: 'Languages', value: profile.languages.join(', ') || 'Not set' },
    { glyph: '⌖', label: 'From', value: profile.country || 'Worldwide' },
    { glyph: '◷', label: 'Joined', value: formatDate(user?.created_at, false) },
  ];

  return (
    <Screen>
      <RetroHeader compact
        action={<Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings/account')}><RetroGlyph glyph="⚙" tone="neutral" /></Pressable>}
        title="Your profile"
        tone="accent"
      />

      <View style={styles.profileHeader}>
        <PaperSurface variant="oval" color={colors.accentSoft} ink={colors.accentSolid} /><View pointerEvents="none" style={styles.portraitFlower}><InkDrawing motif="flower" size={64} color={colors.accent} /></View><View pointerEvents="none" style={styles.portraitStar}><InkDrawing motif="spark" size={44} color={colors.warning} /></View>
        <View style={styles.avatarFrame}><Avatar label={profile.displayName} path={profile.avatarPath} size={72} /></View>
        <Text style={styles.profileName}>{profile.displayName}</Text>
        <Text style={styles.profileHandle}>@{profile.handle}</Text>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile/edit')} style={styles.editButton}><Text style={styles.editLabel}>Edit profile</Text></Pressable>
      </View>

      <View style={styles.stats}><PaperSurface variant="ticket" color={colors.surfaceSoft} />
        <Pressable accessibilityRole="button" onPress={() => user && router.push({ pathname: '/people/connections', params: { userId: user.id, mode: 'following', name: profile.displayName } })} style={styles.stat}>
          <Text style={styles.statNumber}>{stats?.following ?? '—'}</Text><Text style={styles.statLabel}>Following</Text>
        </Pressable>
        <View style={styles.statDivider} />
        <Pressable accessibilityRole="button" onPress={() => user && router.push({ pathname: '/people/connections', params: { userId: user.id, mode: 'followers', name: profile.displayName } })} style={styles.stat}>
          <Text style={styles.statNumber}>{stats?.followers ?? '—'}</Text><Text style={styles.statLabel}>Followers</Text>
        </Pressable>
        <View style={styles.statDivider} />
        <View style={styles.stat}><Text style={styles.statNumber}>{stats?.posts ?? '—'}</Text><Text style={styles.statLabel}>Posts</Text></View>
      </View>

      <View style={styles.metadataGrid}>
        {metadata.map((item) => (
          <View key={item.label} style={styles.metadataItem}><PaperSurface variant="note" color={colors.surface} />
            <View style={styles.metadataTop}><RetroGlyph glyph={item.glyph} size="sm" tone="neutral" /><Text style={styles.metadataLabel}>{item.label}</Text></View>
            <Text numberOfLines={2} style={styles.metadataValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/wallet' as Href)} style={styles.walletStrip}><PaperSurface variant="ticket" color={colors.warningSoft} ink={colors.warning} />
        <View style={{ flex: 1 }}>
          <Text style={styles.walletKicker}>{checkoutEnabled ? 'GIFT EARNINGS' : 'GIFT LAB · FREE BETA'}</Text>
          <Text style={styles.walletTitle}>{checkoutEnabled ? wallet ? formatUsd(wallet.available_cents) : 'Your wallet' : 'Preview the collection'}</Text>
          <Text style={styles.walletMeta}>{checkoutEnabled ? wallet?.pending_cents ? `${formatUsd(wallet.pending_cents)} pending · withdraw at $100` : receivedGifts.length ? `${receivedGifts.length} recent gift${receivedGifts.length === 1 ? '' : 's'} received` : 'Half of every gift goes to you' : 'Gifting is unavailable during the free beta.'}</Text>
        </View>
        <InkDrawing motif="gift" size={64} color={colors.warning} />
      </Pressable>

      <View style={styles.giftsSection}>
        <View style={styles.giftsHeader}>
          <View style={styles.giftsTitleRow}><InkDrawing motif="gift" size={46} color={colors.warning} /><View><Text style={styles.giftsTitle}>{checkoutEnabled ? 'Gifts received' : 'Gift archive'}</Text><Text style={styles.giftsMeta}>{checkoutEnabled ? 'Sent your way' : 'Preview mode'}</Text></View></View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/wallet' as Href)}><Text style={styles.giftsLink}>View all</Text></Pressable>
        </View>
        {receivedGifts.length ? (
          <View style={styles.giftRow}>
            {receivedGifts.slice(0, 3).map((gift) => {
              const sender = gift.sender_display_name || (gift.sender_handle ? `@${gift.sender_handle}` : 'Someone');
              return (
                <Pressable
                  key={gift.gift_id}
                  accessibilityLabel={`${gift.gift_name} from ${sender}`}
                  onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: gift.sender_id } })}
                  style={styles.giftCard}
                >
                  <GiftArtwork size={52} slug={gift.gift_slug} />
                  <Text numberOfLines={1} style={styles.giftName}>{gift.gift_name}</Text>
                  <Text numberOfLines={1} style={styles.giftSender}>from {sender}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/wallet' as Href)} style={styles.noGifts}>
            <InkDrawing motif="gift" size={58} color={colors.warning} /><Text style={styles.noGiftsText}>{checkoutEnabled ? 'Your received gifts will appear here.' : 'No gifts received. Gifting is unavailable during the free beta.'}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.utilityRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Saved posts" onPress={() => router.push('/saved')} style={styles.utilityButton}><PaperSurface variant="oval" color={colors.warningSoft} ink={colors.warning} />
          <InkDrawing motif="bookmark" size={40} color={colors.warning} /><View style={styles.utilityCopy}><Text style={styles.utilityTitle}>Saved</Text><Text style={styles.utilityMeta}>Saved posts</Text></View>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/settings/safety')} style={styles.utilityButton}><PaperSurface variant="oval" color={colors.signalSoft} ink={colors.signal} />
          <InkDrawing motif="shield" size={40} color={colors.signal} /><View style={styles.utilityCopy}><Text style={styles.utilityTitle}>Safety</Text><Text style={styles.utilityMeta}>Privacy & blocks</Text></View>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/legal/[document]', params: { document: 'community-guidelines' } })} style={styles.utilityButton}><PaperSurface variant="oval" color={colors.cobaltSoft} ink={colors.cobalt} />
          <InkDrawing motif="book" size={40} color={colors.cobalt} /><View style={styles.utilityCopy}><Text style={styles.utilityTitle}>Guidelines</Text><Text style={styles.utilityMeta}>Community rules</Text></View>
        </Pressable>
      </View>

      {moderator ? <Pressable accessibilityRole="button" onPress={() => router.push('/moderation')} style={styles.moderationLink}><InkDrawing motif="shield" size={30} color={colors.signal} /><Text style={styles.moderationLabel}>Review reports</Text><Text style={styles.moderationLabel}>↗</Text></Pressable> : null}
      <View style={styles.accountFooter}>
        <Text numberOfLines={1} style={styles.email}>{user?.email ?? 'Authenticated account'}</Text>
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOutButton}><Text style={styles.signOutText}>Sign out</Text></Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  portraitFlower: { position: 'absolute', left: 14, top: 53, transform: [{rotate:'-22deg'}] },
  portraitStar: { position: 'absolute', right: 22, top: 66, transform: [{rotate:'15deg'}] },
  portraitCaption: { fontFamily: fonts.italic, color: colors.accent, fontSize: 22, transform: [{rotate:'-6deg'}] },
  profileHeader: { alignItems: 'center', marginTop: 10, paddingHorizontal: 34, paddingTop: 16, paddingBottom: 20 },
  avatarFrame: { marginTop: 8, position: 'relative' },
  profileName: { color: colors.text, fontFamily: fonts.display, fontSize: 36, lineHeight: 39, letterSpacing: -0.5, marginTop: 8, textTransform: 'uppercase' },
  profileHandle: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  bio: { color: colors.text, fontFamily: fonts.italic, fontSize: 21, lineHeight: 24, marginTop: 6, maxWidth: 310, textAlign: 'center' },
  editButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 40, justifyContent: 'center', marginTop: 10, minHeight: 44, paddingHorizontal: 28, transform: [{rotate:'-3deg'}] },
  editLabel: { color: colors.primaryInk, fontFamily: fonts.display, fontSize: 19, letterSpacing: 0.8, textTransform:'uppercase' },
  stats: { alignItems: 'center', flexDirection: 'row', paddingVertical: 12, marginTop: 8 },
  stat: { alignItems: 'center', flex: 1, gap: 2 },
  statDivider: { backgroundColor: colors.border, height: 27, width: StyleSheet.hairlineWidth },
  statNumber: { color: colors.text, fontFamily: fonts.display, fontSize: 28 },
  statLabel: { color: colors.textSubtle, fontSize: 12, fontWeight: '500' },
  metadataGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '4%', rowGap: 6, marginTop: 10 },
  metadataItem: { minHeight: 82, padding: 10, width: '48%' },
  metadataTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  metadataLabel: { color: colors.textMuted, flex: 1, fontFamily: fonts.italic, fontSize: 20 },
  metadataValue: { color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 19, marginTop: 4 },
  walletStrip: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 12, padding: 20 },
  walletKicker: { color: colors.cobalt, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  walletTitle: { color: colors.text, fontFamily: fonts.editorial, fontSize: 31, marginTop: 8 },
  walletMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  giftsSection: { marginTop: 14 },
  giftsHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  giftsTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  giftsTitle: { fontFamily: fonts.editorial, color: colors.text, fontSize: 31 },
  giftsMeta: { color: colors.textSubtle, fontSize: 11, fontWeight: '800', marginTop: 2, textTransform: 'uppercase' },
  giftsLink: { color: colors.warning, fontFamily: fonts.italic, fontSize: 19, paddingVertical: 12 },
  giftRow: { flexDirection: 'row', gap: spacing.sm },
  giftCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, minWidth: 0, paddingHorizontal: 4, paddingVertical: 16 },
  giftName: { color: colors.text, fontSize: 12, fontWeight: '900', marginTop: spacing.xs, maxWidth: '100%' },
  giftSender: { color: colors.textSubtle, fontSize: 10, marginTop: 2, maxWidth: '100%' },
  noGifts: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 10 },
  noGiftsText: { color: colors.textMuted, flex: 1, fontFamily: fonts.italic, fontSize: 21, lineHeight: 26 },
  utilityRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  utilityButton: { alignItems: 'center', flex: 1, minWidth: 0, gap: 6, minHeight: 126, paddingHorizontal: 6, paddingVertical: 18 },
  utilityCopy: { alignItems: 'center' },
  utilityTitle: { color: colors.text, fontFamily: fonts.editorial, fontSize: 21 },
  utilityMeta: { color: colors.textMuted, fontSize: 10, marginTop: 5, textAlign: 'center' },
  moderationLink: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  moderationLabel: { color: colors.signal, fontFamily: fonts.display, fontSize: 20 },
  accountFooter: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', marginTop: spacing.lg, paddingTop: spacing.md },
  email: { color: colors.textSubtle, flex: 1, fontSize: 13 },
  signOutButton: { borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  signOutText: { color: colors.danger, fontSize: 13, fontWeight: '900' },
});
