import { PLAYER_KINDS, type PlayerKind, type PlayReport } from '@ayvago/shared';
import type { CsvValue } from './csv';

// Table rows of the "Players and plays" report (slice 5.16) for the CSV downloads. The labels
// (headers, kind names, game titles) come from the caller, so the files follow the UI language.

/** Whole hours and the remaining minutes (rounded) of a play time in seconds. */
export function splitDuration(seconds: number): { hours: number; minutes: number } {
  const total = Math.round(Math.max(0, seconds) / 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

const isoDay = (time: number | null) => (time === null ? '' : new Date(time).toISOString());

export type GameCsvHeaders = {
  game: string;
  gameId: string;
  allTimeFinished: string;
  allTimeStarted: string;
  allTimeSeconds: string;
  plays: string;
  seconds: string;
  /** "Plays: Google" … and "Players: Google" … in PLAYER_KINDS order. */
  playsByKind: Record<PlayerKind, string>;
  playersByKind: Record<PlayerKind, string>;
};

export function gameCsvRows(
  report: PlayReport,
  title: (gameId: string) => string,
  h: GameCsvHeaders,
): CsvValue[][] {
  return [
    [
      h.game,
      h.gameId,
      h.allTimeFinished,
      h.allTimeStarted,
      h.allTimeSeconds,
      h.plays,
      h.seconds,
      ...PLAYER_KINDS.map((kind) => h.playsByKind[kind]),
      ...PLAYER_KINDS.map((kind) => h.playersByKind[kind]),
    ],
    ...report.games.map((g) => [
      title(g.gameId),
      g.gameId,
      g.allTime.finished,
      g.allTime.started,
      g.allTime.playSeconds,
      g.plays,
      g.playSeconds,
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
  plays: string;
  seconds: string;
  lastPlayed: string;
  games: string;
};

export function playerCsvRows(
  report: PlayReport,
  title: (gameId: string) => string,
  kind: (kind: PlayerKind) => string,
  noName: string,
  h: PlayerCsvHeaders,
): CsvValue[][] {
  return [
    [h.rank, h.player, h.tag, h.kind, h.plays, h.seconds, h.lastPlayed, h.games],
    ...report.players.map((p, i) => [
      i + 1,
      p.username ?? noName,
      p.tag,
      kind(p.kind),
      p.plays,
      p.playSeconds,
      isoDay(p.lastPlayedAt),
      p.games.map((g) => `${title(g.gameId)} × ${g.plays}`).join('; '),
    ]),
  ];
}
