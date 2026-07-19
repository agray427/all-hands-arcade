import { z } from "zod";
import { ParticipantId, Participant } from "./participant.js";

export const RoomCode = z.string();

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

export type RoomCode = z.infer<typeof RoomCode>;
export type Room = z.infer<typeof Room>;
export type RoomView = z.infer<typeof RoomView>;
