import { PropsWithChildren,useEffect,useRef } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/context/SessionContext';
import { trackEvent } from '@/features/analytics/api';
export function AnalyticsProvider({children}:PropsWithChildren) {
  const {user,onboardingComplete}=useSession();
  const last=useRef(0);
  useEffect(()=>{
    last.current=0;
    if(!user || !onboardingComplete)return;
    const record=()=>{if(AppState.currentState==='active' && Date.now()-last.current>30*60_000){last.current=Date.now();trackEvent('session_start','app');}};
    record();const app=AppState.addEventListener('change',record);return ()=>app.remove();
  },[user?.id,onboardingComplete]);
  return children;
}
