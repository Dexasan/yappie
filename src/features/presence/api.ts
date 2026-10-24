import { supabase } from '@/lib/supabase';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function setAppPresence(active: boolean) {
  const { data, error } = await client().rpc('set_app_presence', { target_active: active });
  if (error) throw error;
  return Boolean(data);
}

export async function listOnlineProfileIds(profileIds: string[]) {
  if (!profileIds.length) return new Set<string>();
  const { data, error } = await client().rpc('list_online_profiles', { target_user_ids: profileIds });
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.user_id));
}
