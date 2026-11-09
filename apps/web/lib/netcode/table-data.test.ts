import { describe, expect, it } from 'vitest';
import { freeSeat, nextBotNumber, seatedUids, seatOf, tableReady, toTable } from './table-data';

const RAW = {
  gameId: 'okey',
  slug: 'okey',
  hostUid: 'host',
  size: 4,
  status: 'open',
  createdAt: 1000,
  seats: {
    0: { uid: 'host', name: 'Ayşe', character: 'explorer' },
    2: { bot: true, name: 'Bot 1' },
  },
  online: { host: 'abcdef012345', junk: 7 },
};

describe('toTable', () => {
  it('reads seats in order, with empty seats as null', () => {
    const table = toTable('ABC234', RAW);
    expect(table?.seats).toEqual([
      { kind: 'player', uid: 'host', name: 'Ayşe', character: 'explorer' },
      null,
      { kind: 'bot', name: 'Bot 1' },
      null,
    ]);
    expect(table?.online).toEqual({ host: 'abcdef012345' });
    expect(table?.status).toBe('open');
  });

  it('reads array-shaped seats and drops unknown characters', () => {
    const table = toTable('ABC234', {
      ...RAW,
      size: 2,
      seats: [
        { uid: 'host', name: 'A', character: 'alien-blue' },
        { bot: true, name: 'Bot 1' },
      ],
    });
    expect(table?.seats).toEqual([
      { kind: 'player', uid: 'host', name: 'A', character: null },
      { kind: 'bot', name: 'Bot 1' },
    ]);
  });

  it('reads the lobby visibility; tables from before it are private', () => {
    expect(toTable('ABC234', { ...RAW, visibility: 'public' })?.visibility).toBe('public');
    expect(toTable('ABC234', { ...RAW, visibility: 'private' })?.visibility).toBe('private');
    expect(toTable('ABC234', RAW)?.visibility).toBe('private');
    expect(toTable('ABC234', { ...RAW, visibility: 'open' })?.visibility).toBe('private');
  });

  it('lists the seated players', () => {
    const table = toTable('ABC234', {
      ...RAW,
      seats: { ...RAW.seats, 3: { uid: 'g', name: 'G' } },
    })!;
    expect(seatedUids(table)).toEqual(['host', 'g']);
  });

  it('refuses things that are not tables', () => {
    expect(toTable('ABC234', null)).toBeNull();
    expect(toTable('ABC234', { slug: 'okey' })).toBeNull();
  });
});

describe('table helpers', () => {
  const table = toTable('ABC234', RAW)!;

  it('finds seats', () => {
    expect(seatOf(table, 'host')).toBe(0);
    expect(seatOf(table, 'nobody')).toBe(-1);
    expect(freeSeat(table)).toBe(1);
  });

  it('is ready only when every seat is taken', () => {
    expect(tableReady(table)).toBe(false);
    const full = toTable('ABC234', {
      ...RAW,
      seats: { ...RAW.seats, 1: { uid: 'g', name: 'G' }, 3: { bot: true, name: 'Bot 2' } },
    })!;
    expect(tableReady(full)).toBe(true);
    expect(freeSeat(full)).toBe(-1);
  });

  it('numbers new bots after the ones already seated', () => {
    expect(nextBotNumber(table)).toBe(2);
  });
});
