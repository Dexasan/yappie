begin;

create or replace function public.create_gift_purchase_intent(
  target_user_id uuid,
  target_gift_slug text,
  gift_context_kind text default 'profile',
  gift_context_id uuid default null
)
returns table (
  purchase_intent_id uuid, price_usd_cents integer, recipient_share_cents integer,
  ios_product_id text, android_product_id text
)
language plpgsql security definer set search_path = '' as $$
declare
  sender_user_id uuid := auth.uid();
  selected_gift public.gift_catalog%rowtype;
  created_intent_id uuid;
begin
  if sender_user_id is null then raise exception 'Authentication required.'; end if;
  if target_user_id is null or target_user_id = sender_user_id then raise exception 'Choose another person to receive this gift.'; end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then raise exception 'This profile is unavailable.'; end if;
  if public.is_blocked_between(sender_user_id, target_user_id) then raise exception 'This gift cannot be sent.'; end if;

  select catalog.* into selected_gift
  from public.gift_catalog catalog
  where catalog.slug = target_gift_slug
    and catalog.active
    and catalog.price_usd_cents is not null
    and public.gift_is_in_season(catalog.season_key);
  if not found then raise exception 'This gift is unavailable.'; end if;

  if gift_context_kind = 'profile' then
    if gift_context_id is not null then raise exception 'Profile gifts cannot include a context ID.'; end if;
  elsif gift_context_kind = 'quick_chat' then
    if gift_context_id is null or not exists (
      select 1 from public.quick_chat_sessions session
      where session.id = gift_context_id and ((session.user_a_id = sender_user_id and session.user_b_id = target_user_id)
        or (session.user_b_id = sender_user_id and session.user_a_id = target_user_id))
    ) then raise exception 'This Quick Chat is unavailable.'; end if;
  elsif gift_context_kind = 'direct_message' then
    if gift_context_id is null or not public.is_conversation_member(gift_context_id, sender_user_id)
      or not public.is_conversation_member(gift_context_id, target_user_id)
    then raise exception 'This conversation is unavailable.'; end if;
  elsif gift_context_kind = 'club_room' then
    if gift_context_id is null or not exists (
      select 1 from public.room_participants sender_participant
      join public.room_participants recipient_participant on recipient_participant.room_id = sender_participant.room_id
      where sender_participant.room_id = gift_context_id and sender_participant.user_id = sender_user_id
        and recipient_participant.user_id = target_user_id and sender_participant.state = 'active'
        and recipient_participant.state = 'active'
    ) then raise exception 'This live room is unavailable.'; end if;
  else raise exception 'Unsupported gift context.';
  end if;

  insert into public.gift_purchase_intents (
    sender_id, recipient_id, gift_slug, context_kind, context_id,
    expected_price_usd_cents, expected_recipient_share_cents
  ) values (
    sender_user_id, target_user_id, selected_gift.slug, gift_context_kind, gift_context_id,
    selected_gift.price_usd_cents, selected_gift.recipient_share_cents
  ) returning id into created_intent_id;

  return query select created_intent_id, selected_gift.price_usd_cents,
    selected_gift.recipient_share_cents, selected_gift.ios_product_id, selected_gift.android_product_id;
end;
$$;

revoke all on function public.create_gift_purchase_intent(uuid, text, text, uuid) from public, anon;
grant execute on function public.create_gift_purchase_intent(uuid, text, text, uuid) to authenticated;

commit;
