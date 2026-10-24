import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

const writes = new Map<string, Promise<unknown>>();
export async function clearAccountDrafts(userId:string) {
  const prefix=`yappie:draft:${userId}:`;
  await Promise.all([...writes].filter(([key])=>key.startsWith(prefix)).map(([,write])=>write.catch(()=>{})));
  const keys=(await AsyncStorage.getAllKeys()).filter(key=>key.startsWith(prefix));
  if(keys.length)await AsyncStorage.multiRemove(keys);
}
export function useDraft(userId: string | undefined, name: string) {
  const key = userId ? `yappie:draft:${userId}:${name}` : '';
  const [draft, setDraft] = useState({ key: '', value: '' });
  const [loaded, setLoaded] = useState('');
  const edited = useRef('');
  useEffect(() => {
    let active = true;
    edited.current = '';
    setLoaded('');
    setDraft({key,value:''});
    if (key) void AsyncStorage.getItem(key).then(value => {
      if (active) { if (edited.current !== key) setDraft({key,value:value ?? ''}); setLoaded(key); }
    }).catch(() => { if (active) setLoaded(key); });
    return () => { active = false; };
  }, [key]);
  useEffect(() => {
    if (!key || loaded !== key || draft.key !== key) return;
    const next = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => draft.value ? AsyncStorage.setItem(key,draft.value) : AsyncStorage.removeItem(key));
    writes.set(key,next);
    void next.catch(() => {}).finally(() => { if (writes.get(key) === next) writes.delete(key); });
  }, [key, loaded, draft]);
  return [draft.key === key ? draft.value : '', (value: string) => { edited.current = key; setDraft({key,value}); }] as const;
}
