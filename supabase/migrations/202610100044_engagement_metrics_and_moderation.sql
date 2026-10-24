begin;
create table private.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  surface text not null,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index app_events_user_created on private.app_events(user_id,created_at);
create index app_events_created on private.app_events(created_at);
create table private.moderators(user_id uuid primary key references auth.users(id) on delete cascade);
revoke all on private.app_events,private.moderators from public,anon,authenticated;
create function public.record_app_event(event_name text,surface text,duration_ms integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  if event_name not in ('session_start','match_started','match_found','match_cancelled','dm_sent','post_published','reply_sent','notification_opened','render_error','audio_failed')
    or surface not in ('app','matching','feed','post','messages','clubs','notifications','calls') or duration_ms<0 or duration_ms>86400000 then raise exception 'Invalid event'; end if;
  if (select count(*) from private.app_events e where e.user_id=auth.uid() and e.created_at>now()-interval '1 minute')>=60 then return; end if;
  insert into private.app_events(user_id,event_name,surface,duration_ms) values(auth.uid(),event_name,surface,duration_ms);
end;
$$;
create function public.engagement_metrics()
returns jsonb language sql stable security definer set search_path = '' as $$
  with cohorts as (select user_id,min(created_at)::date as joined_day from private.app_events where event_name='session_start' group by user_id),
  retention as (select c.*,
    exists(select 1 from private.app_events e where e.user_id=c.user_id and e.event_name='session_start' and e.created_at::date=c.joined_day+1) as d1,
    exists(select 1 from private.app_events e where e.user_id=c.user_id and e.event_name='session_start' and e.created_at::date=c.joined_day+7) as d7 from cohorts c)
  select jsonb_build_object('active_users_7d',(select count(distinct user_id) from private.app_events where created_at>now()-interval '7 days'),
    'events_7d',(select coalesce(jsonb_object_agg(event_name,total),'{}'::jsonb) from (select event_name,count(*) as total from private.app_events where created_at>now()-interval '7 days' group by event_name) counts),
    'd1_eligible',(select count(*) from retention where joined_day<current_date),'d1_returned',(select count(*) from retention where joined_day<current_date and d1),
    'd7_eligible',(select count(*) from retention where joined_day<=current_date-7),'d7_returned',(select count(*) from retention where joined_day<=current_date-7 and d7),
    'match_wait_ms_7d',(select percentile_cont(0.5) within group(order by duration_ms) from private.app_events where event_name='match_found' and created_at>now()-interval '7 days'));
$$;
create function public.prune_engagement_data()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.app_events where created_at<now()-interval '90 days';
  delete from private.notification_jobs where created_at<now()-interval '7 days';
  delete from private.push_devices where updated_at<now()-interval '90 days';
  delete from private.notification_attention where expires_at<now()-interval '1 day';
end;
$$;

create function public.is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.moderators where user_id=auth.uid());
$$;
create function public.list_moderation_reports()
returns table(report_id uuid,target_kind text,target_id uuid,category text,details text,status text,created_at timestamptz,content_preview text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'Moderator access required' using errcode='42501'; end if;
  return query select r.id,r.target_kind,r.target_id,r.category,r.details,r.status,r.created_at,
    case when r.target_kind='post' then (select p.body from public.posts p where p.id=r.target_id)
      when r.target_kind='reply' then (select reply.body from public.replies reply where reply.id=r.target_id)
      when r.target_kind='message' then (select m.body from public.messages m where m.id=r.target_id) end
    from public.reports r where r.status in ('open','reviewing') order by r.created_at limit 100;
end;
$$;
create table private.moderation_actions (
  id bigint generated always as identity primary key,
  moderator_id uuid references auth.users(id) on delete set null,
  report_id uuid references public.reports(id) on delete cascade,
  resolution text not null,
  removed_content boolean not null,
  created_at timestamptz not null default now()
);
revoke all on private.moderation_actions from public,anon,authenticated;
create function public.review_moderation_report(target_report_id uuid,resolution text,remove_content boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  if not public.is_moderator() then raise exception 'Moderator access required' using errcode='42501'; end if;
  if resolution not in ('reviewing','resolved','dismissed') then raise exception 'Invalid resolution'; end if;
  select * into r from public.reports where id=target_report_id for update;
  if r.id is null then raise exception 'Report unavailable'; end if;
  if remove_content and resolution<>'resolved' then raise exception 'Resolve the report to remove content'; end if;
  if remove_content then
    if r.target_kind='post' then update public.posts set deleted_at=now() where id=r.target_id;
    elsif r.target_kind='reply' then update public.replies set deleted_at=now() where id=r.target_id;
    elsif r.target_kind='message' then update public.messages set deleted_at=now() where id=r.target_id;
    else raise exception 'Use account or room administration for this report'; end if;
  end if;
  update public.reports set status=resolution,resolved_at=case when resolution in ('resolved','dismissed') then now() else null end where id=r.id;
  insert into private.moderation_actions(moderator_id,report_id,resolution,removed_content) values(auth.uid(),r.id,resolution,remove_content);
end;
$$;
revoke all on function public.record_app_event(text,text,integer),public.is_moderator(),public.list_moderation_reports(),public.review_moderation_report(uuid,text,boolean) from public,anon;
grant execute on function public.record_app_event(text,text,integer),public.is_moderator(),public.list_moderation_reports(),public.review_moderation_report(uuid,text,boolean) to authenticated;
revoke all on function public.engagement_metrics(),public.prune_engagement_data() from public,anon,authenticated;
grant execute on function public.engagement_metrics(),public.prune_engagement_data() to service_role;
commit;
