import type { PlayerId } from '@arcade/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_GUESSES, ROUND_DURATION_MS } from './constants.js';
import { publicBoard, selfBoard } from './redact.js';
import {
  allBoardsFinished,
  createBoard,
  createRound,
  isBoardFinished,
  resolveRound,
  submitGuess,
  type CipherRoundState,
} from './state.js';

const ALICE = 'alice' as PlayerId;
const BOB = 'bob' as PlayerId;
const START = 1_700_000_000_000;

function newRound(secret = 'crane'): CipherRoundState {
  const round = createRound(0, secret, START);
  round.boards.set(ALICE, createBoard(ALICE));
  round.boards.set(BOB, createBoard(BOB));
  return round;
}

describe('submitGuess', () => {
  let round: CipherRoundState;
  beforeEach(() => {
    round = newRound();
  });

  it('accepts an allowed word and returns its colours', () => {
    const outcome = submitGuess(round, ALICE, 'stare', START + 1_000);
    expect(outcome.kind).toBe('accepted');
    if (outcome.kind !== 'accepted') throw new Error('unreachable');
    expect(outcome.guessIndex).toBe(0);
    expect(outcome.solved).toBe(false);
    expect(round.boards.get(ALICE)?.guesses).toEqual(['stare']);
  });

  // The spec's core rule: a bad word is never "locked in".
  it.each(['zzzzz', 'cran', 'cranes', '12345', ''])(
    'rejects %o without consuming a guess',
    (bad) => {
      const outcome = submitGuess(round, ALICE, bad, START + 1_000);
      expect(outcome.kind).toBe('rejected');
      if (outcome.kind !== 'rejected') throw new Error('unreachable');
      expect(outcome.message).toBe('This is not an allowed word');

      const board = round.boards.get(ALICE);
      expect(board?.guesses).toEqual([]);
      expect(board?.results).toEqual([]);
      expect(board?.solved).toBe(false);
    },
  );

  it('leaves the board untouched across a run of rejected entries', () => {
    for (const bad of ['zzzzz', 'qqqqq', 'aaaaa!', 'xy']) {
      submitGuess(round, ALICE, bad, START + 1_000);
    }
    expect(round.boards.get(ALICE)?.guesses).toHaveLength(0);
    // ...and a valid word still works afterwards.
    expect(submitGuess(round, ALICE, 'crane', START + 2_000).kind).toBe('accepted');
  });

  it('normalizes case and whitespace before checking', () => {
    expect(submitGuess(round, ALICE, '  CRANE  ', START + 500).kind).toBe('accepted');
    expect(round.boards.get(ALICE)?.guesses).toEqual(['crane']);
  });

  it('scores a solve from server-measured elapsed time', () => {
    submitGuess(round, ALICE, 'stare', START + 1_000);
    submitGuess(round, ALICE, 'crane', START + 30_000);

    const board = round.boards.get(ALICE);
    expect(board?.solved).toBe(true);
    expect(board?.solvedElapsedMs).toBe(30_000);
    // 30s -> 450 speed, second guess -> 400.
    expect(board?.score).toEqual({ speed: 450, guesses: 400, total: 850 });
  });

  it('stops accepting guesses once solved', () => {
    submitGuess(round, ALICE, 'crane', START + 1_000);
    const outcome = submitGuess(round, ALICE, 'stare', START + 2_000);
    expect(outcome.kind).toBe('rejected');
    expect(round.boards.get(ALICE)?.guesses).toHaveLength(1);
  });

  it('allows exactly five guesses', () => {
    for (const word of ['stare', 'spilt', 'moody', 'bluff', 'wharf']) {
      expect(submitGuess(round, ALICE, word, START + 1_000).kind).toBe('accepted');
    }
    expect(round.boards.get(ALICE)?.guesses).toHaveLength(MAX_GUESSES);

    const sixth = submitGuess(round, ALICE, 'crane', START + 2_000);
    expect(sixth.kind).toBe('rejected');
    expect(round.boards.get(ALICE)?.guesses).toHaveLength(MAX_GUESSES);
  });

  it('rejects a guess that arrives after the buzzer', () => {
    const outcome = submitGuess(round, ALICE, 'crane', round.endsAt + 1);
    expect(outcome.kind).toBe('rejected');
    expect(round.boards.get(ALICE)?.guesses).toHaveLength(0);
  });

  it('rejects a guess from someone who is not in the round', () => {
    expect(submitGuess(round, 'ghost' as PlayerId, 'crane', START + 1_000).kind).toBe('rejected');
  });
});

describe('round completion', () => {
  it('reports all boards finished only once nobody can play on', () => {
    const round = newRound();
    expect(allBoardsFinished(round, [ALICE, BOB])).toBe(false);

    submitGuess(round, ALICE, 'crane', START + 1_000);
    expect(allBoardsFinished(round, [ALICE, BOB])).toBe(false);

    for (const word of ['stare', 'spilt', 'moody', 'bluff', 'wharf']) {
      submitGuess(round, BOB, word, START + 2_000);
    }
    expect(isBoardFinished(round.boards.get(BOB)!)).toBe(true);
    expect(allBoardsFinished(round, [ALICE, BOB])).toBe(true);
  });

  it('never reports an empty room as finished', () => {
    expect(allBoardsFinished(newRound(), [])).toBe(false);
  });
});

describe('resolveRound', () => {
  it('scores solvers and zeroes everyone else', () => {
    const round = newRound();
    submitGuess(round, ALICE, 'crane', START + 10_000);
    submitGuess(round, BOB, 'stare', START + 10_000);

    const scores = resolveRound(round);
    expect(round.phase).toBe('resolved');

    const alice = scores.find((s) => s.playerId === ALICE);
    const bob = scores.find((s) => s.playerId === BOB);
    // Solved inside 15s on the first guess: a perfect round.
    expect(alice?.points).toBe(1000);
    expect(alice?.detail).toEqual({ speed: 500, guesses: 500 });
    expect(bob?.points).toBe(0);
  });

  it('gives the buzzer-beater on the last guess exactly 200', () => {
    const round = newRound();
    for (const word of ['stare', 'spilt', 'moody', 'bluff']) {
      submitGuess(round, ALICE, word, START + 1_000);
    }
    submitGuess(round, ALICE, 'crane', START + ROUND_DURATION_MS);

    const scores = resolveRound(round);
    expect(scores.find((s) => s.playerId === ALICE)?.points).toBe(200);
  });
});

describe('redaction', () => {
  it('never exposes letters or the secret to other players', () => {
    const round = newRound('crane');
    submitGuess(round, ALICE, 'stare', START + 1_000);

    const board = round.boards.get(ALICE)!;
    const shared = publicBoard(board);

    expect(shared).not.toHaveProperty('guesses');
    expect(JSON.stringify(shared)).not.toContain('stare');
    expect(JSON.stringify(shared)).not.toContain('crane');
    expect(shared.guessCount).toBe(1);
    expect(shared.results).toHaveLength(1);
  });

  it('gives the board owner their own letters but not the secret', () => {
    const round = newRound('crane');
    submitGuess(round, ALICE, 'stare', START + 1_000);

    const own = selfBoard(round.boards.get(ALICE)!);
    expect(own.guesses).toEqual(['stare']);
    expect(JSON.stringify(own)).not.toContain('crane');
  });
});
