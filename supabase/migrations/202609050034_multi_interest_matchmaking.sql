-- Multi-interest quick chat matching and privacy-safe trending suggestions.

create or replace function private.normalize_match_interests(raw_interests text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(item.normalized order by item.first_position), '{}'::text[])
  from (
    select
      normalized,
      min(position) as first_position
    from (
      select
        ordinality as position,
        nullif(
          lower(regexp_replace(btrim(value), '\s+', ' ', 'g')),
          ''
        ) as normalized
      from unnest(coalesce(raw_interests, '{}'::text[])) with ordinality as input(value, ordinality)
    ) cleaned
    where normalized is not null
      and char_length(normalized) between 2 and 40
    group by normalized
  ) item;
$$;

alter table public.quick_chat_queue
  add column if not exists interests text[] not null default '{}'::text[];

update public.quick_chat_queue
set interests = array[lower(regexp_replace(btrim(topic), '\s+', ' ', 'g'))]
where cardinality(interests) = 0
  and topic is not null
  and char_length(btrim(topic)) between 2 and 40;

delete from public.quick_chat_queue
where cardinality(interests) = 0;

alter table public.quick_chat_queue
  drop constraint if exists quick_chat_queue_interests_valid;

alter table public.quick_chat_queue
  add constraint quick_chat_queue_interests_valid check (
    cardinality(interests) between 1 and 5
    and interests = private.normalize_match_interests(interests)
  );

create or replace function private.sync_quick_chat_interests()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  normalized_topic text;
begin
  normalized_topic := nullif(
    lower(regexp_replace(btrim(coalesce(new.topic, '')), '\s+', ' ', 'g')),
    ''
  );

  if tg_op = 'INSERT' and cardinality(new.interests) = 0 then
    new.interests := array[normalized_topic];
  elsif tg_op = 'UPDATE'
    and new.topic is distinct from old.topic
    and new.interests is not distinct from old.interests then
    new.interests := array[normalized_topic];
  end if;

  new.interests := private.normalize_match_interests(new.interests);
  new.topic := new.interests[1];
  return new;
end;
$$;

drop trigger if exists sync_quick_chat_interests on public.quick_chat_queue;
create trigger sync_quick_chat_interests
before insert or update on public.quick_chat_queue
for each row execute function private.sync_quick_chat_interests();

alter table public.quick_chat_sessions
  add column if not exists matched_interests text[] not null default '{}'::text[];

create or replace function public.join_quick_chat_v2(match_interests text[])
returns table (
  match_status text,
  session_id uuid,
  conversation_id uuid,
  matched_profile_id uuid,
  matched_interests text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  effective_languages text[];
  normalized_interests text[];
  candidate_user_id uuid;
  candidate_interests text[];
  overlap_interests text[];
  existing_session_id uuid;
  existing_conversation_id uuid;
  existing_partner_id uuid;
  existing_matched_interests text[];
  created_conversation_id uuid;
  created_session_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if match_interests is null or cardinality(match_interests) not between 1 and 5 then
    raise exception 'Choose between 1 and 5 interests' using errcode = '22023';
  end if;

  normalized_interests := private.normalize_match_interests(match_interests);
  if cardinality(normalized_interests) <> cardinality(match_interests) then
    raise exception 'Interests must be unique and between 2 and 40 characters' using errcode = '22023';
  end if;

  select profile.languages
  into effective_languages
  from public.profiles profile
  where profile.id = current_user_id;

  if not private.valid_language_list(effective_languages) then
    raise exception 'Complete your language profile before matching' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.user_settings
    where id = current_user_id
      and onboarding_completed_at is not null
      and age_verified_at is not null
  ) then
    raise exception 'Complete age-verified onboarding before matching' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  update public.quick_chat_sessions
  set status = 'ended', ended_at = now(), ended_by = current_user_id, end_reason = 'timeout'
  where status = 'active'
    and current_user_id in (user_a_id, user_b_id)
    and (user_a_last_seen_at < now() - interval '30 seconds'
      or user_b_last_seen_at < now() - interval '30 seconds');

  select quick_session.id,
    quick_session.conversation_id,
    case
      when quick_session.user_a_id = current_user_id then quick_session.user_b_id
      else quick_session.user_a_id
    end,
    quick_session.matched_interests
  into existing_session_id, existing_conversation_id, existing_partner_id, existing_matched_interests
  from public.quick_chat_sessions quick_session
  where quick_session.status = 'active'
    and current_user_id in (quick_session.user_a_id, quick_session.user_b_id)
  order by quick_session.started_at desc
  limit 1;

  if existing_session_id is not null then
    if current_user_id = (
      select user_a_id from public.quick_chat_sessions where id = existing_session_id
    ) then
      update public.quick_chat_sessions
      set user_a_last_seen_at = now()
      where id = existing_session_id;
    else
      update public.quick_chat_sessions
      set user_b_last_seen_at = now()
      where id = existing_session_id;
    end if;
    delete from public.quick_chat_queue where user_id = current_user_id;
    return query select
      'matched'::text,
      existing_session_id,
      existing_conversation_id,
      existing_partner_id,
      existing_matched_interests;
    return;
  end if;

  delete from public.quick_chat_queue
  where expires_at <= now() or queued_at <= now() - interval '8 seconds';

  select queued.user_id, queued.interests
  into candidate_user_id, candidate_interests
  from public.quick_chat_queue queued
  where queued.user_id <> current_user_id
    and queued.expires_at > now()
    and queued.queued_at > now() - interval '8 seconds'
    and queued.languages && effective_languages
    and queued.interests && normalized_interests
    and not public.is_blocked_between(current_user_id, queued.user_id)
    and not exists (
      select 1 from public.quick_chat_sessions recent_session
      where recent_session.started_at > now() - interval '5 minutes'
        and ((recent_session.user_a_id = current_user_id and recent_session.user_b_id = queued.user_id)
          or (recent_session.user_b_id = current_user_id and recent_session.user_a_id = queued.user_id))
    )
  order by
    cardinality(array(
      select interest
      from unnest(normalized_interests) as interest
      where interest = any(queued.interests)
    )) desc,
    queued.queued_at asc
  for update skip locked
  limit 1;

  if candidate_user_id is null then
    insert into public.quick_chat_queue (user_id, languages, topic, interests, queued_at, expires_at)
    values (current_user_id, effective_languages, normalized_interests[1], normalized_interests, now(), now() + interval '8 seconds')
    on conflict (user_id) do update
      set languages = excluded.languages,
          topic = excluded.topic,
          interests = excluded.interests,
          queued_at = excluded.queued_at,
          expires_at = excluded.expires_at;

    return query select
      'queued'::text,
      null::uuid,
      null::uuid,
      null::uuid,
      '{}'::text[];
    return;
  end if;

  overlap_interests := array(
    select interest
    from unnest(normalized_interests) as interest
    where interest = any(candidate_interests)
  );

  delete from public.quick_chat_queue where user_id in (current_user_id, candidate_user_id);

  insert into public.conversations (kind, created_by)
  values ('quick_chat', current_user_id)
  returning id into created_conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (created_conversation_id, current_user_id),
    (created_conversation_id, candidate_user_id);

  insert into public.quick_chat_sessions (
    conversation_id,
    user_a_id,
    user_b_id,
    matched_interests
  ) values (
    created_conversation_id,
    candidate_user_id,
    current_user_id,
    overlap_interests
  )
  returning id into created_session_id;

  return query select
    'matched'::text,
    created_session_id,
    created_conversation_id,
    candidate_user_id,
    overlap_interests;
