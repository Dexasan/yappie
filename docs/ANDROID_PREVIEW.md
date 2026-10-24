# Android preview: 0.1.8 (13)

The combined batch is committed and is being prepared as an EAS `preview` APK.
This version includes the approved talking-mouth logo, matching-first copy,
Activity and unread UI, personalized discovery, saved posts, and Settings
placement changes. Resend sender and email template changes are configured on
the backend and do not depend on the APK.

TypeScript, the image-parser dependency check, engagement migration/behavior
tests, Android Metro/Hermes export, and 320px/390px fixture layout checks passed.
Physical-device behavior and email delivery have not been tested in this batch.
Android push remains blocked on Firebase setup; in-app unread indicators and
Activity are included.

Build/download details will be added after EAS produces the artifact.

## Previous Android test build: 0.1.7

See the [UI refinement release](UI_REFINEMENT_RELEASE.md) for the current APK and corrected navigation/design. The [engagement test release](ENGAGEMENT_TEST_RELEASE.md) records the backend deployment and Firebase push limitation.

## Previous Android test build: 0.1.5

- Version: **0.1.5 (10)**
- Package: `com.socialdiscovery.app`
- Source: `379c71a9124197f27a46e5492307898fd2dfb563`
- Profile: EAS `preview`, internal distribution, standalone release APK
- [Install with Expo](https://expo.dev/accounts/dexasan/projects/social-discovery/builds/84ad6711-347c-4405-9262-ad180ff5ba65)
- [Download the APK](https://expo.dev/artifacts/eas/5GLY46_JOa4KXvBnvc4gey8MHO3BXo9r1uc94i0eEfk.apk)
- SHA-256: `292B23176FA654D4C81E02D973A64D41C3CBA1B1D5733CFA1AA17224E688CDD8`

This build adds threaded comment replies, a restricted message recipient picker, safer chat-to-profile navigation, the illustrated Yappie launch screen, and individual artwork for Yap topics. Voice calls now retry delayed Cloudflare tracks, wait for actual inbound audio packets before showing Connected, recover missed Realtime events, and route Android audio through the earpiece or speaker with a speaker toggle.

Clubs now use user-supplied photographic covers throughout the list, creation flow, and detail screen instead of generic symbols. A Club creator must choose its cover and is the only account allowed to replace it. The backend validates the original `created_by` user before accepting an upload; moderator membership alone does not grant cover access.

The APK uses the configured preview backend and existing Android signing credentials. No Metro development server is needed. Over-the-air updates are disabled, so this APK identifies one fixed build. The direct artifact link is temporary and is scheduled to expire on **September 26, 2026**; the Expo build page remains the build record.

## Device testing

Install the APK and confirm **0.1.5 · build 10** in Account settings. Test a real voice call between two phones with microphone permission enabled, then switch between the earpiece and speaker. Also check replying to a post comment, starting a message from the filtered recipient picker, opening a chat partner's profile and returning to Message, and creating a Club with a cover image. Real phone microphone and speaker behavior still requires this physical two-device test even though the live Cloudflare transport test received audio packets end to end.

TypeScript, the dependency supply-chain check, topic artwork coverage, call lifecycle tests, live reply and picker database checks, the creator-only Club cover security smoke test, and the production Android bundle export passed before submission. The downloaded APK contains 1,337 readable archive entries and reports the expected package, version, and build number. Its v2 signing-certificate SHA-256 fingerprint matches build 9 exactly.
