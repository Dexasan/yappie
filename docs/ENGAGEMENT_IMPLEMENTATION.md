# Engagement implementation

## Product decisions

Matching remains the initial tab and first-session experience. Onboarding has no new follow, club, or interest-selection step. Discover automatically combines privately retained matching interests, club topics, topics of liked posts, followed authors, shared profile languages, recency, and author diversity. Following remains chronological. Shared profile languages are a relevance proxy, not automatic detection of each post's language. This is a transparent rules-based first version, not a trained recommender.

## Implemented sequence

1. Activity center for follows, likes, replies, and gifts; shared unread state; accessible Discover red dot and Inbox counts. Feed positions persist on the server separately for global/Following. Failed requests and unfocused/background screens do not acknowledge unread content. Blocks and removed posts use consistent activity visibility rules.
2. Post lookup by ID, live reply updates while the thread is focused, installed-app share links, and validated login continuation. Direct-message links resolve the partner from the server. Conversation loading now starts with the newest 100 messages instead of the oldest 100; read acknowledgements use loaded message timestamps.
3. Post/reply menus with specific report reasons, author blocking, owner deletion, bookmarks, and hide/not-interested for Discover. Club posts also expose the menu. Moderators get a restricted report-review screen with recorded actions and reported-content removal. Moderator membership is assigned only by a server administrator.
4. Opt-in native notification registration, device reassignment/logout handling, category preferences, quiet hours in the device timezone, and previews off by default. A private server queue handles DMs, replies, optional likes/follows, and RSVP reminders. Claiming, retry limits, stale-token retirement, receipts, noisy-social coalescing, and active-conversation suppression are included. The worker authenticates using a dedicated secret.
5. Scheduled club conversations, explicit RSVP, cancellation, start controls, weekly recurrence, and club invitation links. Weekly reminders carry forward only for users who explicitly RSVP and remain active club members. Search now runs on the server with 30-row pagination instead of filtering only the loaded list.
6. Account-scoped local drafts for feed posts, replies, DMs, and club posts; private engagement events for activation/returns, matching waits, messages, replies, notification opens, render failures, and audio failures. Aggregate metrics are server-only. The worker prunes usage events older than 90 days and delivery jobs older than seven days.

## Deployment order

On 2026-10-12, migrations 039–046 and `deliver-notifications` were deployed to the linked project. The worker secret is stored in Edge secrets and Supabase Vault. The `yappie-deliver-notifications` cron runs every minute through `pg_net`; observed HTTP responses were 200. An unauthenticated worker request returned 401. Android FCM credentials are still absent, so native push delivery is not ready. The steps below document the deployment workflow for operators.

1. Apply migrations `202610100039` through `202610100046` with the existing Supabase release workflow. Existing matching and feed RPCs remain available for older installed clients.
2. Set `NOTIFICATION_WORKER_SECRET` in Supabase Edge Function secrets to a new strong random secret. Keep it out of the app and repository. Set `EXPO_ACCESS_TOKEN` too if enhanced push security is enabled for the Expo project.
3. Deploy `deliver-notifications`. Its `verify_jwt = false` configuration is intentional: the endpoint rejects calls without the separate worker bearer secret. No app account can run the queue/receipt RPCs.
4. Configure a server scheduler to POST to `/functions/v1/deliver-notifications` every minute with `Authorization: Bearer <worker secret>`. Store scheduler credentials in the platform's secret store. The worker queues due club reminders, processes receipts, sends due notifications, and performs retention cleanup. Without this scheduler, pushes and automated retention cleanup do not run.
5. Configure FCM credentials for Android and APNs credentials for iOS in the Expo/EAS project, then build new native binaries. `expo-notifications` is a native dependency; updating JavaScript alone is insufficient. iOS push credential provisioning requires the appropriate Apple developer account.
6. Assign the designated reviewer in `private.moderators` through an administrator connection. Example using an actual approved account ID: `insert into private.moderators(user_id) values ('<reviewer UUID>');`. Do not expose this table or a role-grant API to ordinary accounts. Operators can call `public.engagement_metrics()` through a server/admin connection.

Implementation reference: [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Expo receipts and delivery](https://docs.expo.dev/push-notifications/sending-notifications/).

## Validation

- `pnpm typecheck` checks app/API types and the generated routes.
- `node scripts/verify-engagement.cjs` executes the new migrations in an isolated PostgreSQL-compatible PGlite engine with representative base tables. It exercises ranked pagination, feed acknowledgements, blocked visibility, saving/hiding, author ownership, token reassignment, worker privileges, active-conversation suppression, club RSVP/recurrence, private metrics, and moderator authorization. This does not replace a deployment rehearsal against a full Supabase instance.
- `pnpm security:dependencies` checks the existing image-parser patch.
- `node scripts/smoke-engagement-live.cjs` passed against the deployed backend on 2026-10-12: authenticated feed/badge/read cursors, saved/hidden content, Activity, preferences, search, club scheduling/RSVP, direct-message unread/read acknowledgements, analytics, and owner/moderator/worker authorization. Its temporary accounts, posts, club, and conversation were removed.
- `node scripts/configure-notification-worker.cjs` installs/reuses the worker secret through Vault, configures the cron job, and checks authenticated/unauthenticated worker responses. This is an operator-only deployment command, not a client script.
- Android and iOS Metro/Hermes exports succeeded during development. Exports verify bundling, not native push delivery or live audio.
- Local fixture previews rendered Discover, Activity, and notification settings. Activity's mark-shown-read action cleared its displayed unread markers, and toggling quiet hours revealed its time controls. Browser input timed out when checking the feed content menu, so complete visual/interaction QA remains outstanding. Fixtures are not connected to a live backend and the fixture tab bar does not exercise native badges.

## Required device acceptance

Use two real test accounts on installed Android/iOS builds. Verify badges across tabs/restarts/account switches; new posts arriving during refresh; no clear-on-fetch-failure; Following isolation; post/DM links after login; blocked/deleted targets; reply delivery; denied permissions; quiet hours; read suppression; duplicate/retried provider requests; expired tokens; logout/reassignment; RSVP cancellation; and native notification taps from foreground, background, and cold start. Check long feeds and small screens before release.

## Limits and next decisions

- Native share links open installed Yappie. Public web previews, universal/app links, and an install landing destination need a chosen public domain and explicit content-visibility design; authenticated posts have not been silently made public.
- Images/voice notes, reposts, and broader entertainment formats remain the next product phase after validating the return loop, as recommended in the audit. Bookmarks and drafts are implemented now. No user-density, retention, or market-success result is claimed.
- Background/native incoming-call integration is separate from social push and remains unchanged.
- Queue claims prevent simultaneous sends of one job. Delivery is at least once: an ambiguous network timeout after a provider accepted a request can still produce a duplicate. Receipts confirm provider handoff, not device display. Native device acceptance is required before calling push reliable.
- Discover ranking can change as follows/likes/interests change between pages. The fixed time snapshot stabilizes recency, and the client deduplicates IDs; this is not an immutable server-side feed session.
- The first metrics version measures observed activity cohorts within retained data. It is not a complete crash-reporting system, attribution platform, or experiment framework. Query timings and ranking quality need real beta data.
