# iOS Simulator build: 0.1.5 (10)

Built on September 12, 2026 from the `preview-simulator` EAS profile.

- [Download the iOS Simulator artifact](https://expo.dev/artifacts/eas/IPacAQmnQd1QuKLjShr0TT5xAde3LMkPOKmBGpK-KuQ.tar.gz)
- [Open the permanent Expo build record](https://expo.dev/accounts/dexasan/projects/social-discovery/builds/51d3c04c-6db6-4081-8ce0-6c7e1b9b2826)
- Bundle identifier: `com.socialdiscovery.app`
- App version: `0.1.5`
- Build number: `10`
- Artifact size: `39,690,390` bytes

The direct artifact link is temporary and is scheduled to expire on September 26, 2026. The Expo build record remains available after that date.

## Install in the iOS Simulator

1. Download and extract the `.tar.gz` artifact on a Mac with Xcode installed.
2. Start an iPhone in Xcode's Simulator app.
3. Drag the extracted YAPPIE `.app` onto the running simulator, or run `xcrun simctl install booted /path/to/YAPPIE.app`.

This artifact is compiled for the iOS Simulator and cannot be installed on a physical iPhone. A physical-device build requires an Apple Developer distribution certificate and an iPhone registered in an ad hoc provisioning profile. Once those credentials are configured in EAS, run `pnpm build:ios:preview` to produce the signed installable build.

## Verification

- TypeScript passed.
- The dependency supply-chain check passed.
- Expo dependency compatibility passed after aligning SDK 57 patch releases.
- The production iOS Hermes bundle exported locally with all 31 bundled assets.
- EAS completed CocoaPods resolution, Xcode native compilation, linking, and artifact packaging successfully.
