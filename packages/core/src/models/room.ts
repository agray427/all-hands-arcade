import type { Id as ParticipantId, Participant } from "./participant.js";

export type Id = string;

export type Room = {
  id: Id;
  participants: Record<ParticipantId, Participant>;
  createdAt: number;
};
