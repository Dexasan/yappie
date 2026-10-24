import { supabase } from '@/lib/supabase';

function getCallbackParams(url: string) {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const fragment = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);

  return {
    code: query.get('code') ?? fragment.get('code'),
    errorDescription: query.get('error_description') ?? fragment.get('error_description'),
    intent: query.get('intent') ?? fragment.get('intent'),
    type: query.get('type') ?? fragment.get('type'),
  };
}

export const authCallbackUrl = 'socialdiscovery://auth/callback';

function isExpectedCallback(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'socialdiscovery:' && parsed.hostname === 'auth' && parsed.pathname === '/callback';
  } catch {
    return false;
  }
}

export async function handleAuthCallbackUrl(url: string) {
  if (!supabase || !isExpectedCallback(url)) return null;

  const { code, errorDescription, intent, type } = getCallbackParams(url);
  if (errorDescription) throw new Error(errorDescription);

  if (!code) return null;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return type ?? intent;
}
