import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/context/SessionContext';
import { EngagementSummary, loadEngagementSummary } from '@/features/activity/api';
import { supabase } from '@/lib/supabase';
import { uniqueRealtimeTopic } from '@/lib/realtime-topic';

type Value = { summary: EngagementSummary | null; refresh: () => Promise<void> };
const ActivityContext = createContext<Value>({ summary: null, refresh: async () => {} });

export function ActivityProvider({ children }: PropsWithChildren) {
  const { user, onboardingComplete } = useSession();
  const userId = user?.id;
  const [state, setState] = useState<{ userId: string; summary: EngagementSummary } | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    if (!userId || !onboardingComplete || AppState.currentState !== 'active') return;
    try {
      const summary = await loadEngagementSummary();
      if (current === generation.current) setState({ userId, summary });
    } catch { /* Keep the last known state; reconcile on reconnect/foreground. */ }
  }, [userId, onboardingComplete]);

  useEffect(() => {
    setState(null);
    if (!userId || !onboardingComplete || !supabase) return;
    const client = supabase;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 200);
    };
    const channel = client.channel(uniqueRealtimeTopic(`engagement:${userId}`));
    for (const table of ['posts', 'messages', 'activity_events', 'conversation_members', 'blocks', 'follows']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, invalidate);
    }
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(); });
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    const appState = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => {
      ++generation.current;
      if (debounce) clearTimeout(debounce);
      clearInterval(interval);
      appState.remove();
      void client.removeChannel(channel);
    };
  }, [userId, onboardingComplete, refresh]);

  return <ActivityContext.Provider value={{ summary: state && state.userId === userId ? state.summary : null, refresh }}>{children}</ActivityContext.Provider>;
}

export const useActivity = () => useContext(ActivityContext);
