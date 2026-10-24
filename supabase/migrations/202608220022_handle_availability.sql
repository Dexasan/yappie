begin;

-- The unique profile index is the final protection against simultaneous claims.
create or replace function public.is_handle_available(candidate_handle text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select lower(regexp_replace(trim(candidate_handle), '^@+', '')) as handle
  )
  select normalized.handle ~ '^[a-z0-9_]{3,24}$'
    and not exists (
      select 1
      from public.profiles profile
      where lower(profile.handle) = normalized.handle
        and profile.id <> auth.uid()
    )
  from normalized;
$$;

revoke all on function public.is_handle_available(text) from public, anon;
grant execute on function public.is_handle_available(text) to authenticated;

commit;
