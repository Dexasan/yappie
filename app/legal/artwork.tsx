import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { InkDrawing } from '@/components/InkArtwork';
import { Text } from '@/components/Typography';
import { Heading, Muted, Screen } from '@/components/ui';
import { colors, fonts } from '@/theme/tokens';
import notices from '../../assets/topic-icons/notices.json';

export default function ArtworkCredits() {
  return <Screen>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>← Back</Text></Pressable>
    <InkDrawing motif="flower" size={52} />
    <Heading>Behind the drawings.</Heading>
    <Muted>Yap's topic icons feature Sketchyicons, based on Lucide and Feather, and sports artwork from Lucide Lab. YAPPIE's logo, decorative illustrations, and skateboard are original artwork.</Muted>
    {notices.map(notice => <View key={notice.heading} style={styles.section}><Text style={styles.title}>{notice.heading}</Text><Text selectable style={styles.body}>{notice.body}</Text></View>)}
  </Screen>;
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 12 },
  backText: { color: colors.text, fontSize: 14 },
  section: { marginTop: 28, gap: 12 },
  title: { color: colors.text, fontFamily: fonts.editorial, fontSize: 28 },
  body: { color: colors.textMuted, fontSize: 12, lineHeight: 19 },
});
