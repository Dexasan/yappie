import { Text } from '@/components/Typography';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GiftArtwork } from '@/components/GiftArtwork';
import { beginGiftCheckout, formatUsd, giftCheckoutEnabled, loadGiftCatalog, type GiftCatalogItem, type GiftContextKind } from '@/features/gifts/api';
import { giftPresentation } from '@/features/gifts/presentation';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export function GiftPicker({
  contextId,
  contextKind,
  onClose,
  recipientId,
  recipientName,
  visible,
}: {
  contextId?: string;
  contextKind: GiftContextKind;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  visible: boolean;
}) {
  const [catalog, setCatalog] = useState<GiftCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [sendingSlug, setSendingSlug] = useState<string | null>(null);
  const [error, setError] = useState('');
  const checkoutEnabled = giftCheckoutEnabled();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextCatalog = await loadGiftCatalog();
      setCatalog(nextCatalog);
      setSelectedSlug((current) => current && nextCatalog.some((gift) => gift.slug === current) ? current : nextCatalog[0]?.slug ?? null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Gifts are temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setError('');
    void refresh();
  }, [refresh, recipientId, visible]);

  const selectedGift = catalog.find((gift) => gift.slug === selectedSlug) ?? null;

  const send = async () => {
    if (!checkoutEnabled || !selectedGift || sendingSlug) return;
    setSendingSlug(selectedGift.slug);
    setError('');
    try {
      await beginGiftCheckout({ contextId, contextKind, giftSlug: selectedGift.slug, recipientId });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not open secure checkout. No payment was taken.');
    } finally {
      setSendingSlug(null);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close gift picker" accessibilityRole="button" onPress={onClose} style={styles.modalBackdrop} />
        <View style={styles.giftSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.titleBlock}>
              <Text style={styles.eyebrow}>{checkoutEnabled ? 'SEND A REAL GIFT' : 'GIFT LAB · FREE BETA'}</Text>
              <Text style={styles.title}>{checkoutEnabled ? 'Make their screen light up.' : 'A little magic, still in the workshop.'}</Text>
              <Text numberOfLines={1} style={styles.subtitle}>{checkoutEnabled ? `For ${recipientName}` : `Previewing the future collection for ${recipientName}`}</Text>
            </View>
            <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={styles.closeButton}><Text style={styles.closeGlyph}>×</Text></Pressable>
          </View>

          {loading ? <ActivityIndicator color={colors.warning} style={styles.loading} /> : null}
          {!loading ? (
            <ScrollView contentContainerStyle={styles.giftRail} horizontal showsHorizontalScrollIndicator={false} style={styles.giftScroller}>
              {catalog.map((gift) => {
                const selected = selectedSlug === gift.slug;
                const presentation = giftPresentation(gift.slug);
                return (
                  <Pressable
                    key={gift.slug}
                    accessibilityLabel={checkoutEnabled ? `${gift.name}, ${formatUsd(gift.price_usd_cents)}` : `${gift.name} gift preview`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => { setSelectedSlug(gift.slug); setError(''); }}
                    style={[styles.giftChoice, { borderColor: selected ? presentation.accent : colors.border }, selected && { backgroundColor: presentation.background, shadowColor: presentation.accent }]}
                  >
                    <GiftArtwork animated={selected} size={72} slug={gift.slug} />
                    <Text numberOfLines={1} style={styles.giftName}>{gift.name}</Text>
                    <Text style={[styles.price, { color: presentation.accent }]}>{checkoutEnabled ? formatUsd(gift.price_usd_cents) : 'PREVIEW'}</Text>
                    {gift.season_key !== 'evergreen' ? <Text style={styles.seasonTag}>{gift.season_key.toUpperCase()}</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {selectedGift ? (
            <View style={[styles.preview, { borderColor: giftPresentation(selectedGift.slug).accent }]}>
              <GiftArtwork animated size={92} slug={selectedGift.slug} />
              <View style={styles.previewCopy}>
                <Text style={[styles.giftLabel, { color: giftPresentation(selectedGift.slug).accent }]}>{giftPresentation(selectedGift.slug).label}</Text>
                <Text style={styles.previewTitle}>{selectedGift.name}</Text>
                {checkoutEnabled ? (
                  <>
                    <View style={styles.splitRow}>
                      <View style={styles.splitCell}><Text style={styles.splitValue}>{formatUsd(selectedGift.price_usd_cents)}</Text><Text style={styles.splitLabel}>YOU PAY</Text></View>
                      <Text style={styles.arrow}>→</Text>
                      <View style={styles.splitCell}><Text style={[styles.splitValue, styles.earning]}>50%</Text><Text style={styles.splitLabel}>OF NET TO THEM</Text></View>
                    </View>
                    {selectedGift.grants_premium_days ? <Text style={styles.bonus}>★ Also gives them {selectedGift.grants_premium_days} days of ad-free YAPPIE Premium + the full gift show.</Text> : null}
                  </>
                ) : (
                  <View style={styles.betaNote}>
                    <Text style={styles.betaNoteTitle}>DISPLAY SAMPLE / NOT SENDABLE</Text>
                    <Text style={styles.betaNoteCopy}>No payment, earnings, or Premium is created in this beta.</Text>
                  </View>
                )}
              </View>
            </View>
          ) : null}

          {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !checkoutEnabled || !selectedGift || Boolean(sendingSlug) }}
            disabled={!checkoutEnabled || !selectedGift || Boolean(sendingSlug)}
            onPress={() => void send()}
            style={[styles.sendButton, (!checkoutEnabled || !selectedGift || Boolean(sendingSlug)) && styles.sendButtonDisabled]}
          >
            {sendingSlug ? <ActivityIndicator color={colors.black} /> : <Text style={[styles.sendLabel, !checkoutEnabled && styles.sendLabelDisabled]}>{!checkoutEnabled ? 'GIFTING OPENS AFTER THE FREE BETA' : selectedGift ? `SEND ${selectedGift.name.toUpperCase()} · ${formatUsd(selectedGift.price_usd_cents)}` : 'CHOOSE A GIFT'}</Text>}
          </Pressable>
          <Text style={styles.footnote}>{checkoutEnabled ? 'After storefront tax and fees, net proceeds are split equally. Earnings move to their wallet after verification and the refund hold.' : 'Explore the collection now. Sending, payments, earnings, and withdrawals are disabled during the free beta.'}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { backgroundColor: 'rgba(3, 4, 8, 0.8)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  giftSheet: { backgroundColor: colors.background, borderColor: colors.primary, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderTopWidth: 1.5, gap: 12, maxHeight: '92%', paddingBottom: 30, paddingHorizontal: 20, paddingTop: 16 },
  sheetHandle: { alignSelf: 'center', backgroundColor: colors.borderStrong, borderRadius: radius.pill, height: 4, width: 44 },
  sheetHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  titleBlock: { flex: 1 },
  eyebrow: { color: colors.warning, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.text, fontFamily: fonts.editorial, fontSize: 33, lineHeight: 37, marginTop: 6 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  closeButton: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  closeGlyph: { color: colors.text, fontSize: 27, lineHeight: 28 },
  loading: { marginVertical: spacing.xxl },
  giftScroller: { marginHorizontal: -spacing.lg },
  giftRail: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 7 },
  giftChoice: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 3, borderWidth: 1, gap: 8, padding: 12, width: 126 },
  giftName: { color: colors.text, fontSize: 12, fontWeight: '900', maxWidth: 100 },
  price: { fontSize: 14, fontWeight: '900' },
  seasonTag: { color: colors.textSubtle, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  preview: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 3, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 16 },
  previewCopy: { flex: 1 },
  giftLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  previewTitle: { fontFamily: fonts.display, color: colors.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  tagline: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  splitRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  splitCell: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 8, borderWidth: 1, minWidth: 75, paddingHorizontal: 8, paddingVertical: 6 },
  splitValue: { color: colors.text, fontSize: 15, fontWeight: '900' },
  earning: { color: colors.signal },
  splitLabel: { color: colors.textSubtle, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 1 },
  arrow: { color: colors.warning, fontSize: 17, fontWeight: '900' },
  bonus: { color: colors.signal, fontSize: 10, fontWeight: '800', lineHeight: 14, marginTop: spacing.sm },
  betaNote: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 8, borderStyle: 'dashed', borderWidth: 1, marginTop: spacing.md, padding: spacing.sm },
  betaNoteTitle: { color: colors.warning, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  betaNoteCopy: { color: colors.textMuted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  errorBox: { backgroundColor: colors.dangerSoft, borderColor: colors.danger, borderRadius: 8, borderWidth: 1, padding: spacing.sm },
  error: { color: colors.text, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  sendButton: { alignItems: 'center', backgroundColor: colors.signal, borderColor: colors.black, borderRadius: 11, borderWidth: 2, justifyContent: 'center', minHeight: 54, shadowColor: colors.warning, shadowOffset: { height: 4, width: 4 }, shadowOpacity: 1, shadowRadius: 0 },
  sendButtonDisabled: { backgroundColor: colors.surfaceRaised, shadowOpacity: 0 },
  sendLabel: { color: colors.primaryInk, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  sendLabelDisabled: { color: colors.textMuted },
  footnote: { color: colors.textSubtle, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
