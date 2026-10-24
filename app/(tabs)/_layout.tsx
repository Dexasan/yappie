import { Redirect, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabArtwork } from '@/components/TabArtwork';
import { NavigationArtwork } from '@/components/InkArtwork';
import { colors, fonts } from '@/theme/tokens';
import { useSession } from '@/context/SessionContext';
import { useActivity } from '@/context/ActivityContext';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { summary } = useActivity();
  const { isLoading, onboardingComplete, user } = useSession();
  if (!isLoading && !user) return <Redirect href="/auth" />;
  if (!isLoading && user && !onboardingComplete) return <Redirect href="/onboarding" />;
  return <Tabs initialRouteName="quick-chat" screenOptions={({ route }) => ({
    headerShown: false,
    tabBarHideOnKeyboard: true,
    tabBarBackground: () => <NavigationArtwork />,
    tabBarActiveTintColor: colors.text,
    tabBarInactiveTintColor: colors.textSubtle,
    tabBarIcon: ({ focused }) => <TabArtwork focused={focused} name={route.name} />,
    tabBarIconStyle: styles.icon,
    tabBarItemStyle: styles.tabItem,
    tabBarLabelStyle: styles.label,
    tabBarStyle: [styles.tabBar, { height: 82 + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8) }],
  })}>
    <Tabs.Screen name="quick-chat" options={{ title: 'Yap' }} />
    <Tabs.Screen name="feed" options={{ title: 'Discover', tabBarAccessibilityLabel: summary?.global_new || summary?.following_new ? 'Discover, new posts available' : 'Discover', tabBarBadge: summary?.global_new || summary?.following_new ? '' : undefined, tabBarBadgeStyle: { backgroundColor: colors.danger, minWidth: 9, maxWidth: 9, height: 9 } }} />
    <Tabs.Screen name="clubs" options={{ title: 'Clubs' }} />
    <Tabs.Screen name="messages" options={{ title: 'Inbox', tabBarAccessibilityLabel: `Inbox, ${summary?.message_count ?? 0} unread messages`, tabBarBadge: summary?.message_count ? (summary.message_count > 99 ? '99+' : summary.message_count) : undefined, tabBarBadgeStyle: { backgroundColor: colors.danger, color: colors.white } }} />
    <Tabs.Screen name="profile" options={{ title: 'Me' }} />
  </Tabs>;
}
const styles = StyleSheet.create({
  tabBar: { backgroundColor: 'transparent', borderTopWidth: 0, bottom: 0, paddingHorizontal: 8, paddingTop: 8, position: 'absolute', elevation: 0, shadowOpacity: 0 },
  tabItem: { paddingTop: 0 },
  icon: { width: 60, height: 50 },
  label: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1, marginTop: 1, textTransform: 'uppercase' },
});
