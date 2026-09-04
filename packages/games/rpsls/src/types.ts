import type { PlayerId, ScoreEntry } from '@arcade/core';
import type { Gesture, Variant } from './rules.js';

export interface RpslsConfig {
  /** How many rounds to play. */
  rounds: number;
  /** `classic` is plain Rock-Paper-Scissors; `lizard-spock` adds Lizard and Spock. */
  variant: Variant;
  /** Seconds a player has to lock in a gesture each round. */
  choiceSeconds: number;
  /** Seconds the results of a round stay on screen. */
  revealSeconds: number;
}

export type RpslsPhase = 'intro' | 'choosing' | 'reveal' | 'final';

export interface RpslsAction {
  type: 'pick';
  gesture: string;
}

/** What one player did in one round. */
export interface PlayerRoundResult {
  playerId: PlayerId;
  name: string;
  gesture: Gesture;
  /** Opponents this pick defeated - one point each. */
  beat: number;
  /** Opponents whose pick defeated this one. */
  lost: number;
  /** Opponents who threw the same gesture. */
  tied: number;
}

export interface RoundSummary {
  round: number;
  /** How many players threw each gesture. */
  tally: Array<{ gesture: Gesture; count: number }>;
  /** Everyone who submitted, best round score first. */
  results: PlayerRoundResult[];
  submitted: number;
  missed: number;
}

export interface RpslsState {
  version: number;
  config: RpslsConfig;
  phase: RpslsPhase;
  /** 1-based; 0 while the intro is on screen. */
  round: number;
  /** Epoch ms at which the current phase ends. */
  phaseEndsAt: number;
  picks: Record<PlayerId, Gesture>;
  totals: Record<PlayerId, number>;
  lastRound: RoundSummary | null;
}

export interface HostView {
  gameId: 'rpsls';
  phase: RpslsPhase;
  round: number;
  rounds: number;
  variant: Variant;
  gestures: Gesture[];
  rules: string[];
  phaseEndsAt: number;
  choiceSeconds: number;
  playerCount: number;
  submitted: number;
  lastRound: RoundSummary | null;
  /** Trimmed for readability on a projector. */
  leaderboard: ScoreEntry[];
}

export interface PlayerView {
  gameId: 'rpsls';
  phase: RpslsPhase;
  round: number;
  rounds: number;
  variant: Variant;
  gestures: Gesture[];
  rules: string[];
  phaseEndsAt: number;
  /** The gesture this player locked in for the current round, if any. */
  pick: Gesture | null;
  /** This player's line from the round that just resolved. */
  result: PlayerRoundResult | null;
  total: number;
  rank: number;
  playerCount: number;
  /** Top few players, so everyone can see who to chase. */
  leaderboard: ScoreEntry[];
}
