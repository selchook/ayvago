# ADR 0028 — Social sign-in providers: one flow, same-email linking, a switch per provider

- Status: Accepted (2026-11-20)
- Related: [ADR 0001](0001-firebase-backend.md) (Firebase), [Accounts spec §6](../specs/accounts.md#6-upgrading-and-merging),
  [Phase 5 plan §5.33](../plan/phase-5.md#533-facebook-sign-in--code),
  [Phase 5 setup §5.33](../setup/phase-5.md#533-facebook-sign-in)

## Context
Until now Google was the only way to register. Guests are Firebase anonymous users; signing in
linked Google to the guest (same uid), or, when that Google account already had an Ayvago
account, switched to it and merged the guest with `mergeGuestAccount`. The code named Google
everywhere: the flow, the emulator test hook, deleting an account (re-authentication with
Google), the profile and menu texts and the admin report.

The owner asked for Facebook sign-in next to Google. Apple and X are likely later. Three questions
come with a second provider:

1. **The same email at two providers.** The Firebase project uses "one account per email
   address" and email enumeration protection. Facebook's emails are not verified, so signing in
   with Facebook when a Google account already has that email fails. Observed in the Auth
   emulator (and the codes production documents):

   | Situation | Code |
   |---|---|
   | A guest links a Facebook account another Ayvago account already has | `auth/credential-already-in-use` |
   | A guest links Facebook whose email belongs to a Google account | `auth/email-already-in-use` |
   | Signing in with that Facebook account | `auth/account-exists-with-different-credential` |
   | A registered player links another player's Facebook account | `auth/credential-already-in-use` |
   | A guest links Google whose email belongs to a Facebook-only account | `auth/email-already-in-use`; signing in with Google then works (Google's email is verified, Firebase joins the accounts) |

   With enumeration protection `fetchSignInMethodsForEmail` returns nothing, so the client cannot
   ask which provider has the email.
2. **Facebook may share no email.** The player can refuse the email permission, or have none.
3. **Popups on Safari and iOS.** The sign-in popup is served by `<project>.firebaseapp.com`. With
   third-party storage partitioning (Safari, iOS browsers, Firefox strict mode) it cannot hand
   the result back to ayvago.com reliably. Facebook's in-app browser also blocks popups often.

## Decision

### One provider flow
`apps/web/lib/account/sign-in-flow.ts` holds the flow for every provider, with every Firebase
call passed in (popups in the browser, fake credentials against the emulator, stubs in unit
tests):

- `signInWith(provider)`: signed out or registered, a plain sign-in. A guest is linked in place
  (same uid). On `credential-already-in-use` or `email-already-in-use` the guest switches to the
  account that has the provider and is merged (`mergeGuestAccount`, unchanged); its ID token is
  taken before the switch, as before. For Google this is the old behaviour; only the
  `email-already-in-use` case is new, and it could not happen before Facebook existed.
- `SIGN_IN_PROVIDERS = ['google', 'facebook']` lists the providers. Adding Apple or X is a new
  entry, its `AuthProvider` and its button; the flow, the profile page and the report read the
  list.

### Same email: continue with the provider that has it, then link
When the email belongs to an account of another provider (`account-exists-with-different-credential`,
directly or after `email-already-in-use`), nothing changes yet. The flow keeps the pending
credential (`credentialFromError`) and the UI says: "This email already has an Ayvago account that
signs in with Google. Continue with Google to connect Facebook to it." The player's click opens
the other provider's popup (a new user gesture, so it is not blocked); the flow signs in with it
(a guest switches and is merged) and then links the pending credential (`continueLink`). The
provider of the existing account is the one the server names in `verifiedProvider` when it does,
else the other provider (with two providers there is no other).

If the player picks another account in that second popup, the link fails with
`email-already-in-use` and the player sees the sign-in error; nothing is merged into a wrong
account. Silent account switching never happens outside sign-in: connecting a provider on the
profile page reports `credential-already-in-use` ("This Facebook account is already connected to
another Ayvago account") instead of switching.

### Sign-in methods on the profile page
Registered players see their connected methods and can connect another (`linkWithPopup`) or
disconnect one (`unlink`) while another stays. Firebase itself unlinks the last provider and leaves
an account nobody can sign in to, so the client refuses that (`lastMethod`). Deleting an account
re-authenticates with a provider the player has: the one of the current session, else the first
connected one, so a Facebook-only player is never sent to Google.

### No email is a normal state
`email` is null for guests and for Facebook accounts without one. The UI shows "Signed in with
Facebook" instead of an address; the export and the admin pages already handle null.

### A switch per provider
Facebook is offered only when `NEXT_PUBLIC_FACEBOOK_SIGN_IN=1` (build time). The owner sets it
after the Meta app is live and the provider is enabled in Firebase; until then the code ships
dormant. A connected Facebook account stays visible (and removable) on the profile page even with
the switch off. Later providers get their own switch.

### Auth domain proxy (prepared, owner switches)
Firebase's documented fix for the popup problem ("proxy auth requests to firebaseapp.com") is
built in: with `FIREBASE_AUTH_PROXY_ORIGIN=https://<project>.firebaseapp.com`, Next.js rewrites
`/__/auth/*` and `/__/firebase/init.json` on ayvago.com to that origin (`beforeFiles`, before
the locale routes; the locale middleware skips `/__/`). Unset, nothing is proxied. Moving
`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` to `ayvago.com` is an owner step, after the redirect URI
`https://ayvago.com/__/auth/handler` is registered at Google and Meta. No redirect flow is built
for in-app browsers; `auth/popup-blocked` shows the existing message.

### Reporting
The admin "Players and plays" report gets a `facebook` player kind (Facebook and not Google; Google
wins when both are connected, so earlier numbers do not move).

## Consequences
- Facebook needs a Meta app, its review settings and a privacy page with data-deletion
  instructions (`/{locale}/privacy#delete-data`); the setup doc lists the steps.
- Firebase's "one account per email" setting must stay on: the same-email path depends on it.
- A Facebook-only account that later signs in with Google (same email) is joined by Firebase,
  because Google's email is verified. In production Firebase may unlink the unverified Facebook
  provider in that case; the player can connect it again on the profile page.
- The emulator cannot open real popups. Emulator builds read `window.__ayvagoEmulatorIdentity`
  and use a fake credential for every popup, so end-to-end tests drive the real UI; the
  `__ayvagoEmulatorSignIn(provider, email)` family of hooks wraps that (the old
  `__ayvagoEmulatorGoogleSignIn(email)` still works).
- Apple and X fit the same flow, switch and profile list.
