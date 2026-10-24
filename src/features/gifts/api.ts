import { supabase } from '@/lib/supabase';

export type EarningsWallet = {
  available_cents: number;
  lifetime_earned_cents: number;
  lifetime_paid_cents: number;
  payout_status: 'not_connected' | 'pending_verification' | 'restricted' | 'verified';
  pending_cents: number;
  premium_until: string | null;
  withdrawal_minimum_cents: number;
};

export type GiftCatalogItem = {
  android_product_id: string;
  animation_key: string;
  emoji: string;
  grants_premium_days: number;
  includes_gift_pack: boolean;
  ios_product_id: string;
  name: string;
  price_usd_cents: number;
  recipient_share_cents: number;
  season_key: 'christmas' | 'evergreen' | 'halloween' | 'summer' | 'winter';
  slug: string;
};

export type ProfileGift = {
  coin_cost: number;
  created_at: string;
  gift_emoji: string;
  gift_id: string;
  gift_name: string;
  gift_slug: string;
  price_paid_cents: number | null;
  recipient_earnings_cents: number | null;
  sender_display_name: string | null;
  sender_handle: string | null;
  sender_id: string;
};

export type GiftContextKind = 'club_room' | 'direct_message' | 'profile' | 'quick_chat';

type GiftCheckoutInput = {
  contextId?: string;
  contextKind: GiftContextKind;
  giftSlug: string;
  recipientId: string;
};

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

export async function loadEarningsWallet() {
  const { data, error } = await client().rpc('get_earnings_wallet');
  if (error) throw error;
  const wallet = data[0];
  if (!wallet) throw new Error('Your earnings wallet is unavailable.');
  return wallet as EarningsWallet;
}

export async function loadGiftCatalog() {
  const { data, error } = await client().rpc('list_paid_gift_catalog');
  if (error) throw error;
  return data as GiftCatalogItem[];
}

export async function loadProfileGifts(profileId: string) {
  const { data, error } = await client().rpc('list_profile_gifts', {
    target_user_id: profileId,
    gift_limit: 12,
  });
  if (error) throw error;
  return data as ProfileGift[];
}

export function giftCheckoutEnabled() {
  return process.env.EXPO_PUBLIC_GIFT_CHECKOUT_ENABLED === 'true';
}

export async function beginGiftCheckout(_input: GiftCheckoutInput) {
  if (!giftCheckoutEnabled()) {
    throw new Error('Gifting is off during the free beta. No payment was taken.');
  }

  // Deliberately do not create a server intent until native storefront billing,
  // receipt verification, refund handling, and payouts are all connected.
  throw new Error('Gift checkout is not available in this build. No payment was taken.');
}
