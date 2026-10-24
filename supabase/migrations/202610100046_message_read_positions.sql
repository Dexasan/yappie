begin;
create function public.get_direct_conversation_partner(target_conversation_id uuid)
returns table(user_id uuid,display_name text,handle text,avatar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id,p.display_name,p.handle,p.avatar_path from public.direct_conversations d
  join public.profiles p on p.id=case when d.user_low_id=auth.uid() then d.user_high_id else d.user_low_id end
  where d.conversation_id=target_conversation_id and auth.uid() in(d.user_low_id,d.user_high_id)
    and public.is_conversation_member(d.conversation_id,auth.uid()) and not public.is_blocked_between(auth.uid(),p.id);
$$;
create function public.acknowledge_conversation(target_conversation_id uuid,through_time timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or through_time is null or through_time>now() then raise exception 'Invalid read position' using errcode='42501'; end if;
  update public.conversation_members set last_read_at=greatest(coalesce(last_read_at,joined_at),through_time)
    where conversation_id=target_conversation_id and user_id=auth.uid() and left_at is null;
  if not found then raise exception 'Conversation access required' using errcode='42501'; end if;
end;
$$;
revoke all on function public.get_direct_conversation_partner(uuid),public.acknowledge_conversation(uuid,timestamptz) from public,anon;
grant execute on function public.get_direct_conversation_partner(uuid),public.acknowledge_conversation(uuid,timestamptz) to authenticated;
commit;
