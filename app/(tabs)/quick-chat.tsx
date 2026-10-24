import { InkDrawing, PaperSurface } from '@/components/InkArtwork';
import { TopicArtwork } from '@/components/TopicArtwork';
import { Text, TextInput } from '@/components/Typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BrandLockup, BrandMark } from '@/components/Brand';
import { Avatar, Screen } from '@/components/ui';
import { useCalls } from '@/context/CallContext';
import { listAvailableCallers, requestDirectCall, type AvailableCaller } from '@/features/calls/api';
import {
  cancelQuickChatSearch,
  joinQuickChat,
  loadQuickChatMatchingCount,
  loadTrendingMatchInterests,
  type TrendingInterest,
} from '@/features/quick-chat/api';
import { matchInterestCatalog } from '@/features/quick-chat/interests';
import { colors, fonts } from '@/theme/tokens';
import { trackEvent } from '@/features/analytics/api';
import { ActivityButton } from '@/components/ActivityButton';

type MatchState = 'idle' | 'searching';

function interestSearchKey(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

const blockedInterestPattern = /(?:^|[^\p{L}\p{N}])(?:rape|rapist|raping|molest(?:ed|er|ers|ing|ation)?|incest(?:uous)?|p(?:ae|e)dophil(?:e|es|ia|ic)|sexual[\s-]+(?:assault|abuse|violence)|child[\s-]+(?:porn|sex|sexual[\s-]+abuse)|underage[\s-]+sex|bestiality|necrophilia)(?=$|[^\p{L}\p{N}])/iu;
const blockedObfuscations = new Set(['rape', 'rapist', 'raping', 'molest', 'molester', 'molestation', 'incest', 'pedophile', 'paedophile', 'pedophilia', 'paedophilia', 'bestiality', 'necrophilia']);

function normalizeTypedInterest(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function interestIsBlocked(value: string) {
  return blockedInterestPattern.test(value) || blockedObfuscations.has(interestSearchKey(value));
}

function readableMatchError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Matching failed. Please try again.';
  if (message.toLowerCase().includes('network')) return 'No connection. Try again.';
  return message;
}

export default function QuickChatScreen() {
  const { isAvailable, isAvailabilityBusy, setAvailable } = useCalls();
  const [matchState, setMatchState] = useState<MatchState>('idle');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [suggestedInterests, setSuggestedInterests] = useState<TrendingInterest[]>([]);
  const [interestInput, setInterestInput] = useState('');
  const [error, setError] = useState('');
  const [matchingCount, setMatchingCount] = useState<number | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const activeSearchRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenerationRef = useRef(0);
  const [availableCallers, setAvailableCallers] = useState<AvailableCaller[]>([]);
  const [callersLoading, setCallersLoading] = useState(true);
  const [callingUserId, setCallingUserId] = useState<string | null>(null);
  const searching = matchState === 'searching';
  const searchStartedAt = useRef(0);
  const suggestionQuery = interestSearchKey(interestInput.trim());
  const suggestionPool = useMemo(() => Array.from(new Map(
    [...suggestedInterests.map((interest) => interest.label), ...matchInterestCatalog]
      .map((label) => [interestSearchKey(label), label]),
  ).values()), [suggestedInterests]);
  const interestSuggestions = suggestionQuery
    ? suggestionPool
      .filter((label) => !selectedInterests.some((selected) => interestSearchKey(selected) === interestSearchKey(label)))
      .filter((label) => interestSearchKey(label).includes(suggestionQuery))
      .sort((left, right) => Number(!interestSearchKey(left).startsWith(suggestionQuery)) - Number(!interestSearchKey(right).startsWith(suggestionQuery)))
      .slice(0, 6)
    : [];
  const typedInterest = normalizeTypedInterest(interestInput);
  const canonicalTypedInterest = suggestionPool.find((label) => interestSearchKey(label) === interestSearchKey(typedInterest));
  const typedInterestChoice = canonicalTypedInterest ?? typedInterest;
  const canAddTypedInterest = typedInterest.length >= 2 && !searching;

  const refreshAvailableCallers = useCallback(async () => {
    try {
      setAvailableCallers(await listAvailableCallers());
    } catch {
      setAvailableCallers([]);
    } finally {
      setCallersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!appIsActive) return;
    void refreshAvailableCallers();
    const interval = setInterval(() => void refreshAvailableCallers(), 10_000);
    return () => clearInterval(interval);
  }, [appIsActive, refreshAvailableCallers]);

  const refreshMatchingCount = useCallback(async () => {
    try {
      setMatchingCount(await loadQuickChatMatchingCount());
    } catch {
      setMatchingCount(null);
    }
  }, []);

  useEffect(() => {
    if (!appIsActive) return;
    void refreshMatchingCount();
    const interval = setInterval(() => void refreshMatchingCount(), 4000);
    return () => clearInterval(interval);
  }, [appIsActive, refreshMatchingCount]);

  useEffect(() => {
    if (!appIsActive) return;
    let active = true;
    const refresh = async () => {
      try {
        const interests = await loadTrendingMatchInterests(20);
        if (active && interests.length) setSuggestedInterests(interests);
      } catch {
        if (active) setSuggestedInterests([]);
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [appIsActive]);

  useEffect(() => {
    const stopActiveSearch = () => {
      if (!activeSearchRef.current) return;
      searchGenerationRef.current += 1;
      activeSearchRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
      void cancelQuickChatSearch().catch(() => undefined);
    };

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
      if (state === 'active' || !activeSearchRef.current) return;
      stopActiveSearch();
      setMatchState('idle');
    });

    return () => {
      stopActiveSearch();
      appStateSubscription.remove();
    };
  }, []);

  const pollForMatch = async (generation: number) => {
    if (!activeSearchRef.current || generation !== searchGenerationRef.current) return;
    try {
      const result = await joinQuickChat(selectedInterests);
      if (!activeSearchRef.current || generation !== searchGenerationRef.current) return;

      if (result.match_status === 'matched' && result.session_id && result.conversation_id && result.matched_profile_id) {
        trackEvent('match_found','matching',Date.now()-searchStartedAt.current);
        activeSearchRef.current = false;
        pollTimerRef.current = null;
        setMatchState('idle');
        router.push({
          pathname: '/quick-chat/[sessionId]',
          params: {
            sessionId: result.session_id,
            conversationId: result.conversation_id,
            partnerId: result.matched_profile_id,
            topic: (result.matched_interests.length ? result.matched_interests : selectedInterests).join(' · '),
          },
        });
        return;
      }
      pollTimerRef.current = setTimeout(() => void pollForMatch(generation), 2500);
    } catch (nextError) {
      if (generation !== searchGenerationRef.current) return;
      activeSearchRef.current = false;
      setMatchState('idle');
      setError(readableMatchError(nextError));
    }
  };

  const beginSearch = () => {
    if (!selectedInterests.length || activeSearchRef.current) return;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const generation = searchGenerationRef.current + 1;
    searchStartedAt.current=Date.now();
    trackEvent('match_started','matching');
    searchGenerationRef.current = generation;
    setError('');
    setMatchState('searching');
    activeSearchRef.current = true;
    void pollForMatch(generation);
  };

  const cancelSearch = async () => {
    trackEvent('match_cancelled','matching',Date.now()-searchStartedAt.current);
    searchGenerationRef.current += 1;
    activeSearchRef.current = false;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
    setMatchState('idle');
    try {
      await cancelQuickChatSearch();
    } catch (nextError) {
      setError(readableMatchError(nextError));
    }
  };

  const addInterest = (label: string) => {
    const nextInterest = normalizeTypedInterest(label);
    if (searching || nextInterest.length < 2) return;
    if (interestIsBlocked(nextInterest)) {
      setError('That interest is not allowed for matching. Choose a safe conversation topic.');
      return;
    }
    if (selectedInterests.some((interest) => interestSearchKey(interest) === interestSearchKey(nextInterest))) {
      setInterestInput('');
      return;
    }
    if (selectedInterests.length >= 5) {
      setError('You can select up to 5 interests.');
      return;
    }
    setSelectedInterests((current) => [...current, nextInterest]);
    setInterestInput('');
    setError('');
  };

  const useTypedInterest = () => {
    if (typedInterestChoice) addInterest(typedInterestChoice);
  };

  const toggleInterest = (label: string) => {
    if (searching) return;
    setError('');
    setSelectedInterests((current) => {
      const selected = current.some((interest) => interestSearchKey(interest) === interestSearchKey(label));
      if (selected) return current.filter((interest) => interestSearchKey(interest) !== interestSearchKey(label));
      if (current.length >= 5) {
        setError('You can select up to 5 interests.');
        return current;
      }
      return [...current, label];
    });
  };

  const callPerson = async (caller: AvailableCaller) => {
    if (callingUserId) return;
    setCallingUserId(caller.user_id);
    setError('');
    try {
      const { ensureDirectCallMicrophonePermission } = await import('@/features/calls/audio');
      if (!(await ensureDirectCallMicrophonePermission())) throw new Error('Allow microphone access to make a call.');
      const callId = await requestDirectCall(caller.user_id);
      setAvailableCallers((current) => current.filter((item) => item.user_id !== caller.user_id));
      router.push(`/calls/${callId}` as never);
    } catch (nextError) {
      setError(readableMatchError(nextError));
      void refreshAvailableCallers();
    } finally {
      setCallingUserId(null);
    }
  };

  const quickPicks = (suggestedInterests.length
    ? suggestedInterests.map((interest) => interest.label)
    : ['Music', 'Gaming', 'Movies', 'Deep conversations', 'Travel', 'Anime'])
    .filter((label) => !interestIsBlocked(label)).slice(0, 6);

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandLockup compact />
        <ActivityButton />
      </View>

      <View style={styles.hero}>
        <PaperSurface variant="note" color={colors.accentSoft} ink={colors.accentSolid} />
        <View style={styles.heroRow}><View style={{flex:1}}><Text style={styles.heroTitle}>Match with strangers</Text></View><View style={styles.heroMark}><BrandMark size={92} /></View></View>
        <Text style={styles.heroCopy}>One-to-one chats based on shared interests.</Text>
      </View>

      <View style={styles.matchCard}><PaperSurface variant="ticket" color={colors.surfaceSoft} ink={colors.borderStrong} />
        <View style={styles.matchHeader}>
          <Text style={styles.cardTitle}>{searching ? 'Finding a match…' : 'Choose interests'}</Text>
          <View style={styles.matchingBadge}>
            <View style={[styles.matchingDot, !matchingCount && styles.matchingDotEmpty]} />
            <Text style={styles.matchingText}>{matchingCount === null ? 'Matching' : matchingCount + ' matching'}</Text>
          </View>
        </View>
        <Text style={styles.cardCopy}>{searching ? 'Looking for someone who shares your interests.' : 'Select 1–5 interests.'}</Text>

        <View style={styles.quickPicks}>
          {quickPicks.map((label, index) => {
            const selected = selectedInterests.some((interest) => interestSearchKey(interest) === interestSearchKey(label));
            return (
              <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected, disabled: searching }} disabled={searching} onPress={() => toggleInterest(label)} style={({ pressed }) => [styles.interestChip, {transform:[{rotate:index % 2 ? '2deg' : '-2deg'}]}, selected && styles.interestChipSelected, pressed && styles.pressed]}>
                <TopicArtwork label={label} size={30} color={selected ? colors.primaryInk : colors.accent} /><Text style={[styles.interestChipText, selected && styles.interestChipTextSelected]}>{label}{selected ? ' ✓' : ''}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.customInterest}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput accessibilityLabel="Search matching interests" autoCapitalize="none" autoCorrect={false} editable={!searching} maxLength={40} onChangeText={setInterestInput} onSubmitEditing={useTypedInterest} placeholder="Search or add an interest" placeholderTextColor={colors.textSubtle} returnKeyType="search" style={styles.interestInput} value={interestInput} />
          {interestInput.trim() ? <Pressable accessibilityLabel="Add interest" accessibilityRole="button" disabled={!canAddTypedInterest} onPress={useTypedInterest} style={[styles.addInterestButton, !canAddTypedInterest && styles.disabled]}><Text style={styles.addInterestText}>+</Text></Pressable> : null}
        </View>
        {interestInput.trim() ? (
          <View style={styles.suggestionList}>
            {interestSuggestions.map((label) => (
              <Pressable key={label} accessibilityRole="button" disabled={searching} onPress={() => addInterest(label)} style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}><TopicArtwork label={label} size={24} /><Text style={styles.suggestionText}>{label}</Text><Text style={styles.suggestionAction}>Add +</Text></Pressable>
            ))}
            {!canonicalTypedInterest && typedInterest.length >= 2 ? <Pressable accessibilityRole="button" disabled={searching} onPress={useTypedInterest} style={styles.suggestionRow}><TopicArtwork label={typedInterest} size={24} /><Text numberOfLines={1} style={styles.suggestionText}>Use “{typedInterest}”</Text><Text style={styles.suggestionAction}>Add +</Text></Pressable> : null}
          </View>
        ) : null}

        {selectedInterests.filter((interest) => !quickPicks.some((pick) => interestSearchKey(pick) === interestSearchKey(interest))).length ? (
          <View style={styles.selectedChips}>
            {selectedInterests.filter((interest) => !quickPicks.some((pick) => interestSearchKey(pick) === interestSearchKey(interest))).map((interest) => (
              <Pressable key={interest} accessibilityRole="button" accessibilityLabel={'Remove ' + interest} disabled={searching} onPress={() => toggleInterest(interest)} style={styles.selectedChip}><TopicArtwork label={interest} size={24} color={colors.primaryInk} /><Text style={styles.selectedChipText}>{interest}  ×</Text></Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.selectionMeta}><Text style={styles.selectionCopy}>{selectedInterests.length ? selectedInterests.length + ' of 5 interests selected' : 'Choose at least one to get started'}</Text><Text style={styles.privateLabel}>1:1 chat</Text></View>
        {searching ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel matching" onPress={() => void cancelSearch()} style={styles.cancelButton}><ActivityIndicator color={colors.accent} size="small" /><Text style={styles.cancelText}>Searching · Tap to cancel</Text></Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Find a match" accessibilityState={{ disabled: !selectedInterests.length }} disabled={!selectedInterests.length} onPress={beginSearch} style={({ pressed }) => [styles.matchButton, !selectedInterests.length && styles.matchButtonDisabled, pressed && styles.pressed]}><Text style={[styles.matchButtonText, !selectedInterests.length && styles.matchButtonTextDisabled]}>FIND A MATCH</Text><Text style={[styles.matchArrow, !selectedInterests.length && styles.matchButtonTextDisabled]}>↗</Text></Pressable>
        )}
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      <View style={styles.callSection}><PaperSurface variant="note" color={colors.cobaltSoft} ink={colors.cobalt} />
        <View style={styles.callHeader}>
          <View style={{ flex: 1 }}><View style={{flexDirection:"row",alignItems:"center",gap:8}}><InkDrawing motif="sound" size={34} color={colors.cobalt} /><Text style={styles.sectionTitle}>Voice calls</Text></View><Text style={styles.sectionMeta}>{isAvailable ? 'Available for incoming calls.' : 'Turn on to receive voice calls.'}</Text></View>
          <Pressable accessibilityLabel="Available for voice calls" accessibilityRole="switch" hitSlop={6} accessibilityState={{ checked: isAvailable, disabled: isAvailabilityBusy }} disabled={isAvailabilityBusy} onPress={() => void setAvailable(!isAvailable)} style={[styles.availabilityToggle, isAvailable && styles.availabilityToggleOn]}><View style={[styles.toggleKnob, isAvailable && styles.toggleKnobOn]} /></Pressable>
        </View>
        {callersLoading ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}
        {!callersLoading && availableCallers.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.callersScroller} contentContainerStyle={styles.callerCards}>
            {availableCallers.map((caller) => {
              const name = caller.display_name || (caller.handle ? '@' + caller.handle : 'Yappie member');
              const isCalling = callingUserId === caller.user_id;
              return <Pressable key={caller.user_id} accessibilityRole="button" accessibilityLabel={'Call ' + name} disabled={Boolean(callingUserId)} onPress={() => void callPerson(caller)} style={({ pressed }) => [styles.callerCard, pressed && styles.pressed]}><View><Avatar label={name} path={caller.avatar_path} size={56} /><View style={styles.callerDot} /></View><Text numberOfLines={1} style={styles.callerName}>{name}</Text><Text style={styles.callAction}>{isCalling ? 'Calling…' : 'Call ↗'}</Text></Pressable>;
            })}
          </ScrollView>
        ) : null}
        {!callersLoading && !availableCallers.length ? <View style={styles.emptyCalls}><InkDrawing motif="sound" size={54} color={colors.accent} /><View style={{ flex: 1 }}><Text style={styles.emptyCallsTitle}>No one available to call</Text><Text style={styles.emptyCallsCopy}>People available for voice calls will appear here.</Text></View></View> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroRow: {flexDirection:'row',alignItems:'center',gap:5},
  heroMark: { marginVertical: -4, transform: [{ rotate: '-9deg' }] },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 6 },
  hero: { marginBottom: 10, marginTop: 6, paddingHorizontal: 23, paddingVertical: 16 },
  heroTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 32, letterSpacing: -0.8, lineHeight: 37 },
  heroCopy: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 6 },
  matchCard: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 20 },
  matchHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontFamily: fonts.editorial, fontSize: 30, lineHeight: 34 },
  cardCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 6 },
  matchingBadge: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  matchingDot: { backgroundColor: colors.success, borderRadius: 4, height: 6, width: 6 },
  matchingDotEmpty: { backgroundColor: colors.textSubtle },
  matchingText: { color: colors.textSubtle, fontSize: 9, fontWeight: '500' },
  quickPicks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '3%', rowGap: 7, marginVertical: 10 },
  interestChip: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 12, justifyContent: 'center', minHeight: 58, paddingHorizontal: 3, width:'31.3%', gap: 1 },
  interestChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  interestChipText: { color: colors.text, fontFamily: fonts.medium, fontSize: 12 },
  interestChipTextSelected: { color: colors.primaryInk, fontSize: 12, fontWeight: '700' },
  customInterest: { alignItems: 'center', borderColor: colors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 2 },
  searchGlyph: { color: colors.textSubtle, fontSize: 25, marginRight: 8 },
  interestInput: { color: colors.text, flex: 1, fontSize: 13, minHeight: 48, paddingVertical: 10 },
  addInterestButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 32 },
  addInterestText: { color: colors.accent, fontSize: 24, fontWeight: '600' },
  suggestionList: { backgroundColor: colors.backgroundRaised, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginTop: 6, overflow: 'hidden' },
  suggestionRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, justifyContent: 'space-between', minHeight: 46, paddingHorizontal: 14 },
  suggestionText: { color: colors.text, flex: 1, fontSize: 14 },
  suggestionAction: { color: colors.cobalt, fontSize: 12, fontWeight: '700' },
  selectedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  selectedChip: { backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: 4, borderWidth: 1, alignItems: 'center', flexDirection: 'row', gap: 6, maxWidth: '100%', minHeight: 44, paddingHorizontal: 10, paddingVertical: 5 },
  selectedChipText: { color: colors.primaryInk, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  selectionMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', marginBottom: 8, marginTop: 8 },
  selectionCopy: { color: colors.textSubtle, fontSize: 11 },
  privateLabel: { color: colors.textSubtle, fontSize: 11 },
  matchButton: { alignItems: 'center', backgroundColor: colors.accentSolid, borderRadius: 40, flexDirection: 'row', justifyContent: 'center', minHeight: 54, paddingHorizontal: 12, transform:[{rotate:'-2deg'}] },
  matchButtonDisabled: { backgroundColor: colors.surfaceRaised },
  matchButtonText: { color: colors.white, fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.5 },
  matchButtonTextDisabled: { color: colors.textSubtle },
  matchArrow: { color: colors.white, fontSize: 24, marginLeft: 10 },
  cancelButton: { alignItems: 'center', backgroundColor: colors.accentSoft, borderColor: colors.accent, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 56 },
  cancelText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  callSection: { marginTop: 12, padding: 20, gap: 4 },
  callHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontFamily: fonts.italic, fontSize: 29, lineHeight:32, flexShrink:1 },
  sectionMeta: { color: colors.textSubtle, fontSize: 12, lineHeight: 18, marginTop: 5 },
  availabilityToggle: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 22, height: 36, justifyContent: 'center', paddingHorizontal: 4, width: 58 },
  availabilityToggleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleKnob: { backgroundColor: colors.textSubtle, borderRadius: 14, height: 26, width: 26 },
  toggleKnobOn: { backgroundColor: colors.black, transform: [{ translateX: 22 }] },
  loading: { height: 96 },
  callersScroller: { marginTop: 16, marginHorizontal: -22 },
  callerCards: { gap: 10, paddingHorizontal: 22 },
  callerCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, padding: 14, width: 110 },
  callerDot: { backgroundColor: colors.success, borderColor: colors.surface, borderRadius: 7, borderWidth: 3, bottom: 0, height: 14, position: 'absolute', right: 0, width: 14 },
  callerName: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 10, maxWidth: '100%' },
  callAction: { color: colors.accent, fontSize: 11, fontWeight: '600', marginTop: 6 },
  emptyCalls: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 6, paddingVertical: 8 },
  emptyCallsTitle: { color: colors.text, fontFamily: fonts.editorial, fontSize: 22 },
  emptyCallsCopy: { color: colors.textSubtle, fontSize: 12, lineHeight: 18, marginTop: 4 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20, marginTop: 14 },
});
