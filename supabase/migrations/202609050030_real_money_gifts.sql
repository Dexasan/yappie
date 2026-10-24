begin;

-- Paid gifts are intentionally separate from the retired coin system. A client can
-- create an intent, but only the service role may verify a store purchase, deliver
-- the gift, or credit earnings.
alter table public.gift_catalog
  add column if not exists price_usd_cents integer,
  add column if not exists recipient_share_cents integer,
  add column if not exists animation_key text,
  add column if not exists season_key text not null default 'evergreen',
  add column if not exists grants_premium_days integer not null default 0,
  add column if not exists includes_gift_pack boolean not null default false,
  add column if not exists ios_product_id text,
  add column if not exists android_product_id text;

alter table public.gift_catalog
  drop constraint if exists gift_catalog_paid_price_positive,
  add constraint gift_catalog_paid_price_positive check (price_usd_cents is null or price_usd_cents > 0),
  drop constraint if exists gift_catalog_recipient_share_valid,
  add constraint gift_catalog_recipient_share_valid check (
    recipient_share_cents is null
    or (recipient_share_cents >= 0 and recipient_share_cents <= price_usd_cents)
  ),
  drop constraint if exists gift_catalog_premium_days_valid,
  add constraint gift_catalog_premium_days_valid check (grants_premium_days between 0 and 3650),
  drop constraint if exists gift_catalog_season_valid,
  add constraint gift_catalog_season_valid check (season_key in ('evergreen', 'halloween', 'christmas', 'winter', 'summer'));

update public.gift_catalog
set active = false
where slug in ('mixtape', 'moon_ticket', 'golden_mic');

insert into public.gift_catalog (
  slug, name, emoji, coin_cost, sort_order, active, price_usd_cents,
  recipient_share_cents, animation_key, season_key, grants_premium_days,
  includes_gift_pack, ios_product_id, android_product_id
)
values
  ('rose', 'Rose', '🌹', 1, 10, true, 200, 100, 'rose_bloom', 'evergreen', 0, false, 'yappie.gift.rose.2', 'yappie_gift_rose_2'),
  ('coffee', 'Coffee', '☕', 1, 20, true, 400, 200, 'coffee_steam', 'evergreen', 0, false, 'yappie.gift.coffee.4', 'yappie_gift_coffee_4'),
  ('heart', 'Heart', '💖', 1, 30, true, 600, 300, 'heart_burst', 'evergreen', 0, false, 'yappie.gift.heart.6', 'yappie_gift_heart_6'),
  ('fire', 'Fireworks', '🎆', 1, 40, true, 1000, 500, 'fireworks', 'evergreen', 0, false, 'yappie.gift.fireworks.10', 'yappie_gift_fireworks_10'),
  ('crown', 'Crown', '👑', 1, 50, true, 2500, 1250, 'crown_shine', 'evergreen', 0, false, 'yappie.gift.crown.25', 'yappie_gift_crown_25'),
  ('bumper', 'YAPPIE Bumper', '🚀', 1, 60, true, 5000, 2500, 'bumper_show', 'evergreen', 30, true, 'yappie.gift.bumper.50', 'yappie_gift_bumper_50'),
  ('halloween_pumpkin', 'Pumpkin Pop', '🎃', 1, 110, true, 400, 200, 'pumpkin_pop', 'halloween', 0, false, 'yappie.gift.pumpkin.4', 'yappie_gift_pumpkin_4'),
  ('halloween_ghost', 'Friendly Ghost', '👻', 1, 120, true, 600, 300, 'ghost_float', 'halloween', 0, false, 'yappie.gift.ghost.6', 'yappie_gift_ghost_6'),
  ('christmas_card', 'Christmas Card', '💌', 1, 130, true, 500, 250, 'card_open', 'christmas', 0, false, 'yappie.gift.christmascard.5', 'yappie_gift_christmas_card_5'),
  ('santa_surprise', 'Santa Surprise', '🎅', 1, 140, true, 1000, 500, 'santa_drop', 'christmas', 0, false, 'yappie.gift.santa.10', 'yappie_gift_santa_10'),
  ('winter_jacket', 'Winter Jacket', '🧥', 1, 150, true, 800, 400, 'jacket_warmup', 'winter', 0, false, 'yappie.gift.jacket.8', 'yappie_gift_jacket_8'),
  ('summer_beach_ball', 'Beach Ball', '🏖️', 1, 160, true, 400, 200, 'beach_bounce', 'summer', 0, false, 'yappie.gift.beachball.4', 'yappie_gift_beach_ball_4'),
  ('summer_sunglasses', 'Summer Shades', '😎', 1, 170, true, 600, 300, 'shades_flash', 'summer', 0, false, 'yappie.gift.shades.6', 'yappie_gift_shades_6')
