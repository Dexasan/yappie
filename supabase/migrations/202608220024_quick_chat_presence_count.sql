begin;

create or replace function public.get_quick_chat_waiting_count(match_languages text[], match_topic text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_topic text := nullif(lower(trim(match_topic)), '');
  waiting_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if match_languages is null or cardinality(match_languages) not between 1 and 8 then
    raise exception 'Choose between one and eight languages' using errcode = '22023';
  end if;

  if normalized_topic is null or char_length(normalized_topic) not between 2 and 40 then
    raise exception 'Choose an interest before matching' using errcode = '22023';
  end if;

  select count(*)::integer
  into waiting_count
  from public.quick_chat_queue queued
  where queued.user_id <> current_user_id
    and queued.expires_at > now()
    and queued.queued_at > now() - interval '8 seconds'
    and queued.languages && match_languages
    and queued.topic = normalized_topic
    and not public.is_blocked_between(current_user_id, queued.user_id)
    and not exists (
      select 1
      from public.quick_chat_sessions recent_session
      where recent_session.started_at > now() - interval '5 minutes'
        and (
          (recent_session.user_a_id = current_user_id and recent_session.user_b_id = queued.user_id)
          or (recent_session.user_b_id = current_user_id and recent_session.user_a_id = queued.user_id)
        )
    );

  return waiting_count;
end;
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
  candidate_user_id uuid;
  existing_session_id uuid;
  existing_conversation_id uuid;
  existing_partner_id uuid;
  created_conversation_id uuid;
  created_session_id uuid;
  normalized_topic text := nullif(lower(trim(match_topic)), '');
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if match_languages is null or cardinality(match_languages) not between 1 and 8 then
    raise exception 'Choose between one and eight languages' using errcode = '22023';
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

  select quick_session.id,
         quick_session.conversation_id,
         case
           when quick_session.user_a_id = current_user_id then quick_session.user_b_id
           else quick_session.user_a_id
         end
  into existing_session_id, existing_conversation_id, existing_partner_id
  from public.quick_chat_sessions quick_session
  where quick_session.status = 'active'
    and current_user_id in (quick_session.user_a_id, quick_session.user_b_id)
  order by quick_session.started_at desc
  limit 1;

  if existing_session_id is not null then
    return query select 'matched'::text, existing_session_id, existing_conversation_id, existing_partner_id;
    return;
  end if;

  delete from public.quick_chat_queue
  where expires_at <= now()
     or queued_at <= now() - interval '8 seconds';

  select queued.user_id
  into candidate_user_id
  from public.quick_chat_queue queued
  where queued.user_id <> current_user_id
    and queued.expires_at > now()
    and queued.queued_at > now() - interval '8 seconds'
    and queued.languages && match_languages
    and queued.topic = normalized_topic
    and not public.is_blocked_between(current_user_id, queued.user_id)
    and not exists (
      select 1
      from public.quick_chat_sessions recent_session
      where recent_session.started_at > now() - interval '5 minutes'
        and (
          (recent_session.user_a_id = current_user_id and recent_session.user_b_id = queued.user_id)
          or (recent_session.user_b_id = current_user_id and recent_session.user_a_id = queued.user_id)
        )
    )
  order by queued.queued_at
  for update skip locked
  limit 1;

  if candidate_user_id is null then
    insert into public.quick_chat_queue (user_id, languages, topic, queued_at, expires_at)
    values (current_user_id, match_languages, normalized_topic, now(), now() + interval '8 seconds')
    on conflict (user_id) do update
      set languages = excluded.languages,
          topic = excluded.topic,
          queued_at = excluded.queued_at,
          expires_at = excluded.expires_at;

    return query select 'queued'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  delete from public.quick_chat_queue where user_id in (current_user_id, candidate_user_id);

  insert into public.conversations (kind, created_by)
  values ('quick_chat', current_user_id)
  returning id into created_conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (created_conversation_id, current_user_id),
    (created_conversation_id, candidate_user_id);

  insert into public.quick_chat_sessions (conversation_id, user_a_id, user_b_id)
  values (created_conversation_id, candidate_user_id, current_user_id)
  returning id into created_session_id;

  return query select 'matched'::text, created_session_id, created_conversation_id, candidate_user_id;
end;
$$;

revoke all on function public.get_quick_chat_waiting_count(text[], text) from public, anon;
revoke all on function public.join_quick_chat(text[], text) from public, anon;

grant execute on function public.get_quick_chat_waiting_count(text[], text) to authenticated;
grant execute on function public.join_quick_chat(text[], text) to authenticated;

commit;
