import { Text, TextInput } from '@/components/Typography';
import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GiftPicker } from '@/components/GiftPicker';
import { GiftArtwork } from '@/components/GiftArtwork';
import { Avatar, Muted } from '@/components/ui';
import { useSession } from '@/context/SessionContext';
import { giftCheckoutEnabled } from '@/features/gifts/api';
import {
  blockProfile,
  heartbeatQuickChat,
  leaveQuickChat,
  loadConversationMessages,
  loadPublicProfile,
  reportProfile,
  sendConversationMessage,
  subscribeToConversationMessages,
  type Message,
  type PublicProfile,
} from '@/features/quick-chat/api';
import { colors, radius, spacing } from '@/theme/tokens';
import { followProfile, getOrCreateDirectConversation } from '@/features/social/api';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function containsWord(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

export default function QuickChatConversationScreen() {
  const params = useLocalSearchParams<{ sessionId: string; conversationId: string; partnerId: string; topic?: string }>();
  const sessionId = first(params.sessionId);
  const conversationId = first(params.conversationId);
  const partnerId = first(params.partnerId);
  const topic = first(params.topic);
  const { user } = useSession();
  const checkoutEnabled = giftCheckoutEnabled();
  const [messages, setMessages] = useState<Message[]>([]);
  const [partner, setPartner] = useState<PublicProfile | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [giftPickerVisible, setGiftPickerVisible] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [kept, setKept] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<Message>>(null);

  const addMessage = (message: Message) => {
    setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
  };

  useEffect(() => {
    if (!conversationId || !partnerId) return;
    let active = true;

    void Promise.all([loadConversationMessages(conversationId), loadPublicProfile(partnerId)])
      .then(([nextMessages, nextPartner]) => {
        if (!active) return;
        setMessages(nextMessages);
        setPartner(nextPartner);
      })
      .catch((nextError: unknown) => {
        if (active) setError(nextError instanceof Error ? nextError.message : 'Could not open this conversation.');
      });

    const unsubscribe = subscribeToConversationMessages(conversationId, addMessage);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [conversationId, partnerId]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const heartbeat = async () => {
      try {
        const connected = await heartbeatQuickChat(sessionId);
        if (active && !connected) {
          setError('This match ended because someone went offline.');
          router.replace('/(tabs)/quick-chat');
        }
      } catch (nextError) {
        if (active) setError(nextError instanceof Error ? nextError.message : 'Could not keep this match connected.');
      }
    };
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sessionId]);

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !conversationId || !user || sending) return;
    setSending(true);
    setError('');
    setDraft('');

    try {
      const message = await sendConversationMessage(conversationId, user.id, body);
      addMessage(message);
    } catch (nextError) {
      setDraft(body);
      setError(nextError instanceof Error ? nextError.message : 'Message failed to send.');
    } finally {
      setSending(false);
    }
  };

  const endChat = async (reason: 'left' | 'skip' | 'blocked' | 'reported') => {
    if (sessionId) await leaveQuickChat(sessionId, reason);
    router.replace('/(tabs)/quick-chat');
  };

  const keepInTouch = async () => {
    if (!user || !partnerId || keeping || kept) return;
    setKeeping(true);
    setError('');
    try {
      await Promise.all([
        followProfile(user.id, partnerId),
        getOrCreateDirectConversation(partnerId),
      ]);
      setKept(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not save this connection.');
    } finally {
      setKeeping(false);
    }
  };

  const confirmBlock = () => {
    if (!user || !partnerId) return;
    Alert.alert('Block this person?', 'You will not be matched or messaged by this account again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => void blockProfile(user.id, partnerId).then(() => endChat('blocked')).catch((nextError: unknown) => {
          setError(nextError instanceof Error ? nextError.message : 'Could not block this account.');
        }),
      },
    ]);
  };

  const confirmReport = () => {
    if (!user || !partnerId) return;
    Alert.alert('Report this conversation?', 'The moderation queue will receive the account and conversation context.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => void reportProfile(user.id, partnerId, `Reported from Quick Chat session ${sessionId ?? 'unknown'}`)
          .then(() => endChat('reported'))
          .catch((nextError: unknown) => {
            setError(nextError instanceof Error ? nextError.message : 'Could not submit the report.');
          }),
      },
    ]);
  };

  const partnerName = partner?.display_name || (partner?.handle ? `@${partner.handle}` : 'Quick Chat');
  const canSkip = messages.some((message) => containsWord(message.body));

  const showOptions = () => {
    Alert.alert('Conversation options', undefined, [
      { text: 'Report', onPress: confirmReport },
      { text: 'Block', style: 'destructive', onPress: confirmBlock },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Leave conversation" onPress={() => void endChat('left')} style={styles.headerAction}>
            <Text style={styles.headerActionText}>‹</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Open ${partnerName}'s profile`}
            accessibilityRole="button"
            disabled={!partnerId}
            onPress={() => partnerId && router.push({ pathname: '/people/[userId]', params: { userId: partnerId } })}
            style={styles.profileLink}
          >
            <Avatar label={partnerName} path={partner?.avatar_path} size={42} />
            <View style={styles.headerIdentity}>
              <Text style={styles.partnerName}>{partnerName}</Text>
              <Muted>{topic ? `Matched on ${topic}` : 'Connected now'}</Muted>
            </View>
          </Pressable>
          {canSkip ? (
            <Pressable accessibilityLabel="Skip to another match" accessibilityRole="button" onPress={() => void endChat('skip')} style={styles.skipButton}>
              <Text style={styles.skipLabel}>Skip</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityLabel="Conversation options" accessibilityRole="button" onPress={showOptions} style={styles.moreButton}>
            <Text style={styles.moreLabel}>•••</Text>
          </Pressable>
        </View>

        {canSkip ? (
          <View style={styles.keepRow}>
            <Text style={styles.keepCopy}>Keep this chat?</Text>
            <Pressable accessibilityRole="button" disabled={keeping || kept} onPress={() => void keepInTouch()} style={[styles.keepButton, kept && styles.keepButtonDone]}>
              <Text style={styles.keepButtonText}>{kept ? 'Saved ✓' : keeping ? 'Saving…' : 'Follow + save'}</Text>
            </Pressable>
          </View>
        ) : null}

        <FlatList
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.messages}
          data={messages}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>{topic ? `You both picked ${topic}. Send a message.` : 'Send a message.'}</Text>}
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
          <Pressable
            accessibilityRole="button"
            disabled={!draft.trim() || sending}
            onPress={() => void send()}
            style={({ pressed }) => [styles.sendButton, pressed && styles.sendPressed, (!draft.trim() || sending) && styles.sendDisabled]}
          >
            <Text style={styles.sendLabel}>↑</Text>
          </Pressable>
        </View>
        {sessionId && partnerId ? (
          <GiftPicker
            contextId={sessionId}
            contextKind="quick_chat"
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
  container: { flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 14 },
  headerAction: { alignItems: 'center', height: 48, justifyContent: 'center', width: 40 },
  headerActionText: { color: colors.text, fontSize: 36, fontWeight: '300', lineHeight: 38 },
  headerIdentity: { flex: 1 },
  profileLink: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
  partnerName: { color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },
  skipButton: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 13 },
  skipLabel: { color: colors.accent, fontSize: 13, fontWeight: '900' },
  moreButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  moreLabel: { color: colors.textMuted, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  keepRow: { alignItems: 'center', backgroundColor: colors.cobaltSoft, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  keepCopy: { color: colors.textMuted, flex: 1, fontSize: 12, lineHeight: 18 },
  keepButton: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 12 },
  keepButtonDone: { backgroundColor: colors.successSoft },
  keepButtonText: { color: colors.text, fontSize: 12, fontWeight: '700' },
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
  sendPressed: { backgroundColor: colors.primaryPressed, transform: [{ scale: 0.96 }] },
  sendDisabled: { opacity: 0.4 },
  sendLabel: { color: colors.primaryInk, fontSize: 24, fontWeight: '800' },
});
