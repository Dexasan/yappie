import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

type SessionDescription = { sdp: string; type: 'offer' | 'answer' };

type RequestBody = {
  action?: 'create_session' | 'publish' | 'pull' | 'renegotiate' | 'close_session' | 'revoke_publisher' | 'close_room' | 'disconnect';
  media_session_id?: string;
  call_id?: string;
  room_id?: string;
  session_description?: SessionDescription;
  session_kind?: 'publisher' | 'subscriber';
  target_user_id?: string;
  inspect_only?: boolean;
};

const headers = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { headers, status });
}

function isSessionDescription(value: unknown): value is SessionDescription {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SessionDescription>;
  return typeof candidate.sdp === 'string'
    && candidate.sdp.length <= 32_768
    && candidate.sdp.startsWith('v=0')
    && (candidate.type === 'offer' || candidate.type === 'answer');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 65_536) return response({ error: 'Request is too large.' }, 413);
    const authorization = request.headers.get('Authorization');
    if (!authorization) return response({ error: 'Authentication required.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const realtimeAppId = Deno.env.get('CLOUDFLARE_REALTIME_APP_ID');
    const realtimeAppSecret = Deno.env.get('CLOUDFLARE_REALTIME_APP_SECRET');
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return response({ error: 'Supabase runtime configuration is missing.' }, 500);
    }
    if (!realtimeAppId || !realtimeAppSecret) {
      return response({ error: 'Live audio is not configured yet.' }, 503);
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return response({ error: 'Invalid or expired session.' }, 401);

    const bodyText = await request.text();
    if (bodyText.length > 65_536) return response({ error: 'Request is too large.' }, 413);
    const body = (() => {
      try { return JSON.parse(bodyText) as RequestBody; } catch { return null; }
    })();
    if (!body?.action) return response({ error: 'action is required.' }, 400);

    const { error: rateLimitError } = await userClient.rpc('consume_audio_rate_limit', {
      target_action: body.action,
    });
    if (rateLimitError) return response({ error: 'Too many audio requests. Please slow down.' }, 429);

    const cloudflareBase = `https://rtc.live.cloudflare.com/v1/apps/${realtimeAppId}`;
    const cloudflareRequest = async (path: string, method: 'POST' | 'PUT', payload?: Record<string, unknown>) => {
      const providerResponse = await fetch(`${cloudflareBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${realtimeAppSecret}`,
          'Content-Type': 'application/json',
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      const text = await providerResponse.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { errorDescription: text || 'Cloudflare returned an unreadable response.' };
      }
      if (!providerResponse.ok || data.errorCode) {
        const description = typeof data.errorDescription === 'string' ? data.errorDescription : 'Cloudflare request failed.';
        throw new Error(description);
      }
      return data;
    };

    const loadJoinedParticipant = async (roomId: string) => {
      const [{ data: room }, { data: participant }] = await Promise.all([
        admin.from('club_rooms').select('id, status').eq('id', roomId).maybeSingle(),
        admin
          .from('room_participants')
          .select('role, state, left_at')
          .eq('room_id', roomId)
          .eq('user_id', userData.user.id)
          .maybeSingle(),
      ]);
      if (!room || room.status !== 'live') throw new Error('This room is not live.');
      if (!participant || participant.state !== 'active' || participant.left_at) {
        throw new Error('Join the Club room before connecting audio.');
      }
      return participant;
    };

    const loadAcceptedCall = async (callId: string) => {
      const { data: directCall } = await admin
        .from('direct_calls')
        .select('id, caller_id, callee_id, status')
        .eq('id', callId)
        .maybeSingle();
      if (!directCall || directCall.status !== 'accepted') throw new Error('This call is no longer active.');
      if (![directCall.caller_id, directCall.callee_id].includes(userData.user.id)) {
        throw new Error('You are not part of this call.');
      }
      return directCall;
    };

    const loadOwnedSession = async (mediaSessionId: string) => {
      const { data } = await admin
        .from('room_audio_sessions')
        .select('*')
        .eq('id', mediaSessionId)
        .eq('user_id', userData.user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!data) throw new Error('The audio session is not active.');
      if (data.call_id) await loadAcceptedCall(data.call_id);
      else if (data.room_id) await loadJoinedParticipant(data.room_id);
      else throw new Error('The audio session has no valid scope.');
      return data;
    };

    const forceCloseProviderTrack = async (session: { provider_session_id: string; provider_track_mid: string | null }) => {
      if (!session.provider_track_mid) return;
      await cloudflareRequest(`/sessions/${session.provider_session_id}/tracks/close`, 'PUT', {
        force: true,
        tracks: [{ mid: session.provider_track_mid }],
      });
    };

    if (body.action === 'create_session') {
      if ((!body.room_id && !body.call_id) || (body.room_id && body.call_id) || !body.session_kind) {
        return response({ error: 'Exactly one audio scope and session_kind are required.' }, 400);
      }
      if (body.call_id) {
        await loadAcceptedCall(body.call_id);
      } else if (body.room_id) {
        const participant = await loadJoinedParticipant(body.room_id);
        if (body.session_kind === 'publisher' && !['host', 'speaker'].includes(participant.role)) {
          return response({ error: 'Only users on stage can publish audio.' }, 403);
        }
      }

      let existingQuery = admin
        .from('room_audio_sessions')
        .select('id')
        .eq('user_id', userData.user.id)
        .eq('session_kind', body.session_kind)
        .eq('status', 'active');
      existingQuery = body.call_id ? existingQuery.eq('call_id', body.call_id) : existingQuery.eq('room_id', body.room_id!);
      const { data: existingSessions } = await existingQuery;
      if (existingSessions?.[0]) {
        return response({ mediaSessionId: existingSessions[0].id, reused: true });
      }

      const provider = await cloudflareRequest('/sessions/new', 'POST');
      if (typeof provider.sessionId !== 'string') throw new Error('Cloudflare did not return a session ID.');
      const { data: mediaSession, error: insertError } = await admin
        .from('room_audio_sessions')
        .insert({
          room_id: body.room_id ?? null,
          call_id: body.call_id ?? null,
          user_id: userData.user.id,
          provider_session_id: provider.sessionId,
          session_kind: body.session_kind,
        })
        .select('id')
        .single();
      if (insertError) throw insertError;
      return response({ mediaSessionId: mediaSession.id });
    }

    if (body.action === 'disconnect') {
      if ((!body.room_id && !body.call_id) || (body.room_id && body.call_id)) {
        return response({ error: 'Exactly one audio scope is required.' }, 400);
      }
      if (body.call_id) await loadAcceptedCall(body.call_id);
      let ownedQuery = admin
        .from('room_audio_sessions')
        .select('id, provider_session_id, provider_track_mid, session_kind')
        .eq('user_id', userData.user.id)
        .eq('status', 'active');
      ownedQuery = body.call_id ? ownedQuery.eq('call_id', body.call_id) : ownedQuery.eq('room_id', body.room_id!);
      const { data: ownedSessions } = await ownedQuery;
      const results = await Promise.allSettled(
        (ownedSessions ?? [])
          .filter((session) => session.session_kind === 'publisher')
          .map((session) => forceCloseProviderTrack(session)),
      );
      let closeOwnedQuery = admin
        .from('room_audio_sessions')
        .update({ status: 'closed' })
        .eq('user_id', userData.user.id)
        .eq('status', 'active');
      closeOwnedQuery = body.call_id
        ? closeOwnedQuery.eq('call_id', body.call_id)
        : closeOwnedQuery.eq('room_id', body.room_id!);
      await closeOwnedQuery;

      if (body.call_id) {
        await admin
          .from('direct_calls')
          .update({ status: 'ended', ended_at: new Date().toISOString(), ended_by: userData.user.id, end_reason: 'Disconnected' })
          .eq('id', body.call_id)
          .eq('status', 'accepted');
        return response({
          closed: true,
          failedTrackCount: results.filter((result) => result.status === 'rejected').length,
        });
      }

      const { data: room } = await admin
        .from('club_rooms')
        .select('host_id, status')
        .eq('id', body.room_id)
        .maybeSingle();
      const disconnectedAt = new Date().toISOString();
      if (room?.host_id === userData.user.id && room.status === 'live') {
        await admin
          .from('club_rooms')
          .update({ status: 'ended', ended_at: disconnectedAt })
          .eq('id', body.room_id)
          .eq('status', 'live');
        await admin
          .from('room_participants')
          .update({ state: 'left', left_at: disconnectedAt, hand_raised_at: null })
          .eq('room_id', body.room_id)
          .eq('state', 'active');
      } else {
        await admin
          .from('room_participants')
          .update({ state: 'left', left_at: disconnectedAt, hand_raised_at: null })
          .eq('room_id', body.room_id)
          .eq('user_id', userData.user.id)
          .eq('state', 'active');
      }
      return response({
        closed: true,
        failedTrackCount: results.filter((result) => result.status === 'rejected').length,
      });
    }

    const mediaSession = body.media_session_id && body.action !== 'close_session'
      ? await loadOwnedSession(body.media_session_id)
      : null;

    if (body.action === 'publish') {
      if (!mediaSession) return response({ error: 'media_session_id is required.' }, 400);
      if (mediaSession.session_kind !== 'publisher') return response({ error: 'A publisher session is required.' }, 400);
      if (!isSessionDescription(body.session_description)) return response({ error: 'A valid offer is required.' }, 400);
      if (mediaSession.call_id) {
        await loadAcceptedCall(mediaSession.call_id);
      } else {
        const participant = await loadJoinedParticipant(mediaSession.room_id);
        if (!['host', 'speaker'].includes(participant.role)) return response({ error: 'Publishing permission was revoked.' }, 403);
      }

      const provider = await cloudflareRequest(`/sessions/${mediaSession.provider_session_id}/tracks/new`, 'POST', {
        autoDiscover: true,
        sessionDescription: body.session_description,
      });
      const tracks = Array.isArray(provider.tracks) ? provider.tracks as Array<Record<string, unknown>> : [];
      const audioTrack = tracks.find((track) => track.kind === 'audio') ?? tracks[0];
      if (!audioTrack || typeof audioTrack.trackName !== 'string') throw new Error('Cloudflare did not create an audio track.');
      const { error: publishError } = await admin
        .from('room_audio_sessions')
        .update({
          provider_track_mid: typeof audioTrack.mid === 'string' ? audioTrack.mid : null,
          published_track_name: audioTrack.trackName,
        })
        .eq('id', mediaSession.id);
      if (publishError) throw publishError;
      return response({ provider });
    }

    if (body.action === 'revoke_publisher') {
      if (!body.room_id || !body.target_user_id) return response({ error: 'room_id and target_user_id are required.' }, 400);
      const requester = await loadJoinedParticipant(body.room_id);
      if (requester.role !== 'host') return response({ error: 'Only the room host can revoke a publisher.' }, 403);
      const { data: targetSession } = await admin
        .from('room_audio_sessions')
        .select('id, provider_session_id, provider_track_mid')
        .eq('room_id', body.room_id)
        .eq('user_id', body.target_user_id)
        .eq('session_kind', 'publisher')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (targetSession) {
        await forceCloseProviderTrack(targetSession);
        await admin.from('room_audio_sessions').update({ status: 'closed' }).eq('id', targetSession.id);
      }
      return response({ closed: Boolean(targetSession) });
    }

    if (body.action === 'close_room') {
      if (!body.room_id) return response({ error: 'room_id is required.' }, 400);
      const { data: room } = await admin.from('club_rooms').select('host_id').eq('id', body.room_id).maybeSingle();
      if (!room || room.host_id !== userData.user.id) return response({ error: 'Only the room host can close room audio.' }, 403);
      const { data: publisherSessions } = await admin
        .from('room_audio_sessions')
        .select('id, provider_session_id, provider_track_mid')
        .eq('room_id', body.room_id)
        .eq('session_kind', 'publisher')
        .not('provider_track_mid', 'is', null);
      const results = await Promise.allSettled((publisherSessions ?? []).map((session) => forceCloseProviderTrack(session)));
      const failed = results.filter((result) => result.status === 'rejected').length;
      await admin.from('room_audio_sessions').update({ status: 'closed' }).eq('room_id', body.room_id);
      if (failed) throw new Error(`Could not close ${failed} Cloudflare audio track(s).`);
      return response({ closed: true });
    }

    if (body.action === 'close_session') {
      if (!body.media_session_id) return response({ error: 'media_session_id is required.' }, 400);
      const { data: ownedSession } = await admin
        .from('room_audio_sessions')
        .select('id, provider_session_id, provider_track_mid, session_kind')
        .eq('id', body.media_session_id)
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (!ownedSession) return response({ closed: true });
      try {
        if (ownedSession.session_kind === 'publisher') await forceCloseProviderTrack(ownedSession);
      } finally {
        const { error: closeError } = await admin.from('room_audio_sessions').update({ status: 'closed' }).eq('id', ownedSession.id);
        if (closeError) throw closeError;
      }
      return response({ closed: true });
    }

    if (!mediaSession) return response({ error: 'media_session_id is required.' }, 400);

    if (body.action === 'pull') {
      if (mediaSession.session_kind !== 'subscriber') return response({ error: 'A subscriber session is required.' }, 400);
      let publisherQuery = admin
        .from('room_audio_sessions')
        .select('provider_session_id, published_track_name, user_id')
        .eq('session_kind', 'publisher')
        .eq('status', 'active')
        .neq('user_id', userData.user.id)
        .not('published_track_name', 'is', null);
      publisherQuery = mediaSession.call_id
        ? publisherQuery.eq('call_id', mediaSession.call_id)
        : publisherQuery.eq('room_id', mediaSession.room_id);
      const { data: publishers, error: publishersError } = await publisherQuery;
      if (publishersError) throw publishersError;
      if (mediaSession.call_id) {
        const tracks = (publishers ?? []).map((publisher) => ({
          location: 'remote',
          sessionId: publisher.provider_session_id,
          trackName: publisher.published_track_name,
        }));
        const publisherKey = tracks.map((track) => `${track.sessionId}:${track.trackName}`).sort().join('|');
        if (body.inspect_only) return response({ publisherKey, trackCount: tracks.length });
        if (tracks.length === 0) return response({ provider: null, trackCount: 0 });
        const provider = await cloudflareRequest(`/sessions/${mediaSession.provider_session_id}/tracks/new`, 'POST', { tracks });
        const received = Array.isArray(provider.tracks) ? provider.tracks as Array<Record<string, unknown>> : [];
        const errors = received.filter((track) => track.errorCode);
        if (errors.length && errors.every((track) => track.errorCode === 'empty_track_error')) {
          return response({ provider: null, trackCount: 0, publisherKey, pending: true });
        }
        if (!received.length || errors.length) {
          const failure = received.map((track) => ({
            errorCode: track.errorCode,
            errorDescription: track.errorDescription,
            kind: track.kind,
            location: track.location,
            mid: track.mid,
            trackName: track.trackName,
          }));
          throw new Error(`Remote track negotiation failed: ${JSON.stringify(failure)}`);
        }
        return response({ provider, trackCount: received.length, publisherKey });
      }
      const publisherIds = [...new Set((publishers ?? []).map((publisher) => publisher.user_id))];
      const { data: currentSpeakers } = publisherIds.length
        ? await admin
            .from('room_participants')
            .select('user_id')
            .eq('room_id', mediaSession.room_id)
            .eq('state', 'active')
            .is('left_at', null)
            .in('role', ['host', 'speaker'])
            .in('user_id', publisherIds)
        : { data: [] as Array<{ user_id: string }> };
      const speakerIds = new Set((currentSpeakers ?? []).map((speaker) => speaker.user_id));
      const tracks = (publishers ?? [])
        .filter((publisher) => speakerIds.has(publisher.user_id) && publisher.published_track_name)
        .map((publisher) => ({
          location: 'remote',
          sessionId: publisher.provider_session_id,
          trackName: publisher.published_track_name,
        }));
      if (tracks.length === 0) return response({ provider: null, trackCount: 0 });
      const provider = await cloudflareRequest(`/sessions/${mediaSession.provider_session_id}/tracks/new`, 'POST', { tracks });
      return response({ provider, trackCount: tracks.length });
    }

    if (body.action === 'renegotiate') {
      if (!isSessionDescription(body.session_description)) return response({ error: 'A valid answer is required.' }, 400);
      const provider = await cloudflareRequest(`/sessions/${mediaSession.provider_session_id}/renegotiate`, 'PUT', {
        sessionDescription: body.session_description,
      });
      return response({ provider });
    }

    return response({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('Audio gateway failure:', message);
    return response({ error: 'The audio request could not be completed.' }, 500);
  }
});
