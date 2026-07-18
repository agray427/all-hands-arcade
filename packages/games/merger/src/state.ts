import type { ParticipantId } from "@arcade/core";

export interface MergerRules {
  negotiationTimeMs: number;
  showdownTimeMs: number;
  startingAsset: number;
}

export interface AssetEstimate {
  minEst: number;
  maxEst: number;
}

export type MergerResolution =
  | {
      kind: "deal";
      acceptedBy: ParticipantId;
      shares: Record<ParticipantId, number>;
      advancer: ParticipantId;
    }
  | { kind: "expired" };

export interface MergerPair {
  a: ParticipantId;
  b: ParticipantId;
  assetsAtPairing: Record<ParticipantId, number>;
  estimates: Record<ParticipantId, AssetEstimate>;
  offers: Record<ParticipantId, number>;
  resolution: MergerResolution | null;
}

export interface MergerState {
  rules: MergerRules;
  phase: "negotiate" | "showdown" | "ended";
  round: number;
  assets: Record<ParticipantId, number>;
  startingAssets: Record<ParticipantId, number>;
  banked: Record<ParticipantId, number>;
  exitedAt: Record<ParticipantId, number>;
  pairs: MergerPair[];
  bye: ParticipantId | null;
  deadline: number;
  offline: Record<ParticipantId, true>;
  contestants: ParticipantId[];
  names: Record<ParticipantId, string>;
}

export function activePool(state: MergerState): ParticipantId[] {
  return state.contestants.filter((id) => state.exitedAt[id] === undefined);
}

export function pairOf(state: MergerState, participantId: ParticipantId): MergerPair | null {
  return state.pairs.find((p) => p.a === participantId || p.b === participantId) ?? null;
}

export function partnerIn(pair: MergerPair, participantId: ParticipantId): ParticipantId {
  return pair.a === participantId ? pair.b : pair.a;
}

export function netDelta(state: MergerState, participantId: ParticipantId): number {
  return (state.banked[participantId] ?? 0) - (state.startingAssets[participantId] ?? 0);
}
