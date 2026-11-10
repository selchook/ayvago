// Ayvago Cloud Functions. Region and limits apply to every function in this codebase.
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onValueCreated, onValueWritten } from 'firebase-functions/v2/database';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './admin';
import {
  getAppCheckStatus as appCheckStatusCall,
  setAppCheckMode as appCheckModeCall,
} from './appcheck';
import { fail } from './errors';
import { deleteInactiveGuests, deletePlayerData, mergeGuestAccount as mergeGuest } from './guests';
import { closeSeasons, playerCard, syncPlayerRows } from './leaderboards';
import { reviewScoreFlag as review, setPlayerBan as ban } from './moderation';
import { recomputeGameScores } from './rankings';
import { getPlayReport as playReportCall } from './reports';
import { deleteStaleLobbyData, syncLobbyTable as syncLobby } from './lobby';
import { recordRoomJoin, recordTableStart } from './recent';
import { deleteOldRooms, deleteOldTables, ROOM_TTL_MS } from './rooms';
import { finishSession as finish, startSession as start } from './sessions';
import { reserveUsername as reserve } from './usernames';
import { castVote as vote } from './votes';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

/** Guests unused for this long are deleted with their data (docs/specs/accounts.md §2). */
const GUEST_RETENTION_DAYS = 30;
/** Finished and abandoned score sessions are kept this long for review, then deleted. */
const SESSION_RETENTION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const reserveUsername = onCall(reserve);

export const mergeGuestAccount = onCall(mergeGuest);

export const startSession = onCall(start);

export const finishSession = onCall(finish);

export const castVote = onCall(vote);

// Admin panel (requires the `admin` custom claim).
export const reviewScoreFlag = onCall(review);
export const setPlayerBan = onCall(ban);
export const getAppCheckStatus = onCall(appCheckStatusCall);
export const setAppCheckMode = onCall(appCheckModeCall);
/** "Players and plays" report (slice 5.16): reads every play stat, so it gets more time and memory. */
export const getPlayReport = onCall({ timeoutSeconds: 300, memory: '512MiB' }, playReportCall);

/** syncLeaderboardProfile(): copies the caller's current name and avatar into their board rows. */
export const syncLeaderboardProfile = onCall(async (request) => {
  if (!request.auth) throw fail('unauthenticated', 'signed-out');
  const uid = request.auth.uid;
  const card = playerCard((await db().doc(`users/${uid}`).get()).data());
  return { boards: await syncPlayerRows(uid, card) };
});

/**
 * deleteMyData(): Delete account, server part. Removes everything the server wrote about the
 * caller (leaderboard rows and entries, votes, username) and `users/{uid}` with every
 * subcollection (profile, library, play stats of every game). The client then deletes the
 * Firebase Auth user.
 */
export const deleteMyData = onCall(async (request) => {
  if (!request.auth) throw fail('unauthenticated', 'signed-out');
  await deletePlayerData(request.auth.uid);
  return { deleted: true };
});

/** Catalog ranking scores (docs/specs/voting.md §4), hourly so new games find their place fast. */
export const recomputeRankings = onSchedule({ schedule: 'every 60 minutes' }, async () => {
  const games = await recomputeGameScores();
  logger.info('Game scores recomputed', { games });
});

export const cleanupGuests = onSchedule(
  { schedule: 'every day 03:30', timeZone: 'Europe/Istanbul' },
  async () => {
    const cutoff = Date.now() - GUEST_RETENTION_DAYS * DAY_MS;
    const deleted = await deleteInactiveGuests(cutoff);
    logger.info('Inactive guests deleted', { deleted });
  },
);

export const cleanupSessions = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Europe/Istanbul' },
  async () => {
    const old = db()
      .collection('sessions')
      .where('startedAt', '<', Timestamp.fromMillis(Date.now() - SESSION_RETENTION_DAYS * DAY_MS))
      .limit(400);
    let deleted = 0;
    for (;;) {
      const page = await old.get();
      if (page.empty) break;
      const batch = db().batch();
      page.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deleted += page.size;
    }
    logger.info('Old score sessions deleted', { deleted });
  },
);

/**
 * Online match rooms and game tables expire after two hours (docs/adr/0010-online-matches.md,
 * docs/adr/0015-tables-for-four-with-bots.md); stale lobby entries, invites and invite quotas
 * go with them (docs/adr/0019-table-lobby-presence-invites.md).
 */
export const cleanupRooms = onSchedule({ schedule: 'every 60 minutes' }, async () => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  const deleted = await deleteOldRooms(cutoff);
  const tables = await deleteOldTables(cutoff);
  const lobby = await deleteStaleLobbyData(cutoff);
  logger.info('Old online rooms and tables deleted', { deleted, tables, ...lobby });
});

// The Functions emulator fires database triggers only in us-central1. Local development opts in
// with AYVAGO_EMULATOR_DB_TRIGGERS=1 in functions/.env.local (git-ignored, read only by the
// emulator); the test run leaves it off, because bursts of table writes there overwhelm the
// emulator's function workers. Deploys always use europe-west1, the database's region.
const emulatorTriggerRegion =
  process.env.FUNCTIONS_EMULATOR === 'true' && process.env.AYVAGO_EMULATOR_DB_TRIGGERS === '1'
    ? { region: 'us-central1' }
    : {};

/**
 * Keeps the public lobby list (lobby/{gameId}/tables/{code}) in step with every public table
 * (docs/adr/0019-table-lobby-presence-invites.md), and records who played with whom when a table
 * starts (users/{uid}/recentPlayers, docs/adr/0021-site-presence-recent-players.md).
 */
export const syncLobbyTable = onValueWritten(
  { ref: 'tables/{code}', ...emulatorTriggerRegion },
  async (event) => {
    const code = event.params.code;
    const before = event.data.before.val() as unknown;
    const after = event.data.after.val() as unknown;
    const [result, recent] = await Promise.all([
      syncLobby(code, before, after, event.data.after.ref.root),
      recordTableStart(code, before, after),
    ]);
    if (result !== 'unchanged') logger.debug('Lobby entry updated', { code, result });
    if (recent > 0) logger.debug('Recent players recorded', { code, entries: recent });
  },
);

/**
 * A two-player room got its second player: both get each other in their recent players
 * (docs/adr/0021-site-presence-recent-players.md). Fires once per room, on the guest seat only,
 * so moves, signals and presence in the room never start it.
 */
export const recordRoomPlayers = onValueCreated(
  { ref: 'rooms/{code}/guestUid', ...emulatorTriggerRegion },
  async (event) => {
    const code = event.params.code;
    const entries = await recordRoomJoin(code, event.data.ref.root);
    if (entries > 0) logger.debug('Recent players recorded', { code, entries });
  },
);

/** Weekly seasons end on Monday at 09:00 UTC (docs/specs/leaderboards.md §8). */
export const closeLeaderboardSeason = onSchedule(
  { schedule: '0 9 * * 1', timeZone: 'Etc/UTC' },
  async () => {
    const archived = await closeSeasons();
    logger.info('Leaderboard season closed', { archived });
  },
);