on conflict (slug) do update
set name = excluded.name,
    emoji = excluded.emoji,
    coin_cost = excluded.coin_cost,
    sort_order = excluded.sort_order,
    active = excluded.active,
    price_usd_cents = excluded.price_usd_cents,
    recipient_share_cents = excluded.recipient_share_cents,
    animation_key = excluded.animation_key,
    season_key = excluded.season_key,
    grants_premium_days = excluded.grants_premium_days,
    includes_gift_pack = excluded.includes_gift_pack,
    ios_product_id = excluded.ios_product_id,
    android_product_id = excluded.android_product_id;

create table public.earnings_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pending_cents bigint not null default 0,
  available_cents bigint not null default 0,
  lifetime_earned_cents bigint not null default 0,
  lifetime_paid_cents bigint not null default 0,
  payout_status text not null default 'not_connected',
  updated_at timestamptz not null default now(),
  constraint earnings_wallets_amounts_nonnegative check (
    pending_cents >= 0 and available_cents >= 0 and lifetime_earned_cents >= 0 and lifetime_paid_cents >= 0
  ),
  constraint earnings_wallets_payout_status_valid check (
    payout_status in ('not_connected', 'pending_verification', 'verified', 'restricted')
  )
);

create table public.gift_purchase_intents (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  gift_slug text not null references public.gift_catalog (slug),
  context_kind text not null,
  context_id uuid,
  expected_price_usd_cents integer not null,
  expected_recipient_share_cents integer not null,
  store_provider text,
  store_product_id text,
  store_transaction_id text,
  status text not null default 'created',
  verified_at timestamptz,
  earnings_available_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gift_purchase_intents_not_self check (sender_id <> recipient_id),
  constraint gift_purchase_intents_context_kind check (context_kind in ('profile', 'quick_chat', 'direct_message', 'club_room')),
  constraint gift_purchase_intents_profile_context check (context_kind <> 'profile' or context_id is null),
  constraint gift_purchase_intents_conversation_context check (context_kind = 'profile' or context_id is not null),
  constraint gift_purchase_intents_provider_valid check (store_provider is null or store_provider in ('apple', 'google')),
  constraint gift_purchase_intents_status_valid check (status in ('created', 'verified', 'refunded', 'chargeback', 'cancelled')),
  constraint gift_purchase_intents_amounts_positive check (expected_price_usd_cents > 0 and expected_recipient_share_cents >= 0),
  unique (store_provider, store_transaction_id)
);

alter table public.gifts
  add column if not exists purchase_intent_id uuid references public.gift_purchase_intents (id),
  add column if not exists price_paid_cents integer,
  add column if not exists recipient_earnings_cents integer,
  add column if not exists currency text;

create unique index if not exists gifts_purchase_intent_unique_idx
on public.gifts (purchase_intent_id) where purchase_intent_id is not null;

