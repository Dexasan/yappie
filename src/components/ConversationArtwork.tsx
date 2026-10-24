import { Image, StyleSheet, View } from 'react-native';

/** Original editorial illustration, bundled for offline use. */
export function ConversationArtwork({ compact = false }: { compact?: boolean }) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.art, compact && styles.compact]}><Image source={require('../../assets/art/conversation-night-print.png')} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} /></View>;
}
const styles = StyleSheet.create({
  art: { width: '100%', aspectRatio: 1.5 },
  compact: { aspectRatio: 2.8 },
});
