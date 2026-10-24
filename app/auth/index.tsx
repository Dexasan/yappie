import { Text, TextInput } from '@/components/Typography';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrandLockup } from '@/components/Brand';
import { ConversationArtwork } from '@/components/ConversationArtwork';
import { Card, Pill, PrimaryButton, Screen } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { safeReturnTarget } from '@/lib/navigation-target';

type AuthMode = 'sign-in' | 'sign-up';

function readableAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  if (message.toLowerCase().includes('invalid login')) return 'The email or password is incorrect.';
  if (message.toLowerCase().includes('already registered')) return 'An account already exists for this email.';
  if (message.toLowerCase().includes('rate limit')) return 'Too many attempts. Wait a moment and try again.';
  return message;
}

export default function AuthScreen() {
  const { returnTo } = useLocalSearchParams<{returnTo?: string}>();
  const { isConfigured, isLoading, onboardingComplete, requestPasswordReset, signIn, signUp, user } = useSession();
  const [mode, setMode] = useState<AuthMode>('sign-up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!isLoading && user) {
    return <Redirect href={onboardingComplete ? safeReturnTarget(returnTo) ?? '/(tabs)/quick-chat' : '/onboarding'} />;
  }

  const strongSignUpPassword = password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password);
  const canSubmit = isConfigured && email.trim().includes('@') && (mode === 'sign-up' ? strongSignUpPassword : password.length > 0) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      if (mode === 'sign-in') {
        await signIn(email.trim().toLowerCase(), password);
      } else {
        const result = await signUp(email.trim().toLowerCase(), password);
        if (result.needsEmailConfirmation) {
          setNotice('Check your email and tap the YAPPIE confirmation link to continue.');
        }
      }
    } catch (nextError) {
      setError(readableAuthError(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode((current) => (current === 'sign-up' ? 'sign-in' : 'sign-up'));
    setError('');
    setNotice('');
  };

  const sendResetLink = async () => {
    if (!email.trim().includes('@') || submitting) {
      setError('Enter your email first, then request a reset link.');
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setNotice('Password reset link sent. Open it on this device to choose a new password.');
    } catch (nextError) {
      setError(readableAuthError(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <BrandLockup compact />
        <Pill label="Early access" tone="accent" />
      </View>
      <View style={styles.intro}>
        <ConversationArtwork compact />
        <Text style={styles.introEyebrow}>{mode === 'sign-up' ? 'GOOD COMPANY STARTS HERE' : 'WELCOME BACK'}</Text>
        <Text style={styles.introTitle}>{mode === 'sign-up' ? 'GOOD COMPANY.\nGREAT STORIES.' : 'BACK FOR\nANOTHER HELLO.'}</Text>
      </View>

      <View style={styles.promiseRow}>
        <View style={[styles.promise, styles.promiseSignal]}><Text style={styles.promiseValue}>1:1</Text><Text style={styles.promiseLabel}>Real chats</Text></View>
        <View style={[styles.promise, styles.promiseCobalt]}><Text style={[styles.promiseValue, styles.promiseValueLight]}>Clubs</Text><Text style={[styles.promiseLabel, styles.promiseLabelLight]}>Your people</Text></View>
        <View style={[styles.promise, styles.promiseOrange]}><Text style={styles.promiseValue}>Live</Text><Text style={styles.promiseLabel}>Open calls</Text></View>
      </View>

      <Card style={styles.form}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={email}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          onChangeText={setPassword}
          placeholder={mode === 'sign-up' ? '10+ characters, letter + number' : 'Your password'}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {mode === 'sign-in' ? (
          <Pressable accessibilityRole="button" onPress={() => void sendResetLink()} style={styles.forgotButton}>
            <Text style={styles.forgotLabel}>Forgot password?</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {!isConfigured ? <Text style={styles.error}>Backend configuration is missing.</Text> : null}

        <PrimaryButton
          disabled={!canSubmit}
          label={submitting ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
          onPress={submit}
        />
      </Card>

      <Pressable accessibilityRole="button" onPress={switchMode} style={styles.switchButton}>
        <Text style={styles.switchMuted}>{mode === 'sign-up' ? 'Already have an account?' : 'New here?'}</Text>
        <Text style={styles.switchAction}>{mode === 'sign-up' ? ' Sign in' : ' Create account'}</Text>
      </Pressable>
      <View style={styles.policyBlock}>
        <Text style={styles.privacy}>By continuing, you agree to our policies. Age eligibility is verified during profile setup.</Text>
        <View style={styles.policyLinks}>
          <Pressable onPress={() => router.push({ pathname: '/legal/[document]', params: { document: 'terms' } })}><Text style={styles.policyLink}>Terms</Text></Pressable>
          <Text style={styles.policyDot}>·</Text>
          <Pressable onPress={() => router.push({ pathname: '/legal/[document]', params: { document: 'privacy' } })}><Text style={styles.policyLink}>Privacy</Text></Pressable>
          <Text style={styles.policyDot}>·</Text>
          <Pressable onPress={() => router.push({ pathname: '/legal/[document]', params: { document: 'community-guidelines' } })}><Text style={styles.policyLink}>Guidelines</Text></Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  intro: { gap: 10, marginTop: 22 },
  introTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  introEyebrow: { color: colors.accent, fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  introTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 53, letterSpacing: -0.5, lineHeight: 54 },
  introCopy: { color: colors.textMuted, fontFamily: fonts.italic, fontSize: 25, lineHeight: 29 },
  promiseRow: { alignItems: 'stretch', borderTopColor: colors.primary, borderTopWidth: 1, borderBottomColor: colors.primary, borderBottomWidth: 1, flexDirection: 'row', marginVertical: 22 },
  promise: { alignItems: 'center', flex: 1, gap: 5, justifyContent: 'center', minHeight: 68, paddingHorizontal: 5 },
  promiseSignal: { backgroundColor: 'transparent' },
  promiseCobalt: { backgroundColor: 'transparent', borderLeftColor: colors.border, borderLeftWidth: 1, borderRightColor: colors.border, borderRightWidth: 1 },
  promiseOrange: { backgroundColor: 'transparent' },
  promiseValue: { color: colors.text, fontFamily: fonts.display, fontSize: 24, textTransform: 'uppercase' },
  promiseValueLight: { color: colors.text },
  promiseLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '500', textAlign: 'center' },
  promiseLabelLight: { color: colors.textMuted },
  form: { backgroundColor: 'transparent', borderWidth: 0, gap: 12, padding: 0 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
  input: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: 4, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 54, paddingHorizontal: 16 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  notice: { backgroundColor: colors.successSoft, borderRadius: radius.sm, color: colors.success, fontSize: 14, lineHeight: 21, padding: spacing.md },
  forgotButton: { alignSelf: 'flex-end', marginTop: -spacing.xs, paddingVertical: spacing.xs },
  forgotLabel: { color: colors.cobalt, fontSize: 14, fontWeight: '900' },
  switchButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  switchMuted: { color: colors.textMuted, fontSize: 15 },
  switchAction: { color: colors.cobalt, fontSize: 15, fontWeight: '900' },
  policyBlock: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  privacy: { color: colors.textSubtle, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  policyLinks: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  policyLink: { color: colors.text, fontSize: 13, fontWeight: '900' },
  policyDot: { color: colors.textSubtle, fontSize: 13 },
});
