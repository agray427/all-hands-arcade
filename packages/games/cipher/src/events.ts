import type {
  Ack,
  ArcadeClientToServer,
  ArcadeServerToClient,
  PlayerId,
} from '@arcade/core';

import type { PublicBoard, SelfBoard } from './redact.js';

export interface GuessAccepted {
  guessIndex: number;
  result: import('./evaluate.js').LetterState[];
  solved: boolean;
  points: number | null;
}

export interface CipherClientToServer {
  'cipher:guess': (req: { guess: string }, ack: Ack<GuessAccepted>) => void;
  /** Facilitator only. Validated against the same allow list as a guess. */
  'cipher:setSecret': (req: { word: string }, ack: Ack<{ word: string }>) => void;
  /** Facilitator only. Draws from the common-word subset of the allow list. */
  'cipher:randomSecret': (ack: Ack<{ word: string }>) => void;
}

export interface CipherServerToClient {
  /** Private, to one socket: your own board, with letters. Sent on resume. */
  'cipher:board': (board: SelfBoard) => void;
  /** Facilitators only, batched: everyone's colours, nobody's letters. */
  'cipher:progress': (boards: PublicBoard[]) => void;
  /** Players learn that a word exists, never what it is. */
  'cipher:secretReady': (payload: { hasSecret: boolean }) => void;
  /** The only time the secret reaches a player: after the round is resolved. */
  'cipher:reveal': (payload: { index: number; secret: string; solvedBy: PlayerId[] }) => void;
}

/**
 * The composed contract. Server and client both import these aliases, so an
 * event added on one side cannot silently go missing on the other.
 */
export type CipherC2S = ArcadeClientToServer & CipherClientToServer;
export type CipherS2C = ArcadeServerToClient & CipherServerToClient;

/** Shape of `SessionResult.gameState` for this game. */
export interface CipherSessionState {
  board: SelfBoard | null;
  hasSecret: boolean;
  /** Facilitator only; undefined for players. */
  secret?: string;
  progress?: PublicBoard[];
}
