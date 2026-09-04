import { describe, expect, it } from 'vitest';

import type { PlayerId } from './ids.js';
import { accumulate, rank, type LeaderboardEntry, type RoundScore } from './leaderboard.js';

const ALICE = 'alice' as PlayerId;
const BOB = 'bob' as PlayerId;
const CARA = 'cara' as PlayerId;

const names = new Map<PlayerId, string>([
  [ALICE, 'Alice'],
  [BOB, 'Bob'],
  [CARA, 'Cara'],
]);

function score(playerId: PlayerId, roundIndex: number, points: number): RoundScore {
  return { playerId, roundIndex, points };
}

describe('accumulate', () => {
  it('totals points across rounds and ranks them', () => {
    const board = accumulate(
      [
        score(ALICE, 0, 850),
        score(BOB, 0, 1000),
        score(ALICE, 1, 700),
        score(BOB, 1, 0),
        score(ALICE, 2, 300),
        score(BOB, 2, 200),
      ],
      names,
      3,
    );

    expect(board.map((e) => [e.displayName, e.totalPoints, e.rank])).toEqual([
      ['Alice', 1850, 1],
      ['Bob', 1200, 2],
      ['Cara', 0, 3],
    ]);
  });

  it('keeps a per-round column for every round', () => {
    const board = accumulate([score(ALICE, 1, 500)], names, 3);
    expect(board.find((e) => e.playerId === ALICE)?.roundPoints).toEqual([0, 500, 0]);
  });

  it('seeds everyone in the room, including players who have not scored', () => {
    const board = accumulate([], names, 3);
    expect(board).toHaveLength(3);
    expect(board.every((e) => e.totalPoints === 0)).toBe(true);
  });

  it('ignores scores for rounds outside the match', () => {
    const board = accumulate([score(ALICE, 9, 500)], names, 3);
    const alice = board.find((e) => e.playerId === ALICE);
    expect(alice?.roundPoints).toEqual([0, 0, 0]);
    expect(alice?.totalPoints).toBe(500);
  });
});

describe('rank', () => {
  const entry = (displayName: string, totalPoints: number): LeaderboardEntry => ({
    playerId: displayName as PlayerId,
    displayName,
    totalPoints,
    roundPoints: [],
    rank: 0,
  });

  it('gives tied players the same rank and skips the next', () => {
    const ranked = rank([entry('Bob', 500), entry('Alice', 500), entry('Cara', 100)]);
    expect(ranked.map((e) => [e.displayName, e.rank])).toEqual([
      ['Alice', 1],
      ['Bob', 1],
      ['Cara', 3],
    ]);
  });

  it('breaks ties by name so the order is stable between renders', () => {
    expect(rank([entry('Zoe', 100), entry('Adam', 100)]).map((e) => e.displayName)).toEqual([
      'Adam',
      'Zoe',
    ]);
  });
});
