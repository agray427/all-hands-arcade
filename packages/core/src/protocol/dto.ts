import type { Id as ParticipantId, Participant } from "../models/participant.js";

export type RoomView = {
  id: string;
  participants: Record<ParticipantId, Participant>;
  createdAt: number;
};
