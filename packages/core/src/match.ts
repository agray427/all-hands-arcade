import type { MatchId } from './ids.js';

export type RoundPhase = 'pending' | 'active' | 'resolved';

export interface RoundWindow {
  index: number;
  /** Epoch ms, server clock. 0 while pending. */
  startedAt: number;
  endsAt: number;
  phase: RoundPhase;
}

export interface MatchSnapshot {
  matchId: MatchId;
  roundCount: number;
  currentRoundIndex: number;
  rounds: RoundWindow[];
}