end;
$$;

create or replace function public.list_trending_match_interests(limit_count integer default 10)
returns table (
  label text,
  glyph text,
  score bigint,
  source text
)
language sql
stable
security definer
set search_path = ''
as $$
  with queue_activity as (
    select interest as normalized_label, count(*)::bigint * 10 as activity_score
    from public.quick_chat_queue queued
    cross join lateral unnest(queued.interests) as interest
    where queued.expires_at > now()
      and queued.queued_at >= now() - interval '30 seconds'
    group by interest
    having count(*) >= 2
  ),
  post_topics as (
    select lower(regexp_replace(btrim(post.topic), '\s+', ' ', 'g')) as normalized_label,
      count(*)::bigint * 2 as activity_score
    from public.posts post
    where post.deleted_at is null
      and post.created_at >= now() - interval '7 days'
      and post.topic is not null
      and char_length(btrim(post.topic)) between 2 and 40
    group by lower(regexp_replace(btrim(post.topic), '\s+', ' ', 'g'))
    having count(*) >= 2
  ),
  post_hashtags as (
    select replace(matches.tag[1], '_', ' ') as normalized_label,
      count(*)::bigint as activity_score
    from public.posts post
    cross join lateral regexp_matches(lower(post.body), '#([a-z0-9_]{2,32})', 'g') as matches(tag)
    where post.deleted_at is null
      and post.created_at >= now() - interval '7 days'
    group by replace(matches.tag[1], '_', ' ')
    having count(*) >= 2
  ),
  live as (
    select normalized_label, sum(activity_score)::bigint as activity_score
    from (
      select * from queue_activity
      union all
      select * from post_topics
      union all
      select * from post_hashtags
    ) activity
    where char_length(normalized_label) between 2 and 40
    group by normalized_label
  ),
  fallback(label, glyph) as (
    values
      ('Music', '♫'),
      ('Movies', '▣'),
      ('Gaming', '✦'),
      ('Travel', '↗'),
      ('Relationships', '♡'),
      ('Late night', '☾'),
      ('Study', '⌁'),
      ('Tech', '⌘'),
      ('Anime', '※'),
      ('Football', '◉'),
      ('AI', '✧'),
      ('Formula 1', '⊙'),
      ('Fashion', '◈'),
      ('Fitness', '↑'),
      ('Food & cooking', '◇'),
      ('Books', '≡'),
      ('Memes', '☺'),
      ('Photography', '◐'),
      ('K-pop', '♪'),
      ('Entrepreneurship', '$')
  ),
  live_rows as (
    select initcap(normalized_label) as label, '#'::text as glyph,
      activity_score as score, 'live'::text as source
    from live
  ),
  fallback_rows as (
    select fallback.label, fallback.glyph, 0::bigint as score, 'discover'::text as source
    from fallback
    where not exists (
      select 1 from live where live.normalized_label = lower(fallback.label)
    )
  ),
  combined as (
    select *, 0 as source_rank, md5(lower(label)) as rotation_key from live_rows
    union all
    select *, 1 as source_rank,
      md5(lower(label) || floor(extract(epoch from now()) / 21600)::text) as rotation_key
    from fallback_rows
  )
  select combined.label, combined.glyph, combined.score, combined.source
  from combined
  order by source_rank, score desc, rotation_key
  limit greatest(1, least(coalesce(limit_count, 10), 20));
$$;

revoke all on function public.join_quick_chat_v2(text[]) from public;
grant execute on function public.join_quick_chat_v2(text[]) to authenticated;

revoke all on function public.list_trending_match_interests(integer) from public;
grant execute on function public.list_trending_match_interests(integer) to authenticated;

revoke all on function private.normalize_match_interests(text[]) from public, anon, authenticated;
revoke all on function private.sync_quick_chat_interests() from public, anon, authenticated;
