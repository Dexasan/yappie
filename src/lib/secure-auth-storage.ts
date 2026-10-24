import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const chunkSize = 1800;
const manifestSuffix = '.__chunks';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function manifestKey(key: string) {
  return `${key}${manifestSuffix}`;
}

function chunkKey(key: string, index: number) {
  return `${key}.${index}`;
}

async function readChunkCount(key: string) {
  const raw = await SecureStore.getItemAsync(manifestKey(key), secureOptions);
  const count = Number(raw);
  return Number.isInteger(count) && count > 0 && count <= 32 ? count : 0;
}

async function removeSecureValue(key: string) {
  const count = await readChunkCount(key);
  await Promise.all([
    ...Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index), secureOptions)),
    SecureStore.deleteItemAsync(manifestKey(key), secureOptions),
    SecureStore.deleteItemAsync(key, secureOptions),
  ]);
}

async function writeSecureValue(key: string, value: string) {
  const previousCount = await readChunkCount(key);
  const chunks = value.match(new RegExp(`.{1,${chunkSize}}`, 'gs')) ?? [''];
  if (chunks.length > 32) throw new Error('The secure session payload is unexpectedly large.');

  await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk, secureOptions)));
  await SecureStore.setItemAsync(manifestKey(key), String(chunks.length), secureOptions);
  await Promise.all(
    Array.from({ length: Math.max(0, previousCount - chunks.length) }, (_, offset) =>
      SecureStore.deleteItemAsync(chunkKey(key, chunks.length + offset), secureOptions),
    ),
  );
  await SecureStore.deleteItemAsync(key, secureOptions);
}

export const secureAuthStorage = {
  async getItem(key: string) {
    const count = await readChunkCount(key);
    if (count) {
      const chunks = await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index), secureOptions)),
      );
      if (chunks.every((chunk): chunk is string => chunk !== null)) return chunks.join('');
      await removeSecureValue(key);
    }

    // One-time migration from the former plaintext AsyncStorage adapter.
    const legacyValue = await AsyncStorage.getItem(key);
    if (!legacyValue) return null;
    await writeSecureValue(key, legacyValue);
    await AsyncStorage.removeItem(key);
    return legacyValue;
  },
  async setItem(key: string, value: string) {
    await writeSecureValue(key, value);
    await AsyncStorage.removeItem(key);
  },
  async removeItem(key: string) {
    await Promise.all([removeSecureValue(key), AsyncStorage.removeItem(key)]);
  },
};
