# Yappie engagement audit

Date: 2026-10-10. Scope: current local source, migrations, and product documentation. This is a code audit, not a test of the deployed database, installed builds, user retention, or market demand. Priorities below are product judgments to validate with a beta cohort.

Implementation update: the user kept matching as the first-session experience and requested automatic relevance from interest/language signals rather than extra onboarding selections. See `docs/ENGAGEMENT_IMPLEMENTATION.md` for completed work, validation, and deployment requirements. Findings below describe the pre-implementation audit.

## Main finding

Yappie has the components of a useful social loop: meet someone, follow, post, reply, message, and join a live club. The weakest connections are discovering relevant people, noticing their response, and returning to the right conversation. More features alone will not establish demand or make it a leading app.

## Prioritized gaps

| Priority | Finding in current source | User impact | Proposed outcome |
| --- | --- | --- | --- |
| P0 | No push library, token registration, delivery worker, or notification settings found in the app/backend source. | Replies and DMs cannot bring someone back through OS notifications. | Reliable opt-in push for DMs and replies first; grouped likes/follows later. |
| P0 | `activity_events`, event triggers, listing, unread count, and read RPCs already exist in migrations, but no app screen consumes them. | Social feedback exists in the backend design but is invisible to users. | Activity screen with actor, context, unread state, and navigation to the actual item. |
| P0 | Tab layout has no badge configuration. Feed subscription runs only while Discover is focused; its new-post flag is local component state. | New activity elsewhere in the app is easy to miss. | Shared account-scoped unread state, Discover dot, Inbox count, and Activity count. |
| P0 | Post detail takes original body/author from navigation parameters and loads only replies/avatar. Share sends copied text, without a post URL. | Opening a post by ID alone shows fallback original content; sharing cannot reliably recruit someone into that conversation. | Fetch authorized post details by ID; handle unavailable posts; add stable share links and login continuation. |
| P0 | Reports support post/reply/message/room targets in SQL, but feed and post detail have no direct report actions. User reports/blocks and room moderation already exist. | Reporting specific harmful content takes unnecessary effort. | Post/reply menus with report/block, owner delete, and an operational review workflow. |
| P1 | The UI calls the global feed “For you”, while `get_feed` orders public posts by creation time. | The label promises relevance that the current query does not provide. | Start with explicit topic/language interests, followed people, recency, and author diversity; offer hide/not interested. |
| P1 | Onboarding collects identity, age, country, and languages, then goes to Quick Chat. No initial follow/club selection found. Matching continues polling until match, cancel, or error. | New accounts can encounter an empty social graph or wait without another useful next step. | Optional starter people/clubs; after a bounded wait offer broader interests, live rooms, or a discussion without silently changing preferences. |
| P1 | Clubs exposes currently live rooms but no scheduled room/reminder flow was found. Club discovery filters the loaded list locally. | People must happen to arrive together; communities lack a predictable return occasion. | Recurring hosted sessions, RSVP/reminders, shareable invites, and searchable discovery beyond the loaded page. |
| P1 | No funnel analytics or crash-reporting integration found. MVP documentation already calls for push and core analytics. | There is no instrumented way to distinguish weak demand from failed delivery, matching, or audio. | Measure activation, match waits/success, conversation continuation, returns, notification outcomes, and technical failures. |
| P2 | Posts and chat are text-focused; no bookmark/repost/voice-note flow found. Basic text sharing, likes, threaded replies, people search in the message picker, and club search already exist. | Fewer ways to express oneself or save a useful conversation. | Add drafts/bookmarks and evaluate image posts or voice notes after the core return loop works. |

## Red dot and unread behavior

Treat feed discovery, personal activity, and messages as separate signals:

- Discover dot: eligible posts by other people exist after the last successfully acknowledged feed position. Keep separate positions for global and Following. Respect blocks, deleted posts, and club visibility; do not light Following for an unrelated global post.
- Inbox number: unread messages from accessible conversations, consistent with existing conversation read state.
- Activity number: unread visible social events. The existing unread-count RPC counts all unread events, whereas the listing excludes blocked actors. Align those filters before exposing the count to avoid an unexplained badge.
- A feed dot is a cue that new items exist, not a claim that every older post was read. Acknowledge the newest batch when it is successfully shown at the top. Do not clear on a failed fetch or merely touching the tab.
- While the user is reading older posts, show a “New posts” button without replacing their current position. Acknowledge only the batch actually loaded; a post arriving during refresh must remain discoverable.
- Restore account-scoped state after restart, clear it on account changes, reconcile on foreground/reconnect, and use server queries to recover events missed by realtime.
- Suppress one's own posts and duplicate alerts. Expose an accessible label describing the badge.

