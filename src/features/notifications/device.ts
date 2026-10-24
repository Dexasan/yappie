import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const tokenKey='yappie:push-token';
let activeConversation: string | null=null;
Notifications.setNotificationHandler({handleNotification:async notification => {
  const suppress=activeConversation && notification.request.content.data?.url===`/messages/${activeConversation}`;
  return {shouldShowBanner:!suppress,shouldShowList:!suppress,shouldPlaySound:!suppress,shouldSetBadge:false};
}});
export function setActiveNotificationConversation(id: string|null) {activeConversation=id;}
export async function registerDevice(requestPermission=false) {
  if (!supabase) throw new Error('Supabase is not configured.');
  if(Platform.OS==='android') await Notifications.setNotificationChannelAsync('conversations',{name:'Conversations',importance:Notifications.AndroidImportance.HIGH});
  let permission=await Notifications.getPermissionsAsync();
  if(!permission.granted && requestPermission) permission=await Notifications.requestPermissionsAsync();
  if(!permission.granted) { if(requestPermission) throw new Error('Notifications are disabled. You can enable them in your phone settings.'); return; }
  const projectId=Constants.expoConfig?.extra?.eas?.projectId;
  if(!projectId) throw new Error('Push configuration is unavailable in this build.');
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  const {error}=await supabase.rpc('register_push_device',{push_token:token});
  if(error) throw error;
  await AsyncStorage.setItem(tokenKey,token);
}
export async function unregisterDevice() {
  const token=await AsyncStorage.getItem(tokenKey);
  if(token && supabase) {
    const {error}=await supabase.rpc('unregister_push_device',{push_token:token});
    if(error) throw new Error('Could not disconnect notifications. Please reconnect and try signing out again.');
  }
  await AsyncStorage.removeItem(tokenKey);
  await Notifications.dismissAllNotificationsAsync();
  await Notifications.setBadgeCountAsync(0);
}
export async function setDeviceBadge(count:number) {await Notifications.setBadgeCountAsync(count);}
export function listenForNotifications(onOpen:(data:Record<string,unknown>)=>void,onReceive:()=>void) {
  const responses=Notifications.addNotificationResponseReceivedListener(response=>onOpen(response.notification.request.content.data ?? {}));
  const incoming=Notifications.addNotificationReceivedListener(onReceive);
  const tokens=Notifications.addPushTokenListener(()=>{void registerDevice().catch(()=>{});});
  void Notifications.getLastNotificationResponseAsync().then(response=>{if(response){onOpen(response.notification.request.content.data ?? {});void Notifications.clearLastNotificationResponseAsync();}}).catch(()=>{});
  return ()=>{responses.remove();incoming.remove();tokens.remove();};
}
