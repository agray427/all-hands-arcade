import type { PlayerId, RoomCode } from './ids.js';

export type Role = 'facilitator' | 'player';

export type RoomStatus =
  | 'lobby'
  | 'in_round'
  | 'round_review'
  | 'match_complete'
  | 'closed';

export interface Participant {
  id: PlayerId;
  role: Role;
  displayName: string;
  connected: boolean;
  joinedAt: number;
  /**
   * Index of the first round this participant was present for. Someone who
   * joins mid-round watches it out and starts scoring at the next one.
   */
  eligibleFromRound: number;
}

export interface RoomConfig {
  gameId: string;
  /** Round *count* is configurable; round *duration* is not (see the game's constants). */
  roundCount: number;
}

export interface RoomSnapshot {
  code: RoomCode;
  gameId: string;
  status: RoomStatus;
  config: RoomConfig;
  participants: Participant[];
  /** -1 while in the lobby. */
  currentRoundIndex: number;
}

export const MIN_ROUND_COUNT = 1;
export const MAX_ROUND_COUNT = 10;

export function clampRoundCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_ROUND_COUNT;
  return Math.min(MAX_ROUND_COUNT, Math.max(MIN_ROUND_COUNT, Math.round(value)));
}
