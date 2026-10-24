begin;

alter table public.replies add column parent_reply_id uuid references public.replies(id) on delete set null;
create index replies_parent_reply_idx on public.replies(parent_reply_id) where parent_reply_id is not null;

create function private.validate_reply_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_reply_id is not null and (
    new.parent_reply_id = new.id or not exists (
      select 1 from public.replies parent
      where parent.id = new.parent_reply_id and parent.post_id = new.post_id
        and parent.deleted_at is null
        and (auth.uid() is null or not public.is_blocked_between(auth.uid(), parent.author_id))
    )
  ) then
    raise exception 'This comment is no longer available to reply to.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_reply_parent() from public, anon, authenticated;
create trigger replies_validate_parent before insert or update of parent_reply_id, post_id on public.replies
for each row execute function private.validate_reply_parent();

-- Keep the old RPC available for previously shared APKs.
create function public.get_post_replies_v2(target_post_id uuid)
returns table (
  reply_id uuid, author_id uuid, author_display_name text, author_handle text,
  body text, created_at timestamptz, parent_reply_id uuid,
  parent_author_name text, parent_body_preview text
)
language sql stable security definer set search_path = '' as $$
  select reply.id, reply.author_id, author.display_name, author.handle,
    reply.body, reply.created_at, reply.parent_reply_id,
    coalesce(parent_author.display_name, parent_author.handle), left(parent.body, 100)
  from public.replies reply
  join public.posts post on post.id = reply.post_id
  join public.profiles author on author.id = reply.author_id
  left join public.replies parent on parent.id = reply.parent_reply_id
    and parent.deleted_at is null and not public.is_blocked_between(auth.uid(), parent.author_id)
  left join public.profiles parent_author on parent_author.id = parent.author_id
  where auth.uid() is not null and reply.post_id = target_post_id
    and reply.deleted_at is null and post.deleted_at is null
    and not public.is_blocked_between(auth.uid(), post.author_id)
    and not public.is_blocked_between(auth.uid(), reply.author_id)
  order by reply.created_at, reply.id;
$$;
revoke all on function public.get_post_replies_v2(uuid) from public, anon;
grant execute on function public.get_post_replies_v2(uuid) to authenticated;

create or replace function public.notify_post_reply_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare post_owner uuid; parent_owner uuid; preview text;
begin
  select author_id, left(body, 120) into post_owner, preview
  from public.posts where id = new.post_id and deleted_at is null;
  select author_id into parent_owner from public.replies where id = new.parent_reply_id and deleted_at is null;
  insert into public.activity_events (recipient_id, actor_id, kind, source_id, post_id, metadata, created_at)
  select distinct recipient, new.author_id, 'post_reply', new.id, new.post_id,
    jsonb_build_object('post_preview', preview, 'reply_preview', left(new.body,120), 'parent_reply_id',new.parent_reply_id), new.created_at
  from unnest(array[post_owner,parent_owner]) recipient
  where recipient is not null and recipient <> new.author_id
    and not public.is_blocked_between(new.author_id, recipient);
  return new;
end;
$$;

create or replace function public.search_message_profiles(profile_query text default null, profile_limit integer default 30)
returns table (user_id uuid, display_name text, handle text, country_code text, languages text[], bio text, is_following boolean, follows_me boolean)
language sql stable security definer set search_path = '' as $$
  with query as (select lower(left(ltrim(trim(coalesce(profile_query,'')), '@'),40)) as term)
  select profile.id, profile.display_name, profile.handle, profile.country_code, profile.languages, profile.bio,
    exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=profile.id),
    exists(select 1 from public.follows f where f.follower_id=profile.id and f.followed_id=auth.uid())
  from public.profiles profile
  join public.user_settings settings on settings.id=profile.id and settings.onboarding_completed_at is not null
  join auth.users account on account.id=profile.id
  cross join query
  where auth.uid() is not null and profile.id<>auth.uid()
    and exists(select 1 from public.user_settings viewer where viewer.id=auth.uid() and viewer.onboarding_completed_at is not null)
    and public.can_message_user(auth.uid(),profile.id)
    -- Reserved-domain fixtures and explicitly marked internal accounts never enter the picker.
    and coalesce(account.email,'') !~* '@(example\.(com|org|net|test)|[^@]+\.invalid)$'
    and coalesce(account.raw_app_meta_data->>'is_test_account','false') <> 'true'
    and coalesce(account.raw_app_meta_data->>'is_bot','false') <> 'true'
    and (
      (query.term='' and (
        exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=profile.id)
        or exists(select 1 from public.direct_conversations d where
          (d.user_low_id=auth.uid() and d.user_high_id=profile.id) or
          (d.user_high_id=auth.uid() and d.user_low_id=profile.id))
      ))
      or (char_length(query.term)>=2 and (
        strpos(lower(coalesce(profile.display_name,'')),query.term)>0
        or starts_with(lower(coalesce(profile.handle,'')),query.term)
      ))
    )
  order by 7 desc, profile.display_name nulls last, profile.id
  limit least(greatest(coalesce(profile_limit,30),1),30);
$$;
revoke all on function public.search_message_profiles(text,integer) from public,anon;
grant execute on function public.search_message_profiles(text,integer) to authenticated;

commit;
