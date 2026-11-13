// "Players and plays" report of the admin panel (Phase 5 slices 5.16, 5.22 and 5.28). The
// getPlayReport Cloud Function reads the documents and builds the report with buildPlayReport; the
// web app shows it. Pure, so the aggregation is unit-tested without Firebase.
//
// One window (slice 5.28): every number covers STATS_SINCE (UTC) onward.
//   users/{uid}/stats/{gameId}          per player and game; cleared by the fresh start of slice
//                                       5.13 (docs/adr/0017-server-best-and-fresh-start.md), so
//                                       they start then; a document last played before
//                                       STATS_SINCE is skipped
//   games/{gameId}/daily/{YYYY-MM-DD}   per game and day; only the days from STATS_SINCE on
//   users/{uid}                         profiles created from STATS_SINCE on (by kind)
//
// Slice 5.22 (docs/adr/0022-started-abandoned-and-online-play.md) added started runs per player,
// online matches and the time of runs left without finishing, counted from EXTENDED_STATS_SINCE.
// Documents written before it simply lack those fields, which read as 0.

/**
 * How a player signed in: "google" (Firebase Auth lists google.com), "registered" (another
 * provider), "guest" (anonymous, `isGuest` on the profile) or "unknown" (play stats but no
 * profile any more).
 */
export const PLAYER_KINDS = ['google', 'registered', 'guest', 'unknown'] as const;
export type PlayerKind = (typeof PLAYER_KINDS)[number];

/**
 * The first day (UTC) of every number in the report: the day the progress reset ran (slice 5.13).
 * It deleted every `users/{uid}/stats/{gameId}`, so per-player numbers only exist from then on, and
 * the report counts everything else (daily game counters, new profiles) from the same day.
 */
export const STATS_SINCE = '2026-11-07';

/** STATS_SINCE as epoch milliseconds (midnight UTC). */
export const STATS_SINCE_MS = Date.parse(`${STATS_SINCE}T00:00:00Z`);

/**
 * The day slice 5.22 went live (UTC). From then on the server counts started runs per player,
 * online matches (per player and per game) and the play time of runs left without finishing.
 * Numbers before this day do not include them.
 * Placeholder until the slice is deployed: set it to the deploy day when merging.
 */
export const EXTENDED_STATS_SINCE = '2026-11-10';

/** The per-player table lists at most this many players (the most plays first). */
export const PLAY_REPORT_MAX_PLAYERS = 500;

/** Characters of the uid's end shown to tell players with the same name apart. */
const TAG_LENGTH = 5;

/** One users/{uid}/stats/{gameId} document. Counters are read with countOf (missing = 0). */
export type StatsInput = {
  uid: string;
  gameId: string;
  /** Finished solo runs (GHA_END) and their time. */
  plays: unknown;
  playSeconds: unknown;
  /** Solo runs started (slice 5.22). */
  starts?: unknown;
  /** Time of solo runs left without GHA_END (slice 5.22). */
  abandonedSeconds?: unknown;
  /** Online matches (tables, rooms) the player sat in (slice 5.22). */
  onlinePlays?: unknown;
  /** Epoch milliseconds, or null when missing. */
  lastPlayedAt: number | null;
};

/** One games/{gameId}/daily/{day} document. */
export type DailyInput = {
  gameId: string;
  /** YYYY-MM-DD */
  day: string;
  started: unknown;
  finished: unknown;
  playSeconds: unknown;
  /** Slice 5.22. */
  abandonedSeconds?: unknown;
  /** Online matches started (slice 5.22). */
  onlineStarted?: unknown;
};

export type ProfileInput = { username: string | null; kind: Exclude<PlayerKind, 'unknown'> };

export type KindCounts = Record<PlayerKind, number>;

/** Counters of one player, one game or one player kind. */
export type PlayCounts = {
  /** Solo runs started (per player since EXTENDED_STATS_SINCE). */
  starts: number;
  /** Finished solo runs. */
  plays: number;
  /** Online matches. */
  onlinePlays: number;
  /** Time of finished solo runs. */
  playSeconds: number;
  /** Time of solo runs left without finishing. */
  abandonedSeconds: number;
  /** playSeconds + abandonedSeconds (online play time is not counted). */
  totalSeconds: number;
};

