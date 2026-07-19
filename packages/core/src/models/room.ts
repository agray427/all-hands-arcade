import { z } from "zod";
import type { ParticipantId, Participant } from "./participant.js";

const Id = z.string();

const Room = z.object({
  code: Id,
  participants: z.record(z.custom<ParticipantId>(), z.custom<Participant>()),
  createdAt: z.number(),
});

export type RoomCode = z.infer<typeof Id>;
export type Room = z.infer<typeof Room>;
