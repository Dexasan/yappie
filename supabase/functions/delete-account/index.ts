import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const baseHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { headers: baseHeaders, status });
}

async function removeFolder(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  folder: string,
) {
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await admin.storage.from(bucket).list(folder, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data?.length) return;
    const paths = data.filter((item) => item.id).map((item) => `${folder}/${item.name}`);
    if (!paths.length) return;
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) throw removeError;
  }
  throw new Error('Storage cleanup exceeded its safety limit.');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: baseHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 4096) return response({ error: 'Request is too large.' }, 413);

    const authorization = request.headers.get('Authorization');
    if (!authorization) return response({ error: 'Authentication required.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return response({ error: 'Account deletion is temporarily unavailable.' }, 503);
    }

    const bodyText = await request.text();
    if (bodyText.length > 4096) return response({ error: 'Request is too large.' }, 413);
    const body = JSON.parse(bodyText) as { password?: unknown };
    if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 256) {
      return response({ error: 'Your current password is required.' }, 400);
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user?.email) return response({ error: 'Invalid or expired session.' }, 401);

    const verificationClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } });
    const { data: verification, error: verificationError } = await verificationClient.auth.signInWithPassword({
      email: userData.user.email,
      password: body.password,
    });
    if (verificationError || verification.user?.id !== userData.user.id) {
      return response({ error: 'Your current password is incorrect.' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: ownedClubs, error: clubsError } = await admin
      .from('clubs')
      .select('id')
      .eq('created_by', userData.user.id);
    if (clubsError) throw clubsError;

    await removeFolder(admin, 'avatars', userData.user.id);
    for (const club of ownedClubs ?? []) await removeFolder(admin, 'club-avatars', club.id);

    const { error: deleteError } = await admin.rpc('admin_delete_account', {
      target_user_id: userData.user.id,
    });
    if (deleteError) throw deleteError;

    return response({ deleted: true });
  } catch (error) {
    console.error('Account deletion failed:', error instanceof Error ? error.message : 'unknown error');
    return response({ error: 'The account could not be deleted. Please try again.' }, 500);
  }
});
