begin;
create table public.club_sessions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(char_length(btrim(title)) between 3 and 120),
  starts_at timestamptz not null,
  weekly boolean not null default false,
  timezone text not null default 'UTC',
  status text not null default 'scheduled' check(status in ('scheduled','live','cancelled')),
  live_room_id uuid references public.club_rooms(id) on delete set null
);
create table public.club_session_rsvps (
  session_id uuid not null references public.club_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(session_id,user_id)
);
create index club_sessions_upcoming on public.club_sessions(club_id,starts_at) where status='scheduled';
alter table public.club_sessions enable row level security;
alter table public.club_session_rsvps enable row level security;
revoke all on public.club_sessions,public.club_session_rsvps from anon,authenticated;

create function public.list_club_sessions(target_club_id uuid)
returns table(session_id uuid,title text,starts_at timestamptz,weekly boolean,host_id uuid,is_attending boolean)
language sql stable security definer set search_path = '' as $$
  select s.id,s.title,s.starts_at,s.weekly,s.host_id,exists(select 1 from public.club_session_rsvps r where r.session_id=s.id and r.user_id=auth.uid())
  from public.club_sessions s where auth.uid() is not null and s.club_id=target_club_id and s.status='scheduled' and s.starts_at>now()-interval '1 hour'
    and not public.is_blocked_between(auth.uid(),s.host_id)
    and not exists(select 1 from public.club_memberships cm where cm.club_id=s.club_id and cm.user_id=auth.uid() and cm.status='banned')
  order by s.starts_at limit 30;
$$;
create function public.schedule_club_session(target_club_id uuid,session_title text,start_time timestamptz,repeat_weekly boolean default false,session_timezone text default 'UTC')
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not exists(select 1 from public.club_memberships cm join public.clubs c on c.id=cm.club_id where cm.club_id=target_club_id
    and cm.user_id=auth.uid() and cm.status='active' and (c.allow_member_rooms or cm.role in ('owner','moderator'))) then raise exception 'Hosting access required' using errcode='42501'; end if;
  if start_time<=now() or start_time>now()+interval '90 days' then raise exception 'Choose a time within the next 90 days'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=session_timezone) then raise exception 'Invalid timezone'; end if;
  if (select count(*) from public.club_sessions where host_id=auth.uid() and status='scheduled')>=20 then raise exception 'Too many upcoming sessions'; end if;
  insert into public.club_sessions(club_id,host_id,title,starts_at,weekly,timezone) values(target_club_id,auth.uid(),btrim(session_title),start_time,repeat_weekly,session_timezone) returning id into result;
  return result;
