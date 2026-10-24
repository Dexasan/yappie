# Pre-launch security status

Last verified: 5 September 2026

## Implemented and deployed

- Raw gift transactions are visible only to sender and recipient.
- Block and conversation helper RPCs cannot be used for unrelated-user enumeration.
- Presence queries enforce blocks.
- Quick Chat sessions have participant heartbeats and a 30-second stale timeout.
- Posts, replies, messages, reports, follows, blocks, likes, matching, calls, gifts, Clubs, and audio operations have server-side per-account limits.
- Password changes require reauthentication and revoke other sessions.
- Auth callbacks are exact-match PKCE callbacks; raw token callbacks are rejected.
- Mobile sessions migrate from AsyncStorage to chunked Expo SecureStore storage.
- Account deletion verifies the password in an Edge Function and removes avatar objects before deleting the account.
- Avatar uploads are JPEG-only, size- and dimension-validated by an Edge Function. Direct Storage uploads are denied.
- Unsigned OTA updates are disabled.
- Sensitive Android overlay and camera permissions are blocked, and Android backup is disabled.
- Vulnerable transitive URI and XML parsers are pinned to patched releases.
- The transitive `uuid` advisory is removed. `image-size` zero-length ICNS, JXL, and HEIF/ISO-BMFF loops are locally patched because the fixed release identified by the registry is not published yet; malicious zero-length fixtures are covered by the verification procedure.

## External launch-owner actions

These require account credentials, paid-plan choices, or real organization details and must not be fabricated in source:

1. Add the real privacy/support email, legal controller name, and postal contact to the Privacy Notice and store listing.
2. Enable CAPTCHA in Supabase after creating a Turnstile or hCaptcha site/secret and adding the corresponding mobile challenge flow.
3. Require MFA for the Expo/EAS, Supabase, Cloudflare, Google Play, source-control, and domain/DNS owner accounts.
4. Keep OTA updates disabled, or generate an offline-held Expo update-signing private key and configure code signing before re-enabling them.
5. Enable Supabase session inactivity/timebox controls if the project moves to Pro; the linked free plan rejects those settings.
6. Enable Google Play App Signing, restrict production deployment roles, and retain recovery codes offline.

## Verification commands

```powershell
pnpm run typecheck
pnpm run security:dependencies
pnpm run security:smoke
pnpm audit --prod --audit-level low
```

The registry audit will continue to identify `image-size@1.2.1` by version even though pnpm applies `patches/image-size@1.2.1.patch`. Remove the local patch and upgrade when a maintained fixed release is available.
