import {
  PLAYER_KINDS,
  type GameReport,
  type PlayerGame,
  type PlayerKind,
  type PlayerReport,
} from '@ayvago/shared';
import type { CsvValue } from './csv';

// Table rows of the "Players and plays" report (slices 5.16, 5.22 and 5.28) for the CSV downloads.
// The labels (headers, kind names, game lines) come from the caller, so the files follow the UI
// language. The rows come in the order the table shows them (slice 5.25: a sorted table exports
// sorted rows, and the player rank follows that order). Like the report, every column covers
// statsSince onward (slice 5.28).

/** Whole hours and the remaining minutes (rounded) of a play time in seconds. */
export function splitDuration(seconds: number): { hours: number; minutes: number } {
  const total = Math.round(Math.max(0, seconds) / 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

const isoDay = (time: number | null) => (time === null ? '' : new Date(time).toISOString());

export type GameCsvHeaders = {
  game: string;
  gameId: string;
  /** games/{gameId}/daily from statsSince on. */
  started: string;
  finished: string;
  online: string;
  seconds: string;
  abandonedSeconds: string;
  /** users/{uid}/stats: "Plays: Google" … and "Players: Google" … in PLAYER_KINDS order. */
  playsByKind: Record<PlayerKind, string>;
  playersByKind: Record<PlayerKind, string>;
};

export function gameCsvRows(
  games: readonly GameReport[],
  title: (gameId: string) => string,
  h: GameCsvHeaders,
): CsvValue[][] {
  return [
    [
      h.game,
      h.gameId,
      h.started,
      h.finished,
      h.online,
      h.seconds,
      h.abandonedSeconds,
      ...PLAYER_KINDS.map((kind) => h.playsByKind[kind]),
      ...PLAYER_KINDS.map((kind) => h.playersByKind[kind]),
    ],
    ...games.map((g) => [
      title(g.gameId),
      g.gameId,
      g.window.started,
      g.window.finished,
      g.window.onlineStarted,
      g.window.playSeconds,
      g.window.abandonedSeconds,
      ...PLAYER_KINDS.map((kind) => g.playsByKind[kind]),
      ...PLAYER_KINDS.map((kind) => g.playersByKind[kind]),
    ]),
  ];
}

export type PlayerCsvHeaders = {
  rank: string;
  player: string;
  tag: string;
  kind: string;
  starts: string;
  plays: string;
  online: string;
  seconds: string;
  abandonedSeconds: string;
  totalSeconds: string;
  lastPlayed: string;
  games: string;
};

export function playerCsvRows(
  players: readonly PlayerReport[],
  gameLine: (game: PlayerGame) => string,
  kind: (kind: PlayerKind) => string,
  noName: string,
  h: PlayerCsvHeaders,
): CsvValue[][] {
  return [
    [
      h.rank,
      h.player,
      h.tag,
      h.kind,
      h.starts,
      h.plays,
      h.online,
      h.seconds,
      h.abandonedSeconds,
      h.totalSeconds,
      h.lastPlayed,
      h.games,
    ],
    ...players.map((p, i) => [
      i + 1,
      p.username ?? noName,
      p.tag,
      kind(p.kind),
      p.starts,
      p.plays,
      p.onlinePlays,
      p.playSeconds,
      p.abandonedSeconds,
      p.totalSeconds,
      isoDay(p.lastPlayedAt),
      p.games.map(gameLine).join('; '),
    ]),
  ];
}

/**
 * The CSV file name: what it holds, the report's first day and when it was built (UTC), e.g.
 * `ayvago-games-from-2026-11-07-2026-11-13T09-30.csv`.
 */
export function reportFileName(table: 'games' | 'players', since: string, generatedAt: number) {
  const stamp = new Date(generatedAt).toISOString().slice(0, 16).replace(':', '-');
  return `ayvago-${table}-from-${since}-${stamp}.csv`;
}
