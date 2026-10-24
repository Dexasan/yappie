import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

export type NotificationPreferences = { messages:boolean; replies:boolean; likes_follows:boolean; club_reminders:boolean; previews:boolean; quiet_start:number|null; quiet_end:number|null; timezone:string };
export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const {data,error}=await supabase.rpc('get_notification_preferences');
  if(error) throw error;
  return data as unknown as NotificationPreferences;
}
export async function saveNotificationPreferences(preferences: NotificationPreferences) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const {error}=await supabase.rpc('set_notification_preferences',{preferences:preferences as unknown as Json});
  if(error) throw error;
}
export async function setNotificationAttention(conversationId: string | null) {
  if (!supabase) return;
  const {error}=await supabase.rpc('set_notification_attention',{target_conversation_id:conversationId ?? undefined});
  if(error) throw error;
}
