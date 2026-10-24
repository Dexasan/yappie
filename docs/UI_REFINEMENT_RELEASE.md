# Yappie UI refinement — 2026-10-12

Released: **0.1.7 (12)**, Android preview APK. Matching remains the first tab.

- [Download APK](https://expo.dev/artifacts/eas/lCGeAdq7BbTfG6e0c8R8v1SgZrjptLH5XItDwMBYaak.apk).
- [Build / install page](https://expo.dev/accounts/dexasan/projects/social-discovery/builds/bebcd476-132f-4858-879f-9cd53ab1488a).
- Local copy: `dist/yappie-0.1.7-12.apk`, 160,086,165 bytes. EAS records artifact expiry as 2026-10-26.
- SHA-256: `C00B1F72532B2798A9477E48542C55407A22D059473C7EDAEA41219CA96209AF`.
- The uploaded workspace includes the local engagement/UI changes; EAS's prior Git commit metadata does not identify every uploaded file. No Git commit or push was performed.

## Navigation

- Yap's profile shortcut is removed. The header uses an original ink bell, tilted paper control, condensed Activity label, and unread badge.
- Discover uses the compact bell variant to fit narrow headers.
- Me's gear opens Settings. Notification preferences are inside Settings, below its introduction.
- Saved posts sit beside Safety and Guidelines in the existing illustrated utility area. The extra plain links above the profile are removed.

## Consistent feature UI

Activity, saved posts, notification preferences, quiet hours, content/report menus, scheduled club conversations, scheduling forms, and moderation use the existing charcoal/chalk/vermilion palette, bundled fonts, paper surfaces, and original SVG artwork. New bell, bookmark, and calendar illustrations extend the established ink system. Switches share the app palette on Android, iOS, and web and expose checked/disabled state to assistive technology.

`AGENTS.md` records these design conventions for subsequent feature work. No backend change was required for this refinement; the prior engagement deployment stays in use. Phone push delivery still requires the Firebase setup documented in `ANDROID_PUSH_SETUP.md`.

## Checks

- `pnpm typecheck` passed.
- The iOS Metro/Hermes export passed. This checks shared-code bundling, not an installed iPhone build.
- The Android native build completed. The downloaded APK's 1,406 archive entries passed CRC checks; package/version strings and updated UI text were found in the manifest/bundle. The APK v2 certificate fingerprint matches the existing EAS signing key (`2B0017777286059EF0F5D4A130B1C3F8A185ACA00AE05E7F1AD65145E1777549`). These checks do not replace phone runtime testing.
- Local fixture interaction checks passed for Yap's Activity navigation and removed profile shortcut, Activity read markers, Saved navigation from Me, notification preferences in Settings, quiet hours, content/report menus, club sessions, and the scheduling form.
- Screenshots were inspected at 390px and 320px widths. The narrow notification heading and Discover action spacing were corrected before the release submission.
- Previews use fixture data and do not prove phone rendering or live push delivery. Phone acceptance remains required.

Local screenshots: `dist/engagement-style/`.
