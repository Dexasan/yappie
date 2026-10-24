import { InkDrawing } from '@/components/InkArtwork';
import { Text, TextInput } from '@/components/Typography';
import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

import { Card, Muted, Pill, PrimaryButton, Screen, SectionHeader } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

function readableError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  if (error.message.toLowerCase().includes('same password')) return 'Choose a password you have not used for this account.';
  return error.message || fallback;
}

export default function AccountSettingsScreen() {
  const { deleteAccount, updatePassword, user } = useSession();
  const [newPassword, setNewPassword] = useState('');
  const [changeCurrentPassword, setChangeCurrentPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const passwordReady = changeCurrentPassword.length > 0 && newPassword.length >= 10 && /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword) && newPassword === confirmation && !savingPassword;
  const deletionReady = currentPassword.length > 0 && deletePhrase.trim().toUpperCase() === 'DELETE' && !deleting;

  const savePassword = async () => {
    if (!passwordReady) return;
    setSavingPassword(true);
    setPasswordError('');
    setPasswordNotice('');
    try {
      await updatePassword(newPassword, changeCurrentPassword);
      setChangeCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setPasswordNotice('Your password has been updated.');
    } catch (error) {
      setPasswordError(readableError(error, 'Could not update your password.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const permanentlyDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount(currentPassword);
      router.replace('/auth');
    } catch (error) {
      setDeleteError(readableError(error, 'Could not delete your account.'));
      setDeleting(false);
    }
  };

  const confirmDeletion = () => {
    if (!deletionReady) return;
    Alert.alert(
      'Permanently delete account?',
      'This cannot be undone. Your profile, posts, messages, owned clubs, and account access will be removed.',
      [
        { text: 'Keep account', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: () => void permanentlyDelete() },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.backButton}><Text style={styles.backGlyph}>‹</Text></Pressable>
        <Text style={styles.topTitle}>Settings</Text>
        <View style={styles.topSpacer} />
      </View>

      <SectionHeader title="Notifications" />
      <Pressable accessibilityRole="button" accessibilityLabel="Notification settings" onPress={() => router.push('/settings/notifications')} style={styles.notificationRow}>
        <InkDrawing motif="bell" size={44} color={colors.accent} />
        <View style={{ flex: 1 }}><Text style={styles.notificationTitle}>Notification settings</Text><Muted>Alerts, quiet hours & previews</Muted></View>
        <Text style={styles.notificationArrow}>↗</Text>
      </Pressable>

      <SectionHeader title="Account" />
      <Card style={styles.identityCard}>
        <View style={styles.identityCopy}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <Text selectable style={styles.email}>{user?.email ?? 'Unavailable'}</Text>
        </View>
        <Pill label="Private" tone="success" />
      </Card>

      <SectionHeader title="Change password" />
      <Card style={styles.formCard}>
        <Muted>Use at least ten characters with a letter and number. Other signed-in devices will be logged out.</Muted>
        <Text style={styles.fieldLabel}>Current password</Text>
        <TextInput
          accessibilityLabel="Current password before changing it"
          autoCapitalize="none"
          autoComplete="current-password"
          onChangeText={setChangeCurrentPassword}
          placeholder="Confirm it is really you"
          placeholderTextColor={colors.textSubtle}
          secureTextEntry
          style={styles.input}
          value={changeCurrentPassword}
        />
        <Text style={styles.fieldLabel}>New password</Text>
        <TextInput
          accessibilityLabel="New password"
          autoCapitalize="none"
          autoComplete="new-password"
          onChangeText={setNewPassword}
          placeholder="10+ characters, letter + number"
          placeholderTextColor={colors.textSubtle}
          secureTextEntry
          style={styles.input}
          value={newPassword}
        />
        <Text style={styles.fieldLabel}>Confirm new password</Text>
        <TextInput
          accessibilityLabel="Confirm new password"
          autoCapitalize="none"
          autoComplete="new-password"
          onChangeText={setConfirmation}
          placeholder="Repeat the new password"
          placeholderTextColor={colors.textSubtle}
          secureTextEntry
          style={styles.input}
          value={confirmation}
        />
        {confirmation.length > 0 && confirmation !== newPassword ? <Text style={styles.error}>The passwords do not match.</Text> : null}
        {passwordError ? <Text accessibilityRole="alert" style={styles.error}>{passwordError}</Text> : null}
        {passwordNotice ? <Text accessibilityRole="alert" style={styles.notice}>{passwordNotice}</Text> : null}
        <PrimaryButton disabled={!passwordReady} label={savingPassword ? 'Updating…' : 'Update password'} onPress={() => void savePassword()} />
      </Card>

      <SectionHeader title="Danger zone" />
      <Card style={styles.dangerCard}>
        <View style={styles.dangerHeadingRow}>
          <View style={styles.dangerIcon}><Text style={styles.dangerGlyph}>!</Text></View>
          <View style={styles.dangerCopy}>
            <Text style={styles.dangerTitle}>Delete account permanently</Text>
            <Muted>This removes your profile, posts, messages, room history, gift history, and clubs you own. It cannot be reversed.</Muted>
          </View>
        </View>
        <Text style={styles.fieldLabel}>Current password</Text>
        <TextInput
          accessibilityLabel="Current password for account deletion"
          autoCapitalize="none"
          autoComplete="current-password"
          onChangeText={setCurrentPassword}
          placeholder="Confirm it is really you"
          placeholderTextColor={colors.textSubtle}
          secureTextEntry
          style={styles.input}
          value={currentPassword}
        />
        <Text style={styles.fieldLabel}>Type DELETE to continue</Text>
        <TextInput
          accessibilityLabel="Type DELETE to confirm account deletion"
          autoCapitalize="characters"
          autoCorrect={false}
          onChangeText={setDeletePhrase}
          placeholder="DELETE"
          placeholderTextColor={colors.textSubtle}
          style={styles.input}
          value={deletePhrase}
        />
        {deleteError ? <Text accessibilityRole="alert" style={styles.error}>{deleteError}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !deletionReady }}
          disabled={!deletionReady}
          onPress={confirmDeletion}
          style={({ pressed }) => [styles.deleteButton, !deletionReady && styles.disabled, pressed && styles.pressed]}
        >
          <Text style={styles.deleteLabel}>{deleting ? 'Deleting…' : 'Delete my account'}</Text>
        </Pressable>
      </Card>
      <Text style={styles.buildLabel}>YAPPIE · {Constants.expoConfig?.version ?? '0.1.5'}{Platform.OS === 'android' ? ` · build ${Constants.expoConfig?.android?.versionCode ?? 10}` : Platform.OS === 'ios' ? ` · build ${Constants.expoConfig?.ios?.buildNumber ?? '10'}` : ''}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notificationRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  notificationTitle: { fontFamily: fonts.editorial, fontSize: 27, color: colors.text, marginBottom: 4 },
  notificationArrow: { fontSize: 25, color: colors.accent },
  buildLabel: { color: colors.textSubtle, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 24 },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  backButton: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
  backGlyph: { color: colors.text, fontSize: 30, fontWeight: '500', lineHeight: 32 },
  topTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  topSpacer: { width: 42 },
  hero: { alignItems: 'flex-start', borderBottomColor: colors.primary, borderBottomWidth: 1.5, gap: 8, marginTop: 24, paddingBottom: 24 },
  heroTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 42, lineHeight: 46, textTransform: 'uppercase' },
  heroCopy: { maxWidth: 340, textAlign: 'left' },
  identityCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  identityCopy: { flex: 1, gap: 4 },
  label: { color: colors.textSubtle, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  email: { color: colors.text, fontSize: 14, fontWeight: '800' },
  formCard: { backgroundColor: 'transparent', borderWidth: 0, padding: 0, gap: 12 },
  fieldLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '900', marginTop: spacing.xs },
  input: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: 4, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 54, paddingHorizontal: 16 },
  error: { color: colors.danger, fontSize: 12.5, lineHeight: 18 },
  notice: { backgroundColor: colors.successSoft, borderRadius: radius.sm, color: colors.success, fontSize: 12.5, lineHeight: 18, padding: spacing.md },
  dangerCard: { backgroundColor: colors.dangerSoft, borderColor: colors.border, gap: spacing.md },
  dangerHeadingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  dangerIcon: { alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: radius.md, height: 44, justifyContent: 'center', width: 44 },
  dangerGlyph: { color: colors.danger, fontSize: 20, fontWeight: '900' },
  dangerCopy: { flex: 1, gap: 4 },
  dangerTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  deleteButton: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: radius.pill, justifyContent: 'center', minHeight: 50, paddingHorizontal: spacing.lg },
  deleteLabel: { color: colors.primaryInk, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
