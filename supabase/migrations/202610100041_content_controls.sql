begin;
create function public.set_post_preference(target_post_id uuid, preference_kind text, enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.posts p where p.id=target_post_id and p.deleted_at is null and not public.is_blocked_between(auth.uid(),p.author_id)) then
    raise exception 'Post unavailable' using errcode='42501';
  end if;
  if preference_kind not in ('saved','hidden') then raise exception 'Invalid preference'; end if;
  insert into public.post_preferences(user_id,post_id,saved,hidden)
    values(auth.uid(),target_post_id,preference_kind='saved' and enabled,preference_kind='hidden' and enabled)
  on conflict(user_id,post_id) do update set
    saved=case when preference_kind='saved' then enabled else public.post_preferences.saved end,
    hidden=case when preference_kind='hidden' then enabled else public.post_preferences.hidden end;
end;
$$;
create function public.list_saved_posts()
returns table(post_id uuid,body text,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id,p.body,p.created_at from public.post_preferences pref join public.posts p on p.id=pref.post_id
  where pref.user_id=auth.uid() and pref.saved and p.deleted_at is null and not public.is_blocked_between(auth.uid(),p.author_id)
  order by pref.created_at desc limit 100;
$$;
create function public.delete_own_content(content_kind text,target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if content_kind='post' then update public.posts set deleted_at=now() where id=target_id and author_id=auth.uid();
  elsif content_kind='reply' then update public.replies set deleted_at=now() where id=target_id and author_id=auth.uid();
  else raise exception 'Invalid content kind'; end if;
  if not found then raise exception 'Content access required' using errcode='42501'; end if;
end;
$$;
revoke all on function public.set_post_preference(uuid,text,boolean) from public,anon;
revoke all on function public.list_saved_posts() from public,anon;
revoke all on function public.delete_own_content(text,uuid) from public,anon;
grant execute on function public.set_post_preference(uuid,text,boolean) to authenticated;
grant execute on function public.list_saved_posts() to authenticated;
grant execute on function public.delete_own_content(text,uuid) to authenticated;
commit;
