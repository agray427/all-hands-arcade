import type { ParticipantId } from "@arcade/core";

export type SosChoice = "split" | "steal";
export type SosOutcome = "double-split" | "split-steal" | "double-steal";

export interface SosRules {
  decisionTimeMs: number;
  startingPot: number;
}

export interface SosPair {
  a: ParticipantId;
  b: ParticipantId;
  pot: number;
  choices: Record<ParticipantId, SosChoice>;
  outcome: SosOutcome | null;
}

export interface SosState {
  rules: SosRules;
  phase: "pairing" | "decide" | "reveal" | "ended";
  round: number;
  pairs: SosPair[];
  bye: ParticipantId | null;
  stakes: Record<ParticipantId, number>;
  banked: Record<ParticipantId, number>;
  eliminatedAt: Record<ParticipantId, number>;
  deadline: number;
  offline: Record<ParticipantId, true>;
  contestants: ParticipantId[];
  names: Record<ParticipantId, string>;
}

export function poolOf(state: SosState): ParticipantId[] {
  return state.contestants.filter((id) => state.eliminatedAt[id] === undefined);
}

export function pairOf(state: SosState, participantId: ParticipantId): SosPair | null {
  return state.pairs.find((p) => p.a === participantId || p.b === participantId) ?? null;
}

export function partnerIn(pair: SosPair, participantId: ParticipantId): ParticipantId {
  return pair.a === participantId ? pair.b : pair.a;
}
