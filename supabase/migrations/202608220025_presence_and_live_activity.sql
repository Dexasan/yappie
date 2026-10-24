begin;

create table public.app_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index app_presence_recent_idx on public.app_presence(last_seen_at desc);

alter table public.app_presence enable row level security;
revoke all on public.app_presence from anon, authenticated;

create or replace function public.set_app_presence(target_active boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not target_active then
    delete from public.app_presence where user_id = current_user_id;
    return false;
  end if;

  insert into public.app_presence(user_id, last_seen_at)
  values (current_user_id, now())
  on conflict (user_id) do update set last_seen_at = now();
  return true;
end;
$$;

create or replace function public.list_online_profiles(target_user_ids uuid[])
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if cardinality(coalesce(target_user_ids, '{}'::uuid[])) > 100 then
    raise exception 'Too many profiles requested' using errcode = '22023';
  end if;

  return query
  select presence.user_id
  from public.app_presence presence
  where presence.user_id = any(coalesce(target_user_ids, '{}'::uuid[]))
    and presence.last_seen_at > now() - interval '22 seconds'
    and exists (
      select 1
      from public.direct_conversations direct
      where auth.uid() in (direct.user_low_id, direct.user_high_id)
        and presence.user_id in (direct.user_low_id, direct.user_high_id)
    );
end;
$$;

create or replace function public.get_quick_chat_matching_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 0
    else count(*)::integer
  end
  from public.quick_chat_queue queued
  where queued.expires_at > now()
    and queued.queued_at > now() - interval '8 seconds';
$$;

create or replace function public.set_call_availability(target_available boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  update public.direct_calls
  set status = 'missed', ended_at = now(), end_reason = 'No answer'
  where status = 'requested'
    and created_at < now() - interval '35 seconds'
    and (caller_id = current_user_id or callee_id = current_user_id);

  update public.direct_calls
  set status = 'ended', ended_at = now(), end_reason = 'Connection lost'
  where status = 'accepted'
    and (
      (caller_id = current_user_id and coalesce(caller_last_seen_at, accepted_at, created_at) < now() - interval '16 seconds')
      or
      (callee_id = current_user_id and coalesce(callee_last_seen_at, accepted_at, created_at) < now() - interval '16 seconds')
    );

  if not target_available then
    delete from public.call_availability where user_id = current_user_id;
    return false;
  end if;

  if exists (
    select 1 from public.direct_calls
    where status in ('requested', 'accepted')
      and (caller_id = current_user_id or callee_id = current_user_id)
  ) then
    delete from public.call_availability where user_id = current_user_id;
    return false;
  end if;

  insert into public.call_availability(user_id, last_seen_at)
  values (current_user_id, now())
  on conflict (user_id) do update set last_seen_at = now();
  return true;
end;
$$;

create or replace function public.list_available_call_profiles()
returns table (
  user_id uuid,
  display_name text,
  handle text,
  country_code text,
  languages text[],
  avatar_path text,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id,
    profile.display_name,
    profile.handle,
    profile.country_code,
    profile.languages,
    profile.avatar_path,
    available.last_seen_at
  from public.call_availability available
  join public.profiles profile on profile.id = available.user_id
  where auth.uid() is not null
    and available.user_id <> auth.uid()
    and available.last_seen_at > now() - interval '18 seconds'
    and profile.display_name is not null
    and not public.is_blocked_between(auth.uid(), available.user_id)
    and not exists (
      select 1 from public.direct_calls busy
      where busy.status in ('requested', 'accepted')
        and (busy.caller_id = available.user_id or busy.callee_id = available.user_id)
    )
  order by available.last_seen_at desc
  limit 30;
$$;

create or replace function public.request_direct_call(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  created_call_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Choose another person to call.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(least(current_user_id, target_user_id)::text || greatest(current_user_id, target_user_id)::text, 0));

  if public.is_blocked_between(current_user_id, target_user_id) then
    raise exception 'This person is not available.';
  end if;
  if not exists (
    select 1 from public.call_availability
    where user_id = target_user_id and last_seen_at > now() - interval '18 seconds'
  ) then
    raise exception 'This person is no longer available.';
  end if;
  if exists (
    select 1 from public.direct_calls
    where status in ('requested', 'accepted')
      and (caller_id in (current_user_id, target_user_id) or callee_id in (current_user_id, target_user_id))
  ) then
    raise exception 'One of you is already handling another call.';
  end if;

  insert into public.direct_calls(caller_id, callee_id)
  values (current_user_id, target_user_id)
  returning id into created_call_id;

  delete from public.call_availability where user_id in (current_user_id, target_user_id);
  return created_call_id;
end;
$$;

create or replace function public.heartbeat_direct_call(target_call_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_call public.direct_calls%rowtype;
  partner_last_seen timestamptz;
begin
  select * into target_call from public.direct_calls where id = target_call_id for update;
  if target_call.id is null or current_user_id not in (target_call.caller_id, target_call.callee_id) then
    raise exception 'Call not found.';
  end if;
  if target_call.status <> 'accepted' then
    return false;
  end if;

  partner_last_seen := case
    when current_user_id = target_call.caller_id then target_call.callee_last_seen_at
    else target_call.caller_last_seen_at
  end;
  if coalesce(partner_last_seen, target_call.accepted_at, target_call.created_at) < now() - interval '16 seconds' then
    update public.direct_calls
    set status = 'ended', ended_at = now(), ended_by = current_user_id, end_reason = 'Connection lost'
    where id = target_call_id;
    return false;
  end if;

  if current_user_id = target_call.caller_id then
    update public.direct_calls set caller_last_seen_at = now() where id = target_call_id;
  else
    update public.direct_calls set callee_last_seen_at = now() where id = target_call_id;
  end if;
  return true;
end;
$$;

revoke all on function public.set_app_presence(boolean) from public, anon;
revoke all on function public.list_online_profiles(uuid[]) from public, anon;
revoke all on function public.get_quick_chat_matching_count() from public, anon;

grant execute on function public.set_app_presence(boolean) to authenticated;
grant execute on function public.list_online_profiles(uuid[]) to authenticated;
grant execute on function public.get_quick_chat_matching_count() to authenticated;

commit;
