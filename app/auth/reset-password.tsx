import { Text, TextInput } from '@/components/Typography';
import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BrandLockup } from '@/components/Brand';
import { Card, Eyebrow, Heading, Muted, PrimaryButton, Screen } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { colors, radius, spacing } from '@/theme/tokens';

export default function ResetPasswordScreen() {
  const { isLoading, isPasswordRecovery, onboardingComplete, updatePassword, user } = useSession();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isLoading && !user) return <Redirect href="/auth" />;
  if (!isLoading && user && !isPasswordRecovery) {
    return <Redirect href={onboardingComplete ? '/(tabs)/quick-chat' : '/onboarding'} />;
  }

  const canSubmit = password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password) && password === confirmation && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const profileWasAlreadyComplete = await updatePassword(password);
      router.replace(profileWasAlreadyComplete ? '/(tabs)/quick-chat' : '/onboarding');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not update your password.');
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <BrandLockup compact />
      <View style={styles.hero}>
        <Eyebrow>Account recovery</Eyebrow>
        <Heading>Choose a new password.</Heading>
        <Muted>Use at least ten characters with a letter and number. Avoid reusing another password.</Muted>
      </View>
      <Card style={styles.form}>
        <Text style={styles.label}>New password</Text>
        <TextInput
          accessibilityLabel="New password"
          autoCapitalize="none"
          autoComplete="new-password"
          onChangeText={setPassword}
          placeholder="10+ characters, letter + number"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          accessibilityLabel="Confirm new password"
          autoCapitalize="none"
          autoComplete="new-password"
          onChangeText={setConfirmation}
          placeholder="Repeat your new password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          style={styles.input}
          value={confirmation}
        />
        {confirmation.length > 0 && password !== confirmation ? <Text style={styles.error}>The passwords do not match.</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton disabled={!canSubmit} label={submitting ? 'Updating…' : 'Update password'} onPress={() => void submit()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md, marginBottom: spacing.xl, marginTop: spacing.xxl },
  form: { backgroundColor: colors.surface, gap: spacing.md },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: spacing.xs },
  input: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 54, paddingHorizontal: spacing.lg },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
