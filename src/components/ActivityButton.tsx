import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { Text } from '@/components/Typography';
import { useActivity } from '@/context/ActivityContext';
import { colors, fonts } from '@/theme/tokens';

export function ActivityButton({ compact = false }: { compact?: boolean }) {
  const { summary } = useActivity();
  const count = summary?.activity_count ?? 0;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Activity, ${count} unread`} onPress={() => router.push('/activity')} style={({ pressed }) => [styles.button, compact && styles.compact, pressed && styles.pressed]}>
    <PaperSurface variant="oval" color={colors.accentSoft} ink={colors.accentSolid} />
    <View style={styles.bell}><InkDrawing motif="bell" size={32} color={colors.accent} /></View>
    {!compact ? <Text style={styles.label}>Activity</Text> : null}
    {count > 0 ? <View style={styles.badge}><Text style={styles.count}>{count > 99 ? '99+' : count}</Text></View> : null}
  </Pressable>;
}
const styles = StyleSheet.create({
  compact: { minWidth: 48, paddingHorizontal: 8 },
  button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, transform: [{ rotate: '-3deg' }] },
  bell: { transform: [{ rotate: '10deg' }] },
  label: { color: colors.text, fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.6, textTransform: 'uppercase' },
  badge: { position: 'absolute', top: -3, right: 0, minWidth: 21, minHeight: 21, borderRadius: 12, borderWidth: 2, borderColor: colors.background, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  count: { color: colors.primaryInk, fontFamily: fonts.bold, fontSize: 10 },
  pressed: { opacity: 0.75, transform: [{ rotate: '0deg' }, { scale: 0.96 }] },
});
