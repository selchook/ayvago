// "Players and plays" report of the admin panel (Phase 5 slices 5.16 and 5.22). The getPlayReport
// Cloud Function reads the documents and builds the report with buildPlayReport; the web app shows
// it. Pure, so the aggregation is unit-tested without Firebase.
//
// Sources:
//   users/{uid}/stats/{gameId}          per player and game; cleared by the fresh start of slice
//                                       5.13 (docs/adr/0017-server-best-and-fresh-start.md)
//   games/{gameId}/daily/{YYYY-MM-DD}   per game and day; kept through the fresh start
//
// Slice 5.22 (docs/adr/0022-started-abandoned-and-online-play.md) added started runs per player,
// online matches and the time of runs left without finishing. Documents written before it simply
// lack those fields, which read as 0.

/**
 * How a player signed in: "google" (Firebase Auth lists google.com), "registered" (another
 * provider), "guest" (anonymous, `isGuest` on the profile) or "unknown" (play stats but no
 * profile any more).
 */
export const PLAYER_KINDS = ['google', 'registered', 'guest', 'unknown'] as const;
export type PlayerKind = (typeof PLAYER_KINDS)[number];

/**
 * The day the progress reset ran (slice 5.13). It deleted every `users/{uid}/stats/{gameId}`, so
 * per-player numbers only cover the time since then.
 */
export const STATS_SINCE = '2026-11-07';

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
  /** Profiles of this kind (null for "unknown", which has none by definition). */
  profiles: number | null;
  /** Players of this kind with at least one stats document. */
  players: number;
};

/** Sums of games/{gameId}/daily over a range of days. */
export type DailyTotals = {
  started: number;
  finished: number;
  playSeconds: number;
  abandonedSeconds: number;
  onlineStarted: number;
};

export type GameReport = {
  gameId: string;
  /** Sums of games/{gameId}/daily: everything since launch. */
  allTime: DailyTotals;
  /** Sums of games/{gameId}/daily from STATS_SINCE on (UTC days). */
  window: DailyTotals;
  /** Since STATS_SINCE, from users/{uid}/stats/{gameId}. */
  plays: number;
  playSeconds: number;
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
  /** First day of the per-player numbers (the fresh start). */
  statsSince: string;
  /** First day of per-player starts, online matches and abandoned-run time (slice 5.22). */
  extendedSince: string;
  /** Earliest day in games/{gameId}/daily, null without any. */
  allTimeSince: string | null;
  summary: Record<PlayerKind, KindSummary>;
  /** Most finished runs and online matches of all time first. */
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
  /** Profiles in total per kind (all of them, players or not). */
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
        allTime: zeroDaily(),
        window: zeroDaily(),
        plays: 0,
        playSeconds: 0,
        playsByKind: zeroKinds(),
        playersByKind: zeroKinds(),
        players: { google: new Set(), registered: new Set(), guest: new Set(), unknown: new Set() },
      };
      games.set(gameId, row);
    }
    return row;
  };

  let allTimeSince: string | null = null;
  for (const day of input.daily) {
    const row = game(day.gameId);
    addDaily(row.allTime, day);
    // YYYY-MM-DD strings compare like the days they name.
    if (day.day >= STATS_SINCE) addDaily(row.window, day);
    if (allTimeSince === null || day.day < allTimeSince) allTimeSince = day.day;
  }

  const players = new Map<string, PlayerReport>();
  for (const stat of input.stats) {
    const counts = statsCounts(stat);
    const kind = kindOf(stat.uid);
    const row = game(stat.gameId);
    row.plays += counts.plays;
    row.playSeconds += counts.playSeconds;
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
    allTimeSince,
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
          b.allTime.finished +
            b.allTime.onlineStarted -
            (a.allTime.finished + a.allTime.onlineStarted) ||
          b.plays - a.plays ||
          a.gameId.localeCompare(b.gameId),
      ),
    players: sortedPlayers.slice(0, maxPlayers),
    playerCount: sortedPlayers.length,
    truncated: Math.max(0, sortedPlayers.length - maxPlayers),
  };
}
