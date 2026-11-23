# Intastellar Analytics — mobile app

Expo (SDK 58) companion app for the Analytics side: Home, Live, Ad Spend.
Everything else opens the web dashboard in an in-app browser.

## Run it

Expo needs Node 18+ (the web build uses the repo's Node 16 — use nvm):

```bash
cd apps/mobile
npm install
npx expo start          # scan the QR code with Expo Go, or press i / a
```

Expo Go is enough to look at the screens, but **sign-in needs a development
build**: Intastellar Accounts redirects to `intastellaranalytics://auth`,
which only a build with that scheme can receive.

```bash
npx expo run:ios        # or run:android — needs Xcode / Android Studio
# or, without local tooling:
npx eas-cli@latest build --profile development --platform ios
```

## Sign-in

> **Needs `@intastellar/signin-sdk-react-native` 1.2.0** (`Entry=reactauth`,
> auth session, launch-URL handling). Until 1.2.0 is on npm, `npm install`
> gives 1.1.1, whose redirect Intastellar Accounts sends to the web flow —
> sign-in then fails. Build the SDK from `intastellar-signin`
> (react-version/packages/react-native) and copy its `dist/` into
> `node_modules/@intastellar/signin-sdk-react-native/dist/`, or wait for the
> release and bump the dependency to `^1.2.0`.

`@intastellar/signin-sdk-react-native` opens Intastellar Accounts in an
in-app browser, which redirects back to `intastellaranalytics://auth?token=…`.

- That redirect URI must be allowed for `CLIENT_ID` (src/lib/config.js) in
  Intastellar Accounts.
- The token is stored in the Keychain / Keystore (expo-secure-store);
  organisation, domain and period in AsyncStorage.

## Shared with the web

Translations (`src/i18n`), the small-sample rule and consent definitions are
imported straight from the repo's `src/` (metro.config.js watches it), so the
app shows the same numbers with the same words. `npm test` at the repo root
checks the app's texts are translated in every language.

API: the same endpoints and headers as the web (`Authorization`,
`Organisation`, `ExcludeBots`) — see src/lib/api.js.

## Build and release

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit
```

Bundle id / package: `com.intastellar.analytics` (app.json).
