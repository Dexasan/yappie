import { supabase } from '@/lib/supabase';

export async function setPostPreference(postId: string, kind: 'saved' | 'hidden', value: boolean) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('set_post_preference', { target_post_id: postId, preference_kind: kind, enabled: value });
  if (error) throw error;
}

export async function listSavedPosts() {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('list_saved_posts');
  if (error) throw error;
  return data;
}

export async function deleteContent(kind: 'post' | 'reply', id: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('delete_own_content', { content_kind: kind, target_id: id });
  if (error) throw error;
}

export async function reportContent(kind: 'post' | 'reply', id: string, authorId: string, category: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!data.user) throw new Error('Sign in to report content.');
  const { error } = await supabase.from('reports').insert({ reporter_id: data.user.id, target_kind: kind, target_id: id, target_user_id: authorId, category, details: `Reported ${kind} from its content menu` });
  if (error) throw error;
}
