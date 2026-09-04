import type { PlayerId, RoundPhase, RoundScore } from '@arcade/core';

import { MAX_GUESSES, ROUND_DURATION_MS } from './constants.js';
import { evaluateGuess, isWinningResult, type LetterState } from './evaluate.js';
import { scoreRound, type RoundScoreBreakdown, type ScoreMode } from './scoring.js';
import { validateEntry, type EntryRejection } from './validate.js';

export interface PlayerBoard {
  playerId: PlayerId;
  guesses: string[];
  results: LetterState[][];
  solved: boolean;
  /** ms since round start, set the moment the winning guess is accepted. */
  solvedElapsedMs: number | null;
  score: RoundScoreBreakdown | null;
}

export interface CipherRoundState {
  index: number;
  /** SERVER ONLY. Never serialised into anything bound for a player socket. */
  secret: string;
  startedAt: number;
  endsAt: number;
  phase: RoundPhase;
  boards: Map<PlayerId, PlayerBoard>;
  mode: ScoreMode;
}

export function createBoard(playerId: PlayerId): PlayerBoard {
  return {
    playerId,
    guesses: [],
    results: [],
    solved: false,
    solvedElapsedMs: null,
    score: null,
  };
}

export function createRound(
  index: number,
  secret: string,
  startedAt: number,
  mode: ScoreMode = 'continuous',
): CipherRoundState {
  return {
    index,
    secret,
    startedAt,
    endsAt: startedAt + ROUND_DURATION_MS,
    phase: 'active',
    boards: new Map(),
    mode,
  };
}

/** A board is done when it has been solved or has spent all five guesses. */
export function isBoardFinished(board: PlayerBoard): boolean {
  return board.solved || board.guesses.length >= MAX_GUESSES;
}

/**
 * True once nobody has anything left to do, which ends the round early instead
 * of making a room of 100 people watch a dead clock.
 */
export function allBoardsFinished(
  round: CipherRoundState,
  activePlayers: readonly PlayerId[],
): boolean {
  if (activePlayers.length === 0) return false;
  return activePlayers.every((id) => {
    const board = round.boards.get(id);
    return board !== undefined && isBoardFinished(board);
  });
}

export type SubmitOutcome =
  | { kind: 'rejected'; reason: EntryRejection | 'round_over' | 'board_finished'; message: string }
  | {
      kind: 'accepted';
      guessIndex: number;
      result: LetterState[];
      solved: boolean;
      board: PlayerBoard;
    };

/**
 * The order of these guards is the feature.
 *
 * Validation runs BEFORE the guess is appended, so a word that is not on the
 * allow list costs the player nothing: no row consumed, no board mutated,
 * nothing "locked in". That is a structural property of this function rather
 * than a convention the UI is trusted to honour, which is why the server can
 * safely re-run it on input the client already checked.
 */
export function submitGuess(
  round: CipherRoundState,
  playerId: PlayerId,
  raw: string,
  nowMs: number,
): SubmitOutcome {
  if (round.phase !== 'active' || nowMs > round.endsAt) {
    return { kind: 'rejected', reason: 'round_over', message: 'This round is over' };
  }

  const board = round.boards.get(playerId);
  if (board === undefined) {
    return { kind: 'rejected', reason: 'round_over', message: 'You are not in this round' };
  }
  if (isBoardFinished(board)) {
    return { kind: 'rejected', reason: 'board_finished', message: 'You are out of guesses' };
  }

  const entry = validateEntry(raw);
  if (!entry.ok) {
    return { kind: 'rejected', reason: entry.reason, message: entry.message };
  }

  const result = evaluateGuess(round.secret, entry.word);
  board.guesses.push(entry.word);
  board.results.push(result);

  if (isWinningResult(result)) {
    board.solved = true;
    board.solvedElapsedMs = Math.max(0, nowMs - round.startedAt);
    board.score = scoreRound({
      solved: true,
      elapsedMs: board.solvedElapsedMs,
      guessCount: board.guesses.length,
      mode: round.mode,
    });
  }

  return {
    kind: 'accepted',
    guessIndex: board.guesses.length - 1,
    result,
    solved: board.solved,
    board,
  };
}

/**
 * Freeze the round and turn every board into a RoundScore. Anyone who did not
 * solve scores zero — there is no partial credit for near misses.
 */
export function resolveRound(round: CipherRoundState): RoundScore[] {
  round.phase = 'resolved';

  const scores: RoundScore[] = [];
  for (const board of round.boards.values()) {
    const breakdown =
      board.score ??
      scoreRound({
        solved: false,
        elapsedMs: ROUND_DURATION_MS,
        guessCount: board.guesses.length,
        mode: round.mode,
      });
    board.score = breakdown;
    scores.push({
      playerId: board.playerId,
      roundIndex: round.index,
      points: breakdown.total,
      detail: { speed: breakdown.speed, guesses: breakdown.guesses },
    });
  }
  return scores;
}
