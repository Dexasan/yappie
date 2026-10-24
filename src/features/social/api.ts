import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function followProfile(followerId: string, followedId: string) {
  const { error } = await client().from('follows').insert({ follower_id: followerId, followed_id: followedId });
  if (error && error.code !== '23505') throw error;
}

export async function unfollowProfile(followerId: string, followedId: string) {
  const { error } = await client()
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('followed_id', followedId);
  if (error) throw error;
}

export async function isFollowingProfile(followerId: string, followedId: string) {
  const { data, error } = await client()
    .from('follows')
    .select('followed_id')
    .eq('follower_id', followerId)
    .eq('followed_id', followedId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function getOrCreateDirectConversation(otherUserId: string) {
  const { data, error } = await client().rpc('get_or_create_direct_conversation', { other_user_id: otherUserId });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('The conversation could not be opened. Please try again.');
  return data;
}

export type SocialStats = {
  followers: number;
  following: number;
  posts: number;
};

export type PublicProfilePost = {
  body: string;
  created_at: string;
  id: string;
  topic: string | null;
};

export type ConnectionMode = 'followers' | 'following';

export type ConnectionProfile = Pick<
  Tables<'profiles'>,
  'id' | 'handle' | 'display_name' | 'country_code' | 'languages' | 'bio' | 'avatar_path'
> & {
  viewer_follows: boolean;
};

export type UpdateProfileInput = {
  bio: string;
  countryCode: string | null;
  displayName: string;
  handle: string;
  languages: string[];
};

export async function isHandleAvailable(handle: string) {
  const { data, error } = await client().rpc('is_handle_available', { candidate_handle: handle });
  if (error) throw error;
  return Boolean(data);
}

export async function updateOwnProfile(userId: string, input: UpdateProfileInput) {
  const { error } = await client()
    .from('profiles')
    .update({
      bio: input.bio,
      country_code: input.countryCode,
      display_name: input.displayName,
      handle: input.handle,
      languages: input.languages,
    })
    .eq('id', userId);

  if (error) throw error;
}

export async function loadSocialStats(userId: string): Promise<SocialStats> {
  const db = client();
  const [followingResult, followersResult, postsResult] = await Promise.all([
    db.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
    db.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', userId),
    db.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', userId).is('deleted_at', null),
  ]);

  if (followingResult.error) throw followingResult.error;
  if (followersResult.error) throw followersResult.error;
  if (postsResult.error) throw postsResult.error;

  return {
    followers: followersResult.count ?? 0,
    following: followingResult.count ?? 0,
    posts: postsResult.count ?? 0,
  };
}

export const loadOwnSocialStats = loadSocialStats;

export async function loadProfilePosts(userId: string) {
  const { data, error } = await client()
    .from('posts')
    .select('id, body, topic, created_at')
    .eq('author_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw error;
  return data as PublicProfilePost[];
}

export async function loadProfileConnections(profileId: string, viewerId: string, mode: ConnectionMode) {
  const db = client();
  let profileIds: string[];

  if (mode === 'followers') {
    const { data, error } = await db
      .from('follows')
      .select('follower_id, created_at')
      .eq('followed_id', profileId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    profileIds = data.map((item) => item.follower_id);
  } else {
    const { data, error } = await db
      .from('follows')
      .select('followed_id, created_at')
      .eq('follower_id', profileId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    profileIds = data.map((item) => item.followed_id);
  }

  if (profileIds.length === 0) return [];

  const [profilesResult, viewerFollowsResult] = await Promise.all([
    db
      .from('profiles')
      .select('id, handle, display_name, country_code, languages, bio, avatar_path')
      .in('id', profileIds),
    db
      .from('follows')
      .select('followed_id')
      .eq('follower_id', viewerId)
      .in('followed_id', profileIds),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (viewerFollowsResult.error) throw viewerFollowsResult.error;

  const viewerFollows = new Set(viewerFollowsResult.data.map((item) => item.followed_id));
  const profileById = new Map(profilesResult.data.map((item) => [item.id, item]));

  return profileIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
    .map((profile) => ({ ...profile, viewer_follows: viewerFollows.has(profile.id) })) as ConnectionProfile[];
}
