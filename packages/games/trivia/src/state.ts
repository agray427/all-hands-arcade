import type { ParticipantId } from "@arcade/core";

export type TriviaVariantId = "classic" | "survival";
export type TriviaPhase = "question" | "reveal" | "ended";
export type AnswerOutcome = "correct" | "wrong" | "timeout";

export interface TriviaRules {
  variant: TriviaVariantId;
  deckId: string;
  rounds: number;
  questionTimeMs: number;
  revealTimeMs: number;
  startTimeMs: number;
  stepMs: number;
  minTimeMs: number;
}

export interface TriviaState {
  rules: TriviaRules;
  phase: TriviaPhase;
  round: number;
  order: number[];
  deadline: number;
  answers: Record<ParticipantId, { choice: number; at: number }>;
  outcomes: Record<ParticipantId, AnswerOutcome>;
  scores: Record<ParticipantId, number>;
  eliminatedAt: Record<ParticipantId, number>;
  contestants: ParticipantId[];
  names: Record<ParticipantId, string>;
}

export function questionTimeFor(rules: TriviaRules, round: number): number {
  if (rules.variant === "classic") return rules.questionTimeMs;
  return Math.max(rules.minTimeMs, rules.startTimeMs - (round - 1) * rules.stepMs);
}

export function aliveContestants(state: TriviaState): ParticipantId[] {
  return state.contestants.filter((id) => state.eliminatedAt[id] === undefined);
}