export type KindSummary = PlayCounts & {
  /**
   * Profiles of this kind created from STATS_SINCE on (null for "unknown", which has none by
   * definition).
   */
  profiles: number | null;
  /** Players of this kind with at least one stats document. */
  players: number;
};

/** Sums of games/{gameId}/daily over the days from STATS_SINCE on. */
export type DailyTotals = {
  started: number;
  finished: number;
  playSeconds: number;
  abandonedSeconds: number;
  onlineStarted: number;
};

export type GameReport = {
  gameId: string;
  /** Sums of games/{gameId}/daily from STATS_SINCE on (UTC days). */
  window: DailyTotals;
  /** Finished runs and distinct players per kind, from users/{uid}/stats/{gameId}. */
  playsByKind: KindCounts;
  playersByKind: KindCounts;
};

export type PlayerGame = PlayCounts & { gameId: string };

export type PlayerReport = PlayCounts & {
  /** The end of the uid, never the whole uid. */
  tag: string;
  username: string | null;
  kind: PlayerKind;
  /** The last start, finish, abandoned run or online match. */
  lastPlayedAt: number | null;
  /** Most played first. */
  games: PlayerGame[];
};

export type PlayReport = {
  generatedAt: number;
  /** First day (UTC) of every number in the report: STATS_SINCE. */
  statsSince: string;
  /** First day of per-player starts, online matches and abandoned-run time (slice 5.22). */
  extendedSince: string;
  summary: Record<PlayerKind, KindSummary>;
  /** Most finished runs and online matches first. */
  games: GameReport[];
  /** Most plays (finished and online) first, at most PLAY_REPORT_MAX_PLAYERS. */
  players: PlayerReport[];
  /** Players with stats in total, and how many of them the list leaves out. */
  playerCount: number;
  truncated: number;
};

export type PlayReportInput = {
  now: number;
  stats: StatsInput[];
  daily: DailyInput[];
  /** Profiles of the players in `stats`; a missing uid is an "unknown" player. */
  profiles: Map<string, ProfileInput>;
  /** Profiles per kind created from STATS_SINCE on (players or not). */
  profileTotals: Record<Exclude<PlayerKind, 'unknown'>, number>;
  maxPlayers?: number;
};

const zeroKinds = (): KindCounts => ({ google: 0, registered: 0, guest: 0, unknown: 0 });

const zeroCounts = (): PlayCounts => ({
  starts: 0,
  plays: 0,
  onlinePlays: 0,
  playSeconds: 0,
  abandonedSeconds: 0,
  totalSeconds: 0,
});

const zeroDaily = (): DailyTotals => ({
  started: 0,
  finished: 0,
  playSeconds: 0,
  abandonedSeconds: 0,
  onlineStarted: 0,
});

/** A count read from Firestore: a finite, non-negative number, else 0. */
export const countOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** The counters of one stats document; fields from before slice 5.22 are missing and read 0. */
export function statsCounts(stat: StatsInput): PlayCounts {
  const playSeconds = countOf(stat.playSeconds);
  const abandonedSeconds = countOf(stat.abandonedSeconds);
  return {
    starts: countOf(stat.starts),
    plays: countOf(stat.plays),
    onlinePlays: countOf(stat.onlinePlays),
    playSeconds,
    abandonedSeconds,
    totalSeconds: playSeconds + abandonedSeconds,
  };
}

function addCounts(to: PlayCounts, from: PlayCounts) {
  to.starts += from.starts;
  to.plays += from.plays;
  to.onlinePlays += from.onlinePlays;
  to.playSeconds += from.playSeconds;
  to.abandonedSeconds += from.abandonedSeconds;
  to.totalSeconds += from.totalSeconds;
}

function addDaily(to: DailyTotals, day: DailyInput) {
  to.started += countOf(day.started);
  to.finished += countOf(day.finished);
  to.playSeconds += countOf(day.playSeconds);
  to.abandonedSeconds += countOf(day.abandonedSeconds);
  to.onlineStarted += countOf(day.onlineStarted);
}

