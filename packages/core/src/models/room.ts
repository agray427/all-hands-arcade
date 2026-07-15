import type { ParticipantId, RoomCode } from "./primitives.js";
import type { Participant } from "./participant.js";

export interface Room {
  code: RoomCode;
  participants: Record<ParticipantId, Participant>;
  createdAt: number;
}

export interface RoomView {
  code: RoomCode;
  participants: Record<ParticipantId, Participant>;
  createdAt: number;
}
