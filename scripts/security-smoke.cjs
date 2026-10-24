const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

const { createClient } = require('@supabase/supabase-js');

const projectRef = 'fzpehebwhsfrrgdugxpr';
const supabaseUrl = `https://${projectRef}.supabase.co`;
const supabaseCli = path.resolve('node_modules/.pnpm/supabase@2.114.0/node_modules/supabase/dist/supabase.js');
const jpegSeed = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDZooor5A/WAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//Z', 'base64');
const validJpeg = Buffer.concat([jpegSeed.subarray(0, 155), Buffer.from([40, 40, 40]), jpegSeed.subarray(155)]);

function loadProjectKeys() {
  const output = execFileSync(process.execPath, [supabaseCli, 'projects', 'api-keys', '--project-ref', projectRef], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const payload = JSON.parse(output);
  const serviceRole = payload.keys?.find((key) => key.name === 'service_role')?.api_key;
  const anonymous = payload.keys?.find((key) => key.name === 'anon')?.api_key;
  if (!serviceRole || !anonymous) throw new Error('Could not load project keys.');
  return { anonymous, serviceRole };
}

async function createTestAccount(admin, anonymous, label) {
  const suffix = randomUUID();
  const email = `security-${label}-${suffix}@example.com`;
  const password = `Secure-${suffix}!9`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: `Security ${label}` },
    app_metadata: { is_test_account: true },
  });
  if (error) throw error;
  const userId = data.user.id;
  const { error: profileError } = await admin.from('profiles').update({
    display_name: `Security ${label}`,
    handle: `sec_${label}_${suffix.replaceAll('-', '').slice(0, 8)}`,
    country_code: 'DE',
    languages: ['English'],
  }).eq('id', userId);
  if (profileError) throw profileError;
  const { error: settingsError } = await admin.from('user_settings').update({
    date_of_birth: '1990-01-01',
    age_verified_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    community_guidelines_accepted_at: new Date().toISOString(),
    onboarding_completed_at: new Date().toISOString(),
  }).eq('id', userId);
  if (settingsError) throw settingsError;
  const client = createClient(supabaseUrl, anonymous, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw signInError ?? new Error('Test account could not sign in.');
  return { accessToken: signedIn.session.access_token, client, email, password, userId };
}

