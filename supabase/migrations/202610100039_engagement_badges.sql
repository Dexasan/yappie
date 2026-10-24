begin;

create table public.feed_read_positions (
  user_id uuid not null references auth.users(id) on delete cascade,
  feed_mode text not null check (feed_mode in ('global', 'following')),
  seen_through timestamptz not null,
  primary key (user_id, feed_mode)
);
alter table public.feed_read_positions enable row level security;
revoke all on public.feed_read_positions from anon, authenticated;

-- One visibility definition for the activity list and its badge.
create or replace function public.get_activity_unread_count()
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from public.activity_events a
  where a.recipient_id = auth.uid() and a.read_at is null
    and not public.is_blocked_between(auth.uid(), a.actor_id)
    and (a.post_id is null or exists (
      select 1 from public.posts p where p.id = a.post_id and p.deleted_at is null
        and not public.is_blocked_between(auth.uid(), p.author_id)
    ));
$$;

create or replace function public.list_activity_events(activity_limit integer default 50, before_created_at timestamptz default null)
returns table (activity_id uuid, actor_id uuid, actor_display_name text, actor_handle text,
  actor_country_code text, kind text, source_id uuid, post_id uuid, post_body text,
  post_author_id uuid, post_author_name text, metadata jsonb, read_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.actor_id, actor.display_name, actor.handle, actor.country_code, a.kind,
    a.source_id, a.post_id, p.body, p.author_id, owner.display_name, a.metadata, a.read_at, a.created_at
  from public.activity_events a
  join public.profiles actor on actor.id = a.actor_id
  left join public.posts p on p.id = a.post_id and p.deleted_at is null
  left join public.profiles owner on owner.id = p.author_id
  where a.recipient_id = auth.uid()
    and (before_created_at is null or a.created_at < before_created_at)
    and not public.is_blocked_between(auth.uid(), a.actor_id)
    and (a.post_id is null or (p.id is not null and not public.is_blocked_between(auth.uid(), p.author_id)))
  order by a.created_at desc, a.id desc limit least(greatest(activity_limit, 1), 100);
$$;

create function public.acknowledge_feed(feed_mode text, through_time timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if feed_mode not in ('global', 'following') or through_time is null or through_time > now() then
    raise exception 'Invalid feed position';
  end if;
  insert into public.feed_read_positions(user_id, feed_mode, seen_through)
  values (auth.uid(), feed_mode, through_time)
  on conflict on constraint feed_read_positions_pkey do update
    set seen_through = greatest(public.feed_read_positions.seen_through, excluded.seen_through);
end;
$$;

create function public.get_engagement_summary()
returns table(activity_count bigint, message_count bigint, global_new boolean, following_new boolean, checked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select public.get_activity_unread_count(),
    (select count(*) from public.messages m
      join public.direct_conversations d on d.conversation_id = m.conversation_id
      join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
      where auth.uid() in (d.user_low_id, d.user_high_id) and m.sender_id <> auth.uid()
        and m.deleted_at is null and m.created_at > coalesce(cm.last_read_at, cm.joined_at)
        and not public.is_blocked_between(auth.uid(), m.sender_id)),
    exists(select 1 from public.posts p where auth.uid() is not null and p.club_id is null
      and p.author_id <> auth.uid() and p.deleted_at is null
      and not public.is_blocked_between(auth.uid(), p.author_id)
      and p.created_at > coalesce((select seen_through from public.feed_read_positions where user_id = auth.uid() and feed_mode = 'global'), '-infinity'::timestamptz)),
    exists(select 1 from public.posts p where auth.uid() is not null and p.club_id is null
      and p.author_id <> auth.uid() and p.deleted_at is null
      and not public.is_blocked_between(auth.uid(), p.author_id)
      and exists(select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = p.author_id)
      and p.created_at > coalesce((select seen_through from public.feed_read_positions where user_id = auth.uid() and feed_mode = 'following'), '-infinity'::timestamptz)), now();
$$;

revoke all on function public.acknowledge_feed(text,timestamptz) from public, anon;
revoke all on function public.get_engagement_summary() from public, anon;
grant execute on function public.acknowledge_feed(text,timestamptz) to authenticated;
grant execute on function public.get_engagement_summary() to authenticated;

-- Membership changes also reconcile badge state on other signed-in devices.
do $$ begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null; end $$;

commit;
