begin;

create or replace function public.leave_quick_chat(target_session_id uuid, leave_reason text default 'left')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if leave_reason not in ('left', 'skip', 'blocked', 'reported') then
    raise exception 'Invalid leave reason' using errcode = '22023';
  end if;

  select session.conversation_id
  into target_conversation_id
  from public.quick_chat_sessions session
  where session.id = target_session_id
    and session.status = 'active'
    and current_user_id in (session.user_a_id, session.user_b_id);

  if target_conversation_id is null then
    return false;
  end if;

  if leave_reason = 'skip' and not exists (
    select 1
    from public.messages message
    where message.conversation_id = target_conversation_id
      and message.deleted_at is null
      and message.body ~ '[[:alnum:]]'
  ) then
    raise exception 'Say something before skipping' using errcode = '22023';
  end if;

  update public.quick_chat_sessions
  set status = 'ended',
      ended_at = now(),
      ended_by = current_user_id,
      end_reason = leave_reason
  where id = target_session_id
    and status = 'active';

  update public.conversation_members
  set left_at = now()
  where conversation_id = target_conversation_id
    and user_id = current_user_id;

  return true;
end;
$$;

revoke all on function public.leave_quick_chat(uuid, text) from public, anon;
grant execute on function public.leave_quick_chat(uuid, text) to authenticated;

commit;