async function main() {
  const { anonymous, serviceRole } = loadProjectKeys();
  const admin = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const accounts = [];
  let testClubId;
  try {
    const alice = await createTestAccount(admin, anonymous, 'alice'); accounts.push(alice);
    const bob = await createTestAccount(admin, anonymous, 'bob'); accounts.push(bob);
    const mallory = await createTestAccount(admin, anonymous, 'mallory'); accounts.push(mallory);

    const { data: createdClubId, error: clubCreateError } = await alice.client.rpc('create_club', {
      club_name: 'Security Photo Club', club_description: 'Temporary club for creator-only cover checks.',
      club_topic: 'Security testing', member_rooms: true,
    });
    if (clubCreateError || typeof createdClubId !== 'string') throw clubCreateError ?? new Error('Cover-test Club was not created.');
    testClubId = createdClubId;
    const { error: moderatorError } = await admin.from('club_memberships').insert({
      club_id: testClubId, user_id: bob.userId, role: 'moderator', status: 'active',
    });
    if (moderatorError) throw moderatorError;
    const uploadClubCover = (account) => fetch(`${supabaseUrl}/functions/v1/upload-avatar?kind=club&club_id=${testClubId}`, {
      method: 'POST',
      headers: { apikey: anonymous, Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'image/jpeg' },
      body: validJpeg,
    });
    const moderatorCover = await uploadClubCover(bob);
    if (moderatorCover.status !== 403) throw new Error('A Club moderator could change the creator-only cover.');
    const creatorCover = await uploadClubCover(alice);
    if (!creatorCover.ok || !(await creatorCover.json())?.path) throw new Error('The Club creator could not upload its cover.');

    const avatarResponse = await fetch(`${supabaseUrl}/functions/v1/upload-avatar?kind=profile`, {
      method: 'POST',
      headers: { apikey: anonymous, Authorization: `Bearer ${alice.accessToken}`, 'Content-Type': 'image/jpeg' },
      body: validJpeg,
    });
    const uploadedAvatar = await avatarResponse.json();
    if (!avatarResponse.ok || !uploadedAvatar?.path) throw new Error(uploadedAvatar?.error || 'Validated avatar upload failed.');

    const { error: directUploadError } = await mallory.client.storage.from('avatars').upload(
      `${mallory.userId}/avatar-${Date.now()}.jpg`,
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      { contentType: 'image/jpeg' },
    );
    if (!directUploadError) throw new Error('Direct unvalidated Storage upload was accepted.');
    const invalidImageResponse = await fetch(`${supabaseUrl}/functions/v1/upload-avatar?kind=profile`, {
      method: 'POST',
      headers: { apikey: anonymous, Authorization: `Bearer ${mallory.accessToken}`, 'Content-Type': 'image/jpeg' },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    if (invalidImageResponse.ok) throw new Error('Invalid JPEG was accepted by the image gateway.');

    const { data: trendRows, error: trendError } = await alice.client.rpc('list_trending_match_interests', {
      limit_count: 10,
    });
    if (trendError || trendRows?.length !== 10) throw trendError ?? new Error('Interest discovery did not return 10 tags.');
    if (new Set(trendRows.map((item) => item.label.toLowerCase())).size !== trendRows.length) {
      throw new Error('Interest discovery returned duplicate tags.');
    }

    const { data: customInterestRows, error: customInterestError } = await alice.client.rpc('join_quick_chat_v2', {
      match_interests: ['knitting tiny hats'],
    });
    if (customInterestError || customInterestRows?.[0]?.match_status !== 'queued') {
      throw customInterestError ?? new Error('A safe custom matching interest was rejected.');
    }
    const { error: cancelCustomError } = await alice.client.rpc('cancel_quick_chat_search');
    if (cancelCustomError) throw cancelCustomError;

    const { data: blockedInterestRows, error: blockedInterestError } = await alice.client.rpc('join_quick_chat_v2', {
      match_interests: ['rape'],
    });
    if (!blockedInterestError || blockedInterestRows) {
      throw new Error('A blocked matching interest was accepted.');
    }

    const { data: aliceQueue, error: aliceQueueError } = await alice.client.rpc('join_quick_chat_v2', {
      match_interests: ['music', 'travel'],
    });
    if (aliceQueueError || aliceQueue?.[0]?.match_status !== 'queued') {
      throw aliceQueueError ?? new Error('First multi-interest matcher did not enter the queue.');
    }
    const { data: bobQueue, error: bobQueueError } = await bob.client.rpc('join_quick_chat_v2', {
      match_interests: ['gaming', 'tech'],
    });
    if (bobQueueError || bobQueue?.[0]?.match_status !== 'queued') {
      throw bobQueueError ?? new Error('Non-overlapping matcher was paired incorrectly.');
    }
    const { data: matchedRows, error: matchError } = await mallory.client.rpc('join_quick_chat_v2', {
      match_interests: ['gaming', 'music', 'travel'],
    });
    const matched = matchedRows?.[0];
    if (matchError || matched?.match_status !== 'matched' || matched.matched_profile_id !== alice.userId) {
      throw matchError ?? new Error('Matcher did not prefer the strongest interest overlap.');
    }
    if (matched.matched_interests.join(',') !== 'music,travel') {
      throw new Error('Matcher did not return the shared interests.');
    }
    const { error: leaveMatchError } = await mallory.client.rpc('leave_quick_chat', {
      target_session_id: matched.session_id,
      leave_reason: 'left',
    });
    if (leaveMatchError) throw leaveMatchError;
    const { error: cancelBobError } = await bob.client.rpc('cancel_quick_chat_search');
    if (cancelBobError) throw cancelBobError;

    const { data: conversationId, error: conversationError } = await alice.client.rpc('get_or_create_direct_conversation', {
      other_user_id: bob.userId,
    });
    if (conversationError) throw conversationError;

    const { data: leakedMembership, error: membershipError } = await mallory.client.rpc('is_conversation_member', {
      target_conversation_id: conversationId,
      target_user_id: alice.userId,
    });
    if (membershipError || leakedMembership) throw membershipError ?? new Error('Conversation membership leaked.');

    const { error: retiredGiftError } = await alice.client.rpc('send_virtual_gift', {
      target_user_id: bob.userId,
      target_gift_slug: 'rose',
      gift_context_kind: 'direct_message',
      gift_context_id: conversationId,
    });
    if (!retiredGiftError) throw new Error('Retired coin gift RPC is still callable.');

    const { data: intentRows, error: intentError } = await alice.client.rpc('create_gift_purchase_intent', {
      target_user_id: bob.userId,
      target_gift_slug: 'rose',
      gift_context_kind: 'direct_message',
      gift_context_id: conversationId,
    });
    if (!intentError || intentRows) throw new Error('Free-beta client was allowed to create a paid gift purchase intent.');

    const { error: presenceError } = await bob.client.rpc('set_app_presence', { target_active: true });
    if (presenceError) throw presenceError;
    const { error: blockError } = await alice.client.from('blocks').insert({ blocker_id: alice.userId, blocked_id: bob.userId });
    if (blockError) throw blockError;

    const { data: leakedBlock, error: leakedBlockError } = await mallory.client.rpc('is_blocked_between', {
      first_user: alice.userId, second_user: bob.userId,
    });
    if (leakedBlockError || leakedBlock) throw leakedBlockError ?? new Error('Third-party block relationship leaked.');
    const { data: involvedBlock } = await bob.client.rpc('is_blocked_between', {
      first_user: alice.userId, second_user: bob.userId,
    });
    if (!involvedBlock) throw new Error('Block enforcement stopped working for an involved account.');

    const { data: onlineRows, error: onlineError } = await alice.client.rpc('list_online_profiles', {
      target_user_ids: [bob.userId],
    });
    if (onlineError || onlineRows?.length) throw onlineError ?? new Error('Blocked presence leaked.');

    let rateLimited = false;
    for (let index = 0; index < 9; index += 1) {
      const { error } = await mallory.client.from('posts').insert({ author_id: mallory.userId, body: `Rate test ${index}` });
      if (index === 8 && error) rateLimited = true;
      else if (error) throw error;
    }
    if (!rateLimited) throw new Error('Post rate limit did not activate.');

    const { error: wrongDeleteError } = await alice.client.functions.invoke('delete-account', { body: { password: 'wrong-password' } });
    if (!wrongDeleteError) throw new Error('Account deletion accepted a wrong password.');
    const { error: deleteError } = await alice.client.functions.invoke('delete-account', { body: { password: alice.password } });
    if (deleteError) {
      const { error: directDeleteError } = await admin.rpc('admin_delete_account', { target_user_id: alice.userId });
      throw new Error(`Delete function failed${directDeleteError ? `; database said: ${directDeleteError.message}` : '; direct database deletion succeeded'}.`);
    }
    accounts.splice(accounts.indexOf(alice), 1);
    const { data: deletedUser } = await admin.auth.admin.getUserById(alice.userId);
    if (deletedUser?.user) throw new Error('Deleted account still exists.');
    const { data: orphanedAvatars, error: avatarListError } = await admin.storage.from('avatars').list(alice.userId);
    if (avatarListError || orphanedAvatars?.length) throw avatarListError ?? new Error('Deleted account left avatar objects behind.');

    console.log('Security authorization, multi-interest matching, paused gifts, presence, throttling, and deletion smoke tests passed.');
  } finally {
    if (testClubId) {
      try { await admin.from('clubs').delete().eq('id', testClubId); } catch { /* best-effort fixture cleanup */ }
    }
    for (const account of accounts) await admin.auth.admin.deleteUser(account.userId).catch(() => undefined);
  }
}

main().catch(async (error) => {
  let detail = '';
  if (error?.context && typeof error.context.text === 'function') {
    try { detail = await error.context.text(); } catch { /* keep the original error */ }
  }
  console.error(`${error instanceof Error ? error.message : String(error)}${detail ? `: ${detail}` : ''}`);
  process.exitCode = 1;
});
