begin;

-- Matching remains the entry point. Reuse its selected interests privately.
create table private.discovery_interests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interests text[] not null default '{}',
  updated_at timestamptz not null default now()
);
revoke all on private.discovery_interests from public, anon, authenticated;
create function private.remember_discovery_interests()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.discovery_interests(user_id, interests) values(new.user_id, new.interests)
  on conflict(user_id) do update set interests = excluded.interests, updated_at = now();
  return new;
end;
$$;
revoke all on function private.remember_discovery_interests() from public, anon, authenticated;
create trigger remember_discovery_interests after insert or update of interests on public.quick_chat_queue
for each row execute function private.remember_discovery_interests();
insert into private.discovery_interests(user_id, interests)
select user_id, interests from public.quick_chat_queue on conflict do nothing;

create function public.join_quick_chat_v3(match_interests text[])
returns table(match_status text,session_id uuid,conversation_id uuid,matched_profile_id uuid,matched_interests text[])
language plpgsql security definer set search_path = '' as $$
begin
  -- Existing matching validates interests, language eligibility, age, and blocks.
  return query select * from public.join_quick_chat_v2(match_interests);
  insert into private.discovery_interests(user_id,interests) values(auth.uid(),private.normalize_match_interests(match_interests))
  on conflict(user_id) do update set interests=excluded.interests,updated_at=now()
    where private.discovery_interests.interests is distinct from excluded.interests;
end;
$$;
revoke all on function public.join_quick_chat_v3(text[]) from public,anon;
grant execute on function public.join_quick_chat_v3(text[]) to authenticated;

create table public.post_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  saved boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(user_id,post_id)
);
alter table public.post_preferences enable row level security;
revoke all on public.post_preferences from anon, authenticated;
grant select, insert, update, delete on public.post_preferences to authenticated;
create policy post_preferences_own on public.post_preferences for all to authenticated
using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()) and exists (
  select 1 from public.posts p where p.id = post_id and p.deleted_at is null
    and not public.is_blocked_between((select auth.uid()), p.author_id)));

-- Cursor includes rank and ID; age is fixed to snapshot_time across pagination.
create function public.get_discover_feed(feed_limit integer default 30, snapshot_time timestamptz default now(), before_score double precision default null, before_id uuid default null)
returns table(post_id uuid, author_id uuid, author_display_name text, author_handle text,
  author_country_code text, body text, topic text, created_at timestamptz,
  like_count bigint, reply_count bigint, liked_by_me boolean, ranking_score double precision)
language sql stable security definer set search_path = '' as $$
  with interests as (
    select unnest(di.interests) as term from private.discovery_interests di where di.user_id = auth.uid()
    union select lower(c.topic) from public.clubs c join public.club_memberships cm on cm.club_id = c.id
      where cm.user_id = auth.uid() and cm.status = 'active'
    union select lower(p.topic) from public.posts p join public.post_likes l on l.post_id = p.id
      where l.user_id = auth.uid() and p.topic is not null and p.deleted_at is null
        and not public.is_blocked_between(auth.uid(),p.author_id)
  ), candidates as (
    select p.*, a.display_name, a.handle, a.country_code, a.languages,
      row_number() over(partition by p.author_id order by p.created_at desc,p.id desc) as author_position
    from public.posts p join public.profiles a on a.id = p.author_id
    where auth.uid() is not null and p.club_id is null and p.deleted_at is null
      and p.created_at <= least(snapshot_time, now())
      and not public.is_blocked_between(auth.uid(),p.author_id)
      and not exists(select 1 from public.post_preferences pref where pref.user_id = auth.uid() and pref.post_id = p.id and pref.hidden)
  ), ranked as (
    select c.*,
      (4.0 * least(3,(select count(*) from interests i where
          to_tsvector('simple',coalesce(c.topic,'') || ' ' || c.body) @@ plainto_tsquery('simple',i.term)))
       + case when exists(select 1 from public.profiles own where own.id = auth.uid() and own.languages && c.languages) then 2.0 else 0.0 end
       + case when exists(select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = c.author_id) then 3.0 else 0.0 end
       + 3.0 / (1.0 + greatest(0,extract(epoch from (least(snapshot_time,now())-c.created_at)))/86400.0)
       + least(2.0,(select count(*)::double precision / 5 from public.post_likes l join public.posts p on p.id=l.post_id
           where l.user_id=auth.uid() and p.author_id=c.author_id and p.deleted_at is null))
       - least(3.0,(c.author_position - 1)::double precision * 0.5))::double precision as score
    from candidates c
  )
  select r.id,r.author_id,r.display_name,r.handle,r.country_code,r.body,r.topic,r.created_at,
    (select count(*) from public.post_likes l where l.post_id=r.id),
    (select count(*) from public.replies reply where reply.post_id=r.id and reply.deleted_at is null),
    exists(select 1 from public.post_likes l where l.post_id=r.id and l.user_id=auth.uid()),r.score
  from ranked r where before_score is null or (r.score,r.id) < (before_score,before_id)
  order by r.score desc,r.id desc limit least(greatest(feed_limit,1),50);
$$;
revoke all on function public.get_discover_feed(integer,timestamptz,double precision,uuid) from public,anon;
grant execute on function public.get_discover_feed(integer,timestamptz,double precision,uuid) to authenticated;

-- Hidden posts never cause a permanent Discover dot.
create or replace function public.get_engagement_summary()
returns table(activity_count bigint, message_count bigint, global_new boolean, following_new boolean, checked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select public.get_activity_unread_count(),
    (select count(*) from public.messages m
      join public.direct_conversations d on d.conversation_id = m.conversation_id
      join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
      where auth.uid() in (d.user_low_id,d.user_high_id) and m.sender_id <> auth.uid() and m.deleted_at is null
        and m.created_at > coalesce(cm.last_read_at,cm.joined_at)
        and not public.is_blocked_between(auth.uid(),m.sender_id)),
    exists(select 1 from public.posts p where auth.uid() is not null and p.club_id is null and p.author_id <> auth.uid()
      and p.deleted_at is null and not public.is_blocked_between(auth.uid(),p.author_id)
      and not exists(select 1 from public.post_preferences pref where pref.user_id=auth.uid() and pref.post_id=p.id and pref.hidden)
      and p.created_at > coalesce((select seen_through from public.feed_read_positions where user_id=auth.uid() and feed_mode='global'),'-infinity'::timestamptz)),
    exists(select 1 from public.posts p where auth.uid() is not null and p.club_id is null and p.author_id <> auth.uid()
      and p.deleted_at is null and not public.is_blocked_between(auth.uid(),p.author_id)
      and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=p.author_id)
      and p.created_at > coalesce((select seen_through from public.feed_read_positions where user_id=auth.uid() and feed_mode='following'),'-infinity'::timestamptz)), now();
$$;
commit;
