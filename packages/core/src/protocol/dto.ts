import { z } from "zod";
import type { ParticipantId, Participant } from "../models/participant.js";

export const RoomView = z.object({
  code: z.string(),
  participants: z.record(z.custom<ParticipantId>(), z.custom<Participant>()),
  createdAt: z.number(),
});

export type RoomView = z.infer<typeof RoomView>;
