import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const maximumBytes = 3 * 1024 * 1024;
const maximumDimension = 2048;
const headers = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { headers, status });
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    return null;
  }
  const sizeMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (sizeMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return { height, width };
    }
    offset += segmentLength;
  }
  return null;
}

function isUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return response({ error: 'Authentication required.' }, 401);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/jpeg') {
      return response({ error: 'Only sanitized JPEG images are accepted.' }, 415);
    }
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > maximumBytes) return response({ error: 'The image is larger than 3 MB.' }, 413);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) return response({ error: 'Image upload is unavailable.' }, 503);

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return response({ error: 'Invalid or expired session.' }, 401);

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > maximumBytes) return response({ error: 'The image is larger than 3 MB.' }, 413);
    const dimensions = jpegDimensions(bytes);
    if (!dimensions
      || dimensions.width < 64 || dimensions.height < 64
      || dimensions.width > maximumDimension || dimensions.height > maximumDimension
      || dimensions.width * dimensions.height > maximumDimension * maximumDimension) {
      return response({ error: 'The image is invalid or has unsupported dimensions.' }, 422);
    }

    const requestUrl = new URL(request.url);
    const kind = requestUrl.searchParams.get('kind');
    const clubId = requestUrl.searchParams.get('club_id');
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    let bucket: 'avatars' | 'club-avatars';
    let folder: string;
    let previousPath: string | null = null;

    if (kind === 'profile') {
      bucket = 'avatars';
      folder = userData.user.id;
      const { data: profile } = await admin.from('profiles').select('avatar_path').eq('id', userData.user.id).single();
      previousPath = profile?.avatar_path ?? null;
    } else if (kind === 'club' && isUuid(clubId)) {
      const { data: clubOwner, error: clubOwnerError } = await admin.from('clubs').select('created_by')
        .eq('id', clubId).maybeSingle();
      if (clubOwnerError) throw clubOwnerError;
      if (!clubOwner || clubOwner.created_by !== userData.user.id) {
        return response({ error: 'Only the person who created this Club can change its cover.' }, 403);
      }
      bucket = 'club-avatars';
      folder = clubId;
      const { data: club } = await admin.from('clubs').select('avatar_path').eq('id', clubId).single();
      previousPath = club?.avatar_path ?? null;
    } else {
      return response({ error: 'A valid upload scope is required.' }, 400);
    }

    const nextPath = `${folder}/avatar-${Date.now()}.jpg`;
    const { error: uploadError } = await admin.storage.from(bucket).upload(nextPath, bytes, {
      cacheControl: '31536000', contentType: 'image/jpeg', upsert: false,
    });
    if (uploadError) throw uploadError;

    const pointerResult = kind === 'profile'
      ? await admin.from('profiles').update({ avatar_path: nextPath }).eq('id', userData.user.id)
      : await admin.from('clubs').update({ avatar_path: nextPath }).eq('id', clubId!);
    if (pointerResult.error) {
      await admin.storage.from(bucket).remove([nextPath]);
      throw pointerResult.error;
    }
    if (previousPath && previousPath !== nextPath && previousPath.startsWith(`${folder}/`)) {
      await admin.storage.from(bucket).remove([previousPath]);
    }
    return response({ path: nextPath });
  } catch (error) {
    console.error('Avatar upload failed:', error instanceof Error ? error.message : 'unknown error');
    return response({ error: 'The image could not be uploaded. Please try again.' }, 500);
  }
});
