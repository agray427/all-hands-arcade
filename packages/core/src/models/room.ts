import { z } from "zod";
import { ParticipantId, Participant } from "./participant.js";

const Code = z.string();

export const Room = z.object({
  code: Code,
  participants: z.record(ParticipantId, Participant),
  createdAt: z.number(),
});

export const RoomView = z.object({
  code: Code,
  participants: z.record(ParticipantId, Participant),
  createdAt: z.number(),
});

export { Code as RoomCode };

export type RoomCode = z.infer<typeof Code>;
export type Room = z.infer<typeof Room>;
export type RoomView = z.infer<typeof RoomView>;
