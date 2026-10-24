import { Text, TextInput } from '@/components/Typography';
import { useMemo, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrandLockup } from '@/components/Brand';
import { Card, Eyebrow, Heading, Muted, PrimaryButton, Screen } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { isHandleAvailable } from '@/features/social/api';
import { colors, radius, spacing } from '@/theme/tokens';

const languageOptions = ['English', 'Spanish', 'German', 'Italian', 'French', 'Portuguese', 'Hindi', 'Arabic', 'Nepali', 'Japanese'];

function isValidAdultBirthDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birthDate = new Date(year, month - 1, day);
  if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day) return false;

  const today = new Date();
  const adultCutoff = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  return birthDate <= adultCutoff;
}

function readableOnboardingError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Profile setup failed. Please try again.';
  if (message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique')) {
    return 'That username is already taken. Try another one.';
  }
  return message;
}

export default function OnboardingScreen() {
  const { completeOnboarding, isLoading, onboardingComplete, user } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [languages, setLanguages] = useState(['English']);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const normalizedHandle = useMemo(
    () => handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
    [handle],
  );
  const normalizedCountryCode = countryCode.trim().toUpperCase();
  const countryCodeValid = normalizedCountryCode.length === 0 || /^[A-Z]{2}$/.test(normalizedCountryCode);
  const canContinue =
    displayName.trim().length >= 2 &&
    normalizedHandle.length >= 3 &&
    isValidAdultBirthDate(birthDate) &&
    countryCodeValid &&
    languages.length > 0 &&
    termsAccepted &&
    handleStatus !== 'checking' &&
    handleStatus !== 'taken' &&
    !submitting;

  if (!isLoading && !user) return <Redirect href="/auth" />;
  if (!isLoading && onboardingComplete) return <Redirect href="/(tabs)/quick-chat" />;

  const finish = async () => {
    if (!canContinue) return;
    setSubmitting(true);
    setError('');

    try {
      setHandleStatus('checking');
      if (!(await isHandleAvailable(normalizedHandle))) {
        setHandleStatus('taken');
        throw new Error('That username is already taken. Try another one.');
      }
      setHandleStatus('available');
      await completeOnboarding({
        birthDate,
        countryCode: normalizedCountryCode,
        displayName: displayName.trim(),
        handle: normalizedHandle,
        languages,
      });
      router.replace('/(tabs)/quick-chat');
    } catch (nextError) {
      setError(readableOnboardingError(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  const checkUsername = async () => {
    if (normalizedHandle.length < 3) {
      setHandleStatus('idle');
      return;
    }
    setHandleStatus('checking');
    try {
      setHandleStatus(await isHandleAvailable(normalizedHandle) ? 'available' : 'taken');
    } catch {
      setHandleStatus('idle');
    }
  };

  return (
    <Screen>
      <BrandLockup compact />
      <View style={styles.topRow}>
        <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
      </View>
      <View style={styles.intro}>
        <Eyebrow>Make your first impression</Eyebrow>
        <Heading>Set up your profile</Heading>
        <Muted>Your email and birth date stay private.</Muted>
      </View>

      <Card style={styles.form}>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          accessibilityLabel="Display name"
          autoCapitalize="words"
          onChangeText={setDisplayName}
          placeholder="Alex"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={displayName}
        />

        <Text style={styles.label}>Username</Text>
        <View style={styles.handleRow}>
          <Text style={styles.at}>@</Text>
          <TextInput
            accessibilityLabel="Username"
            autoCapitalize="none"
            maxLength={25}
            onBlur={() => void checkUsername()}
            onChangeText={(value) => {
              setHandle(value.replace(/^@+/, ''));
              setHandleStatus('idle');
            }}
            placeholder="alexaroundtheworld"
            placeholderTextColor={colors.textMuted}
            style={styles.handleInput}
            value={handle}
          />
        </View>
        <Text style={[styles.handleStatus, handleStatus === 'taken' && styles.handleTaken, handleStatus === 'available' && styles.handleAvailable]}>
          {handleStatus === 'checking' ? 'Checking…' : handleStatus === 'taken' ? 'Already taken' : handleStatus === 'available' ? `@${normalizedHandle} is yours` : 'One unique @username per person'}
        </Text>

        <View style={styles.splitRow}>
          <View style={styles.splitField}>
            <Text style={styles.label}>Birth date</Text>
            <TextInput
              accessibilityLabel="Birth date in year month day format"
              inputMode="numeric"
              maxLength={10}
              onChangeText={setBirthDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={birthDate}
            />
          </View>
          <View style={styles.countryField}>
            <Text style={styles.label}>Country</Text>
            <TextInput
              accessibilityLabel="Optional two-letter country code"
              autoCapitalize="characters"
              maxLength={2}
              onChangeText={setCountryCode}
              placeholder="DE"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={countryCode}
            />
          </View>
        </View>
        {birthDate.length === 10 && !isValidAdultBirthDate(birthDate) ? (
          <Text style={styles.error}>Enter a valid birth date. You must be at least 18.</Text>
        ) : null}

        <View style={styles.labelRow}>
          <Text style={styles.label}>Languages</Text>
          <Text style={styles.helper}>Choose up to 4</Text>
        </View>
        <View style={styles.languages}>
          {languageOptions.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: languages.includes(option), disabled: !languages.includes(option) && languages.length >= 4 }}
              disabled={!languages.includes(option) && languages.length >= 4}
              onPress={() => setLanguages((current) => current.includes(option)
                ? current.length > 1 ? current.filter((item) => item !== option) : current
                : [...current, option])}
              style={[styles.choice, languages.includes(option) && styles.choiceSelected, !languages.includes(option) && languages.length >= 4 && styles.choiceDisabled]}
            >
              <Text style={[styles.choiceText, languages.includes(option) && styles.choiceTextSelected]}>{option}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
          onPress={() => setTermsAccepted((current) => !current)}
          style={styles.ageRow}
        >
          <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
            {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.ageText}>I confirm these details are accurate, I am at least 18, and I agree to the app policies.</Text>
        </Pressable>
        <View style={styles.policyLinks}>
          <Pressable onPress={() => router.push({ pathname: '/legal/[document]', params: { document: 'terms' } })}><Text style={styles.policyLink}>Terms</Text></Pressable>
          <Text style={styles.policyDot}>·</Text>
          <Pressable onPress={() => router.push({ pathname: '/legal/[document]', params: { document: 'privacy' } })}><Text style={styles.policyLink}>Privacy</Text></Pressable>
          <Text style={styles.policyDot}>·</Text>
          <Pressable onPress={() => router.push({ pathname: '/legal/[document]', params: { document: 'community-guidelines' } })}><Text style={styles.policyLink}>Community Guidelines</Text></Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      <PrimaryButton disabled={!canContinue} label={submitting ? 'Saving profile…' : 'Continue'} onPress={finish} />
      <Text style={styles.privacy}>Your precise location is never collected or displayed.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
  progressTrack: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, height: 10, overflow: 'hidden', width: 142 },
  progressFill: { backgroundColor: colors.signal, borderRadius: radius.pill, height: '100%', width: '82%' },
  step: { color: colors.textMuted, fontSize: 13, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  intro: { borderTopColor: colors.primary, borderTopWidth: 1.5, borderBottomColor: colors.primary, borderBottomWidth: 1.5, gap: 12, marginBottom: 24, marginTop: 24, paddingVertical: 24 },
  form: { backgroundColor: 'transparent', borderWidth: 0, padding: 0, gap: 12, marginBottom: 24 },
  label: { color: colors.textMuted, fontSize: 14, fontWeight: '900', marginTop: spacing.xs },
  labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  helper: { color: colors.textSubtle, fontSize: 13, fontWeight: '700' },
  input: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: 4, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 54, paddingHorizontal: 16 },
  handleRow: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: 4, borderWidth: 1, flexDirection: 'row', minHeight: 54, paddingHorizontal: 16 },
  at: { color: colors.cobalt, fontSize: 19, fontWeight: '900' },
  handleInput: { color: colors.text, flex: 1, fontSize: 17, paddingLeft: spacing.xs },
  handleStatus: { color: colors.textSubtle, fontSize: 12, marginTop: -spacing.sm },
  handleTaken: { color: colors.danger, fontWeight: '800' },
  handleAvailable: { color: colors.success, fontWeight: '800' },
  splitRow: { flexDirection: 'row', gap: spacing.md },
  splitField: { flex: 1 },
  countryField: { width: 96 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 11 },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceDisabled: { opacity: 0.4 },
  choiceText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
  choiceTextSelected: { color: colors.primaryInk },
  ageRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  checkbox: { alignItems: 'center', borderColor: colors.borderStrong, borderRadius: 8, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.primaryInk, fontWeight: '900' },
  ageText: { color: colors.textMuted, flex: 1, fontSize: 14, lineHeight: 21 },
  policyLinks: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  policyLink: { color: colors.cobalt, fontSize: 13, fontWeight: '800' },
  policyDot: { color: colors.textSubtle, fontSize: 13 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  privacy: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.md, textAlign: 'center' },
});
