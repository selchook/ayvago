// Read-only health report: are runs recorded, and for which kinds of players? Run by
// .github/workflows/progress-report.yml with the deploy service account:
//   node scripts/progress-report.mjs [--days 7]
// It only reads. It prints counts, never names, uids or e-mail addresses.
//
// Player kinds: "guest" (anonymous profile), "google" (signed in with Google), "registered"
// (signed in, provider not readable) and "unknown" (no profile any more).
import { appendFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const KINDS = ['google', 'registered', 'guest', 'unknown'];

/**
 * Player kind per uid. The profile's `isGuest` (Firestore) splits guests from registered players;
 * Firebase Auth then names Google sign-ins, when the credentials may read Auth (otherwise a
 * registered player stays "registered").
 */
async function kindsOf(db, auth, uids) {
  const kinds = new Map();
  const list = [...uids].filter(Boolean);
  for (let i = 0; i < list.length; i += 300) {
    const refs = list.slice(i, i + 300).map((uid) => db.doc(`users/${uid}`));
    for (const snap of await db.getAll(...refs)) {
      kinds.set(
        snap.id,
        !snap.exists ? 'unknown' : snap.get('isGuest') === true ? 'guest' : 'registered',
      );
    }
  }
  try {
    const registered = list.filter((uid) => kinds.get(uid) === 'registered');
    for (let i = 0; i < registered.length; i += 100) {
      const res = await auth.getUsers(registered.slice(i, i + 100).map((uid) => ({ uid })));
      for (const u of res.users)
        if (u.providerData.some((p) => p.providerId === 'google.com')) kinds.set(u.uid, 'google');
    }
  } catch (err) {
    console.warn(
      `Auth not readable with these credentials (${err.code ?? err.message}); registered players stay "registered".`,
    );
  }
  return kinds;
}

function table(title, rows, columns) {
  const head = `| ${title} | ${columns.join(' | ')} |`;
  const sep = `|---|${columns.map(() => '---:').join('|')}|`;
  const body = Object.entries(rows).map(
    ([k, r]) => `| ${k} | ${columns.map((c) => r[c] ?? 0).join(' | ')} |`,
  );
  return [head, sep, ...body].join('\n');
}

async function main() {
  const { values } = parseArgs({ options: { days: { type: 'string', default: '7' } } });
  const days = Math.max(1, Math.min(60, Number(values.days) || 7));
  const since = Timestamp.fromMillis(Date.now() - days * 86400_000);
  initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
  const db = getFirestore();
  const auth = getAuth();

  // score sessions started in the window, by final status and player kind
  const sessions = await db.collection('sessions').where('startedAt', '>=', since).get();
  const leaderboardEntries = await db.collectionGroup('entries').get();
  const progress = await db.collectionGroup('progress').get();

  const uids = new Set();
  sessions.forEach((d) => uids.add(d.get('uid')));
  leaderboardEntries.forEach((d) => uids.add(d.id));
  progress.forEach((d) => uids.add(d.ref.parent.parent.id));
  const kinds = await kindsOf(db, auth, uids);

  const bySession = {};
  const players = Object.fromEntries(KINDS.map((k) => [k, new Set()]));
  sessions.forEach((d) => {
    const status = d.get('practice') ? `${d.get('status')} (practice)` : d.get('status');
    const kind = kinds.get(d.get('uid'));
    (bySession[status] ??= {})[kind] = ((bySession[status] ?? {})[kind] ?? 0) + 1;
    players[kind].add(d.get('uid'));
  });

  // leaderboard entries on the all-time boards (one per player per game)
  const byEntries = { 'all-time entries': {}, 'weekly entries': {} };
  leaderboardEntries.forEach((d) => {
    const board = d.ref.parent.parent.id; // leaderboards/{game}/boards/{board}/entries/{uid}
    const row = board === 'all' ? 'all-time entries' : 'weekly entries';
    const kind = kinds.get(d.id);
    byEntries[row][kind] = (byEntries[row][kind] ?? 0) + 1;
  });

  const byProgress = { 'players with progress': {}, 'total XP': {} };
  progress.forEach((d) => {
    const kind = kinds.get(d.ref.parent.parent.id);
    byProgress['players with progress'][kind] =
      (byProgress['players with progress'][kind] ?? 0) + 1;
    byProgress['total XP'][kind] = (byProgress['total XP'][kind] ?? 0) + (Number(d.get('xp')) || 0);
  });

  const playerRow = {
    'players who started a run': Object.fromEntries(KINDS.map((k) => [k, players[k].size])),
  };
  const out = [
    `## Progress report: last ${days} days`,
    '',
    table('Score sessions by status', bySession, KINDS),
    '',
    table('Players', playerRow, KINDS),
    '',
    table('Leaderboards (current)', byEntries, KINDS),
    '',
    table('XP and achievements (current)', byProgress, KINDS),
    '',
    `Sessions in the window: ${sessions.size}. Status "finished" means the run was accepted (it reached the leaderboards unless it was a practice run on Easy); "flagged" waits for review in /admin; "rejected" failed the checks; "open" was never finished.`,
  ].join('\n');
  console.log(out);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, out + '\n');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
