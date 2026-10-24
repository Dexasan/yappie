import { PropsWithChildren, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSession } from '@/context/SessionContext';
import { useActivity } from '@/context/ActivityContext';
import { setNotificationAttention } from '@/features/notifications/api';
import { listenForNotifications, registerDevice, setActiveNotificationConversation, setDeviceBadge } from '@/features/notifications/device';
import { safeReturnTarget } from '@/lib/navigation-target';
import { trackEvent } from '@/features/analytics/api';

export function NotificationProvider({children}:PropsWithChildren) {
  const {user,isLoading,onboardingComplete}=useSession();
  const {summary,refresh}=useActivity();
  const pathname=usePathname();
  const pending=useRef<Record<string,unknown>|null>(null);
  const session=useRef({user,isLoading,onboardingComplete});
  session.current={user,isLoading,onboardingComplete};
  const open=(data:Record<string,unknown>)=>{
    const target=safeReturnTarget(data.url);
    if(!target) return;
    if(session.current.isLoading){pending.current=data;return;}
    if(!session.current.user){router.push({pathname:'/auth',params:{returnTo:String(target)}});return;}
    if(session.current.onboardingComplete) {trackEvent('notification_opened','notifications');router.push(target);}
  };
  useEffect(()=>listenForNotifications(data=>open(data),()=>void refresh()),[refresh]);
  useEffect(()=>{if(!isLoading && pending.current){const data=pending.current;pending.current=null;open(data);}},[isLoading,user?.id,onboardingComplete]);
  useEffect(()=>{if(user && onboardingComplete) void registerDevice().catch(()=>{});},[user?.id,onboardingComplete]);
  useEffect(()=>{void setDeviceBadge((summary?.activity_count??0)+(summary?.message_count??0)).catch(()=>{});},[summary]);
  useEffect(()=>{
    if(!user) return;
    const match=/^\/messages\/([0-9a-f-]{36})$/i.exec(pathname);
    const sync=()=>{
      const id=AppState.currentState==='active' ? match?.[1]??null : null;
      setActiveNotificationConversation(id);
      void setNotificationAttention(id).catch(()=>{});
    };
    sync();
    const heartbeat=setInterval(sync,20_000);
    const app=AppState.addEventListener('change',sync);
    return ()=>{clearInterval(heartbeat);app.remove();setActiveNotificationConversation(null);void setNotificationAttention(null).catch(()=>{});};
  },[pathname,user?.id]);
  return children;
}
