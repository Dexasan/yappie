import { Text, TextInput } from '@/components/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GiftPicker } from '@/components/GiftPicker';
import { GiftArtwork } from '@/components/GiftArtwork';
import { Avatar, Muted } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { giftCheckoutEnabled } from '@/features/gifts/api';
import { acknowledgeConversation, loadConversationPartner } from '@/features/messages/api';
import {
  blockProfile,
  loadConversationMessages,
  reportProfile,
  sendConversationMessage,
  subscribeToConversationMessages,
  type Message,
} from '@/features/quick-chat/api';
import { colors, spacing } from '@/theme/tokens';
import { useDraft } from '@/lib/use-draft';
import { useActivity } from '@/context/ActivityContext';
import { trackEvent } from '@/features/analytics/api';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function DirectConversationScreen() {
  const params = useLocalSearchParams<{ conversationId: string; partnerId: string; partnerName: string }>();
  const conversationId = first(params.conversationId);
  const [partner,setPartner]=useState<Awaited<ReturnType<typeof loadConversationPartner>>|null>(null);
  const partnerId=partner?.user_id;
  const partnerName=partner?.display_name ?? partner?.handle ?? 'Connection';
  const { user, isLoading } = useSession();
  const { refresh: refreshBadges } = useActivity();
  const checkoutEnabled = giftCheckoutEnabled();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useDraft(user?.id, `message:${conversationId}`);
  const [sending, setSending] = useState(false);
  const [giftPickerVisible, setGiftPickerVisible] = useState(false);
  const [error, setError] = useState('');
  const [partnerAvatarPath, setPartnerAvatarPath] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const focused=useRef(false);
  const [appActive,setAppActive]=useState(AppState.currentState==='active');
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>setAppActive(state==='active'));return ()=>subscription.remove();},[]);

  const addMessage = (message: Message) => {
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
  };

  useFocusEffect(useCallback(() => {
    if (!conversationId || !user || !appActive) return;
    focused.current=true;
    let active = true;
    setMessages([]);
    setPartner(null);
    setPartnerAvatarPath(null);
    setError('');
    void Promise.all([loadConversationMessages(conversationId),loadConversationPartner(conversationId)])
      .then(([data,nextPartner]) => {
        if (!active) return;
        setMessages(current=>[...data,...current.filter(item=>!data.some(old=>old.id===item.id))].sort((a,b)=>a.created_at.localeCompare(b.created_at)));
        setPartner(nextPartner);
        setPartnerAvatarPath(nextPartner.avatar_path);
      })
      .catch((nextError: unknown) => { if (active) setError(nextError instanceof Error ? nextError.message : 'Could not load messages.'); });
    const unsubscribe = subscribeToConversationMessages(conversationId, (message) => {
      if (!active) return;
      addMessage(message);
    });
    return () => {
      active = false;
      focused.current=false;
      unsubscribe();
    };
  }, [conversationId, user?.id, appActive]));

  useEffect(()=>{
    const newest=messages.at(-1);
    if(conversationId && newest && focused.current && appActive) void acknowledgeConversation(conversationId,newest.created_at).then(refreshBadges).catch(()=>{});
  },[conversationId,messages,appActive,refreshBadges]);

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  if (!isLoading && !user) return <Redirect href={{pathname:'/auth',params:{returnTo:`/messages/${conversationId}`}}} />;

  const send = async () => {
    const body = draft.trim();
    if (!conversationId || !user || !body || sending) return;
    setSending(true);
    setDraft('');
    setError('');
    try {
      addMessage(await sendConversationMessage(conversationId, user.id, body));
      trackEvent('dm_sent','messages');
    } catch (nextError) {
      setDraft(body);
      setError(nextError instanceof Error ? nextError.message : 'Message failed to send.');
    } finally {
      setSending(false);
    }
  };

  const confirmBlock = () => {
    if (!user || !partnerId) return;
    Alert.alert('Block this person?', 'They will disappear from your inbox and cannot contact you again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => void blockProfile(user.id, partnerId)
          .then(() => router.replace('/(tabs)/messages'))
          .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : 'Could not block this account.')),
      },
    ]);
  };

  const confirmReport = () => {
    if (!user || !partnerId) return;
    Alert.alert('Report this account?', 'A moderation report will be created for review.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => void reportProfile(user.id, partnerId, `Reported from direct conversation ${conversationId ?? 'unknown'}`)
          .then(() => router.replace('/(tabs)/messages'))
          .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : 'Could not submit this report.')),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoider}>
        <View style={styles.header}>
        <Pressable accessibilityLabel="Back to messages" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Open ${partnerName}'s profile`}
          accessibilityRole="button"
          disabled={!partnerId}
          onPress={() => partnerId && router.push({ pathname: '/people/[userId]', params: { userId: partnerId } })}
          style={styles.profileLink}
        >
          <Avatar label={partnerName} path={partnerAvatarPath} size={42} />
          <View style={styles.identity}>
            <Text style={styles.name}>{partnerName}</Text>
            <Muted>View profile</Muted>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={confirmReport} style={styles.action}><Text style={styles.report}>Report</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={confirmBlock} style={styles.action}><Text style={styles.block}>Block</Text></Pressable>
        </View>

        <FlatList
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.messages}
          data={messages}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>This is the beginning of your conversation.</Text>}
          ref={listRef}
          renderItem={({ item }) => {
            const own = item.sender_id === user?.id;
            return (
              <View style={[styles.bubble, own ? styles.ownBubble : styles.theirBubble]}>
                <Text style={[styles.messageText, own && styles.ownMessageText]}>{item.body}</Text>
              </View>
            );
          }}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.composer}>
        <Pressable accessibilityLabel={checkoutEnabled ? 'Send a gift' : 'Preview future gifts'} accessibilityRole="button" onPress={() => setGiftPickerVisible(true)} style={styles.giftButton}>
          <GiftArtwork size={38} slug="gift_vault" />
          {!checkoutEnabled ? <Text style={styles.giftLabBadge}>LAB</Text> : null}
        </Pressable>
        <TextInput
          accessibilityLabel="Message"
          maxLength={2000}
          multiline
          onChangeText={setDraft}
          placeholder="Write a message…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={draft}
        />
        <Pressable accessibilityLabel="Send message" accessibilityRole="button" disabled={!draft.trim() || sending} onPress={() => void send()} style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]}>
          <Text style={styles.sendLabel}>↑</Text>
        </Pressable>
        </View>
        {conversationId && partnerId ? (
          <GiftPicker
            contextId={conversationId}
            contextKind="direct_message"
            onClose={() => setGiftPickerVisible(false)}
            recipientId={partnerId}
            recipientName={partnerName}
            visible={giftPickerVisible}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboardAvoider: { flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 14 },
  backButton: { alignItems: 'center', height: 48, justifyContent: 'center', width: 40 },
  backText: { color: colors.text, fontSize: 36, fontWeight: '300' },
  identity: { flex: 1 },
  profileLink: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
  name: { color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },
  action: { paddingHorizontal: 5, paddingVertical: spacing.sm },
  report: { color: colors.warning, fontSize: 14, fontWeight: '800' },
  block: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  messages: { flexGrow: 1, gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.lg },
  empty: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.xl, textAlign: 'center' },
  bubble: { borderRadius: 14, maxWidth: '82%', paddingHorizontal: 18, paddingVertical: 13 },
  ownBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 2 },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 2 },
  messageText: { color: colors.text, fontSize: 16, lineHeight: 24 },
  ownMessageText: { color: colors.primaryInk },
  error: { color: colors.danger, fontSize: 12, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, textAlign: 'center' },
  composer: { alignItems: 'flex-end', backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, padding: 12 },
  giftButton: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 8, height: 48, justifyContent: 'center', width: 44 },
  giftLabBadge: { backgroundColor: colors.warningSoft, borderColor: colors.borderStrong, borderRadius: 5, borderWidth: 1, color: colors.warning, fontSize: 6, fontWeight: '900', letterSpacing: 0.5, paddingHorizontal: 4, paddingVertical: 2, position: 'absolute', right: -3, top: -5 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.text, flex: 1, fontSize: 15, maxHeight: 132, minHeight: 48, paddingHorizontal: 16, paddingVertical: 12 },
  sendButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 8, height: 48, justifyContent: 'center', width: 48 },
  sendDisabled: { opacity: 0.4 },
  sendLabel: { color: colors.primaryInk, fontSize: 24, fontWeight: '800' },
});
