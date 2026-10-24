-- Free-form matching interests remain available, but sexual violence,
-- exploitation, and abusive sexual content are not valid matching topics.
create or replace function private.match_interest_is_allowed(raw_interest text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(raw_interest, '') !~* '(^|[^[:alnum:]])(rape|rapist|raping|molest(ed|er|ers|ing|ation)?|incest(uous)?|p(ae|e)dophil(e|es|ia|ic)|sexual[[:space:]-]+(assault|abuse|violence)|child[[:space:]-]+(porn|sex|sexual[[:space:]-]+abuse)|underage[[:space:]-]+sex|bestiality|necrophilia)($|[^[:alnum:]])'
    and lower(regexp_replace(coalesce(raw_interest, ''), '[^[:alnum:]]+', '', 'g')) not in (
      'rape', 'rapist', 'raping', 'molest', 'molester', 'molestation', 'incest',
      'pedophile', 'paedophile', 'pedophilia', 'paedophilia', 'bestiality', 'necrophilia'
    );
$$;

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
        nullif(lower(regexp_replace(btrim(value), '\s+', ' ', 'g')), '') as normalized
      from unnest(coalesce(raw_interests, '{}'::text[])) with ordinality as input(value, ordinality)
    ) cleaned
    where normalized is not null
      and char_length(normalized) between 2 and 40
      and private.match_interest_is_allowed(normalized)
    group by normalized
  ) item;
$$;

delete from public.quick_chat_queue queued
where exists (
  select 1
  from unnest(queued.interests) as interest
  where not private.match_interest_is_allowed(interest)
);

revoke all on function private.match_interest_is_allowed(text) from public, anon, authenticated;
revoke all on function private.normalize_match_interests(text[]) from public, anon, authenticated;