create table public.earnings_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null,
  bucket text not null,
  kind text not null,
  purchase_intent_id uuid references public.gift_purchase_intents (id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint earnings_ledger_amount_nonzero check (amount_cents <> 0),
  constraint earnings_ledger_bucket_valid check (bucket in ('pending', 'available', 'paid')),
  constraint earnings_ledger_kind_valid check (kind in ('gift_credit', 'earnings_release', 'refund', 'chargeback', 'payout', 'admin_adjustment'))
);

create table public.premium_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  source_reference_id uuid,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint premium_entitlements_source_valid check (source in ('gift', 'subscription', 'admin')),
  constraint premium_entitlements_time_valid check (ends_at is null or ends_at > starts_at)
);

create index gift_purchase_intents_sender_idx on public.gift_purchase_intents (sender_id, created_at desc);
create index gift_purchase_intents_recipient_idx on public.gift_purchase_intents (recipient_id, created_at desc);
create index earnings_ledger_user_idx on public.earnings_ledger (user_id, created_at desc);
create index premium_entitlements_user_idx on public.premium_entitlements (user_id, ends_at desc);

create trigger earnings_wallets_set_updated_at before update on public.earnings_wallets
for each row execute function public.set_updated_at();
create trigger gift_purchase_intents_set_updated_at before update on public.gift_purchase_intents
for each row execute function public.set_updated_at();

insert into public.earnings_wallets (user_id)
select id from auth.users on conflict (user_id) do nothing;

