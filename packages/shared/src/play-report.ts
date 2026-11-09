// "Players and plays" report of the admin panel (Phase 5 slice 5.16). The getPlayReport Cloud
// Function reads the documents and builds the report with buildPlayReport; the web app shows it.
// Pure, so the aggregation is unit-tested without Firebase.
//
// Sources:
//   users/{uid}/stats/{gameId}          per player and game; cleared by the fresh start of slice
//                                       5.13 (docs/adr/0017-server-best-and-fresh-start.md)
//   games/{gameId}/daily/{YYYY-MM-DD}   per game and day; kept through the fresh start

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

/** The per-player table lists at most this many players (the most plays first). */
export const PLAY_REPORT_MAX_PLAYERS = 500;

/** Characters of the uid's end shown to tell players with the same name apart. */
const TAG_LENGTH = 5;

export type StatsInput = {
  uid: string;
  gameId: string;
  plays: number;
  playSeconds: number;
  /** Epoch milliseconds, or null when missing. */
  lastPlayedAt: number | null;
};

export type DailyInput = {
  gameId: string;
  /** YYYY-MM-DD */
  day: string;
  started: number;
  finished: number;
  playSeconds: number;
};

export type ProfileInput = { username: string | null; kind: Exclude<PlayerKind, 'unknown'> };

export type KindCounts = Record<PlayerKind, number>;

export type KindSummary = {
  /** Profiles of this kind (null for "unknown", which has none by definition). */
  profiles: number | null;
  /** Players of this kind with at least one stats document. */
  players: number;
  plays: number;
  playSeconds: number;
};

export type GameReport = {
  gameId: string;
  /** Sums of games/{gameId}/daily: everything since launch. */
  allTime: { started: number; finished: number; playSeconds: number };
  /** Since STATS_SINCE, from users/{uid}/stats/{gameId}. */
  plays: number;
  playSeconds: number;
  playsByKind: KindCounts;
  playersByKind: KindCounts;
};

export type PlayerReport = {
  /** The end of the uid, never the whole uid. */
  tag: string;
  username: string | null;
  kind: PlayerKind;
  plays: number;
  playSeconds: number;
  lastPlayedAt: number | null;
  /** Most played first. */
  games: { gameId: string; plays: number; playSeconds: number }[];
};

export type PlayReport = {
  generatedAt: number;
  /** First day of the per-player numbers (the fresh start). */
  statsSince: string;
  /** Earliest day in games/{gameId}/daily, null without any. */
  allTimeSince: string | null;
  summary: Record<PlayerKind, KindSummary>;
  /** Most finished runs of all time first. */
  games: GameReport[];
  /** Most plays first, at most PLAY_REPORT_MAX_PLAYERS. */
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

/** A count read from Firestore: a finite, non-negative number, else 0. */
export const countOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

export function buildPlayReport(input: PlayReportInput): PlayReport {
  const maxPlayers = input.maxPlayers ?? PLAY_REPORT_MAX_PLAYERS;
  const kindOf = (uid: string): PlayerKind => input.profiles.get(uid)?.kind ?? 'unknown';

  const games = new Map<string, GameReport & { players: Record<PlayerKind, Set<string>> }>();
  const game = (gameId: string) => {
    let row = games.get(gameId);
    if (!row) {
      row = {
        gameId,
        allTime: { started: 0, finished: 0, playSeconds: 0 },
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
    row.allTime.started += countOf(day.started);
    row.allTime.finished += countOf(day.finished);
    row.allTime.playSeconds += countOf(day.playSeconds);
    if (allTimeSince === null || day.day < allTimeSince) allTimeSince = day.day;
  }

  const players = new Map<string, PlayerReport>();
  for (const stat of input.stats) {
    const plays = countOf(stat.plays);
    const seconds = countOf(stat.playSeconds);
    const kind = kindOf(stat.uid);
    const row = game(stat.gameId);
    row.plays += plays;
    row.playSeconds += seconds;
    row.playsByKind[kind] += plays;
    row.players[kind].add(stat.uid);

    let player = players.get(stat.uid);
    if (!player) {
      player = {
        tag: stat.uid.slice(-TAG_LENGTH),
        username: input.profiles.get(stat.uid)?.username ?? null,
        kind,
        plays: 0,
        playSeconds: 0,
        lastPlayedAt: null,
        games: [],
      };
      players.set(stat.uid, player);
    }
    player.plays += plays;
    player.playSeconds += seconds;
    if (stat.lastPlayedAt !== null && (player.lastPlayedAt ?? -Infinity) < stat.lastPlayedAt) {
      player.lastPlayedAt = stat.lastPlayedAt;
    }
    player.games.push({ gameId: stat.gameId, plays, playSeconds: seconds });
  }

  const summary = Object.fromEntries(
    PLAYER_KINDS.map((kind) => [
      kind,
      {
        profiles: kind === 'unknown' ? null : input.profileTotals[kind],
        players: 0,
        plays: 0,
        playSeconds: 0,
      },
    ]),
  ) as Record<PlayerKind, KindSummary>;
  for (const player of players.values()) {
    const row = summary[player.kind];
    row.players += 1;
    row.plays += player.plays;
    row.playSeconds += player.playSeconds;
    player.games.sort((a, b) => b.plays - a.plays || a.gameId.localeCompare(b.gameId));
  }

  const sortedPlayers = [...players.values()].sort(
    (a, b) =>
      b.plays - a.plays ||
      (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) ||
      a.tag.localeCompare(b.tag),
  );

  return {
    generatedAt: input.now,
    statsSince: STATS_SINCE,
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
          b.allTime.finished - a.allTime.finished ||
          b.plays - a.plays ||
          a.gameId.localeCompare(b.gameId),
      ),
    players: sortedPlayers.slice(0, maxPlayers),
    playerCount: sortedPlayers.length,
    truncated: Math.max(0, sortedPlayers.length - maxPlayers),
  };
}
