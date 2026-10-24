import { useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { FeatureNotice } from '@/components/EngagementUI';
import * as Linking from 'expo-linking';
import { Text } from '@/components/Typography';
import { useSession } from '@/context/SessionContext';
import { useActivity } from '@/context/ActivityContext';
import { deleteContent, reportContent, setPostPreference } from '@/features/feed/preferences';
import { blockProfile } from '@/features/quick-chat/api';
import { colors, fonts } from '@/theme/tokens';

export function ContentMenu({ kind = 'post', id, authorId, onChanged }: { kind?: 'post' | 'reply'; id: string; authorId: string; onChanged: () => void }) {
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const { refresh } = useActivity();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirming, setConfirming] = useState<'delete' | 'block' | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const action = async (task: () => Promise<unknown>, success: string, changed = false) => {
    if (busy) return;
    setBusy(true);
    try { await task(); setMessage(success); if (changed) onChanged(); void refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not complete this action.'); }
    finally { setBusy(false); setReporting(false); setConfirming(null); }
  };
  const button = (label: string, onPress: () => void) => <Pressable key={label} disabled={busy} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[styles.action,pressed&&{opacity:0.6}]}><Text style={[styles.actionLabel, /^(Delete|Block|Report)/.test(label)&&{color:colors.danger}]}>{label}</Text><Text style={styles.arrow}>↗</Text></Pressable>;
  return <>
    <Pressable accessibilityLabel={`${kind} options`} accessibilityRole="button" onPress={() => { setOpen(true); setMessage(''); setReporting(false); setConfirming(null); }} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.textMuted, fontSize: 22 }}>···</Text></Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}><View style={styles.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Dismiss conversation options" onPress={()=>setOpen(false)} style={StyleSheet.absoluteFill}/><View accessibilityViewIsModal style={[styles.sheet,{paddingBottom:Math.max(insets.bottom,20)}]}>
      <PaperSurface variant="note" color={colors.surface} ink={colors.borderStrong}/><View style={styles.handle}/>
      <View style={styles.heading}><View style={{flex:1}}><Text style={styles.title}>{reporting ? 'Report reason' : confirming ? `Confirm ${confirming}` : kind === 'reply' ? 'Reply options' : 'Post options'}</Text></View><InkDrawing motif={reporting||confirming?'shield':'bookmark'} size={48} color={colors.accent}/></View>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {message ? <FeatureNotice>{message}</FeatureNotice> : null}
      {confirming ? <>{button(confirming === 'delete' ? `Delete ${kind}` : 'Block this account', () => void action(() => confirming === 'delete' ? deleteContent(kind, id) : blockProfile(user!.id, authorId), confirming === 'delete' ? 'Deleted.' : 'Account blocked.', true))}{button('Go back',()=>setConfirming(null))}</> : reporting ? <>{Object.entries({spam:'Spam',harassment:'Harassment',hate:'Hate or discrimination',sexual:'Sexual content',violence:'Violence',minor_safety:'Minor safety',impersonation:'Impersonation',other:'Something else'}).map(([category,label]) => button(label, () => void action(() => reportContent(kind,id,authorId,category), 'Report submitted for review.')))}{button('Go back',()=>setReporting(false))}</> : <>
        {kind === 'post' ? <>{button('Save post', () => void action(() => setPostPreference(id,'saved',true), 'Saved to your bookmarks.'))}{button('Remove bookmark', () => void action(() => setPostPreference(id,'saved',false), 'Bookmark removed.'))}{button('Share link', () => void action(() => Share.share({ message: Linking.createURL(`/post/${id}`) }), 'Share menu opened.'))}{authorId !== user?.id ? button('Not interested · hide post', () => void action(() => setPostPreference(id,'hidden',true), 'Hidden from For you.', true)) : null}</> : null}
        {authorId === user?.id ? button(`Delete ${kind}`, () => setConfirming('delete')) : <>{button(`Report ${kind}`, () => setReporting(true))}{button('Block author', () => setConfirming('block'))}</>}
      </>}
      {button('Close', () => setOpen(false))}
      </ScrollView>
    </View></View></Modal>
  </>;
}
const styles=StyleSheet.create({
  overlay:{flex:1,backgroundColor:colors.scrim,justifyContent:'flex-end'},
  sheet:{height:'82%',maxHeight:'88%',paddingHorizontal:26,paddingTop:14,backgroundColor:colors.surface},
  handle:{height:3,width:36,backgroundColor:colors.borderStrong,borderRadius:2,alignSelf:'center',marginBottom:20},
  heading:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:16},
  kicker:{color:colors.accent,fontSize:9,letterSpacing:1.5,marginBottom:6},
  title:{color:colors.text,fontFamily:fonts.editorial,fontSize:35,lineHeight:40},
  action:{minHeight:52,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border,paddingVertical:12},
  actionLabel:{color:colors.text,fontFamily:fonts.medium,fontSize:14,flex:1},
  arrow:{color:colors.textSubtle,fontSize:20},
});
