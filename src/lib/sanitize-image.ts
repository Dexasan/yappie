import type { ImagePickerAsset } from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const maximumDimension = 2048;

export async function sanitizePickedImage(asset: ImagePickerAsset) {
  const longestSide = Math.max(asset.width, asset.height);
  const resize = longestSide > maximumDimension
    ? asset.width >= asset.height
      ? { width: maximumDimension }
      : { height: maximumDimension }
    : null;
  const result = await manipulateAsync(
    asset.uri,
    resize ? [{ resize }] : [],
    { compress: 0.82, format: SaveFormat.JPEG },
  );
  return {
    height: result.height,
    mimeType: 'image/jpeg' as const,
    uri: result.uri,
    width: result.width,
  };
}
