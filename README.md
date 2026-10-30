# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Firebase data sync

Firebase is initialized once in `src/lib/firebase.ts`; Firestore and Firebase Auth are configured from Vite environment variables. `.env.example` targets the existing `nassaq-ohqtgp` project and contains placeholders, not credentials. Copy it to `.env.local` and fill in the Web App values from the Firebase Console before starting or building:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
```

The app listens to the `gatherings`, `fundPaymentRequests`, and `fundBalances` collections. Gathering additions, edits, and removals are written to Firestore and other clients receive live snapshots. Each payment request stores its `contributions` array and a `confirmationTimes` map keyed by member name. Confirmation timestamps use Firestore server timestamps; balance updates and payment approvals run in a Firestore transaction. With no Firebase configuration, the page clearly indicates that data is local to the current browser.

Firebase Auth is initialized, but this demo does not yet include sign-in or role management. Before using a live project, deploy Firestore Security Rules that require authenticated users and restrict member updates and administrator approvals. Firebase client configuration is not authorization. Configure rules for all three collections and verify them in the Firebase Emulator before deployment. Do not migrate demo data from `localStorage` into the live project as real payment or gathering records.

Firebase Hosting is configured to build the Vite app into `dist` and use the `nassaq-ohqtgp-e2b7f` Hosting target in project `nassaq-ohqtgp`. After authenticating the Firebase CLI, deploy with `firebase deploy --only hosting:nassaq-ohqtgp-e2b7f`.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
