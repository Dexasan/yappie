begin;

drop function if exists public.get_earnings_wallet();
create function public.get_earnings_wallet()
returns table (
  pending_cents bigint, available_cents bigint, lifetime_earned_cents bigint,
  lifetime_paid_cents bigint, payout_status text, withdrawal_minimum_cents integer,
  premium_until timestamptz
)
language sql stable security definer set search_path = '' as $$
  select wallet.pending_cents, wallet.available_cents, wallet.lifetime_earned_cents,
         wallet.lifetime_paid_cents, wallet.payout_status, 10000,
         (
           select max(entitlement.ends_at)
           from public.premium_entitlements entitlement
           where entitlement.user_id = wallet.user_id
             and (entitlement.ends_at is null or entitlement.ends_at > now())
         )
  from public.earnings_wallets wallet where wallet.user_id = auth.uid();
$$;

create or replace function public.record_verified_gift_purchase(
  target_intent_id uuid,
  verified_provider text,
  verified_product_id text,
  verified_transaction_id text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  purchase public.gift_purchase_intents%rowtype;
  selected_gift public.gift_catalog%rowtype;
  created_gift_id uuid;
  existing_intent_id uuid;
  premium_starts_at timestamptz;
begin
  if verified_provider not in ('apple', 'google') then raise exception 'Unsupported purchase provider.'; end if;
  if nullif(trim(verified_product_id), '') is null or nullif(trim(verified_transaction_id), '') is null then
    raise exception 'Verified product and transaction IDs are required.';
  end if;

  select intent.id into existing_intent_id
  from public.gift_purchase_intents intent
  where intent.store_provider = verified_provider and intent.store_transaction_id = verified_transaction_id;
  if existing_intent_id is not null then
    if existing_intent_id <> target_intent_id then raise exception 'This store transaction has already been used.'; end if;
    select gift.id into created_gift_id from public.gifts gift where gift.purchase_intent_id = target_intent_id;
    if created_gift_id is not null then return created_gift_id; end if;
  end if;

  select * into purchase from public.gift_purchase_intents where id = target_intent_id for update;
  if not found then raise exception 'Purchase intent is unavailable.'; end if;
  if purchase.status = 'verified' then
    if purchase.store_provider = verified_provider
      and purchase.store_product_id = verified_product_id
      and purchase.store_transaction_id = verified_transaction_id
    then
      select gift.id into created_gift_id from public.gifts gift where gift.purchase_intent_id = target_intent_id;
      if created_gift_id is not null then return created_gift_id; end if;
    end if;
    raise exception 'Purchase intent was already verified with different details.';
  end if;
  if purchase.status <> 'created' then raise exception 'Purchase intent is unavailable.'; end if;

  select * into selected_gift from public.gift_catalog where slug = purchase.gift_slug;
  if (verified_provider = 'apple' and selected_gift.ios_product_id <> verified_product_id)
    or (verified_provider = 'google' and selected_gift.android_product_id <> verified_product_id)
  then raise exception 'The verified product does not match this gift.'; end if;

  update public.gift_purchase_intents set
    store_provider = verified_provider,
    store_product_id = verified_product_id,
    store_transaction_id = verified_transaction_id,
    status = 'verified',
    verified_at = now(),
    earnings_available_at = now() + interval '7 days'
  where id = target_intent_id;

  insert into public.gifts (
    sender_id, recipient_id, gift_slug, coin_cost, context_kind, context_id,
    purchase_intent_id, price_paid_cents, recipient_earnings_cents, currency
  ) values (
    purchase.sender_id, purchase.recipient_id, purchase.gift_slug, 1,
    purchase.context_kind, purchase.context_id, purchase.id,
    purchase.expected_price_usd_cents, purchase.expected_recipient_share_cents, 'USD'
  ) returning id into created_gift_id;

  insert into public.earnings_wallets (user_id, pending_cents, lifetime_earned_cents)
  values (purchase.recipient_id, purchase.expected_recipient_share_cents, purchase.expected_recipient_share_cents)
  on conflict (user_id) do update set
    pending_cents = public.earnings_wallets.pending_cents + excluded.pending_cents,
    lifetime_earned_cents = public.earnings_wallets.lifetime_earned_cents + excluded.lifetime_earned_cents;

  insert into public.earnings_ledger (user_id, amount_cents, bucket, kind, purchase_intent_id)
  values (purchase.recipient_id, purchase.expected_recipient_share_cents, 'pending', 'gift_credit', purchase.id);

  if selected_gift.grants_premium_days > 0 then
    select greatest(now(), coalesce(max(entitlement.ends_at), now())) into premium_starts_at
    from public.premium_entitlements entitlement
    where entitlement.user_id = purchase.recipient_id
      and (entitlement.ends_at is null or entitlement.ends_at > now());
    insert into public.premium_entitlements (user_id, source, source_reference_id, starts_at, ends_at)
    values (
      purchase.recipient_id, 'gift', purchase.id, premium_starts_at,
      premium_starts_at + make_interval(days => selected_gift.grants_premium_days)
    );
  end if;

  return created_gift_id;
end;
$$;

create or replace function public.release_gift_earnings(target_intent_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare purchase public.gift_purchase_intents%rowtype;
begin
  select * into purchase from public.gift_purchase_intents where id = target_intent_id for update;
  if not found or purchase.status <> 'verified' or purchase.earnings_available_at > now() then
    raise exception 'These earnings are not ready to release.';
  end if;
  if exists (select 1 from public.earnings_ledger where purchase_intent_id = purchase.id and kind = 'earnings_release') then return; end if;
  update public.earnings_wallets set
    pending_cents = pending_cents - purchase.expected_recipient_share_cents,
    available_cents = available_cents + purchase.expected_recipient_share_cents
  where user_id = purchase.recipient_id and pending_cents >= purchase.expected_recipient_share_cents;
  if not found then raise exception 'The pending wallet balance is inconsistent.'; end if;
  insert into public.earnings_ledger (user_id, amount_cents, bucket, kind, purchase_intent_id)
  values
    (purchase.recipient_id, -purchase.expected_recipient_share_cents, 'pending', 'earnings_release', purchase.id),
    (purchase.recipient_id, purchase.expected_recipient_share_cents, 'available', 'earnings_release', purchase.id);
end;
$$;

revoke all on function public.get_earnings_wallet() from public, anon;
revoke all on function public.record_verified_gift_purchase(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.release_gift_earnings(uuid) from public, anon, authenticated;
grant execute on function public.get_earnings_wallet() to authenticated;
grant execute on function public.record_verified_gift_purchase(uuid, text, text, text) to service_role;
grant execute on function public.release_gift_earnings(uuid) to service_role;

commit;
