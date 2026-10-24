begin;
create function public.search_clubs(club_query text default '',club_offset integer default 0,only_joined boolean default false)
returns table(club_id uuid,slug text,name text,description text,topic text,member_count bigint,is_member boolean,live_room_id uuid,live_room_title text,live_listener_count bigint)
language sql stable security definer set search_path = '' as $$
  select c.* from public.list_clubs() c
  where (nullif(btrim(club_query),'') is null or strpos(lower(c.name||' '||c.description||' '||c.topic),lower(left(btrim(club_query),100)))>0)
    and (not only_joined or c.is_member)
    and not exists(select 1 from public.club_memberships cm where cm.club_id=c.club_id and cm.user_id=auth.uid() and cm.status='banned')
  order by (c.live_room_id is not null) desc,c.member_count desc,c.name,c.club_id
  limit 30 offset least(greatest(club_offset,0),10000);
$$;
revoke all on function public.search_clubs(text,integer,boolean) from public,anon;
grant execute on function public.search_clubs(text,integer,boolean) to authenticated;
commit;
