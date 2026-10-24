import { InkDrawing } from '@/components/InkArtwork';
import { Text } from '@/components/Typography';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Eyebrow, Heading, Muted, Screen } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

type LegalDocument = 'terms' | 'privacy' | 'community-guidelines';

const documents: Record<LegalDocument, {
  eyebrow: string;
  title: string;
  summary: string;
  sections: Array<{ heading: string; body: string }>;
}> = {
  terms: {
    eyebrow: 'The agreement',
    title: 'Terms of Use',
    summary: 'Plain-language rules for using YAPPIE during its beta period.',
    sections: [
      { heading: 'Who can use the app', body: 'You must be at least 18 years old, provide accurate account information, and be legally able to accept these terms. One person should control each account.' },
      { heading: 'Your conduct', body: 'You may meet strangers, publish posts, join clubs, and message people. You may not harass, exploit, threaten, impersonate, spam, or use the service for illegal activity. The Community Guidelines are part of these terms.' },
      { heading: 'Your content', body: 'You keep ownership of content you create. You give the service permission to store, process, display, and distribute it only as needed to operate and improve the app. You are responsible for what you publish.' },
      { heading: 'Gift preview', body: 'Paid gifting, earnings, and withdrawals are not available in the free beta. Gift artwork and catalogue entries are illustrative previews only: they cannot be purchased, sent, redeemed, or exchanged for money. If paid gifting launches later, updated terms and final storefront pricing will be shown before the first purchase.' },
      { heading: 'Future paid features', body: 'Previewing a planned gift does not create a balance, payout right, Premium entitlement, or promise that the feature will launch. Any future purchase and payout program will require separate eligibility rules, verification, supported-country checks, and your acceptance of the terms that apply at that time.' },
      { heading: 'Moderation and access', body: 'We may remove content, restrict features, suspend accounts, or preserve evidence when needed for safety, legal compliance, or service integrity. You can report users, posts, messages, and rooms from inside the app.' },
      { heading: 'Beta availability', body: 'The app is provided during an early beta and may change, experience downtime, or lose experimental data. Do not rely on it for emergencies or essential communications.' },
    ],
  },
  privacy: {
    eyebrow: 'Your information',
    title: 'Privacy Notice',
    summary: 'What the beta collects, why it is needed, and what other people can see.',
    sections: [
      { heading: 'Account data', body: 'We process your email address, authentication records, age-eligibility date, and security information to create and protect your account. Your email and birth date are not shown publicly.' },
      { heading: 'Public profile and content', body: 'Your display name, username, country code, languages, bio, posts, replies, follower relationships, club activity, and received gifts can be visible to other authenticated users.' },
      { heading: 'Conversations and live rooms', body: 'Messages and room participation are processed to deliver the features, enforce blocks, investigate reports, and maintain service reliability. Live audio is transmitted through the configured realtime provider and is not designed as a recording feature.' },
      { heading: 'Safety records', body: 'Blocks, reports, moderation actions, and limited technical logs may be retained to prevent abuse and investigate incidents. Blocking hides interactions between the affected accounts.' },
      { heading: 'Discovery and notifications', body: 'We use your matching interests, profile languages, follows, club topics, and likes to order Discover posts. Your matching interests are kept privately. If you enable notifications, we store a device delivery token and your alert preferences. Lock-screen message previews are off by default. You can change these choices in Notification settings.' },
      { heading: 'Usage measurement and drafts', body: 'We record limited events such as app visits, successful matches, posts, replies, and technical failures to understand whether the app works. These events do not contain message bodies or typed content and are kept for up to 90 days. Unsent drafts are stored on your device separately for each account.' },
      { heading: 'Payments and payouts', body: 'The free beta does not collect gift-payment, payout, tax, or bank-account information because purchases and withdrawals are disabled. If those features are activated later, this notice will be updated before that data is collected.' },
      { heading: 'Service providers', body: 'The beta relies on infrastructure providers including Supabase for authentication and data services, Expo for application delivery, and Cloudflare for live audio. They process data to provide their services under their own security obligations.' },
      { heading: 'Your choices', body: 'You can edit profile details, control who may start a direct message, block accounts, change your password, and permanently delete your account inside the app. Formal privacy-request contact details must be added before a public store launch.' },
    ],
  },
  'community-guidelines': {
    eyebrow: 'Keep it human',
    title: 'Community Guidelines',
    summary: 'The minimum standard for conversations between people who may have nothing else in common.',
    sections: [
      { heading: 'Respect consent and boundaries', body: 'If someone asks to stop, changes the subject, leaves, or blocks you, respect that immediately. Do not pressure people for personal details, sexual content, money, or contact outside the app.' },
      { heading: 'No harassment or hate', body: 'Targeted abuse, threats, stalking, humiliation, hateful conduct, and coordinated harassment are not allowed in posts, messages, clubs, profiles, or live rooms.' },
      { heading: 'Protect minors', body: 'The app is for adults only. Any sexualization, grooming, exploitation, or suspected endangerment of a minor is prohibited and may be escalated to the appropriate authorities.' },
      { heading: 'No harmful or deceptive activity', body: 'Do not promote violence, self-harm, scams, malware, impersonation, spam, non-consensual intimate content, or illegal goods and services.' },
      { heading: 'Be a responsible host', body: 'Club owners, moderators, and room hosts should set expectations, remove disruptive speakers, respond to safety concerns, and avoid using their role to intimidate participants.' },
      { heading: 'Report; do not retaliate', body: 'Use the in-app report and block controls when something feels unsafe. Do not organize retaliation or publish private information about the person you reported.' },
    ],
  },
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function LegalScreen() {
  const params = useLocalSearchParams<{ document: string }>();
  const requested = first(params.document);
  const selected: LegalDocument = requested === 'privacy' || requested === 'community-guidelines' ? requested : 'terms';
  const document = documents[selected];

  return (
    <Screen>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backGlyph}>‹</Text><Text style={styles.backLabel}>Back</Text>
      </Pressable>
      <View style={styles.hero}><InkDrawing motif="book" size={86} color={colors.cobalt} />
        <Eyebrow>{document.eyebrow}</Eyebrow>
        <Heading compact>{document.title}</Heading>
        <Muted>{document.summary}</Muted>
        <Text style={styles.updated}>Beta revision · 5 September 2026</Text>
      </View>

      <View style={styles.tabs}>
        {([
          ['terms', 'Terms'],
          ['privacy', 'Privacy'],
          ['community-guidelines', 'Guidelines'],
        ] as const).map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: selected === key }}
            onPress={() => router.replace({ pathname: '/legal/[document]', params: { document: key } })}
            style={[styles.tab, selected === key && styles.tabSelected]}
          >
            <Text style={[styles.tabLabel, selected === key && styles.tabLabelSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sections}>
        {document.sections.map((section, index) => (
          <Card key={section.heading} style={styles.sectionCard}>
            <View style={styles.sectionNumber}><Text style={styles.sectionNumberText}>{index + 1}</Text></View>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          </Card>
        ))}
      </View>
      <Text style={styles.footer}>These beta policies will be reviewed and expanded before public store distribution.</Text>
      <Pressable accessibilityRole="link" onPress={() => router.push('/legal/artwork')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}><Text style={{ color: colors.link, fontSize: 13 }}>Artwork credits & licenses</Text></Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, paddingVertical: spacing.sm },
  backGlyph: { color: colors.text, fontSize: 28, lineHeight: 28 },
  backLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  hero: { gap: spacing.sm, marginTop: spacing.xl },
  updated: { color: colors.textSubtle, fontSize: 12, fontWeight: '800', marginTop: spacing.xs, textTransform: 'uppercase' },
  tabs: { backgroundColor: colors.surfaceSoft, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', marginTop: spacing.xl, padding: 4 },
  tab: { alignItems: 'center', borderRadius: radius.pill, flex: 1, paddingVertical: 10 },
  tabSelected: { backgroundColor: colors.surfaceRaised },
  tabLabel: { color: colors.textSubtle, fontSize: 13, fontWeight: '800' },
  tabLabelSelected: { color: colors.text },
  sections: { gap: spacing.md, marginTop: spacing.xl },
  sectionCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  sectionNumber: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 30, justifyContent: 'center', width: 30 },
  sectionNumberText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  sectionCopy: { flex: 1, gap: spacing.sm },
  sectionHeading: { color: colors.text, fontFamily: fonts.editorial, fontSize: 25, lineHeight: 29 },
  sectionBody: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  footer: { color: colors.textSubtle, fontSize: 12, lineHeight: 18, marginTop: spacing.xl, textAlign: 'center' },
});