end;
$$;
create function public.set_club_session_rsvp(target_session_id uuid,attending boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.club_sessions;
begin
  select * into s from public.club_sessions where id=target_session_id and status='scheduled';
  if s.id is null or s.starts_at<=now() or not exists(select 1 from public.club_memberships cm where cm.club_id=s.club_id and cm.user_id=auth.uid() and cm.status='active')
    or public.is_blocked_between(auth.uid(),s.host_id) then raise exception 'Join this club to RSVP' using errcode='42501'; end if;
  if attending then insert into public.club_session_rsvps values(target_session_id,auth.uid()) on conflict do nothing;
  else delete from public.club_session_rsvps where user_id=auth.uid() and session_id in(select id from public.club_sessions where series_id=s.series_id and status='scheduled'); end if;
end;
$$;
create function public.start_scheduled_club_session(target_session_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.club_sessions; room uuid; next_session uuid; next_start timestamptz;
begin
  select * into s from public.club_sessions where id=target_session_id for update;
  if s.id is null or s.host_id<>auth.uid() or s.status<>'scheduled' then raise exception 'Session hosting access required' using errcode='42501'; end if;
  if s.starts_at>now()+interval '15 minutes' then raise exception 'You can start 15 minutes before the scheduled time'; end if;
  room:=public.start_club_room(s.club_id,s.title);
  update public.club_sessions set status='live',live_room_id=room where id=s.id;
  if s.weekly then
    next_start:=((s.starts_at at time zone s.timezone)+interval '7 days') at time zone s.timezone;
    while next_start<=now() loop next_start:=((next_start at time zone s.timezone)+interval '7 days') at time zone s.timezone; end loop;
    insert into public.club_sessions(series_id,club_id,host_id,title,starts_at,weekly,timezone)
      values(s.series_id,s.club_id,s.host_id,s.title,next_start,true,s.timezone) returning id into next_session;
    insert into public.club_session_rsvps(session_id,user_id) select next_session,r.user_id from public.club_session_rsvps r
      join public.club_memberships cm on cm.user_id=r.user_id and cm.club_id=s.club_id and cm.status='active' where r.session_id=s.id;
  end if;
  return room;
end;
$$;
create function public.cancel_club_session(target_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.club_sessions s set status='cancelled' where s.id=target_session_id and s.status='scheduled' and (s.host_id=auth.uid() or exists(
    select 1 from public.club_memberships cm where cm.club_id=s.club_id and cm.user_id=auth.uid() and cm.status='active' and cm.role in ('owner','moderator')));
  if not found then raise exception 'Session access required' using errcode='42501'; end if;
end;
$$;
create function public.enqueue_club_reminders()
returns void language sql security definer set search_path = '' as $$
  insert into private.notification_jobs(device_id,recipient_id,actor_id,kind,target_id,source_id)
  select d.id,r.user_id,s.host_id,'club_reminder',s.club_id,s.id from public.club_sessions s
  join public.club_session_rsvps r on r.session_id=s.id
  join public.club_memberships cm on cm.club_id=s.club_id and cm.user_id=r.user_id and cm.status='active'
  join private.push_devices d on d.user_id=r.user_id
  where s.status='scheduled' and s.starts_at between now() and now()+interval '10 minutes'
    and not public.is_blocked_between(r.user_id,s.host_id) on conflict do nothing;
$$;
create or replace function private.push_job_allowed(j private.notification_jobs)
returns boolean language sql stable security definer set search_path = '' as $$
  select not public.is_blocked_between(j.recipient_id,j.actor_id)
    and exists(select 1 from private.push_devices d where d.id=j.device_id and d.user_id=j.recipient_id)
    and case when j.kind='message' then
      coalesce((select p.messages from private.notification_preferences p where p.user_id=j.recipient_id),true)
      and exists(select 1 from public.messages m join public.conversation_members cm on cm.conversation_id=m.conversation_id
        where m.id=j.source_id and m.deleted_at is null and cm.user_id=j.recipient_id and cm.left_at is null
          and m.created_at>coalesce(cm.last_read_at,cm.joined_at))
      and not exists(select 1 from private.notification_attention a where a.user_id=j.recipient_id and a.conversation_id=j.target_id and a.expires_at>now())
    when j.kind='club_reminder' then coalesce((select p.club_reminders from private.notification_preferences p where p.user_id=j.recipient_id),true)
      and exists(select 1 from public.club_sessions s join public.club_session_rsvps r on r.session_id=s.id
        join public.club_memberships cm on cm.club_id=s.club_id and cm.user_id=r.user_id
        where s.id=j.source_id and s.status='scheduled' and s.starts_at>now() and r.user_id=j.recipient_id and cm.status='active')
    else
      case when j.kind='post_reply' then coalesce((select p.replies from private.notification_preferences p where p.user_id=j.recipient_id),true)
        else coalesce((select p.likes_follows from private.notification_preferences p where p.user_id=j.recipient_id),false) end
      and exists(select 1 from public.activity_events a where a.id=j.source_id and a.read_at is null)
      and (j.kind='follow' or exists(select 1 from public.posts p where p.id=j.target_id and p.deleted_at is null and not public.is_blocked_between(j.recipient_id,p.author_id)))
    end;
$$;
revoke all on function public.list_club_sessions(uuid),public.schedule_club_session(uuid,text,timestamptz,boolean,text),public.set_club_session_rsvp(uuid,boolean),public.start_scheduled_club_session(uuid),public.cancel_club_session(uuid) from public,anon;
grant execute on function public.list_club_sessions(uuid),public.schedule_club_session(uuid,text,timestamptz,boolean,text),public.set_club_session_rsvp(uuid,boolean),public.start_scheduled_club_session(uuid),public.cancel_club_session(uuid) to authenticated;
revoke all on function public.enqueue_club_reminders() from public,anon,authenticated;
grant execute on function public.enqueue_club_reminders() to service_role;
commit;
