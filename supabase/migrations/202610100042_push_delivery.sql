begin;
create table private.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages boolean not null default true,
  replies boolean not null default true,
  likes_follows boolean not null default false,
  club_reminders boolean not null default true,
  previews boolean not null default false,
  quiet_start integer check(quiet_start between 0 and 23),
  quiet_end integer check(quiet_end between 0 and 23),
  timezone text not null default 'UTC',
  check((quiet_start is null) = (quiet_end is null)),
  check(quiet_start is null or quiet_start <> quiet_end)
);
create table private.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  updated_at timestamptz not null default now()
);
create table private.notification_attention (
  user_id uuid primary key references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  expires_at timestamptz not null
);
create table private.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references private.push_devices(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('message','post_reply','post_like','follow','gift','club_reminder')),
  target_id uuid not null,
  source_id uuid not null,
  status text not null default 'pending' check(status in ('pending','sending','ticket','delivered','cancelled','failed')),
  attempts integer not null default 0,
  due_at timestamptz not null default now(),
  claimed_at timestamptz,
  ticket_id text,
  created_at timestamptz not null default now(),
  unique(device_id,kind,source_id)
);
create index notification_jobs_due on private.notification_jobs(due_at) where status in ('pending','ticket','sending');
create index notification_jobs_created on private.notification_jobs(created_at);
revoke all on private.notification_preferences,private.push_devices,private.notification_attention,private.notification_jobs from public,anon,authenticated;

create function public.get_notification_preferences()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select to_jsonb(p)-'user_id' from private.notification_preferences p where user_id=auth.uid()),
    '{"messages":true,"replies":true,"likes_follows":false,"club_reminders":true,"previews":false,"quiet_start":null,"quiet_end":null,"timezone":"UTC"}'::jsonb);
$$;
create function public.set_notification_preferences(preferences jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=preferences->>'timezone') then raise exception 'Invalid timezone'; end if;
  insert into private.notification_preferences(user_id,messages,replies,likes_follows,club_reminders,previews,quiet_start,quiet_end,timezone)
  values(auth.uid(),(preferences->>'messages')::boolean,(preferences->>'replies')::boolean,
    (preferences->>'likes_follows')::boolean,(preferences->>'club_reminders')::boolean,(preferences->>'previews')::boolean,
    (preferences->>'quiet_start')::integer,(preferences->>'quiet_end')::integer,preferences->>'timezone')
  on conflict(user_id) do update set messages=excluded.messages,replies=excluded.replies,likes_follows=excluded.likes_follows,
    club_reminders=excluded.club_reminders,previews=excluded.previews,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,timezone=excluded.timezone;
