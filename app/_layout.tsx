import 'react-native-gesture-handler';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic';

import { SessionProvider } from '@/context/SessionContext';
import { CallProvider } from '@/context/CallContext';
import { ActivityProvider } from '@/context/ActivityContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { AnalyticsProvider } from '@/context/AnalyticsContext';
import { trackEvent } from '@/features/analytics/api';
import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Typography';
import { colors, fonts } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({retry}:ErrorBoundaryProps) {
  useEffect(()=>{trackEvent('render_error','app');},[]);
  return <View style={{flex:1,justifyContent:'center',padding:32,backgroundColor:colors.background}}><Text style={{color:colors.text,fontSize:22}}>Something went wrong.</Text><Pressable accessibilityRole="button" onPress={retry} style={{paddingVertical:20}}><Text style={{color:colors.accent}}>Try again</Text></Pressable></View>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_700Bold, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic });
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, []);
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <AnalyticsProvider>
        <ActivityProvider>
        <NotificationProvider>
        <CallProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerShown: false }} />
        </CallProvider>
        </NotificationProvider>
        </ActivityProvider>
        </AnalyticsProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
