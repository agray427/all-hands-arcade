import type { PlayerId } from '@arcade/core';

import type { LetterState } from './evaluate.js';
import { isBoardFinished, type PlayerBoard } from './state.js';

/**
 * What everyone other than the board's owner is allowed to see: the colour
 * pattern, but never the letters. The facilitator wall shows a wall of
 * coloured mini-grids, which is the fun part, without leaking anyone's guesses
 * to a projector or handing a neighbour a shortcut.
 */
export interface PublicBoard {
  playerId: PlayerId;
  results: LetterState[][];
  guessCount: number;
  solved: boolean;
  finished: boolean;
  solvedElapsedMs: number | null;
  points: number | null;
}

/** The board's owner sees their own letters, and nothing about the secret. */
export interface SelfBoard extends PublicBoard {
  guesses: string[];
}

export function publicBoard(board: PlayerBoard): PublicBoard {
  return {
    playerId: board.playerId,
    results: board.results.map((row) => [...row]),
    guessCount: board.guesses.length,
    solved: board.solved,
    finished: isBoardFinished(board),
    solvedElapsedMs: board.solvedElapsedMs,
    points: board.score?.total ?? null,
  };
}

export function selfBoard(board: PlayerBoard): SelfBoard {
  return { ...publicBoard(board), guesses: [...board.guesses] };
}
