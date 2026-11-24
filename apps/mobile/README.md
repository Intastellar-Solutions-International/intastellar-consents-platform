# Intastellar Analytics — mobile app

Expo (SDK 58) companion app for the Analytics side: Home, Live, Ad Spend.
Everything else opens the web dashboard in an in-app browser.

## Run it

Expo SDK 58 needs **Node 22.13+** (the web build uses the repo's Node 16). `apps/mobile/.nvmrc` pins it — run `nvm use` in this folder first:

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

Profiles in `eas.json` (run from `apps/mobile`, Node 22 — `nvm use`):

| Profile | For | Command |
|---|---|---|
| `development` | Your iPhone / Android phone, with the dev menu; loads JS from `npx expo start` | `npx eas-cli@latest build --profile development --platform ios` |
| `development-simulator` | iOS Simulator | `npx eas-cli@latest build --profile development-simulator --platform ios` |
| `preview` | Testers (internal distribution), receives updates on channel `preview` | `npx eas-cli@latest build --profile preview --platform all` |
| `production` | App Store / Google Play, channel `production`, build number bumped automatically | `npx eas-cli@latest build --profile production --platform all` then `npx eas-cli@latest submit` |

- **First iOS build on a real phone:** register it once with `npx eas-cli@latest device:create`, then build. EAS offers to create the certificates and the **Apple push key** — say yes, or push notifications fail (the Alerts tab's *Send test notification* then reports `InvalidCredentials`).
- **Android push** needs a Firebase project (`google-services.json`) and its key uploaded with `npx eas-cli@latest credentials`.
- **Updates** (`npx eas-cli@latest update --channel preview`) reach `preview` / `production` builds only — development builds load JS from your dev server instead.
- Push, Face ID, Liquid Glass and haptics all need a build; Expo Go lacks some of them.
