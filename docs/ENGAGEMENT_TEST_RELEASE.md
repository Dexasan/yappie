# Engagement test release — 2026-10-12

- App: Yappie **0.1.6 (11)**, Android package `com.socialdiscovery.app`.
- Profile: EAS `preview`, internal distribution, standalone APK.
- [Build / install page](https://expo.dev/accounts/dexasan/projects/social-discovery/builds/06e7acdf-d8ab-414d-835f-65cbe232e690).
- [Download APK](https://expo.dev/artifacts/eas/J09xVdnLYoLD6nN1EG07fCAZ7JsF1aLx7g4AxY1fg5E.apk). EAS records artifact expiry as 2026-10-26; use the build page if the direct link expires.
- Local copy: `dist/yappie-0.1.6-11.apk` (160,074,061 bytes).
- SHA-256: `479612352C1A49C4C1A11CA9048F59ED46183A3C233153A813BB3AAA1F4B502E`.
- Backend: linked Supabase project, migrations 039–046 applied; remote migration check is up to date.
- Worker: `deliver-notifications` deployed; authenticated invocation returned 200 and unauthenticated invocation returned 401.
- Scheduler: `yappie-deliver-notifications` active every minute, using a Vault-held bearer secret; observed HTTP responses were 200 without timeout.

Matching stays the first experience. Test ranked Discover, new-post badges, Activity, Inbox counts, bookmarks, hide/report/block/delete controls, drafts, scheduled club conversations, RSVPs, and server-side club search. Use two accounts to test new posts and messages; keep one app on another tab to see unread indicators before opening the content.

The APK uploads the working directory, including the uncommitted engagement implementation. EAS's recorded Git commit is the prior checkout commit and does not identify all files in this release archive. No Git commit or push was performed by this deployment.

## Push limitation

Android phone push delivery is blocked on Firebase configuration. There is no Firebase project, `google-services.json`, or FCM V1 credential configured. The worker and queue are deployed, but this APK does not provide working Android push registration. [Firebase setup](ANDROID_PUSH_SETUP.md) and a subsequent native rebuild are required. In-app activity and unread badges can be tested now.

Browser automation ended because the computer-use tool could not reliably determine the current browser URL. No browser workaround was attempted.

## Validation

TypeScript, isolated migration/behavior tests, the existing image-parser dependency check, and live authenticated integration checks passed. Live tests covered feed and DM acknowledgements, saved/hidden content, Activity, notification preferences, scheduling/RSVP, search, analytics, and ownership/moderator/worker access checks. Temporary test accounts, posts, clubs, and conversations were removed. These checks do not replace phone interaction and audio testing.

The completed APK downloaded successfully; all 1,406 ZIP entries passed CRC checks. Its manifest contains the expected package and version. Its APK v2 certificate SHA-256 fingerprint matches the existing EAS Android signing key (`2B0017777286059EF0F5D4A130B1C3F8A185ACA00AE05E7F1AD65145E1777549`). Certificate matching and archive checks do not prove runtime behavior on a phone.
