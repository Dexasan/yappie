import { supabase } from '@/lib/supabase';
import { loadAvatarPathMap } from '@/features/profile/avatar-data';
import { uniqueRealtimeTopic } from '@/lib/realtime-topic';

export type FeedPost = {
  author_avatar_path: string | null;
  author_country_code: string | null;
  author_display_name: string | null;
  author_handle: string | null;
  author_id: string;
  body: string;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  post_id: string;
  reply_count: number;
  topic: string | null;
  ranking_score?: number;
};

export type FeedReply = {
  author_avatar_path: string | null;
  author_display_name: string | null;
  author_handle: string | null;
  author_id: string;
  body: string;
  created_at: string;
  reply_id: string;
  parent_reply_id: string | null;
  parent_author_name: string | null;
  parent_body_preview: string | null;
};

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function loadFeed(beforeCreatedAt?: string) {
  const { data, error } = await client().rpc('get_feed', {
    feed_limit: 30,
    before_created_at: beforeCreatedAt,
  });
  if (error) throw error;
  const rows = data as Omit<FeedPost, 'author_avatar_path'>[];
  const avatars = await loadAvatarPathMap(rows.map((post) => post.author_id));
  return rows.map((post) => ({ ...post, author_avatar_path: avatars.get(post.author_id) ?? null }));
}

export async function loadFollowingFeed(beforeCreatedAt?: string) {
  const { data, error } = await client().rpc('get_following_feed', {
    feed_limit: 30,
    before_created_at: beforeCreatedAt,
  });
  if (error) throw error;
  const rows = data as Omit<FeedPost, 'author_avatar_path'>[];
  const avatars = await loadAvatarPathMap(rows.map((post) => post.author_id));
  return rows.map((post) => ({ ...post, author_avatar_path: avatars.get(post.author_id) ?? null }));
}

export async function loadDiscoverFeed(snapshot: string, cursor?: FeedPost) {
  const { data, error } = await client().rpc('get_discover_feed', { feed_limit: 30, snapshot_time: snapshot, before_score: cursor?.ranking_score, before_id: cursor?.post_id });
  if (error) throw error;
  const avatars = await loadAvatarPathMap(data.map(post => post.author_id));
  return data.map(post => ({ ...post, author_avatar_path: avatars.get(post.author_id) ?? null }));
}

export async function createPost(authorId: string, body: string, topic?: string) {
  const { data, error } = await client()
    .from('posts')
    .insert({ author_id: authorId, body: body.trim(), topic: topic || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setPostLiked(postId: string, userId: string, liked: boolean) {
  if (liked) {
    const { error } = await client().from('post_likes').insert({ post_id: postId, user_id: userId });
    if (error && error.code !== '23505') throw error;
    return;
  }

  const { error } = await client().from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}

export async function loadPostReplies(postId: string) {
  const { data, error } = await client().rpc('get_post_replies_v2', { target_post_id: postId });
  if (error) throw error;
  const rows = data as Omit<FeedReply, 'author_avatar_path'>[];
  const avatars = await loadAvatarPathMap(rows.map((reply) => reply.author_id));
  return rows.map((reply) => ({ ...reply, author_avatar_path: avatars.get(reply.author_id) ?? null }));
}

export async function createReply(postId: string, authorId: string, body: string, parentReplyId: string | null = null) {
  const { data, error } = await client()
    .from('replies')
    .insert({ post_id: postId, author_id: authorId, body: body.trim(), parent_reply_id: parentReplyId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function loadPost(postId: string): Promise<FeedPost | null> {
  const { data: post, error } = await client().from('posts').select('*').eq('id', postId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!post) return null;
  const { data: author, error: authorError } = await client().from('profiles').select('display_name,handle,country_code,avatar_path').eq('id', post.author_id).maybeSingle();
  if (authorError) throw authorError;
  if (!author) return null;
  return { post_id: post.id, author_id: post.author_id, author_display_name: author.display_name, author_handle: author.handle, author_country_code: author.country_code, author_avatar_path: author.avatar_path, body: post.body, topic: post.topic, created_at: post.created_at, like_count: 0, reply_count: 0, liked_by_me: false };
}

export function subscribeToPost(postId: string, onChange: () => void) {
  const activeClient = client();
  const channel = activeClient.channel(uniqueRealtimeTopic(`post:${postId}`))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'replies', filter: `post_id=eq.${postId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `id=eq.${postId}` }, onChange)
    .subscribe();
  return () => { void activeClient.removeChannel(channel); };
}

export function subscribeToNewPosts(onPost: () => void) {
  const activeClient = client();
  const channel = activeClient
    .channel(uniqueRealtimeTopic('feed:new-posts'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, onPost)
    .subscribe();
  return () => { void activeClient.removeChannel(channel); };
}
