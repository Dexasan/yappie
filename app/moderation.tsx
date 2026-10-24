import { useCallback,useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert,StyleSheet,View } from 'react-native';
import { Text } from '@/components/Typography';
import { EmptyState,Screen } from '@/components/ui';
import { PaperSurface } from '@/components/InkArtwork';
import { FeatureHeader,FeatureNotice,InkAction } from '@/components/EngagementUI';
import { listModerationReports,reviewModerationReport } from '@/features/safety/moderation';
import { colors,fonts } from '@/theme/tokens';
import { useSession } from '@/context/SessionContext';
export default function ModerationScreen(){
  const {user}=useSession();
  const [reports,setReports]=useState<Awaited<ReturnType<typeof listModerationReports>>>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{try{setReports(await listModerationReports());setError('');}catch(e){setReports([]);setError(e instanceof Error?e.message:'Could not load reports.');}},[]);
  useFocusEffect(useCallback(()=>{let active=true;setReports([]);setError('');if(user)void listModerationReports().then(data=>{if(active)setReports(data);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[user?.id]));
  const review=async(id:string,resolution:'reviewing'|'resolved'|'dismissed',remove=false)=>{if(busy)return;setBusy(true);try{await reviewModerationReport(id,resolution,remove);await refresh();}catch(e){setError(e instanceof Error?e.message:'Review failed.');}finally{setBusy(false);}};
  return <Screen><FeatureHeader title="Report review" motif="shield" tone={colors.signal}/>{error?<FeatureNotice error>{error}</FeatureNotice>:null}
    {!error&&!reports.length?<EmptyState title="No reports" description="Reports for your review will appear here." glyph="✓"/>:null}
    {reports.map(r=><View key={r.report_id} style={styles.report}><PaperSurface variant="note" color={colors.surfaceSoft}/><Text style={styles.status}>{r.target_kind.toUpperCase()} · {r.status.toUpperCase()}</Text><Text style={styles.title}>{r.category.replaceAll('_',' ')}</Text><Text style={styles.details}>{r.details}</Text>{r.content_preview?<Text style={styles.preview}>{r.content_preview}</Text>:null}
      {(['reviewing','resolved','dismissed'] as const).map(status=><InkAction key={status} disabled={busy} onPress={()=>void review(r.report_id,status)} label={`Mark ${status}`}/>)}
      {['post','reply','message'].includes(r.target_kind)?<InkAction disabled={busy} danger onPress={()=>Alert.alert('Remove reported content?','This hides the content and records your moderation action.',[{text:'Cancel',style:'cancel'},{text:'Remove and resolve',style:'destructive',onPress:()=>void review(r.report_id,'resolved',true)}])} label="Remove & resolve"/>:null}
    </View>)}
  </Screen>;
}
const styles=StyleSheet.create({
  report:{padding:20,marginVertical:12},status:{color:colors.signal,fontSize:10,letterSpacing:1},title:{color:colors.text,fontFamily:fonts.editorial,fontSize:31,marginTop:12,textTransform:'capitalize'},details:{color:colors.textMuted,fontSize:12,lineHeight:19,marginTop:8},preview:{color:colors.text,fontFamily:fonts.italic,fontSize:23,lineHeight:29,marginVertical:16},
});
