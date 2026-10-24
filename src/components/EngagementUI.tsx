import type { PropsWithChildren } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { SwitchProps } from 'react-native';
import { Text } from '@/components/Typography';
import { InkDrawing, InkRule, type InkMotif } from '@/components/InkArtwork';
import { colors, fonts } from '@/theme/tokens';

export function FeatureHeader({ title, eyebrow, description, motif, tone = colors.accent }: { title: string; eyebrow?: string; description?: string; motif: InkMotif; tone?: string }) {
  const compact = useWindowDimensions().width < 360;
  return <View style={styles.header}>
    <View style={styles.top}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}</View>
    <View style={styles.hero}><View style={styles.heroCopy}><Text style={[styles.title, compact && { fontSize: 36, lineHeight: 40 }]}>{title}</Text>{description ? <Text style={[styles.description, compact && { fontSize: 20, lineHeight: 24 }]}>{description}</Text> : null}</View><View style={styles.art}><InkDrawing motif={motif} size={compact ? 52 : 70} color={tone} /></View></View>
    <InkRule />
  </View>;
}
export function InkAction({ label, onPress, disabled = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, disabled && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}><Text style={[styles.actionText, danger && { color: colors.danger }]}>{label}</Text><Text style={[styles.actionArrow, danger && { color: colors.danger }]}>↗</Text></Pressable>;
}
export function FeatureNotice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  return <Text accessibilityRole="alert" style={[styles.notice, error && { color: colors.danger, borderLeftColor: colors.danger }]}>{children}</Text>;
}
export function InkToggle({ value = false, onValueChange, disabled = false, accessibilityLabel, trackColor, thumbColor = colors.primary }: Pick<SwitchProps, 'value' | 'onValueChange' | 'disabled' | 'accessibilityLabel' | 'trackColor' | 'thumbColor'>) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onValueChange?.(!value)} style={[styles.toggleTouch, disabled && { opacity: 0.4 }]}><View style={[styles.toggleTrack, { backgroundColor: value ? trackColor?.true ?? colors.accentSolid : trackColor?.false ?? colors.border }]}><View style={[styles.toggleThumb, { backgroundColor: thumbColor, transform: [{ translateX: value ? 20 : 0 }] }]} /></View></Pressable>;
}
const styles = StyleSheet.create({
  toggleTouch: { minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  toggleTrack: { width: 50, height: 30, borderRadius: 16, padding: 4 },
  toggleThumb: { width: 22, height: 22, borderRadius: 12 },
  header: { marginBottom: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 },
  back: { width: 46, height: 46, borderRadius: 24, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.text, fontSize: 31, lineHeight: 34 },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', flexShrink: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 18 },
  heroCopy: { flex: 1 },
  title: { fontFamily: fonts.display, fontSize: 46, lineHeight: 48, color: colors.text, textTransform: 'uppercase' },
  description: { fontFamily: fonts.italic, fontSize: 22, lineHeight: 26, color: colors.textMuted, marginTop: 8 },
  art: { transform: [{ rotate: '-9deg' }] },
  action: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  actionText: { color: colors.accent, fontFamily: fonts.display, fontSize: 21, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 1 },
  actionArrow: { color: colors.accent, fontSize: 23 },
  notice: { color: colors.signal, borderLeftColor: colors.signal, borderLeftWidth: 2, paddingLeft: 12, marginVertical: 12, fontSize: 13, lineHeight: 20 },
});