end;
$$;
create function public.register_push_device(push_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if push_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' or char_length(push_token)>250 then raise exception 'Invalid push token'; end if;
  -- Rebinding a device cancels jobs for its former account through the FK cascade.
  delete from private.push_devices where token=push_token and user_id<>auth.uid();
  insert into private.push_devices(user_id,token) values(auth.uid(),push_token)
  on conflict(token) do update set updated_at=now();
end;
$$;
create function public.unregister_push_device(push_token text)
returns void language sql security definer set search_path = '' as $$
  delete from private.push_devices where token=push_token and user_id=auth.uid();
$$;
create function public.set_notification_attention(target_conversation_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if target_conversation_id is not null and not public.is_conversation_member(target_conversation_id,auth.uid()) then raise exception 'Conversation access required' using errcode='42501'; end if;
  insert into private.notification_attention(user_id,conversation_id,expires_at) values(auth.uid(),target_conversation_id,now()+interval '40 seconds')
  on conflict(user_id) do update set conversation_id=excluded.conversation_id,expires_at=excluded.expires_at;
end;
$$;

create function private.enqueue_social_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind not in ('post_reply','post_like','follow') then return new; end if;
  insert into private.notification_jobs(device_id,recipient_id,actor_id,kind,target_id,source_id,due_at)
  select d.id,new.recipient_id,new.actor_id,new.kind,coalesce(new.post_id,new.actor_id),new.id,
    now()+case when new.kind in ('post_like','follow') then interval '2 minutes' else interval '5 seconds' end
  from private.push_devices d where d.user_id=new.recipient_id on conflict do nothing;
  return new;
end;
$$;
create trigger activity_push after insert on public.activity_events for each row execute function private.enqueue_social_push();
create function private.enqueue_message_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.notification_jobs(device_id,recipient_id,actor_id,kind,target_id,source_id,due_at)
  select d.id,cm.user_id,new.sender_id,'message',new.conversation_id,new.id,now()+interval '5 seconds'
  from public.conversation_members cm join private.push_devices d on d.user_id=cm.user_id
  join public.direct_conversations direct on direct.conversation_id=cm.conversation_id
  where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id and cm.left_at is null
    and not public.is_blocked_between(cm.user_id,new.sender_id) on conflict do nothing;
  return new;
end;
$$;
create trigger messages_push after insert on public.messages for each row execute function private.enqueue_message_push();

create function private.push_job_allowed(j private.notification_jobs)
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
    else
      case when j.kind='post_reply' then coalesce((select p.replies from private.notification_preferences p where p.user_id=j.recipient_id),true)
        else coalesce((select p.likes_follows from private.notification_preferences p where p.user_id=j.recipient_id),false) end
      and exists(select 1 from public.activity_events a where a.id=j.source_id and a.read_at is null)
      and (j.kind='follow' or exists(select 1 from public.posts p where p.id=j.target_id and p.deleted_at is null and not public.is_blocked_between(j.recipient_id,p.author_id)))
    end;
$$;

create function public.claim_notification_jobs()
returns table(job_id uuid,push_token text,kind text,target_id uuid,actor_id uuid,preview text)
language plpgsql security definer set search_path = '' as $$
begin
  -- Locks prevent concurrent workers from claiming the same job.
  update private.notification_jobs j set status='cancelled' where j.status='pending' and not private.push_job_allowed(j);
  update private.notification_jobs j set due_at=now()+interval '15 minutes'
  from private.notification_preferences p where p.user_id=j.recipient_id and j.status='pending' and j.due_at<=now() and p.quiet_start is not null
    and case when p.quiet_start<p.quiet_end then extract(hour from now() at time zone p.timezone)>=p.quiet_start and extract(hour from now() at time zone p.timezone)<p.quiet_end
      else extract(hour from now() at time zone p.timezone)>=p.quiet_start or extract(hour from now() at time zone p.timezone)<p.quiet_end end;
  -- Bundle noisy social activity per device/target; keep each DM/reply distinct.
  update private.notification_jobs old set status='cancelled' where old.status='pending' and old.kind in ('post_like','follow') and exists(
    select 1 from private.notification_jobs newer where newer.device_id=old.device_id and newer.kind=old.kind and newer.target_id=old.target_id
      and newer.status='pending' and (newer.created_at,newer.id)>(old.created_at,old.id));
  update private.notification_jobs set status='failed' where status in ('pending','sending') and (attempts>=5 or created_at<now()-interval '1 day');
  return query with picked as (
    select j.id from private.notification_jobs j where (j.status='pending' or (j.status='sending' and j.claimed_at<now()-interval '5 minutes'))
      and j.due_at<=now() and private.push_job_allowed(j) order by j.due_at limit 50 for update skip locked
  ), claimed as (
    update private.notification_jobs j set status='sending',claimed_at=now(),attempts=attempts+1 from picked where j.id=picked.id returning j.*
  ) select j.id,d.token,j.kind,j.target_id,j.actor_id,
    case when coalesce(p.previews,false) then case when j.kind='message' then (select left(m.body,120) from public.messages m where m.id=j.source_id)
      when j.kind='post_reply' then (select a.metadata->>'reply_preview' from public.activity_events a where a.id=j.source_id) end end
  from claimed j join private.push_devices d on d.id=j.device_id left join private.notification_preferences p on p.user_id=j.recipient_id;
end;
$$;
create function public.finish_notification_job(job_id uuid, outcome text, expo_ticket text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if outcome='invalid_token' then delete from private.push_devices where id=(select device_id from private.notification_jobs where id=job_id); return; end if;
  if outcome not in ('ticket','delivered','retry','failed') then raise exception 'Invalid outcome'; end if;
  update private.notification_jobs set status=case when outcome='retry' then 'pending' else outcome end,
    ticket_id=coalesce(expo_ticket,ticket_id),due_at=now()+case when outcome='ticket' then interval '15 minutes' else interval '2 minutes' end
  where id=job_id;
end;
$$;
create function public.notification_receipts_due()
returns table(job_id uuid,ticket_id text) language sql stable security definer set search_path = '' as $$
  select id,ticket_id from private.notification_jobs where status='ticket' and due_at<=now() order by due_at limit 100;
$$;

revoke all on function private.enqueue_social_push(),private.enqueue_message_push(),private.push_job_allowed(private.notification_jobs) from public,anon,authenticated;
revoke all on function public.get_notification_preferences(),public.set_notification_preferences(jsonb),public.register_push_device(text),public.unregister_push_device(text),public.set_notification_attention(uuid) from public,anon;
grant execute on function public.get_notification_preferences(),public.set_notification_preferences(jsonb),public.register_push_device(text),public.unregister_push_device(text),public.set_notification_attention(uuid) to authenticated;
revoke all on function public.claim_notification_jobs(),public.finish_notification_job(uuid,text,text),public.notification_receipts_due() from public,anon,authenticated;
grant execute on function public.claim_notification_jobs(),public.finish_notification_job(uuid,text,text),public.notification_receipts_due() to service_role;
commit;
