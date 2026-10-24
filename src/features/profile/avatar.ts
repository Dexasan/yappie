import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import { sanitizePickedImage } from '@/lib/sanitize-image';
import { uploadValidatedAvatar } from '@/lib/upload-avatar';

const maximumAvatarBytes = 3 * 1024 * 1024;
const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export function avatarPublicUrl(path: string | null | undefined) {
  if (!path || !supabase) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export async function chooseAndUploadAvatar(userId: string, previousPath: string | null) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Allow photo access to choose your profile picture.');

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    aspect: [1, 1],
    mediaTypes: ['images'],
    quality: 0.82,
    selectionLimit: 1,
  });
  if (result.canceled || !result.assets[0]) return null;

  const selectedAsset = result.assets[0];
  const mimeType = selectedAsset.mimeType?.toLowerCase() || 'image/jpeg';
  if (!supportedTypes.has(mimeType)) throw new Error('Choose a JPG, PNG, or WebP image.');
  const asset = await sanitizePickedImage(selectedAsset);

  const fileResponse = await fetch(asset.uri);
  if (!fileResponse.ok) throw new Error('The selected photo could not be read.');
  const file = await fileResponse.arrayBuffer();
  if (file.byteLength > maximumAvatarBytes) throw new Error('Choose an image that can be reduced below 3 MB.');

  void userId;
  void previousPath;
  return uploadValidatedAvatar(file, { kind: 'profile' });
}

export async function removeAvatar(userId: string, path: string) {
  void userId;
  const { error: profileError } = await client().rpc('set_profile_avatar', { target_avatar_path: null });
  if (profileError) throw profileError;
  await client().storage.from('avatars').remove([path]).catch(() => undefined);
}
