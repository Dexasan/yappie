begin;

alter table public.earnings_ledger
  drop constraint if exists earnings_ledger_purchase_intent_id_fkey,
  add constraint earnings_ledger_purchase_intent_id_fkey
    foreign key (purchase_intent_id) references public.gift_purchase_intents (id) on delete cascade;

alter table public.gifts
  drop constraint if exists gifts_purchase_intent_id_fkey,
  add constraint gifts_purchase_intent_id_fkey
    foreign key (purchase_intent_id) references public.gift_purchase_intents (id) on delete cascade;

commit;
