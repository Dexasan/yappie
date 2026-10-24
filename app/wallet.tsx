import { PaperSurface } from '@/components/InkArtwork';
import { Text } from '@/components/Typography';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { GiftArtwork } from '@/components/GiftArtwork';
import { EmptyState, PixelRule, RetroGlyph, Screen } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { formatUsd, giftCheckoutEnabled, loadEarningsWallet, loadGiftCatalog, loadProfileGifts, type EarningsWallet, type GiftCatalogItem, type ProfileGift } from '@/features/gifts/api';
import { giftPresentation } from '@/features/gifts/presentation';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export default function WalletScreen() {
  const { user } = useSession();
  const checkoutEnabled = giftCheckoutEnabled();
  const [wallet, setWallet] = useState<EarningsWallet | null>(null);
  const [catalog, setCatalog] = useState<GiftCatalogItem[]>([]);
  const [receivedGifts, setReceivedGifts] = useState<ProfileGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!user) throw new Error('Sign in to open your wallet.');
      const [nextWallet, nextCatalog, nextReceived] = await Promise.all([
        checkoutEnabled ? loadEarningsWallet() : Promise.resolve(null), loadGiftCatalog(), loadProfileGifts(user.id),
      ]);
      setWallet(nextWallet);
      setCatalog(nextCatalog);
      setReceivedGifts(nextReceived);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Your wallet is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [checkoutEnabled, user]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const progress = wallet ? Math.min(1, wallet.available_cents / wallet.withdrawal_minimum_cents) : 0;
  const canWithdraw = Boolean(wallet && wallet.available_cents >= wallet.withdrawal_minimum_cents && wallet.payout_status === 'verified');

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()}><RetroGlyph glyph="‹" tone="neutral" /></Pressable>
        <View style={styles.headerCopy}><Text style={styles.pageLabel}>{checkoutEnabled ? 'YAPPIE / EARNINGS' : 'YAPPIE / GIFT LAB'}</Text><Text style={styles.pageTitle}>{checkoutEnabled ? 'Gift wallet' : 'Gift preview'}</Text></View>
        <RetroGlyph glyph={checkoutEnabled ? '$' : '✦'} tone="warning" />
      </View>
      <PixelRule label={checkoutEnabled ? 'gift earnings' : 'free beta · no payments'} />

      {loading ? <ActivityIndicator color={colors.warning} style={styles.loading} /> : null}
      {!loading && error ? <><EmptyState description={error} glyph="◎" title="Wallet unavailable" /><Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retryButton}><Text style={styles.retryLabel}>Try again</Text></Pressable></> : null}

      {!loading && !error ? (
        <>
          {checkoutEnabled && wallet ? (
            <>
              <View style={styles.balanceHero}>
                <Text style={styles.balanceKicker}>READY TO WITHDRAW</Text>
                <Text style={styles.balanceValue}>{formatUsd(wallet.available_cents)}</Text>
                <View style={styles.balanceRow}>
                  <View><Text style={styles.miniValue}>{formatUsd(wallet.pending_cents)}</Text><Text style={styles.miniLabel}>PENDING</Text></View>
                  <View style={styles.balanceDivider} />
                  <View><Text style={styles.miniValue}>{formatUsd(wallet.lifetime_earned_cents)}</Text><Text style={styles.miniLabel}>ALL-TIME EARNED</Text></View>
                </View>
                <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
                <View style={styles.progressCopy}><Text style={styles.progressText}>{formatUsd(wallet.available_cents)} of {formatUsd(wallet.withdrawal_minimum_cents)}</Text><Text style={styles.progressText}>WITHDRAW AT $100</Text></View>
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canWithdraw }} disabled={!canWithdraw} style={[styles.withdrawButton, !canWithdraw && styles.withdrawDisabled]}>
                  <Text style={[styles.withdrawLabel, !canWithdraw && styles.withdrawLabelDisabled]}>{wallet.payout_status === 'verified' ? canWithdraw ? 'WITHDRAW EARNINGS' : 'KEEP EARNING' : 'CONNECT PAYOUT ACCOUNT'}</Text>
                </Pressable>
              </View>
              <View style={styles.splitCard}>
                <GiftArtwork animated size={58} slug="rose" />
                <View style={styles.splitCopy}><Text style={styles.sectionEyebrow}>THE SPLIT</Text><Text style={styles.splitTitle}>Net proceeds are divided equally.</Text><Text style={styles.splitMeta}>50% to the recipient · 50% to YAPPIE</Text></View>
              </View>
              {wallet.premium_until ? <View style={styles.premiumCard}><Text style={styles.premiumGlyph}>★</Text><View style={styles.splitCopy}><Text style={styles.sectionEyebrow}>YAPPIE PREMIUM</Text><Text style={styles.premiumTitle}>Ad-free until {new Date(wallet.premium_until).toLocaleDateString()}</Text></View></View> : null}
            </>
          ) : (
            <View style={styles.betaHero}>
              <View style={styles.betaArt}><GiftArtwork animated size={92} slug="gift_vault" /></View>
              <Text style={styles.betaStamp}>FREE BETA / DISPLAY ONLY</Text>
              <Text style={styles.betaTitle}>Gifting is unavailable</Text>
              <Text style={styles.betaCopy}>Explore what we are designing. Nothing here can be bought, sent, earned, or withdrawn yet.</Text>
              <View style={styles.betaStatus}><Text style={styles.betaStatusDot}>●</Text><Text style={styles.betaStatusText}>PAYMENTS OFF · WALLET OFF · ZERO CHARGES</Text></View>
            </View>
          )}

          <View style={styles.sectionHeader}><View><Text style={styles.sectionEyebrow}>{checkoutEnabled ? 'AVAILABLE NOW' : 'GIFT PREVIEW'}</Text><Text style={styles.sectionTitle}>Gifts</Text></View><Text style={styles.sectionCount}>{catalog.length}</Text></View>
          <View style={styles.catalog}>
            {catalog.map((gift) => {
              const presentation = giftPresentation(gift.slug);
              return (
                <View key={gift.slug} style={styles.catalogItem}><PaperSurface variant="ticket" color={colors.surfaceSoft} ink={presentation.accent} />
                  <GiftArtwork animated={gift.slug === 'bumper'} size={60} slug={gift.slug} />
                  <View style={styles.giftCopy}><Text style={[styles.giftLabel, { color: presentation.accent }]}>{presentation.label}</Text><Text style={styles.giftName}>{gift.name}</Text><Text style={styles.giftMeta}>{checkoutEnabled ? 'They receive 50% of net' : 'Preview only'}</Text></View>
                  <Text style={[styles.giftPrice, { color: presentation.accent }]}>{checkoutEnabled ? formatUsd(gift.price_usd_cents) : 'PREVIEW'}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.sectionHeader}><View><Text style={styles.sectionEyebrow}>{checkoutEnabled ? 'SENT TO YOU' : 'GIFT ARCHIVE'}</Text><Text style={styles.sectionTitle}>{checkoutEnabled ? 'Recent gifts' : 'Earlier gifts'}</Text></View><Text style={styles.sectionCount}>{receivedGifts.length}</Text></View>
          {receivedGifts.length ? <View style={styles.receivedRail}>{receivedGifts.slice(0, 8).map((gift) => (
            <View key={gift.gift_id} style={styles.receivedGift}>
              <GiftArtwork size={54} slug={gift.gift_slug} />
              <Text numberOfLines={1} style={styles.receivedName}>{gift.gift_name}</Text>
              <Text numberOfLines={1} style={styles.receivedFrom}>{gift.sender_display_name || (gift.sender_handle ? `@${gift.sender_handle}` : 'Someone')}</Text>
            </View>
          ))}</View> : <Text style={styles.receivedEmpty}>{checkoutEnabled ? 'Your gifts and earnings will appear here together.' : 'No gifts here. Sending is paused throughout the free beta.'}</Text>}

          <Text style={styles.legalNote}>{checkoutEnabled ? 'Payout setup requires identity verification and a supported bank account. Refunds or chargebacks can reverse pending earnings.' : 'This is a design preview, not an offer for sale. No purchase or payout account is needed for the free beta.'}</Text>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerCopy: { flex: 1 },
  pageLabel: { color: colors.warning, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  pageTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 34, textTransform: 'uppercase' },
  loading: { marginTop: 160 },
  retryButton: { alignItems: 'center', alignSelf: 'center', borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  retryLabel: { color: colors.text, fontSize: 14, fontWeight: '900' },
  balanceHero: { backgroundColor: colors.warningSoft, borderColor: colors.warning, borderRadius: 16, borderWidth: 2, marginTop: spacing.sm, padding: spacing.xl, shadowColor: colors.warning, shadowOffset: { height: 5, width: 5 }, shadowOpacity: 0.25, shadowRadius: 0 },
  betaHero: { alignItems: 'center', backgroundColor: colors.warningSoft, borderColor: colors.primary, borderRadius: 3, borderStyle: 'dashed', borderWidth: 1, marginTop: 22, overflow: 'hidden', padding: 24 },
  betaArt: { backgroundColor: colors.backgroundRaised, borderColor: colors.border, borderRadius: 60, borderWidth: 1, padding: spacing.sm },
  betaStamp: { color: colors.warning, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: spacing.md },
  betaTitle: { color: colors.text, fontFamily: fonts.editorial, fontSize: 39, lineHeight: 42, marginTop: 6, textAlign: 'center' },
  betaCopy: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, maxWidth: 310, textAlign: 'center' },
  betaStatus: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: 6, marginTop: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: 8 },
  betaStatusDot: { color: colors.signal, fontSize: 10 },
  betaStatusText: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  balanceKicker: { color: colors.warning, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  balanceValue: { color: colors.text, fontSize: 58, fontWeight: '900', letterSpacing: -3, lineHeight: 68, marginTop: 2 },
  balanceRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md },
  miniValue: { color: colors.text, fontSize: 17, fontWeight: '900' },
  miniLabel: { color: colors.textSubtle, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 2 },
  balanceDivider: { backgroundColor: colors.borderStrong, height: 34, width: StyleSheet.hairlineWidth },
  progressTrack: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, height: 8, marginTop: spacing.xl, overflow: 'hidden' },
  progressFill: { backgroundColor: colors.signal, borderRadius: radius.pill, height: '100%' },
  progressCopy: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressText: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  withdrawButton: { alignItems: 'center', backgroundColor: colors.signal, borderColor: colors.black, borderRadius: 10, borderWidth: 2, marginTop: spacing.lg, padding: spacing.md },
  withdrawDisabled: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong },
  withdrawLabel: { color: colors.primaryInk, fontSize: 13, fontWeight: '700', letterSpacing: 0.6 },
  withdrawLabelDisabled: { color: colors.textMuted },
  splitCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, padding: spacing.md },
  splitCopy: { flex: 1 },
  splitTitle: { color: colors.text, fontSize: 16, fontWeight: '900', lineHeight: 20, marginTop: 2 },
  splitMeta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  premiumCard: { alignItems: 'center', backgroundColor: colors.signalSoft, borderColor: colors.signal, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, padding: spacing.md },
  premiumGlyph: { color: colors.signal, fontSize: 24 },
  premiumTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 2 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xxl },
  sectionEyebrow: { color: colors.warning, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  sectionTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 30, textTransform: 'uppercase', marginTop: 4 },
  sectionCount: { color: colors.textSubtle, fontSize: 18, fontWeight: '900' },
  catalog: { gap: spacing.sm, marginTop: spacing.md },
  catalogItem: { alignItems: 'center', flexDirection: 'row', gap: 16, minHeight: 120, padding: 24 },
  giftCopy: { flex: 1 },
  giftLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  giftName: { color: colors.text, fontFamily: fonts.editorial, fontSize: 25, marginTop: 4 },
  giftMeta: { color: colors.signal, fontSize: 11, fontWeight: '800', marginTop: 3 },
  giftPrice: { fontSize: 17, fontWeight: '900' },
  receivedRail: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  receivedGift: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 10, borderWidth: 1, gap: 3, minWidth: 104, padding: spacing.sm },
  receivedName: { color: colors.text, fontSize: 10, fontWeight: '900', maxWidth: 94 },
  receivedFrom: { color: colors.textMuted, fontSize: 10, maxWidth: 94 },
  receivedEmpty: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm },
  legalNote: { color: colors.textSubtle, fontSize: 10, lineHeight: 15, marginVertical: spacing.xl, textAlign: 'center' },
});
