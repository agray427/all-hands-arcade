import { z } from "zod";
import { Id as ParticipantId, Participant } from "./participant.js";

export const Id = z.string();

export const Room = z.object({
  code: Id,
  participants: z.record(ParticipantId, Participant),
  createdAt: z.number(),
});

export type Id = z.infer<typeof Id>;
export type Room = z.infer<typeof Room>;
