import type { ParticipantId } from "@arcade/core";

export type JuryRole = "juror" | "saboteur";

export interface JuryRules {
  clueTimeMs: number;
  voteTimeMs: number;
  revealTimeMs: number;
  saboteurs: number;
  eliminationsPerRound: number;
  roundsToWin: number;
}

export interface JuryWord {
  word: string;
  category: string;
}

export interface JuryState {
  rules: JuryRules;
  phase: "clue" | "vote" | "reveal" | "ended";
  round: number;
  words: JuryWord[];
  deadline: number;
  roles: Record<ParticipantId, JuryRole>;
  clues: Record<ParticipantId, string>;
  votes: Record<ParticipantId, ParticipantId>;
  lastEliminated: { participantId: ParticipantId; role: JuryRole }[];
  eliminatedAt: Record<ParticipantId, number>;
  offline: Record<ParticipantId, true>;
  contestants: ParticipantId[];
  names: Record<ParticipantId, string>;
  winner: "jurors" | "saboteurs" | null;
}

export function aliveContestants(state: JuryState): ParticipantId[] {
  return state.contestants.filter((id) => state.eliminatedAt[id] === undefined);
}

export function aliveByRole(state: JuryState, role: JuryRole): ParticipantId[] {
  return aliveContestants(state).filter((id) => state.roles[id] === role);
}
