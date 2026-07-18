import type { ParticipantId } from "@arcade/core";

export interface TeleRules {
  chainSize: number;
  stepTimeMs: number;
}

export type Strokes = [number, number][][];

export type TeleEntry =
  | { kind: "prompt"; text: string }
  | { kind: "text"; text: string; by: ParticipantId | null }
  | { kind: "drawing"; strokes: Strokes; by: ParticipantId | null };

export interface TeleChain {
  members: ParticipantId[];
  timeline: TeleEntry[];
}

export interface TeleState {
  rules: TeleRules;
  phase: "step" | "gallery" | "ended";
  step: number;
  totalSteps: number;
  chains: TeleChain[];
  deadline: number;
  submitted: Record<ParticipantId, true>;
  offline: Record<ParticipantId, true>;
  contestants: ParticipantId[];
  names: Record<ParticipantId, string>;
}

export function expectsDrawing(step: number): boolean {
  return step % 2 === 0;
}

export function activeOf(chain: TeleChain, step: number): ParticipantId | null {
  return chain.members[step] ?? null;
}

export function chainOf(state: TeleState, participantId: ParticipantId): number {
  return state.chains.findIndex((c) => c.members.includes(participantId));
}
