import { supabase } from '@/lib/supabase';
import { loadAvatarPathMap } from '@/features/profile/avatar-data';
import { listOnlineProfileIds } from '@/features/presence/api';

export type DirectConversation = {
  conversation_id: string;
  last_message_at: string;
  last_message_body: string | null;
  partner_country_code: string | null;
  partner_display_name: string | null;
  partner_handle: string | null;
  partner_id: string;
  partner_avatar_path: string | null;
  partner_is_online: boolean;
  unread_count: number;
};

export type MessageProfile = {
  avatar_path: string | null;
  bio: string | null;
  country_code: string | null;
  display_name: string | null;
  follows_me: boolean;
  handle: string | null;
  is_following: boolean;
  languages: string[];
  user_id: string;
};

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function listDirectConversations() {
  const { data, error } = await client().rpc('list_direct_conversations');
  if (error) throw error;
  const rows = data as Omit<DirectConversation, 'partner_avatar_path' | 'partner_is_online'>[];
  const partnerIds = rows.map((conversation) => conversation.partner_id);
  const [avatars, onlineIds] = await Promise.all([
    loadAvatarPathMap(partnerIds),
    listOnlineProfileIds(partnerIds),
  ]);
  return rows.map((conversation) => ({
    ...conversation,
    partner_avatar_path: avatars.get(conversation.partner_id) ?? null,
    partner_is_online: onlineIds.has(conversation.partner_id),
  }));
}

export async function markConversationRead(conversationId: string) {
  const { error } = await client().rpc('mark_conversation_read', { target_conversation_id: conversationId });
  if (error) throw error;
}

export async function searchMessageProfiles(query: string) {
  const { data, error } = await client().rpc('search_message_profiles', {
    profile_query: query.trim() || undefined,
    profile_limit: 30,
  });
  if (error) throw error;
  const rows = data as Omit<MessageProfile, 'avatar_path'>[];
  const avatars = await loadAvatarPathMap(rows.map((profile) => profile.user_id));
  return rows.map((profile) => ({ ...profile, avatar_path: avatars.get(profile.user_id) ?? null }));
}

export async function acknowledgeConversation(conversationId:string,throughTime:string) {
  const {error}=await client().rpc('acknowledge_conversation',{target_conversation_id:conversationId,through_time:throughTime});
  if(error)throw error;
}
export async function loadConversationPartner(conversationId:string) {
  const {data,error}=await client().rpc('get_direct_conversation_partner',{target_conversation_id:conversationId});
  if(error)throw error;
  if(!data[0])throw new Error('This conversation is unavailable.');
  return data[0];
}

export function subscribeToInbox(userId: string, onChange: () => void) {
  const activeClient = client();
  const channel = activeClient
    .channel(`inbox:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onChange)
    .subscribe();
  return () => { void activeClient.removeChannel(channel); };
}
