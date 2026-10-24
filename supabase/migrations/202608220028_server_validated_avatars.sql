begin;

drop policy if exists users_insert_own_avatar on storage.objects;
drop policy if exists users_update_own_avatar on storage.objects;
drop policy if exists club_staff_insert_avatar on storage.objects;
drop policy if exists club_staff_update_avatar on storage.objects;

create or replace function public.set_profile_avatar(target_avatar_path text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if nullif(trim(target_avatar_path), '') is not null then
    raise exception 'Profile pictures must be uploaded through the validated image service' using errcode = '42501';
  end if;
  update public.profiles set avatar_path = null where id = auth.uid();
  return null;
end;
$$;

revoke all on function public.set_club_avatar(uuid, text) from authenticated;

commit;
