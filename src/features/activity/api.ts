import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type ActivityEvent = Database['public']['Functions']['list_activity_events']['Returns'][number];
export type FeedMode = 'global' | 'following';
export type EngagementSummary = { activity_count: number; message_count: number; global_new: boolean; following_new: boolean; checked_at: string };

export async function loadEngagementSummary(): Promise<EngagementSummary> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('get_engagement_summary');
  if (error) throw error;
  if (!data?.[0]) throw new Error('Activity could not be loaded.');
  return data[0];
}

export async function acknowledgeFeed(mode: FeedMode, throughTime: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('acknowledge_feed', { feed_mode: mode, through_time: throughTime });
  if (error) throw error;
}

export async function loadActivity(before?: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('list_activity_events', { activity_limit: 30, before_created_at: before });
  if (error) throw error;
  return data;
}

export async function markActivityRead(id: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('mark_activity_read', { target_activity_id: id });
  if (error) throw error;
}