/** Order of players and of a player's games: plays (finished and online), then starts. */
const byActivity = (a: PlayCounts, b: PlayCounts) =>
  b.plays + b.onlinePlays - (a.plays + a.onlinePlays) || b.starts - a.starts;

export function buildPlayReport(input: PlayReportInput): PlayReport {
  const maxPlayers = input.maxPlayers ?? PLAY_REPORT_MAX_PLAYERS;
  const kindOf = (uid: string): PlayerKind => input.profiles.get(uid)?.kind ?? 'unknown';

  const games = new Map<string, GameReport & { players: Record<PlayerKind, Set<string>> }>();
  const game = (gameId: string) => {
    let row = games.get(gameId);
    if (!row) {
      row = {
        gameId,
        window: zeroDaily(),
        playsByKind: zeroKinds(),
        playersByKind: zeroKinds(),
        players: { google: new Set(), registered: new Set(), guest: new Set(), unknown: new Set() },
      };
      games.set(gameId, row);
    }
    return row;
  };

  for (const day of input.daily) {
    // YYYY-MM-DD strings compare like the days they name; earlier days are not in the report.
    if (day.day < STATS_SINCE) continue;
    addDaily(game(day.gameId).window, day);
  }

  const players = new Map<string, PlayerReport>();
  for (const stat of input.stats) {
    // The fresh start cleared every stats document on STATS_SINCE, so one last played before it
    // is a leftover the reset missed. A document without a time (only started runs) is kept.
    if (stat.lastPlayedAt !== null && stat.lastPlayedAt < STATS_SINCE_MS) continue;
    const counts = statsCounts(stat);
    const kind = kindOf(stat.uid);
    const row = game(stat.gameId);
    row.playsByKind[kind] += counts.plays;
    row.players[kind].add(stat.uid);

    let player = players.get(stat.uid);
    if (!player) {
      player = {
        tag: stat.uid.slice(-TAG_LENGTH),
        username: input.profiles.get(stat.uid)?.username ?? null,
        kind,
        ...zeroCounts(),
        lastPlayedAt: null,
        games: [],
      };
      players.set(stat.uid, player);
    }
    addCounts(player, counts);
    if (stat.lastPlayedAt !== null && (player.lastPlayedAt ?? -Infinity) < stat.lastPlayedAt) {
      player.lastPlayedAt = stat.lastPlayedAt;
    }
    player.games.push({ gameId: stat.gameId, ...counts });
  }

  const summary = Object.fromEntries(
    PLAYER_KINDS.map((kind) => [
      kind,
      {
        profiles: kind === 'unknown' ? null : input.profileTotals[kind],
        players: 0,
        ...zeroCounts(),
      },
    ]),
  ) as Record<PlayerKind, KindSummary>;
  for (const player of players.values()) {
    const row = summary[player.kind];
    row.players += 1;
    addCounts(row, player);
    player.games.sort((a, b) => byActivity(a, b) || a.gameId.localeCompare(b.gameId));
  }

  const sortedPlayers = [...players.values()].sort(
    (a, b) =>
      byActivity(a, b) ||
      (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) ||
      a.tag.localeCompare(b.tag),
  );

  return {
    generatedAt: input.now,
    statsSince: STATS_SINCE,
    extendedSince: EXTENDED_STATS_SINCE,
    summary,
    games: [...games.values()]
      .map(({ players: sets, ...row }) => ({
        ...row,
        playersByKind: Object.fromEntries(
          PLAYER_KINDS.map((kind) => [kind, sets[kind].size]),
        ) as KindCounts,
      }))
      .sort(
        (a, b) =>
          b.window.finished +
            b.window.onlineStarted -
            (a.window.finished + a.window.onlineStarted) ||
          b.window.started - a.window.started ||
          a.gameId.localeCompare(b.gameId),
      ),
    players: sortedPlayers.slice(0, maxPlayers),
    playerCount: sortedPlayers.length,
    truncated: Math.max(0, sortedPlayers.length - maxPlayers),
  };
}
