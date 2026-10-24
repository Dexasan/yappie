import { supabase } from '@/lib/supabase';
import { uniqueRealtimeTopic } from '@/lib/realtime-topic';
import type { Tables } from '@/types/database';

export type Message = Tables<'messages'>;
export type PublicProfile = Pick<
  Tables<'profiles'>,
  'id' | 'handle' | 'display_name' | 'country_code' | 'languages' | 'bio' | 'avatar_path'
>;

export type MatchResult = {
  conversation_id: string | null;
  match_status: 'matched' | 'queued';
  matched_interests: string[];
  matched_profile_id: string | null;
  session_id: string | null;
};

export type TrendingInterest = {
  glyph: string;
  label: string;
  score: number;
  source: 'live' | 'discover';
};

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function joinQuickChat(interests: string[]) {
  const { data, error } = await client().rpc('join_quick_chat_v3', {
    match_interests: interests,
  });
  if (error) throw error;

  const result = data[0] as MatchResult | undefined;
  if (!result) throw new Error('The matcher returned no result.');
  return result;
}

export async function loadTrendingMatchInterests(limit = 10) {
  const { data, error } = await client().rpc('list_trending_match_interests', {
    limit_count: limit,
  });
  if (error) throw error;
  return (data ?? []) as TrendingInterest[];
}

export async function loadQuickChatMatchingCount() {
  const { data, error } = await client().rpc('get_quick_chat_matching_count');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function cancelQuickChatSearch() {
  const { error } = await client().rpc('cancel_quick_chat_search');
  if (error) throw error;
}

export async function leaveQuickChat(sessionId: string, reason: 'left' | 'skip' | 'blocked' | 'reported' = 'left') {
  const { data, error } = await client().rpc('leave_quick_chat', {
    target_session_id: sessionId,
    leave_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function heartbeatQuickChat(sessionId: string) {
  const { data, error } = await client().rpc('heartbeat_quick_chat', {
    target_session_id: sessionId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function loadPublicProfile(profileId: string) {
  const { data, error } = await client()
    .from('profiles')
    .select('id, handle, display_name, country_code, languages, bio, avatar_path')
    .eq('id', profileId)
    .single();
  if (error) throw error;
  return data;
}

export async function loadConversationMessages(conversationId: string) {
  const { data, error } = await client()
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.reverse();
}

export async function sendConversationMessage(conversationId: string, senderId: string, body: string) {
  const { data, error } = await client()
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function blockProfile(blockerId: string, blockedId: string) {
  const { error } = await client().from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error && error.code !== '23505') throw error;
}

export async function reportProfile(reporterId: string, targetUserId: string, details: string) {
  const { error } = await client().from('reports').insert({
    reporter_id: reporterId,
    target_kind: 'user',
    target_user_id: targetUserId,
    category: 'other',
    details,
  });
  if (error) throw error;
}

export function subscribeToConversationMessages(conversationId: string, onMessage: (message: Message) => void) {
  const activeClient = client();
  const channel = activeClient
    .channel(uniqueRealtimeTopic(`conversation:${conversationId}:messages`))
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(payload.new as Message),
    )
    .subscribe();

  return () => {
    void activeClient.removeChannel(channel);
  };
}
