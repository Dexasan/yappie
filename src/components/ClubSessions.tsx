import { useCallback, useState } from 'react';
import { router,useFocusEffect } from 'expo-router';
import { Share, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Text,TextInput } from '@/components/Typography';
import { useSession } from '@/context/SessionContext';
import { cancelClubSession,listClubSessions,rsvpClubSession,scheduleClubSession,startScheduledSession } from '@/features/clubs/sessions';
import { colors, fonts } from '@/theme/tokens';
import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { FeatureNotice, InkAction, InkToggle } from '@/components/EngagementUI';
import { PrimaryButton } from '@/components/ui';

export function ClubSessions({clubId,canHost,isMember}:{clubId:string;canHost:boolean;isMember:boolean}) {
  const {user}=useSession();
  const [sessions,setSessions]=useState<Awaited<ReturnType<typeof listClubSessions>>>([]);
  const [title,setTitle]=useState('');const [time,setTime]=useState('');const [weekly,setWeekly]=useState(false);const [form,setForm]=useState(false);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>setSessions(await listClubSessions(clubId)),[clubId]);
  useFocusEffect(useCallback(()=>{let active=true;void listClubSessions(clubId).then(data=>{if(active)setSessions(data);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[clubId]));
  const act=async(task:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);try{await task();await refresh();setError('');}catch(e){setError(e instanceof Error?e.message:'Could not update session.');}finally{setBusy(false);}};
  return <View style={styles.section}>
    <View style={styles.heading}><View style={{flex:1}}><Text style={styles.headingTitle}>Scheduled sessions</Text></View><InkDrawing motif="calendar" size={48} color={colors.warning}/></View>
    {!sessions.length ? <Text style={styles.empty}>No sessions scheduled.</Text>:null}
    {error?<FeatureNotice error>{error}</FeatureNotice>:null}
    {sessions.map(s=><View key={s.session_id} style={styles.session}><PaperSurface variant="ticket" color={colors.warningSoft} ink={colors.warning}/><Text style={styles.sessionDate}>{new Date(s.starts_at).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'}).toUpperCase()} · {new Date(s.starts_at).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</Text><Text style={styles.sessionTitle}>{s.title}</Text>{s.weekly?<Text style={styles.recurring}>Repeats weekly</Text>:null}
      {isMember?<InkAction disabled={busy} onPress={()=>void act(()=>rsvpClubSession(s.session_id,!s.is_attending))} label={s.is_attending?'Cancel reminders':s.weekly?'RSVP · weekly reminders':'RSVP · remind me'}/>:<Text style={styles.empty}>Join this club to RSVP.</Text>}
      {s.host_id===user?.id?<><InkAction disabled={busy} onPress={()=>void act(async()=>{const roomId=await startScheduledSession(s.session_id);router.push({pathname:'/clubs/room/[roomId]',params:{roomId}});})} label="Start session"/><InkAction disabled={busy} danger onPress={()=>void act(()=>cancelClubSession(s.session_id))} label="Cancel session"/></>:null}
    </View>)}
    <InkAction onPress={()=>void Share.share({message:`Join our conversations on YAPPIE: ${Linking.createURL(`/clubs/${clubId}`)}`}).catch(e=>setError(e.message))} label="Share club invitation"/>
    {canHost?<InkAction onPress={()=>setForm(!form)} label={form?'Close scheduling':'Schedule a conversation'}/>:null}
    {form?<View style={styles.form}><PaperSurface variant="note" color={colors.surfaceSoft}/><Text style={styles.formTitle}>Schedule a session</Text><Text style={styles.fieldLabel}>THE CONVERSATION</Text><TextInput accessibilityLabel="Scheduled session title" placeholder="What will you talk about?" placeholderTextColor={colors.textSubtle} maxLength={120} value={title} onChangeText={setTitle} style={styles.input}/><Text style={styles.fieldLabel}>WHEN · YOUR LOCAL TIME</Text><TextInput accessibilityLabel="Session start, local date and time" placeholder="2026-10-15T19:30" placeholderTextColor={colors.textSubtle} value={time} onChangeText={setTime} style={styles.input}/><Text style={styles.hint}>YYYY-MM-DDTHH:MM</Text><View style={styles.weekly}><Text style={styles.repeat}>Repeat weekly</Text><InkToggle accessibilityLabel="Repeat session weekly" trackColor={{false:colors.border,true:colors.accentSolid}} thumbColor={colors.primary} value={weekly} onValueChange={setWeekly}/></View><PrimaryButton disabled={busy} onPress={()=>void act(async()=>{if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)||Number.isNaN(new Date(time).getTime()))throw new Error('Enter a valid local date and time.');await scheduleClubSession(clubId,title,new Date(time).toISOString(),weekly);setForm(false);setTitle('');setTime('');})} label={busy?'Scheduling…':'Schedule session'}/></View>:null}
  </View>;
}
const styles=StyleSheet.create({
  section:{marginVertical:22,gap:10},heading:{flexDirection:'row',alignItems:'center',gap:12},kicker:{color:colors.warning,fontSize:9,letterSpacing:1.4},
  headingTitle:{color:colors.text,fontFamily:fonts.editorial,fontSize:34,marginTop:4},empty:{color:colors.textMuted,fontFamily:fonts.italic,fontSize:20,lineHeight:25},
  session:{paddingHorizontal:20,paddingTop:24,paddingBottom:12,marginTop:8},sessionDate:{color:colors.warning,fontSize:10,letterSpacing:0.8,lineHeight:18},
  sessionTitle:{color:colors.text,fontFamily:fonts.editorial,fontSize:28,lineHeight:33,marginTop:10},recurring:{color:colors.textMuted,fontFamily:fonts.italic,fontSize:18,marginTop:8},
  form:{padding:20,gap:12},formTitle:{color:colors.text,fontFamily:fonts.italic,fontSize:29},fieldLabel:{color:colors.textSubtle,fontSize:9,letterSpacing:1,marginTop:8},
  input:{color:colors.text,backgroundColor:colors.backgroundRaised,borderBottomWidth:1,borderBottomColor:colors.borderStrong,minHeight:50,paddingHorizontal:12,fontSize:14},
  hint:{color:colors.textSubtle,fontSize:11},weekly:{flexDirection:'row',alignItems:'center',gap:10,marginVertical:8},repeat:{color:colors.text,fontFamily:fonts.editorial,fontSize:22,flex:1},
});
