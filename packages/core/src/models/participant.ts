import { z } from "zod";
import { Role } from "../protocol/envelope.js";

export const ParticipantId = z.string();

export const Participant = z.object({
  id: ParticipantId,
  name: z.string(),
  role: Role,
  connected: z.boolean(),
});

export type ParticipantId = z.infer<typeof ParticipantId>;
export type Participant = z.infer<typeof Participant>;