Suggested architecture: a shared activity provider above the tabs; authorized badge-summary queries; per-user/per-feed cursors; realtime invalidation plus reconciliation. Do not keep a feed listener active only inside the feed screen or load an entire inbox solely to render a tab count.

## Push delivery scope

Reuse social activity events for the in-app center. DMs need their own delivery events because they are not part of `activity_events`. Create a durable server delivery queue with idempotency, retries, device-token ownership/lifecycle, and receipt handling. Check recipient preferences and current authorization before dispatch. Unregister or reassign device tokens safely on logout/account changes.

Start with DMs and direct replies. Let users choose likes/follows and club reminders. Group noisy events, support mute/quiet hours, avoid duplicate alerts for the conversation currently being read, and provide a lock-screen preview preference. A generic new public post should normally update Discover rather than push everyone.

Expo requires notification libraries/configuration, permissions, a push token, platform credentials, and a native build. Android uses FCM; iOS requires APNs credentials. A successful provider handoff is not proof that a person saw the message. Invalid tokens must be retired based on delivery responses/receipts.

Incoming calls are a separate project: current availability and incoming-call listeners require the app to be active. Adding standard social push does not establish reliable background ringing or native call integration.

## Implementation sequence and acceptance

1. **Complete the in-app feedback loop.** Post lookup by ID, Activity screen, shared unread state, Discover dot, Inbox badge, and matching badge/list visibility rules. Verify with two accounts: B replies to A; A sees activity from another tab; tapping opens the correct post; reading updates the correct badge. Verify new eligible posts across tab changes, restart, failed refresh, blocking, and account switches.
2. **Add push and content safety alongside it.** Implement the delivery queue and preferences, specific content reporting, owner deletion, and establish who reviews reports. Test push on installed Android and iOS builds with foreground/background/cold start, denied permission, token expiry, duplicate events, logout, and deleted/blocked targets.
3. **Improve activation and relevance.** Starter follows/clubs, explicit interests, a useful matching fallback, simple relevance ranking, and hosted club sessions. Preserve a predictable Following feed.
4. **Expand expression and growth based on evidence.** Shareable public previews/invites, bookmarks/drafts, then image posts or voice notes if beta behavior supports them. Rich media also needs upload limits, moderation, and deletion behavior.

Add minimal measurement during step 1, before trying to optimize recommendations. Define an activation event such as a reciprocal conversation or a reply received, then measure next-day and seven-day return among those users. Also track match time/success, follow-to-DM continuation, reply latency, push opens, opt-outs, reports/blocks, and audio failure rate. Do not optimize session length alone.

## Product hypothesis to validate

The strongest candidate identity is “meet people through shared interests, then keep the conversation going.” Test it with a small, coherent community and scheduled hosts so there are actually people to meet. User density, conversation quality, differentiation, and acquisition are business hypotheses; the repository cannot establish them. Prioritize meaningful responses and repeat participation before adding a broad entertainment feature set.

## Evidence

- `app/(tabs)/_layout.tsx`: tab configuration without badges.
- `app/(tabs)/feed.tsx`, `src/features/feed/api.ts`: focus-scoped new-post subscription, text composer/share, manual pagination, no persistent feed cursor.
- `supabase/migrations/202608210016_activity_center.sql`: social event creation/list/read/unread APIs.
- `supabase/migrations/202609110037_threaded_replies_and_message_picker.sql`: reply events also target parent-reply authors and exclude blocked recipients.
- `app/(tabs)/messages.tsx`, `src/features/messages/api.ts`: existing conversation unread badges/filter/read API and focus-scoped inbox refresh.
- `app/post/[postId].tsx`: original post depends on route parameters; replies load on initial effect and own submission, with no realtime reply listener.
- `supabase/migrations/202608210013_complete_basic_clubs.sql`, `202608210015_following_feed.sql`: chronological global/Following queries.
- `app/onboarding.tsx`, `app/(tabs)/quick-chat.tsx`, `app/(tabs)/clubs.tsx`: initial setup, matching loop, and community discovery.
- `src/context/CallContext.tsx`: foreground availability and incoming-call handling.
- `supabase/migrations/202608180001_identity_and_safety.sql`: report targets and review statuses.
- `src/components/ui.tsx`: shared screen uses ScrollView; feed maps all loaded posts. Consider a virtualized list before long-feed scale, and measure on devices before claiming performance problems.
- `package.json`, `app.json`, `supabase/functions/`, `docs/MVP.md`: no push/analytics implementation found; both are listed in intended MVP scope.

Current implementation references: [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Expo delivery and receipts](https://docs.expo.dev/push-notifications/sending-notifications/), [Expo notification handling](https://docs.expo.dev/push-notifications/receiving-notifications/).

No application behavior was changed during this audit. Existing local edits were preserved. No live-device, deployment, performance, or retention results are claimed.
