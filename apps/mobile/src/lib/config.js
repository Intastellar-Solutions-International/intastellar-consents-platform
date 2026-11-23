import * as Linking from "expo-linking";

// Hosts and sign-in settings shared by every request.
export const SCANNER_HOST = "https://www.intastellarconsents.com";   // api/* (Vercel)
export const PRIMARY_HOST = "https://apis.intastellarsolutions.com"; // PHP API (domains, organisations)
export const WEB_APP = "https://www.intastellarconsents.com";

// Intastellar Accounts redirects back to this deep link with ?token=…
// (the SDK passes it as `continue=`). createURL picks the address the app
// can actually receive:
//   development / store build → intastellaranalytics://auth  (app.json scheme)
//   Expo Go                   → exp://<computer-ip>:8081/--/auth
// Expo Go can't open our own scheme, so a fixed intastellaranalytics://
// redirect went nowhere there.
export const LOGIN_URI = Linking.createURL("auth");
export const CLIENT_ID = "d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d";
export const APP_NAME = "Intastellar Analytics";
