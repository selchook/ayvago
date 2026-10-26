// Grants or revokes the `admin` custom claim for the account with the given email.
// Run by .github/workflows/grant-admin.yml with the deploy service account
// (needs the "Firebase Authentication Admin" role, docs/setup/phase-2.md):
//   node scripts/set-admin.mjs <email> grant|revoke
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [email, action] = process.argv.slice(2);
if (!email || !['grant', 'revoke'].includes(action)) {
  console.error('Usage: node scripts/set-admin.mjs <email> grant|revoke');
  process.exit(2);
}

initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const auth = getAuth();
const user = await auth.getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No account with that email. Sign in to Ayvago with Google first.`);
  process.exit(1);
}
const claims = { ...(user.customClaims ?? {}) };
if (action === 'grant') claims.admin = true;
else delete claims.admin;
await auth.setCustomUserClaims(user.uid, claims);
console.log(`${action === 'grant' ? 'Granted' : 'Revoked'} admin for uid ${user.uid}.`);
