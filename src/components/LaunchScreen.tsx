import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandMark } from './Brand';
import { ArtCanvas, InkDrawing, InkRule } from './InkArtwork';
import { Text } from './Typography';
import { colors, fonts } from '@/theme/tokens';

export function LaunchScreen() {
  const { height } = useWindowDimensions();
  const compact = height < 650;
  return <SafeAreaView style={styles.screen}>
    <ArtCanvas />
    <View style={styles.top}><InkDrawing motif="spark" size={26} color={colors.signal} /></View>
    <View style={styles.stage}>
      <View style={[styles.orbit, compact && { height: 150 }]}>
        <View style={styles.planet}><InkDrawing motif="planet" size={compact ? 74 : 96} color={colors.cobalt} /></View>
        <View style={styles.mark}><BrandMark size={compact ? 124 : 164} /></View>
        <View style={styles.flower}><InkDrawing motif="flower" size={compact ? 62 : 84} color={colors.signal} /></View>
      </View>
      <Text style={[styles.title, compact && { fontSize: 84, lineHeight: 88 }]}>YAPPIE<Text style={styles.dot}>.</Text></Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel="Loading Yappie" accessibilityLiveRegion="polite" style={styles.footer}>
      <InkRule /><View style={styles.loadingRow}><ActivityIndicator color={colors.accent} size="small" /><Text style={styles.loading}>Loading Yappie</Text><Text style={styles.dots}>···</Text></View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 26, overflow: 'hidden' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 18 },
  edition: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 2, color: colors.textMuted },
  stage: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 16 },
  orbit: { width: '100%', maxWidth: 370, height: 198, alignItems: 'center', justifyContent: 'center' },
  mark: { transform: [{ rotate: '-8deg' }] },
  planet: { position: 'absolute', top: 2, left: -12, transform: [{ rotate: '-16deg' }] },
  flower: { position: 'absolute', bottom: 5, right: -7, transform: [{ rotate: '19deg' }] },
  title: { fontFamily: fonts.display, fontSize: 106, lineHeight: 111, letterSpacing: -2.5, color: colors.text, textAlign: 'center' },
  dot: { color: colors.accent },
  tagline: { fontFamily: fonts.editorial, fontSize: 32, lineHeight: 35, textAlign: 'center', color: colors.text, marginTop: 8 },
  secondLine: { fontFamily: fonts.italic, color: colors.cobalt },
  note: { marginTop: 28, paddingVertical: 12, paddingHorizontal: 22, flexDirection: 'row', gap: 12, alignItems: 'center', transform: [{ rotate: '-4deg' }] },
  noteText: { color: colors.text, fontFamily: fonts.italic, fontSize: 23 },
  footer: { paddingBottom: 22, gap: 8 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loading: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12, letterSpacing: 1 },
  dots: { marginLeft: 'auto', color: colors.accent, fontSize: 30, lineHeight: 30, letterSpacing: 3 },
});
