import type { ParticipantId } from "@arcade/core";

export interface HiveRules {
  answerTimeMs: number;
  revealTimeMs: number;
  surviveTop: number;
  endBelow: number;
  rounds: number;
}

export interface HiveTallyEntry {
  answer: string;
  count: number;
  surviving: boolean;
}

export interface HiveState {
  rules: HiveRules;
  phase: "prompt" | "reveal" | "ended";
  round: number;
  prompts: string[];
  deadline: number;
  answers: Record<ParticipantId, string>;
  normalized: Record<ParticipantId, string>;
  tally: HiveTallyEntry[];
  eliminatedAt: Record<ParticipantId, number>;
  offline: Record<ParticipantId, true>;
  contestants: ParticipantId[];
  names: Record<ParticipantId, string>;
}

export function aliveContestants(state: HiveState): ParticipantId[] {
  return state.contestants.filter((id) => state.eliminatedAt[id] === undefined);
}
