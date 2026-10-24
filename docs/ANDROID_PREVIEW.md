# Android preview: 0.1.8 (13)

The combined batch was built successfully as an EAS `preview` APK on 2026-10-24.
This version includes the approved talking-mouth logo, matching-first copy,
Activity and unread UI, personalized discovery, saved posts, and Settings
placement changes. Resend sender and email template changes are configured on
the backend and do not depend on the APK.

TypeScript, the image-parser dependency check, engagement migration/behavior
tests, Android Metro/Hermes export, and 320px/390px fixture layout checks passed.
Physical-device behavior and email delivery have not been tested in this batch.
Android push remains blocked on Firebase setup; in-app unread indicators and
Activity are included.

- [Build / install page](https://expo.dev/accounts/dexasan/projects/social-discovery/builds/7372a7a6-5150-46e2-8ef6-1e766901fea2)
- [Download APK](https://expo.dev/artifacts/eas/FCyUuRTnYhMvJFAhJl2I_ktrPe2_ET7zNc-2yUG5KH4.apk)
- Package: `com.socialdiscovery.app`; version `0.1.8`; Android build `13`.
- Source: `6832f4599222f967bd4b2ef1f22d554306e018ba`, from a clean checkout
  pushed to `origin/fix/live-audio-lifecycle` before the build was submitted.
- Local artifact: `dist/yappie-0.1.8-13.apk`.
- Size: **161,572,589 bytes**.
- SHA-256: `0D4008E6CC70A250B206AF952FB33FDA3C411C823CF63A24B638698069A9943E`.
- All **1,406 ZIP entries** passed CRC integrity checks. The compiled manifest
  reports the package/version/build above and does not request camera access.
- APK v2 signing-certificate SHA-256:
  `2B0017777286059EF0F5D4A130B1C3F8A185ACA00AE05E7F1AD65145E1777549`,
  matching the previous Android preview signing certificate.
- EAS records artifact expiry as **2026-11-07**. The build page remains the
  build record if the direct artifact link expires.

The build uses the existing EAS Android keystore, the preview backend environment,
and embedded JavaScript/assets. No Metro server is needed; OTA updates remain
disabled. Physical-phone installation, audio, and real email delivery still need
device testing. Email sender/template branding is live; verification links still
use the underlying Supabase authentication domain.

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
