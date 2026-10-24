# Paid gifts — parked for the free beta

## Current status

Paid gifting is intentionally inactive. `EXPO_PUBLIC_GIFT_CHECKOUT_ENABLED`
must remain `false`. The beta client may preview gift artwork, but it does not
show prices, create purchase intents, charge users, credit earnings, grant
Premium, connect payout accounts, or allow withdrawals.

The production database also revokes authenticated access to
`create_gift_purchase_intent`. Re-enabling the environment flag alone is not
enough to activate purchases; that server permission must only be restored as
part of a later, reviewed launch migration after the checklist below is done.

## Future design

The planned system models gifts as direct purchases. Coins are retired. The buyer sees
the price returned by their App Store or Play storefront. After storefront tax
and fees, the resulting net proceeds are split 50/50 between the recipient and
YAPPIE. A recipient can request a payout after the available balance reaches $100.

## What is prepared but dormant

- Familiar evergreen catalog: Rose, Coffee, Heart, Fireworks, Crown, and the $50
  YAPPIE Bumper.
- Recurring Halloween, Christmas, winter, and summer catalog windows.
- A recipient earnings wallet with pending, available, lifetime, and paid totals.
- A seven-day refund hold before a verified gift earning becomes available.
- Service-role-only delivery and wallet crediting. Mobile clients can never mark
  their own purchase as paid.
- Store transaction IDs are unique and tied to the expected product ID.
- The Bumper grants its recipient 30 days of Premium and a combined gift-show
  animation. The duration is stored in the catalog and can be changed remotely.

## Required before checkout can be enabled

1. Create every consumable product ID from `gift_catalog` in App Store Connect
   and Play Console. Configure regional price points manually where purchasing
   power should differ; otherwise use each store's automatic equalized prices.
2. Install a native StoreKit / Google Play Billing adapter in the Expo development
   build. Expo Go cannot provide this native purchase module.
3. Add a Supabase Edge Function that verifies Apple signed transactions and
   Google purchase tokens with the stores, then calls
   `record_verified_gift_purchase` using the service role.
4. Handle store server notifications for refunds, revocations, and chargebacks.
   Do not release funds without that reversal path.
5. Select and configure a marketplace payout provider. Stripe Connect is the
   current recommended shape, but it is not installed or configured yet.
6. Add hosted payout onboarding, KYC status webhooks, supported-country checks,
   payout requests, failure recovery, and tax reporting.
7. Test purchase retries, duplicate notifications, refunds before and after the
   hold, insufficient balances after reversal, payout failure, and account deletion.
8. Add a reviewed database migration that restores authenticated execute access
   to `create_gift_purchase_intent`.
9. Only then set `EXPO_PUBLIC_GIFT_CHECKOUT_ENABLED=true` and ship a new native
   development build.

## Settlement rule

Never derive the recipient earning from the catalog's reference USD price. Use
the verified transaction currency and storefront, reconcile tax and store fees,
then credit 50% of net proceeds to the pending wallet. The catalog amount is only
a preview fallback until native billing returns the localized product details.
