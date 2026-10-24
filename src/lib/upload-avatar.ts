import { supabase } from '@/lib/supabase';

type UploadScope = { kind: 'profile' } | { kind: 'club'; clubId: string };

export async function uploadValidatedAvatar(file: ArrayBuffer, scope: UploadScope) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabase || !supabaseUrl || !publishableKey) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw error ?? new Error('Your session has expired.');

  const query = scope.kind === 'club'
    ? `kind=club&club_id=${encodeURIComponent(scope.clubId)}`
    : 'kind=profile';
  const response = await fetch(`${supabaseUrl}/functions/v1/upload-avatar?${query}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'image/jpeg',
    },
    body: file,
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; path?: string };
  if (!response.ok || !payload.path) throw new Error(payload.error || 'The image could not be uploaded.');
  return payload.path;
}
