import type { Session, User } from '@supabase/supabase-js';
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import { AppState } from 'react-native';

import { setAppPresence } from '@/features/presence/api';
import { authCallbackUrl, handleAuthCallbackUrl } from '@/lib/auth-callback';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { Profile } from '@/types/models';
import { unregisterDevice } from '@/features/notifications/device';
import { clearAccountDrafts } from '@/lib/use-draft';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

type CompleteOnboardingInput = {
  birthDate: string;
  countryCode: string;
  displayName: string;
  handle: string;
  languages: string[];
};

type SignUpResult = {
  needsEmailConfirmation: boolean;
};

type SessionValue = {
  completeOnboarding: (input: CompleteOnboardingInput) => Promise<void>;
  deleteAccount: (currentPassword: string) => Promise<void>;
  isConfigured: boolean;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  onboardingComplete: boolean;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  updatePassword: (password: string, currentPassword?: string) => Promise<boolean>;
  user: User | null;
};

const SessionContext = createContext<SessionValue | null>(null);

function mapProfile(row: ProfileRow | null, birthDate: string | null = null): Profile | null {
  if (!row) return null;

  return {
    avatarPath: row.avatar_path,
    birthDate,
    handle: row.handle ?? '',
    displayName: row.display_name ?? '',
    country: row.country_code ?? 'Worldwide',
    languages: row.languages,
    bio: row.bio,
  };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const presenceRequestRef = useRef<Promise<unknown>>(Promise.resolve());

  const loadUserData = useCallback(async (userId: string) => {
    if (!supabase) return false;

    const [profileResult, settingsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_settings').select('onboarding_completed_at, date_of_birth').eq('id', userId).single(),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const completed = Boolean(settingsResult.data.onboarding_completed_at);
    setProfile(mapProfile(profileResult.data, settingsResult.data.date_of_birth));
    setOnboardingComplete(completed);
    return completed;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;
    let active = true;

    const initialize = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        const callbackType = await handleAuthCallbackUrl(initialUrl);
        if (callbackType === 'recovery') setIsPasswordRecovery(true);
      }

      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!active) return;

      setSession(data.session);
      if (data.session?.user) await loadUserData(data.session.user.id);
      setIsLoading(false);
    };

    void initialize().catch(() => {
      if (active) setIsLoading(false);
    });

    const authSubscription = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setIsPasswordRecovery(false);
      setSession(nextSession);

      if (!nextSession?.user) {
        setProfile(null);
        setOnboardingComplete(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      void loadUserData(nextSession.user.id).finally(() => setIsLoading(false));
    });

    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthCallbackUrl(url)
        .then((callbackType) => {
          if (callbackType === 'recovery') setIsPasswordRecovery(true);
        })
        .catch(() => undefined);
    });

    return () => {
      active = false;
      authSubscription.data.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, [loadUserData]);

  useEffect(() => {
    if (!session?.user) return;

    const queuePresenceUpdate = (active: boolean) => {
      presenceRequestRef.current = presenceRequestRef.current
        .catch(() => undefined)
        .then(() => setAppPresence(active))
        .catch(() => undefined);
    };
    const heartbeat = () => {
      if (AppState.currentState === 'active') queuePresenceUpdate(true);
    };

    heartbeat();
    const interval = setInterval(heartbeat, 10_000);
    const subscription = AppState.addEventListener('change', (state) => queuePresenceUpdate(state === 'active'));
    return () => {
      clearInterval(interval);
      subscription.remove();
      queuePresenceUpdate(false);
    };
  }, [session?.user.id]);

  const value = useMemo<SessionValue>(
    () => ({
      isConfigured: isSupabaseConfigured,
      isLoading,
      isPasswordRecovery,
      onboardingComplete,
      profile,
      session,
      user: session?.user ?? null,
      signIn: async (email, password) => {
        if (!supabase) throw new Error('Supabase is not configured.');
        setIsPasswordRecovery(false);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      requestPasswordReset: async (email) => {
        if (!supabase) throw new Error('Supabase is not configured.');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${authCallbackUrl}?intent=recovery`,
        });
        if (error) throw error;
      },
      signUp: async (email, password) => {
        if (!supabase) throw new Error('Supabase is not configured.');

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authCallbackUrl },
        });
        if (error) throw error;

        return { needsEmailConfirmation: !data.session };
      },
      signOut: async () => {
        if (!supabase) return;
        await unregisterDevice();
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
      updatePassword: async (password, currentPassword) => {
        if (!supabase) throw new Error('Supabase is not configured.');
        if (!isPasswordRecovery) {
          if (!session?.user.email || !currentPassword) throw new Error('Enter your current password first.');
          const { error: reauthenticationError } = await supabase.auth.signInWithPassword({
            email: session.user.email,
            password: currentPassword,
          });
          if (reauthenticationError) throw new Error('Your current password is incorrect.');
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        const { error: revokeError } = await supabase.auth.signOut({ scope: 'others' });
        if (revokeError) throw revokeError;
        const completed = session?.user ? await loadUserData(session.user.id) : false;
        setIsPasswordRecovery(false);
        return completed;
      },
      refreshProfile: async () => {
        if (session?.user) await loadUserData(session.user.id);
      },
      completeOnboarding: async ({ birthDate, countryCode, displayName, handle, languages }) => {
        if (!supabase) throw new Error('Supabase is not configured.');

        const { data, error } = await supabase.rpc('complete_onboarding', {
          onboarding_birth_date: birthDate,
          onboarding_country_code: countryCode,
          onboarding_display_name: displayName,
          onboarding_handle: handle,
          onboarding_languages: languages,
        });

        if (error) throw error;
        setProfile(mapProfile(data, birthDate));
        setOnboardingComplete(true);
      },
      deleteAccount: async (currentPassword) => {
        if (!supabase || !session?.user.email) throw new Error('Your account session is unavailable.');
        const { error } = await supabase.functions.invoke('delete-account', {
          body: { password: currentPassword },
        });
        if (error) throw error;

        await supabase.auth.signOut({ scope: 'local' });
        await clearAccountDrafts(session.user.id).catch(()=>{});
        setIsPasswordRecovery(false);
        setProfile(null);
        setOnboardingComplete(false);
        setSession(null);
      },
    }),
    [isLoading, isPasswordRecovery, loadUserData, onboardingComplete, profile, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);

  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
