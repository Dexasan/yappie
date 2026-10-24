# YAPPIE — Talk to Strangers

Android and iOS private-beta app for meeting people through authenticated Quick Chat, public posts, persistent DMs, and live interest-based Clubs.

Yappie uses its approved talking-mouth logo and shared charcoal, chalk, and vermilion visual system.

## Development

Requirements: Node.js and pnpm.

```powershell
pnpm install
pnpm typecheck
pnpm android
# On macOS with Xcode:
pnpm ios
```

The app uses the linked Supabase project for authentication, onboarding, profiles, safety, matching, messages, posts, and Club room state. Copy `.env.example` to `.env` for a new development environment.

## Current milestone

- Android/iOS Expo foundation with shared feature and design code
- Five-tab navigation
- Local onboarding and profile state
- Interactive Quick Chat queue preview
- Feed, Clubs, DMs, and safety-center preview screens
- Supabase client boundary and first RLS-protected identity/safety migration
- Live project link and generated TypeScript database types
- Transactional Quick Chat matching and realtime conversations
- Live feed, replies, likes, follows, and persistent DMs
- Live Clubs discovery, membership, room-stage state, hand raises, and moderation
- Android/iOS WebRTC audio client and an authenticated, role-aware Cloudflare Realtime gateway

The Clubs room state is production-backed. Realtime audio activates after a Cloudflare Realtime SFU application is configured with the `CLOUDFLARE_REALTIME_APP_ID` and `CLOUDFLARE_REALTIME_APP_SECRET` Edge Function secrets and the public client feature flag is enabled.

See `docs/MVP.md` and `docs/ARCHITECTURE.md` for the product and technical decisions.

## iOS builds

The `preview` EAS profile creates an internally distributed build for a registered physical iPhone. The `preview-simulator` profile creates an unsigned simulator build. Both use the same app code, backend, bundled fonts, artwork, deep-link scheme, image picker, secure authentication storage, and WebRTC audio features as Android.

```powershell
pnpm dlx eas-cli build --platform ios --profile preview
# or, for the iOS Simulator
pnpm dlx eas-cli build --platform ios --profile preview-simulator
```

A physical-device build requires Apple Developer credentials and an iPhone registered in the provisioning profile. App Store/TestFlight distribution uses the `production` profile and requires App Store Connect setup. See the [latest iOS build record](docs/IOS_PREVIEW.md).
