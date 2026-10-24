import { Text } from '@/components/Typography';
import { Image, StyleSheet, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme/tokens';

const yappieLogo = require('../../assets/brand/yappie-mark.png');

export function BrandMark({ size = 48 }: { size?: number }) {
  return <Image accessibilityLabel="Yappie" resizeMode="contain" source={yappieLogo} style={{ height: size, width: size }} />;
}

export function BrandLockup({ compact = false, inverted = false }: { compact?: boolean; inverted?: boolean }) {
  return (
    <View style={[styles.lockup, compact && styles.lockupCompact]}>
      <BrandMark size={compact ? 42 : 64} />
      <View style={styles.wordmarkCopy}>
        <Text style={[styles.wordmark, compact && styles.wordmarkCompact, inverted && styles.inverted]}>YAPPIE<Text style={styles.wordmarkDot}>.</Text></Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  lockupCompact: { gap: spacing.sm },
  wordmarkCopy: { gap: 1 },
  wordmark: { color: colors.text, fontFamily: fonts.display, fontSize: 52, letterSpacing: -1.5, lineHeight: 57 },
  wordmarkCompact: { fontSize: 34, letterSpacing: -0.8, lineHeight: 40 },
  wordmarkDot: { color: colors.accent },
  tagline: { color: colors.textMuted, fontFamily: fonts.italic, fontSize: 17 },
  inverted: { color: colors.white },
  invertedMuted: { color: '#D7D3C9' },
});