create or replace function public.create_earnings_wallet()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.earnings_wallets (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_user_earnings_wallet_created on auth.users;
create trigger auth_user_earnings_wallet_created after insert on auth.users
for each row execute function public.create_earnings_wallet();

create or replace function public.gift_is_in_season(season text, at_time timestamptz default now())
returns boolean language sql stable set search_path = '' as $$
  select case season
    when 'evergreen' then true
    when 'halloween' then extract(month from at_time) = 10
    when 'christmas' then extract(month from at_time) in (11, 12)
    when 'winter' then extract(month from at_time) in (12, 1, 2)
    when 'summer' then extract(month from at_time) in (6, 7, 8)
    else false
  end;
$$;

create or replace function public.list_paid_gift_catalog()
returns table (
  slug text, name text, emoji text, price_usd_cents integer,
  recipient_share_cents integer, animation_key text, season_key text,
  grants_premium_days integer, includes_gift_pack boolean,
  ios_product_id text, android_product_id text
)
language sql stable security definer set search_path = '' as $$
  select gift.slug, gift.name, gift.emoji, gift.price_usd_cents,
         gift.recipient_share_cents, gift.animation_key, gift.season_key,
         gift.grants_premium_days, gift.includes_gift_pack,
         gift.ios_product_id, gift.android_product_id
  from public.gift_catalog gift
  where auth.uid() is not null
    and gift.active
    and gift.price_usd_cents is not null
    and public.gift_is_in_season(gift.season_key)
  order by gift.sort_order, gift.price_usd_cents, gift.slug;
$$;

create or replace function public.get_earnings_wallet()
returns table (
  pending_cents bigint, available_cents bigint, lifetime_earned_cents bigint,
  lifetime_paid_cents bigint, payout_status text, withdrawal_minimum_cents integer
)
language sql stable security definer set search_path = '' as $$
  select wallet.pending_cents, wallet.available_cents, wallet.lifetime_earned_cents,
         wallet.lifetime_paid_cents, wallet.payout_status, 10000
  from public.earnings_wallets wallet where wallet.user_id = auth.uid();
$$;

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

  select * into selected_gift from public.gift_catalog
  where slug = target_gift_slug and active and price_usd_cents is not null
    and public.gift_is_in_season(season_key);
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

-- This function must only be called by a trusted server after App Store / Play
-- purchase verification. It is deliberately unavailable to app users.
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
begin
  select * into purchase from public.gift_purchase_intents where id = target_intent_id for update;
  if not found or purchase.status <> 'created' then raise exception 'Purchase intent is unavailable.'; end if;
  if verified_provider not in ('apple', 'google') then raise exception 'Unsupported purchase provider.'; end if;

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
    insert into public.premium_entitlements (user_id, source, source_reference_id, starts_at, ends_at)
    values (purchase.recipient_id, 'gift', purchase.id, now(), now() + make_interval(days => selected_gift.grants_premium_days));
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
  where user_id = purchase.recipient_id;
  insert into public.earnings_ledger (user_id, amount_cents, bucket, kind, purchase_intent_id)
  values (purchase.recipient_id, purchase.expected_recipient_share_cents, 'available', 'earnings_release', purchase.id);
end;
$$;

drop function if exists public.list_profile_gifts(uuid, integer);
create function public.list_profile_gifts(target_user_id uuid, gift_limit integer default 12)
returns table (
  gift_id uuid, sender_id uuid, sender_display_name text, sender_handle text,
  gift_slug text, gift_name text, gift_emoji text, coin_cost integer,
  price_paid_cents integer, recipient_earnings_cents integer, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select sent_gift.id, sent_gift.sender_id, sender.display_name, sender.handle,
         catalog.slug, catalog.name, catalog.emoji, sent_gift.coin_cost,
         sent_gift.price_paid_cents, sent_gift.recipient_earnings_cents, sent_gift.created_at
  from public.gifts sent_gift
  join public.profiles sender on sender.id = sent_gift.sender_id
  join public.gift_catalog catalog on catalog.slug = sent_gift.gift_slug
  where auth.uid() is not null and sent_gift.recipient_id = target_user_id
    and not public.is_blocked_between(auth.uid(), sent_gift.recipient_id)
    and not public.is_blocked_between(auth.uid(), sent_gift.sender_id)
  order by sent_gift.created_at desc limit least(greatest(gift_limit, 1), 30);
$$;

alter table public.earnings_wallets enable row level security;
alter table public.gift_purchase_intents enable row level security;
alter table public.earnings_ledger enable row level security;
alter table public.premium_entitlements enable row level security;

revoke all on public.earnings_wallets, public.gift_purchase_intents, public.earnings_ledger, public.premium_entitlements from anon, authenticated;
grant select on public.earnings_wallets, public.gift_purchase_intents, public.earnings_ledger, public.premium_entitlements to authenticated;

create policy earnings_wallets_select_own on public.earnings_wallets for select to authenticated using (user_id = (select auth.uid()));
create policy gift_purchase_intents_select_participants on public.gift_purchase_intents for select to authenticated
using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy earnings_ledger_select_own on public.earnings_ledger for select to authenticated using (user_id = (select auth.uid()));
create policy premium_entitlements_select_own on public.premium_entitlements for select to authenticated using (user_id = (select auth.uid()));

revoke all on function public.create_earnings_wallet() from public, anon, authenticated;
revoke all on function public.gift_is_in_season(text, timestamptz) from public, anon, authenticated;
revoke all on function public.list_paid_gift_catalog() from public, anon;
revoke all on function public.get_earnings_wallet() from public, anon;
revoke all on function public.create_gift_purchase_intent(uuid, text, text, uuid) from public, anon;
revoke all on function public.record_verified_gift_purchase(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.release_gift_earnings(uuid) from public, anon, authenticated;
revoke execute on function public.send_virtual_gift(uuid, text, text, uuid) from authenticated;
revoke all on function public.list_profile_gifts(uuid, integer) from public, anon;

grant execute on function public.list_paid_gift_catalog() to authenticated;
grant execute on function public.get_earnings_wallet() to authenticated;
grant execute on function public.create_gift_purchase_intent(uuid, text, text, uuid) to authenticated;
grant execute on function public.record_verified_gift_purchase(uuid, text, text, text) to service_role;
grant execute on function public.release_gift_earnings(uuid) to service_role;
grant execute on function public.list_profile_gifts(uuid, integer) to authenticated;

commit;
