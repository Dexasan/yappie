let subscriptionId = 0;

/** Supabase reuses channels with the same topic; each mounted subscriber owns one. */
export function uniqueRealtimeTopic(scope: string) {
  subscriptionId += 1;
  return `${scope}:${subscriptionId}`;
}
