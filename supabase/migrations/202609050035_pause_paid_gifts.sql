-- Paid gifting is intentionally parked for the free beta. Catalog and historical
-- gift reads remain available, but app users cannot create purchase intents.
revoke execute on function public.create_gift_purchase_intent(uuid, text, text, uuid) from authenticated;

comment on function public.create_gift_purchase_intent(uuid, text, text, uuid) is
  'Dormant during the free beta. Re-enable only with verified native billing, refund handling, compliant payouts, and updated terms.';
