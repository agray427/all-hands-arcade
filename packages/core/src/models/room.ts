import { z } from "zod";
import { ParticipantId, RoomCode } from "./primitives.js";
import { Participant } from "./participant.js";

export const Room = z.object({
  code: RoomCode,
  participants: z.record(ParticipantId, Participant),
  createdAt: z.number(),
});

export const RoomView = z.object({
  code: RoomCode,
  participants: z.record(ParticipantId, Participant),
  createdAt: z.number(),
});

export type Room = z.infer<typeof Room>;
export type RoomView = z.infer<typeof RoomView>;
