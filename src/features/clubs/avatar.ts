import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import { sanitizePickedImage } from '@/lib/sanitize-image';
import { uploadValidatedAvatar } from '@/lib/upload-avatar';

const maximumImageBytes = 3 * 1024 * 1024;
const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export function clubAvatarPublicUrl(path: string | null | undefined) {
  if (!path || !supabase) return null;
  return supabase.storage.from('club-avatars').getPublicUrl(path).data.publicUrl;
}

export async function chooseClubAvatar() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Allow photo access to choose a Club picture.');
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    aspect: [4, 3],
    mediaTypes: ['images'],
    quality: 0.82,
    selectionLimit: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const mimeType = asset.mimeType?.toLowerCase() || 'image/jpeg';
  if (!supportedTypes.has(mimeType)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (asset.fileSize && asset.fileSize > maximumImageBytes) throw new Error('Choose an image smaller than 5 MB.');
  return asset;
}

export async function uploadClubAvatar(clubId: string, asset: ImagePicker.ImagePickerAsset, previousPath: string | null) {
  const sanitizedAsset = await sanitizePickedImage(asset);
  const response = await fetch(sanitizedAsset.uri);
  if (!response.ok) throw new Error('The selected Club picture could not be read.');
  const file = await response.arrayBuffer();
  if (file.byteLength > maximumImageBytes) throw new Error('Choose an image that can be reduced below 3 MB.');
  void previousPath;
  return uploadValidatedAvatar(file, { kind: 'club', clubId });
}
