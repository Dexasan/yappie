import { uniqueRealtimeTopic } from '@/lib/realtime-topic';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type CallStatus = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'missed' | 'ended';

export type DirectCall = {
  accepted_at: string | null;
  callee_last_seen_at: string | null;
  callee_id: string;
  caller_last_seen_at: string | null;
  caller_id: string;
  created_at: string;
  end_reason: string | null;
  ended_at: string | null;
  ended_by: string | null;
  id: string;
  status: CallStatus;
  updated_at: string;
};

export type AvailableCaller = {
  avatar_path: string | null;
  country_code: string | null;
  display_name: string | null;
  handle: string | null;
  languages: string[];
  last_seen_at: string;
  user_id: string;
};

export type CallPartner = Pick<
  Tables<'profiles'>,
  'id' | 'handle' | 'display_name' | 'country_code' | 'languages' | 'bio' | 'avatar_path'
>;

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function setCallAvailability(isAvailable: boolean) {
  const { data, error } = await client().rpc('set_call_availability', { target_available: isAvailable });
  if (error) throw error;
  return Boolean(data);
}

export async function listAvailableCallers() {
  const { data, error } = await client().rpc('list_available_call_profiles');
  if (error) throw error;
  return (data ?? []) as AvailableCaller[];
}

export async function requestDirectCall(targetUserId: string) {
  const { data, error } = await client().rpc('request_direct_call', { target_user_id: targetUserId });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('The call request was not created.');
  return data;
}

export async function respondDirectCall(callId: string, accept: boolean) {
  const { data, error } = await client().rpc('respond_direct_call', {
    accept_call: accept,
    target_call_id: callId,
  });
  if (error) throw error;
  return data as CallStatus;
}

export async function endDirectCall(callId: string, reason = 'Ended') {
  const { data, error } = await client().rpc('end_direct_call', {
    reason,
    target_call_id: callId,
  });
  if (error) throw error;
  return data as CallStatus;
}

export async function heartbeatDirectCall(callId: string) {
  const { data, error } = await client().rpc('heartbeat_direct_call', { target_call_id: callId });
  if (error) throw error;
  return Boolean(data);
}

export async function loadDirectCall(callId: string) {
  const { data, error } = await client().from('direct_calls').select('*').eq('id', callId).single();
  if (error) throw error;
  return data as DirectCall;
}

export async function loadPendingIncomingCall(userId: string) {
  const { data, error } = await client()
    .from('direct_calls')
    .select('*')
    .eq('callee_id', userId)
    .eq('status', 'requested')
    .gt('created_at', new Date(Date.now() - 35_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DirectCall | null;
}

export async function loadCallPartner(call: DirectCall, currentUserId: string) {
  const partnerId = call.caller_id === currentUserId ? call.callee_id : call.caller_id;
  const { data, error } = await client()
    .from('profiles')
    .select('id, handle, display_name, country_code, languages, bio, avatar_path')
    .eq('id', partnerId)
    .single();
  if (error) throw error;
  return data;
}

export function subscribeToIncomingCalls(userId: string, onCall: (call: DirectCall) => void) {
  const activeClient = client();
  const channel = activeClient
    .channel(uniqueRealtimeTopic(`user:${userId}:incoming-calls`))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'direct_calls', filter: `callee_id=eq.${userId}` },
      (payload) => onCall(payload.new as DirectCall),
    )
    .subscribe();
  return () => void activeClient.removeChannel(channel);
}

export function subscribeToDirectCall(callId: string, onCall: (call: DirectCall) => void) {
  const activeClient = client();
  const channel = activeClient
    .channel(uniqueRealtimeTopic(`call:${callId}:state`))
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'direct_calls', filter: `id=eq.${callId}` },
      (payload) => onCall(payload.new as DirectCall),
    )
    .subscribe();
  return () => void activeClient.removeChannel(channel);
}
