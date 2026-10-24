export function setActiveNotificationConversation(_id:string|null) {}
export async function registerDevice(requestPermission=false) {if(requestPermission) throw new Error('Push notifications are available in installed Android and iOS builds.');}
export async function unregisterDevice() {}
export async function setDeviceBadge(_count:number) {}
export function listenForNotifications(_onOpen:(data:Record<string,unknown>)=>void,_onReceive:()=>void) {return ()=>{};}
