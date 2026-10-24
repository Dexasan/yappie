# Android push delivery setup

The social backend and scheduled delivery worker are deployed. EAS has an Android signing key but no FCM V1 service account. No Firebase project was available on 2026-10-12. Build 0.1.6 (11) can test the engagement UI and live backend; Android push delivery remains unavailable in this build.

1. In [Firebase Console](https://console.firebase.google.com/), create a project for Yappie. Google Analytics is optional; push setup does not require enabling it or upgrading to a paid billing plan.
2. Register an Android app with package `com.socialdiscovery.app`. Download its `google-services.json` into the local workspace. This client configuration is distinct from the private service-account key.
3. Set `expo.android.googleServicesFile` in `app.json` to that file's path. Make sure the file is included in the EAS build archive. For a hosted file environment variable, use a dynamic Expo config to read the EAS-provided path instead.
4. Enable the Firebase Cloud Messaging API V1 and create an appropriate service-account JSON key following the [Expo FCM credential instructions](https://docs.expo.dev/push-notifications/fcm-credentials/). Store the key outside the repository and never paste its private contents into chat or commit it.
5. Run `pnpm dlx eas-cli credentials --platform android`, choose `preview`, and assign the service-account key for **FCM V1**. The service account must belong to the same Firebase project as `google-services.json`.
6. Increment the native build number and build a new Android preview APK. Install it on two phones, enable notifications in Yappie settings, background the recipient app, and send a DM from the other account. Then test replies, quiet hours, logout, and notification taps. Foreground badges and the Activity screen can be tested without FCM.

Browser automation was stopped during this release because it could not reliably determine the current browser URL. Firebase creation and key provisioning were not attempted afterward.
