import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from './Typography';
import { colors, fonts } from '@/theme/tokens';

export function ClubCover({
  height,
  label,
  uri,
  width,
}: {
  height: number;
  label: string;
  uri?: string | null;
  width: number | `${number}%`;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  return (
    <View accessibilityLabel={`${label} club cover`} style={[styles.frame, { height, width }]}>
      {uri && !failed ? (
        <Image onError={() => setFailed(true)} resizeMode="cover" source={{ uri }} style={styles.image} />
      ) : (
        <View style={styles.fallback}>
          <View style={styles.fallbackBand} />
          <Text numberOfLines={2} style={styles.fallbackLabel}>{label}</Text>
          <Text style={styles.fallbackNote}>cover coming soon</Text>
        </View>
      )}
      <View pointerEvents="none" style={styles.wash} />
      <View pointerEvents="none" style={styles.inkCorner} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: colors.surfaceSoft, borderColor: colors.text, borderRadius: 7, borderWidth: 2, overflow: 'hidden', position: 'relative' },
  image: { height: '100%', width: '100%' },
  fallback: { flex: 1, justifyContent: 'flex-end', overflow: 'hidden', padding: 10 },
  fallbackBand: { backgroundColor: colors.cobaltSoft, height: 52, left: -14, position: 'absolute', right: -14, top: 14, transform: [{ rotate: '-8deg' }] },
  fallbackLabel: { color: colors.text, fontFamily: fonts.display, fontSize: 20, lineHeight: 20, textTransform: 'uppercase' },
  fallbackNote: { color: colors.textSubtle, fontSize: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  wash: { backgroundColor: 'rgba(17,17,16,0.08)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  inkCorner: { borderColor: 'rgba(241,235,221,0.68)', borderLeftWidth: 1, borderTopWidth: 1, height: 13, left: 6, position: 'absolute', top: 6, width: 13 },
});
