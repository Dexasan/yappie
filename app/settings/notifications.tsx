import { useCallback, useState } from 'react';
import { Redirect, useFocusEffect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { PrimaryButton, Screen, SectionHeader, SkeletonRows } from '@/components/ui';
import { PaperSurface } from '@/components/InkArtwork';
import { FeatureHeader, FeatureNotice, InkAction, InkToggle } from '@/components/EngagementUI';
import { useSession } from '@/context/SessionContext';
import { loadNotificationPreferences, NotificationPreferences, saveNotificationPreferences } from '@/features/notifications/api';
import { registerDevice } from '@/features/notifications/device';
import { colors, fonts } from '@/theme/tokens';

export default function NotificationSettingsScreen() {
  const {user,isLoading}=useSession();
  const [preferences,setPreferences]=useState<NotificationPreferences|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useFocusEffect(useCallback(()=>{let active=true;setPreferences(null);setMessage('');void loadNotificationPreferences().then(p=>{if(active)setPreferences(p);}).catch(e=>{if(active)setMessage(e.message);});return ()=>{active=false;};},[user?.id]));
  if(!isLoading && !user) return <Redirect href="/auth" />;
  const save=async()=>{
    if(!preferences || busy)return;
    setBusy(true);
    try {await saveNotificationPreferences({...preferences,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});setMessage('Notification preferences saved.');}
    catch(e){setMessage(e instanceof Error?e.message:'Could not save preferences.');}
    finally{setBusy(false);}
  };
  const toggle=(key:'messages'|'replies'|'likes_follows'|'club_reminders'|'previews',label:string,detail:string)=>preferences ? <View key={key} style={styles.toggleRow}><View style={styles.toggleCopy}><Text style={styles.toggleTitle}>{label}</Text><Text style={styles.detail}>{detail}</Text></View><InkToggle disabled={busy} trackColor={{false:colors.border,true:colors.accentSolid}} thumbColor={colors.primary} accessibilityLabel={label} value={preferences[key]} onValueChange={value=>setPreferences({...preferences,[key]:value})} /></View>:null;
  return <Screen><FeatureHeader title="Notifications" motif="bell" />
    <View style={styles.device}><PaperSurface variant="ticket" color={colors.accentSoft} ink={colors.accentSolid} /><InkAction disabled={busy} onPress={()=>{setBusy(true);void registerDevice(true).then(()=>setMessage('Notifications enabled on this device.')).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));}} label="Enable device alerts" /></View>
    {message ? <FeatureNotice>{message}</FeatureNotice>:null}
    {!preferences ? !message && <SkeletonRows />:<>
      <SectionHeader title="Notification types" />
      {toggle('messages','Direct messages','New private messages.')}{toggle('replies','Replies to you','Replies to your posts and comments.')}{toggle('likes_follows','Likes & followers','Likes on your posts and new followers.')}{toggle('club_reminders','Club reminders','For the conversations you RSVP to.')}
      <SectionHeader title="Privacy" />
      {toggle('previews','Lock-screen previews','Show message text in your notifications.')}
      <View style={styles.quiet}><PaperSurface variant="note" color={colors.cobaltSoft} ink={colors.cobalt} /><View style={styles.quietTop}><View style={styles.toggleCopy}><Text style={styles.quietTitle}>Quiet hours</Text><Text style={styles.detail}>Mute alerts during these hours.</Text></View><InkToggle disabled={busy} trackColor={{false:colors.border,true:colors.cobalt}} thumbColor={colors.primary} accessibilityLabel="Quiet hours" value={preferences.quiet_start!==null} onValueChange={enabled=>setPreferences({...preferences,quiet_start:enabled?22:null,quiet_end:enabled?8:null})} /></View>
      {preferences.quiet_start!==null ? <View style={styles.timeRow}>{(['quiet_start','quiet_end'] as const).map(key=><View key={key} style={styles.timeField}><Text style={styles.timeLabel}>{key==='quiet_start'?'FROM · 24H':'UNTIL · 24H'}</Text><View style={styles.timeValue}><TextInput accessibilityLabel={key==='quiet_start'?'Quiet hours start':'Quiet hours end'} keyboardType="number-pad" maxLength={2} value={String(preferences[key])} onChangeText={value=>setPreferences({...preferences,[key]:Number(value)})} style={styles.timeInput} /><Text style={styles.timeSuffix}>:00</Text></View></View>)}</View>:null}
      <Text style={styles.quietNote}>Uses your current timezone. Your messages will still be waiting in your inbox.</Text></View>
      <View style={styles.save}><PrimaryButton disabled={busy} onPress={()=>void save()} label={busy?'Saving…':'Save preferences'} /></View>
    </>}
  </Screen>;
}
const styles=StyleSheet.create({
  device:{paddingHorizontal:20,paddingTop:20,paddingBottom:8,marginBottom:10},
  deviceHeading:{flexDirection:'row',alignItems:'center',gap:10},
  deviceTitle:{fontFamily:fonts.editorial,fontSize:26,color:colors.text,flex:1},
  deviceCopy:{color:colors.textMuted,fontSize:12,lineHeight:19,marginVertical:10},
  toggleRow:{flexDirection:'row',alignItems:'center',gap:16,paddingVertical:17,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  toggleCopy:{flex:1},toggleTitle:{color:colors.text,fontFamily:fonts.display,fontSize:23,letterSpacing:0.3},
  detail:{color:colors.textMuted,fontSize:12,lineHeight:18,marginTop:5},
  quiet:{padding:20,marginTop:22},quietTop:{flexDirection:'row',alignItems:'center',gap:12},
  quietTitle:{color:colors.text,fontFamily:fonts.italic,fontSize:25,lineHeight:28},
  timeRow:{flexDirection:'row',gap:14,marginTop:20},timeField:{flex:1},
  timeLabel:{color:colors.cobalt,fontSize:9,letterSpacing:1},
  timeValue:{flexDirection:'row',alignItems:'center',marginTop:8,borderBottomWidth:1,borderBottomColor:colors.cobalt},
  timeInput:{color:colors.text,fontFamily:fonts.display,fontSize:36,minWidth:48,minHeight:52,padding:4},
  timeSuffix:{color:colors.textMuted,fontFamily:fonts.display,fontSize:30},
  quietNote:{color:colors.textMuted,fontSize:11,lineHeight:18,marginTop:14},save:{marginTop:24},
});
