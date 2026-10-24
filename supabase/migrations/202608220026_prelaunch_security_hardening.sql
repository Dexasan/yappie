begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
revoke create on schema public from public, anon, authenticated;

create or replace function private.valid_language_list(candidate text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate is not null
    and cardinality(candidate) between 1 and 8
    and array_position(candidate, null) is null
    and not exists (
      select 1
      from unnest(candidate) language_name
      where char_length(trim(language_name)) not between 2 and 32
         or language_name !~ '^[[:alpha:]][[:alpha:] .''-]{1,31}$'
    )
    and cardinality(candidate) = (
      select count(distinct lower(trim(language_name)))::integer
      from unnest(candidate) language_name
    );
$$;

revoke all on function private.valid_language_list(text[]) from public, anon;
grant execute on function private.valid_language_list(text[]) to authenticated, service_role;

alter table public.profiles
  add constraint profiles_languages_valid
  check (cardinality(languages) = 0 or private.valid_language_list(languages)) not valid;

alter table public.quick_chat_queue
  add constraint quick_chat_queue_languages_valid
  check (private.valid_language_list(languages)) not valid;

-- Keep the policy helper callable for RLS, but prevent arbitrary third-party
-- relationship probing. A caller may only inspect a relationship they are in.
create or replace function public.is_blocked_between(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null or auth.uid() not in (first_user, second_user) then false
    else exists (
      select 1
      from public.blocks
      where (blocker_id = first_user and blocked_id = second_user)
         or (blocker_id = second_user and blocked_id = first_user)
    )
  end;
$$;

-- Conversation membership may only be inspected by somebody who is already a
-- member of that conversation. This remains usable by RLS and gift validation.
create or replace function public.is_conversation_member(target_conversation_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.conversation_members caller_membership
      where caller_membership.conversation_id = target_conversation_id
        and caller_membership.user_id = auth.uid()
    )
    and exists (
      select 1 from public.conversation_members target_membership
      where target_membership.conversation_id = target_conversation_id
        and target_membership.user_id = target_user_id
    );
$$;

-- Raw gift rows are private. Public profile gift rendering continues through
-- list_profile_gifts(), which deliberately omits private context identifiers.
drop policy if exists gifts_select_authenticated_unblocked on public.gifts;
create policy gifts_select_participants
on public.gifts for select to authenticated
using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

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
    and not public.is_blocked_between(auth.uid(), presence.user_id)
    and exists (
      select 1
      from public.direct_conversations direct
      where auth.uid() in (direct.user_low_id, direct.user_high_id)
        and presence.user_id in (direct.user_low_id, direct.user_high_id)
    );
end;
$$;

alter table public.quick_chat_sessions
  add column user_a_last_seen_at timestamptz not null default now(),
  add column user_b_last_seen_at timestamptz not null default now();

create index quick_chat_sessions_presence_idx
  on public.quick_chat_sessions(status, user_a_last_seen_at, user_b_last_seen_at)
  where status = 'active';

create or replace function public.heartbeat_quick_chat(target_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_session public.quick_chat_sessions%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into target_session
  from public.quick_chat_sessions
  where id = target_session_id
  for update;

  if target_session.id is null
     or current_user_id not in (target_session.user_a_id, target_session.user_b_id) then
    raise exception 'Quick Chat not found' using errcode = 'P0002';
  end if;
  if target_session.status <> 'active' then return false; end if;

  if target_session.user_a_last_seen_at < now() - interval '30 seconds'
     or target_session.user_b_last_seen_at < now() - interval '30 seconds' then
    update public.quick_chat_sessions
    set status = 'ended', ended_at = now(), ended_by = current_user_id, end_reason = 'timeout'
    where id = target_session_id;
    return false;
  end if;

  if current_user_id = target_session.user_a_id then
    update public.quick_chat_sessions set user_a_last_seen_at = now() where id = target_session_id;
  else
    update public.quick_chat_sessions set user_b_last_seen_at = now() where id = target_session_id;
  end if;
  return true;
end;
$$;

create or replace function public.can_send_message(target_conversation_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid()
    and exists (
      select 1
      from public.conversation_members own_membership
      join public.conversations conversation on conversation.id = own_membership.conversation_id
      where own_membership.conversation_id = target_conversation_id
        and own_membership.user_id = target_user_id
        and own_membership.left_at is null
        and not exists (
          select 1
          from public.conversation_members other_membership
          where other_membership.conversation_id = target_conversation_id
            and other_membership.user_id <> target_user_id
            and public.is_blocked_between(target_user_id, other_membership.user_id)
        )
        and (
          (
            conversation.kind = 'direct'
            and exists (
              select 1
              from public.conversation_members recipient_membership
              where recipient_membership.conversation_id = target_conversation_id
                and recipient_membership.user_id <> target_user_id
                and recipient_membership.left_at is null
                and public.can_message_user(target_user_id, recipient_membership.user_id)
            )
          )
          or exists (
            select 1
            from public.quick_chat_sessions quick_session
            where quick_session.conversation_id = target_conversation_id
              and quick_session.status = 'active'
              and quick_session.user_a_last_seen_at > now() - interval '30 seconds'
              and quick_session.user_b_last_seen_at > now() - interval '30 seconds'
          )
        )
    );
$$;

create or replace function public.join_quick_chat(match_languages text[], match_topic text default null)
returns table (
  match_status text,
  session_id uuid,
  conversation_id uuid,
  matched_profile_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  effective_languages text[];
  candidate_user_id uuid;
  existing_session_id uuid;
  existing_conversation_id uuid;
  existing_partner_id uuid;
  created_conversation_id uuid;
  created_session_id uuid;
  normalized_topic text := nullif(lower(regexp_replace(trim(match_topic), '\s+', ' ', 'g')), '');
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select profile.languages into effective_languages
  from public.profiles profile
  where profile.id = current_user_id;
  if not private.valid_language_list(effective_languages) then
    raise exception 'Complete your language profile before matching' using errcode = '22023';
  end if;
  if normalized_topic is null or char_length(normalized_topic) not between 2 and 40 then
    raise exception 'Choose an interest before matching' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.user_settings
    where id = current_user_id
      and onboarding_completed_at is not null
      and age_verified_at is not null
  ) then
    raise exception 'Complete age-verified onboarding before matching' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text, 0));

  update public.quick_chat_sessions
  set status = 'ended', ended_at = now(), ended_by = current_user_id, end_reason = 'timeout'
  where status = 'active'
    and current_user_id in (user_a_id, user_b_id)
    and (user_a_last_seen_at < now() - interval '30 seconds'
      or user_b_last_seen_at < now() - interval '30 seconds');

  select quick_session.id,
         quick_session.conversation_id,
         case when quick_session.user_a_id = current_user_id then quick_session.user_b_id else quick_session.user_a_id end
  into existing_session_id, existing_conversation_id, existing_partner_id
  from public.quick_chat_sessions quick_session
  where quick_session.status = 'active'
    and current_user_id in (quick_session.user_a_id, quick_session.user_b_id)
  order by quick_session.started_at desc
  limit 1;

  if existing_session_id is not null then
    if current_user_id = (select user_a_id from public.quick_chat_sessions where id = existing_session_id) then
      update public.quick_chat_sessions set user_a_last_seen_at = now() where id = existing_session_id;
    else
      update public.quick_chat_sessions set user_b_last_seen_at = now() where id = existing_session_id;
    end if;
    return query select 'matched'::text, existing_session_id, existing_conversation_id, existing_partner_id;
    return;
  end if;

  delete from public.quick_chat_queue
  where expires_at <= now() or queued_at <= now() - interval '8 seconds';

  select queued.user_id into candidate_user_id
  from public.quick_chat_queue queued
  where queued.user_id <> current_user_id
    and queued.expires_at > now()
    and queued.queued_at > now() - interval '8 seconds'
    and queued.languages && effective_languages
    and queued.topic = normalized_topic
    and not public.is_blocked_between(current_user_id, queued.user_id)
    and not exists (
      select 1 from public.quick_chat_sessions recent_session
      where recent_session.started_at > now() - interval '5 minutes'
        and ((recent_session.user_a_id = current_user_id and recent_session.user_b_id = queued.user_id)
          or (recent_session.user_b_id = current_user_id and recent_session.user_a_id = queued.user_id))
    )
  order by queued.queued_at
  for update skip locked
  limit 1;

  if candidate_user_id is null then
    insert into public.quick_chat_queue (user_id, languages, topic, queued_at, expires_at)
    values (current_user_id, effective_languages, normalized_topic, now(), now() + interval '8 seconds')
    on conflict (user_id) do update
      set languages = excluded.languages, topic = excluded.topic,
          queued_at = excluded.queued_at, expires_at = excluded.expires_at;
    return query select 'queued'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  delete from public.quick_chat_queue where user_id in (current_user_id, candidate_user_id);
  insert into public.conversations (kind, created_by)
  values ('quick_chat', current_user_id) returning id into created_conversation_id;
  insert into public.conversation_members (conversation_id, user_id)
  values (created_conversation_id, current_user_id), (created_conversation_id, candidate_user_id);
  insert into public.quick_chat_sessions (conversation_id, user_a_id, user_b_id)
  values (created_conversation_id, candidate_user_id, current_user_id)
  returning id into created_session_id;
  return query select 'matched'::text, created_session_id, created_conversation_id, candidate_user_id;
end;
$$;

create or replace function public.get_quick_chat_waiting_count(match_languages text[], match_topic text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  effective_languages text[];
  normalized_topic text := nullif(lower(regexp_replace(trim(match_topic), '\s+', ' ', 'g')), '');
  waiting_count integer;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select languages into effective_languages from public.profiles where id = current_user_id;
  if not private.valid_language_list(effective_languages) then
    raise exception 'Complete your language profile before matching' using errcode = '22023';
  end if;
  if normalized_topic is null or char_length(normalized_topic) not between 2 and 40 then
    raise exception 'Choose an interest before matching' using errcode = '22023';
  end if;
  select count(*)::integer into waiting_count
  from public.quick_chat_queue queued
  where queued.user_id <> current_user_id
    and queued.expires_at > now()
    and queued.queued_at > now() - interval '8 seconds'
    and queued.languages && effective_languages
    and queued.topic = normalized_topic
    and not public.is_blocked_between(current_user_id, queued.user_id);
  return waiting_count;
end;
$$;

-- A small, server-enforced sliding-window limiter protects direct PostgREST
-- writes as well as RPC-backed actions. The table is outside exposed schemas.
create table private.rate_limit_events (
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup_idx
  on private.rate_limit_events(user_id, action, created_at desc);
revoke all on private.rate_limit_events from public, anon, authenticated;

create or replace function private.enforce_rate_limit(
  target_action text,
  maximum_events integer,
  window_interval interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  recent_count integer;
begin
  if current_user_id is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':' || target_action, 0)
  );
  select count(*)::integer into recent_count
  from private.rate_limit_events
  where user_id = current_user_id and action = target_action
    and created_at > now() - window_interval;
  if recent_count >= maximum_events then
    raise exception 'Too many requests. Please slow down.' using errcode = 'P0001';
  end if;
  insert into private.rate_limit_events(user_id, action) values (current_user_id, target_action);
  delete from private.rate_limit_events
  where user_id = current_user_id and created_at < now() - interval '24 hours';
end;
$$;
revoke all on function private.enforce_rate_limit(text, integer, interval) from public, anon, authenticated;

create or replace function private.enforce_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  case tg_table_name
    when 'posts' then perform private.enforce_rate_limit('post', 8, interval '1 minute');
    when 'replies' then perform private.enforce_rate_limit('reply', 20, interval '1 minute');
    when 'messages' then perform private.enforce_rate_limit('message', 60, interval '1 minute');
    when 'reports' then perform private.enforce_rate_limit('report', 10, interval '1 hour');
    when 'follows' then perform private.enforce_rate_limit('follow', 60, interval '1 hour');
    when 'blocks' then perform private.enforce_rate_limit('block', 60, interval '1 hour');
    when 'post_likes' then perform private.enforce_rate_limit('like', 120, interval '1 minute');
    when 'quick_chat_queue' then perform private.enforce_rate_limit('match_poll', 36, interval '1 minute');
    when 'direct_calls' then perform private.enforce_rate_limit('direct_call', 10, interval '10 minutes');
    when 'gifts' then perform private.enforce_rate_limit('gift', 30, interval '1 minute');
    when 'clubs' then perform private.enforce_rate_limit('club_create', 5, interval '24 hours');
    else raise exception 'Unsupported rate-limited table';
  end case;
  return new;
end;
$$;
revoke all on function private.enforce_write_rate_limit() from public, anon, authenticated;

create trigger posts_rate_limit before insert on public.posts for each row execute function private.enforce_write_rate_limit();
create trigger replies_rate_limit before insert on public.replies for each row execute function private.enforce_write_rate_limit();
create trigger messages_rate_limit before insert on public.messages for each row execute function private.enforce_write_rate_limit();
create trigger reports_rate_limit before insert on public.reports for each row execute function private.enforce_write_rate_limit();
create trigger follows_rate_limit before insert on public.follows for each row execute function private.enforce_write_rate_limit();
create trigger blocks_rate_limit before insert on public.blocks for each row execute function private.enforce_write_rate_limit();
create trigger post_likes_rate_limit before insert on public.post_likes for each row execute function private.enforce_write_rate_limit();
create trigger quick_chat_queue_rate_limit before insert or update on public.quick_chat_queue for each row execute function private.enforce_write_rate_limit();
create trigger direct_calls_rate_limit before insert on public.direct_calls for each row execute function private.enforce_write_rate_limit();
create trigger gifts_rate_limit before insert on public.gifts for each row execute function private.enforce_write_rate_limit();
create trigger clubs_rate_limit before insert on public.clubs for each row execute function private.enforce_write_rate_limit();

create or replace function public.consume_audio_rate_limit(target_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if target_action = 'create_session' then
    perform private.enforce_rate_limit('audio_create_session', 12, interval '1 minute');
  elsif target_action in ('publish', 'pull', 'renegotiate', 'close_session', 'disconnect', 'revoke_publisher', 'close_room') then
    perform private.enforce_rate_limit('audio_operation', 180, interval '1 minute');
  else
    raise exception 'Unsupported audio action' using errcode = '22023';
  end if;
  return true;
end;
$$;
revoke all on function public.consume_audio_rate_limit(text) from public, anon;
grant execute on function public.consume_audio_rate_limit(text) to authenticated;

-- Avatar pointers can only reference objects in the caller's own folder.
revoke update (avatar_path) on public.profiles from authenticated;
create or replace function public.set_profile_avatar(target_avatar_path text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_path text := nullif(trim(target_avatar_path), '');
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if normalized_path is not null
     and (normalized_path not like current_user_id::text || '/%'
       or normalized_path !~ ('^' || current_user_id::text || '/avatar-[0-9]+\.(jpg|png|webp)$')) then
    raise exception 'Invalid profile picture path' using errcode = '22023';
  end if;
  update public.profiles set avatar_path = normalized_path where id = current_user_id;
  return normalized_path;
end;
$$;
revoke all on function public.set_profile_avatar(text) from public, anon;
grant execute on function public.set_profile_avatar(text) to authenticated;

update storage.buckets
set file_size_limit = 3145728
where id in ('avatars', 'club-avatars');

-- The old self-service RPC trusted only possession of a session. Deletion is
-- now service-only after password reauthentication in the delete-account Edge Function.
revoke all on function public.delete_my_account() from authenticated;

create or replace function public.admin_delete_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  delete from public.clubs where created_by = target_user_id;
  delete from public.club_rooms where host_id = target_user_id;
  delete from public.conversations conversation
  where conversation.created_by = target_user_id
     or exists (
       select 1 from public.conversation_members membership
       where membership.conversation_id = conversation.id and membership.user_id = target_user_id
     );
  delete from public.messages where sender_id = target_user_id;
  delete from public.quick_chat_sessions where user_a_id = target_user_id or user_b_id = target_user_id;
  delete from auth.users where id = target_user_id;
  if not found then raise exception 'Account not found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.admin_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_account(uuid) to service_role;

revoke all on function public.heartbeat_quick_chat(uuid) from public, anon;
grant execute on function public.heartbeat_quick_chat(uuid) to authenticated;

alter function public.touch_room_audio_session() set search_path = '';
alter function public.close_invalid_participant_audio_sessions() set search_path = '';
alter function public.close_ended_room_audio_sessions() set search_path = '';
alter function public.close_ended_call_audio_sessions() set search_path = '';
alter function public.set_call_availability(boolean) set search_path = '';
alter function public.list_available_call_profiles() set search_path = '';
alter function public.request_direct_call(uuid) set search_path = '';
alter function public.respond_direct_call(uuid, boolean) set search_path = '';
alter function public.end_direct_call(uuid, text) set search_path = '';
alter function public.heartbeat_direct_call(uuid) set search_path = '';
alter function public.set_club_avatar(uuid, text) set search_path = '';

commit;
