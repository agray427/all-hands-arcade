import { z } from "zod";
import { ParticipantId, Participant } from "./participant.js";

const Id = z.string();

export const Room = z.object({
  code: Id,
  participants: z.record(ParticipantId, Participant),
  createdAt: z.number(),
});

export { Id as RoomCode };

export type RoomCode = z.infer<typeof Id>;
export type Room = z.infer<typeof Room>;
