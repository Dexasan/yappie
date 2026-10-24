import { Redirect } from 'expo-router';
import { LaunchScreen } from '@/components/LaunchScreen';
import { useSession } from '@/context/SessionContext';
export default function Index() {
  const { isLoading, onboardingComplete, user } = useSession();
  if (isLoading) return <LaunchScreen />;
  if (!user) return <Redirect href="/auth" />;
  return <Redirect href={onboardingComplete ? '/(tabs)/quick-chat' : '/onboarding'} />;
}
