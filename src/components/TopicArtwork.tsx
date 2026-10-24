import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/components/Typography';
import glyphs from '@/components/topic-artwork.json';
import { getTopicIconName } from '@/features/quick-chat/topic-icons';
import { colors, fonts } from '@/theme/tokens';

/** Local vector artwork; the enclosing interest control supplies its accessible name. */
export const TopicArtwork = memo(function TopicArtwork({ label, size = 30, color = colors.accent }: {
  label: string;
  size?: number;
  color?: string;
}) {
  const icon = getTopicIconName(label);
  const letters = Array.from(label.replace(/[^\p{L}\p{N}]/gu, '')).slice(0, 2).join('').toUpperCase() || '?';
  return <View pointerEvents="none" aria-hidden accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox="-2 -2 28 28" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {icon ? glyphs[icon].map((d, index) => <Path key={index} d={d} />) : <Path d="M3 3 20 2 22 19 15 20 12 24 9 20 2 21Z" />}
    </Svg>
    {!icon ? <View style={styles.letterStamp}><Text style={{ color, fontFamily: fonts.display, fontSize: size * 0.42, lineHeight: size * 0.58 }}>{letters}</Text></View> : null}
  </View>;
});

const styles = StyleSheet.create({
  letterStamp: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 2 },
});
