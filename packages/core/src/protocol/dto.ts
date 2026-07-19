import { z } from "zod";
import { ParticipantId, Participant } from "../models/participant.js";

export const RoomView = z.object({
  code: z.string(),
  participants: z.record(ParticipantId, Participant),
  createdAt: z.number(),
});

export type RoomView = z.infer<typeof RoomView>;
