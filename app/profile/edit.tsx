import { Text, TextInput } from '@/components/Typography';
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Card, Eyebrow, Heading, Muted, PrimaryButton, Screen } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { isHandleAvailable, updateOwnProfile } from '@/features/social/api';
import { chooseAndUploadAvatar, removeAvatar } from '@/features/profile/avatar';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const languageOptions = ['English', 'Spanish', 'German', 'Italian', 'French', 'Portuguese', 'Hindi', 'Arabic', 'Nepali', 'Japanese'];

function readableProfileError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Your profile could not be updated.';
  if (message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique')) {
    return 'That username is already taken. Try another one.';
  }
  return message;
}

export default function EditProfileScreen() {
  const { profile, refreshProfile, user } = useSession();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [handle, setHandle] = useState(profile?.handle ?? '');
  const [countryCode, setCountryCode] = useState(profile?.country === 'Worldwide' ? '' : profile?.country ?? '');
  const [languages, setLanguages] = useState(profile?.languages.length ? profile.languages : ['English']);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [avatarPath, setAvatarPath] = useState(profile?.avatarPath ?? null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const normalizedHandle = useMemo(
    () => handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24),
    [handle],
  );
  const normalizedCountryCode = countryCode.trim().toUpperCase();
  const canSave = Boolean(
    user &&
    displayName.trim().length >= 2 &&
    displayName.trim().length <= 50 &&
    normalizedHandle.length >= 3 &&
    languages.length > 0 &&
    (normalizedCountryCode.length === 0 || /^[A-Z]{2}$/.test(normalizedCountryCode)) &&
    bio.trim().length <= 240 &&
    handleStatus !== 'checking' &&
    handleStatus !== 'taken' &&
    !submitting
  );

  const save = async () => {
    if (!user || !canSave) return;
    setSubmitting(true);
    setError('');

    try {
      setHandleStatus('checking');
      if (!(await isHandleAvailable(normalizedHandle))) {
        setHandleStatus('taken');
        throw new Error('That username is already taken. Try another one.');
      }
      setHandleStatus('available');
      await updateOwnProfile(user.id, {
        bio: bio.trim(),
        countryCode: normalizedCountryCode || null,
        displayName: displayName.trim(),
        handle: normalizedHandle,
        languages,
      });
      await refreshProfile();
      router.back();
    } catch (nextError) {
      setError(readableProfileError(nextError));
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

  const changePhoto = async () => {
    if (!user || avatarBusy) return;
    setAvatarBusy(true);
    setError('');
    try {
      const nextPath = await chooseAndUploadAvatar(user.id, avatarPath);
      if (nextPath) {
        setAvatarPath(nextPath);
        await refreshProfile();
      }
    } catch (nextError) {
      setError(readableProfileError(nextError));
    } finally {
      setAvatarBusy(false);
    }
  };

  const confirmRemovePhoto = () => {
    if (!user || !avatarPath || avatarBusy) return;
    Alert.alert('Remove profile picture?', 'Your initials will be shown instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setAvatarBusy(true);
          setError('');
          void removeAvatar(user.id, avatarPath)
            .then(async () => {
              setAvatarPath(null);
              await refreshProfile();
            })
            .catch((nextError: unknown) => setError(readableProfileError(nextError)))
            .finally(() => setAvatarBusy(false));
        },
      },
    ]);
  };

  if (!profile) return null;

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>Profile</Text>
        <View style={styles.topSpacer} />
      </View>

      <View style={styles.intro}>
        <Eyebrow>Make it yours</Eyebrow>
        <Heading compact>Edit profile</Heading>
      </View>

      <View style={styles.avatarPreview}>
        <Pressable accessibilityLabel="Change profile picture" disabled={avatarBusy} onPress={() => void changePhoto()} style={styles.avatarAction}>
          <Avatar label={displayName.trim() || profile.displayName} path={avatarPath} size={92} />
          <View style={styles.avatarEditBadge}>{avatarBusy ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.avatarEditGlyph}>+</Text>}</View>
        </Pressable>
        <View style={styles.avatarCopy}>
          <Text style={styles.previewName}>{displayName.trim() || 'Your name'}</Text>
          <Text style={styles.previewHandle}>@{normalizedHandle || 'username'}</Text>
          <Pressable disabled={avatarBusy} onPress={() => void changePhoto()}><Text style={styles.photoAction}>{avatarPath ? 'Change photo' : 'Choose photo'}</Text></Pressable>
          {avatarPath ? <Pressable disabled={avatarBusy} onPress={confirmRemovePhoto}><Text style={styles.removePhoto}>Remove photo</Text></Pressable> : null}
        </View>
      </View>

      <Card style={styles.form}>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          accessibilityLabel="Display name"
          autoCapitalize="words"
          maxLength={50}
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
          {handleStatus === 'checking' ? 'Checking…' : handleStatus === 'taken' ? 'Already taken' : handleStatus === 'available' ? `@${normalizedHandle} is available` : 'Your @username is unique'}
        </Text>

        <Text style={styles.label}>Bio</Text>
        <TextInput
          accessibilityLabel="Bio"
          maxLength={240}
          multiline
          onChangeText={setBio}
          placeholder="What are you curious about?"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.bioInput]}
          textAlignVertical="top"
          value={bio}
        />
        <Text style={styles.characterCount}>{bio.length}/240</Text>

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

        <View style={styles.labelRow}><Text style={styles.label}>Languages</Text><Text style={styles.helper}>Choose up to 4</Text></View>
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

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </Card>

      <PrimaryButton disabled={!canSave} label={submitting ? 'Saving…' : 'Save profile'} onPress={() => void save()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  backButton: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
  backGlyph: { color: colors.text, fontSize: 30, fontWeight: '500', lineHeight: 32 },
  topTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  topSpacer: { width: 42 },
  intro: { gap: spacing.sm, marginBottom: spacing.xl, marginTop: spacing.xl },
  avatarPreview: { alignItems: 'center', backgroundColor: colors.surfaceSoft, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.lg, padding: spacing.lg },
  avatarAction: { position: 'relative' },
  avatarEditBadge: { alignItems: 'center', backgroundColor: colors.signal, borderColor: colors.surfaceSoft, borderRadius: 17, borderWidth: 3, bottom: -2, height: 34, justifyContent: 'center', position: 'absolute', right: -2, width: 34 },
  avatarEditGlyph: { color: colors.black, fontSize: 23, fontWeight: '900', lineHeight: 25 },
  avatarCopy: { flex: 1, gap: 2 },
  previewName: { fontFamily: fonts.display, color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.45 },
  previewHandle: { color: colors.link, fontSize: 13, fontWeight: '800', marginBottom: spacing.xs },
  photoAction: { color: colors.signal, fontSize: 14, fontWeight: '900', marginTop: 3 },
  removePhoto: { color: colors.danger, fontSize: 13, fontWeight: '800', marginTop: 3 },
  form: { backgroundColor: colors.surfaceSoft, gap: spacing.md, marginBottom: spacing.lg },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: spacing.xs },
  labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  helper: { color: colors.textSubtle, fontSize: 13, fontWeight: '700' },
  input: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 52, paddingHorizontal: spacing.lg },
  bioInput: { minHeight: 116, paddingTop: spacing.md },
  characterCount: { color: colors.textSubtle, fontSize: 13, fontWeight: '700', marginTop: -spacing.sm, textAlign: 'right' },
  handleRow: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 52, paddingHorizontal: spacing.lg },
  at: { color: colors.text, fontSize: 17, fontWeight: '800' },
  handleInput: { color: colors.text, flex: 1, fontSize: 16, paddingLeft: spacing.xs },
  handleStatus: { color: colors.textSubtle, fontSize: 12, marginTop: -spacing.sm },
  handleTaken: { color: colors.danger, fontWeight: '800' },
  handleAvailable: { color: colors.success, fontWeight: '800' },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 9 },
  choiceSelected: { backgroundColor: colors.cobaltSoft, borderColor: colors.border },
  choiceDisabled: { opacity: 0.4 },
  choiceText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  choiceTextSelected: { color: colors.link },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
