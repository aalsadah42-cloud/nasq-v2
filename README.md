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

The app listens under `groups/{groupId}/gatherings`, `groups/{groupId}/transactions`, and `groups/{groupId}/fund/{groupId}`; other clients receive live snapshots. New contribution requests store participant UIDs and names, with payment statuses updated by UID; individual payment confirmations are documents in each transaction's `confirmations` subcollection. Balance updates and approvals run in Firestore transactions. Without Firebase configuration, the app uses in-memory state in the current page; this is not durable offline storage.

Gathering documents retain organizer-managed event data. Member RSVPs are stored in `participantDecisionsByUid`, member expenses are appended under `expensesByUid`, and task claims are stored in `taskClaimsByUid`. Firestore rules restrict each member to their own entries; legacy gathering arrays remain readable. Deploy these rules before deploying the client that writes the UID-scoped fields.

Firebase Auth supports account registration and sign-in, and group membership is stored under `groups/{groupId}/members`. Group settings support member roles, invite links, ownership transfer, leaving, and owner-only group deletion. Deploy the repository's `firestore.rules` before using a live project; client-side visibility checks are convenience only, and the rules enforce the actual permissions.

Groups are limited to 30 members. The group document stores the member UID index used by contribution-request rules, and the invite-code document stores the membership counter; both are updated atomically with membership changes. Before deploying these rules to an existing project, backfill each group's `memberUids` and invite-code `memberCount` from actual member documents, and ensure each group has only one invite code. Do not allow joins until this trusted migration is complete. New groups initialize both automatically.

New contribution requests snapshot participant IDs and names, with payment statuses stored as updates; per-member amounts are derived from the request total and participant count when read. Existing requests that already store explicit amounts and statuses remain supported.

Profile details are stored in the signed-in user's `users/{uid}` document, which is readable and writable only by that account. Bank and transfer details are masked in settings and are not copied into group or gathering records; the full value is read only when the member explicitly copies settlement details for a direct transfer. Treat Firebase project access and administrative credentials as sensitive, and verify rule changes in the Firebase Emulator before deployment. Do not migrate demo data from `localStorage` into the live project as real payment or gathering records.

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
