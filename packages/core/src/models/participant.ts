import { z } from "zod";
import { ParticipantId } from "./primitives.js";
import { Role } from "../protocol/envelope.js";

export const Participant = z.object({
  id: ParticipantId,
  name: z.string(),
  role: Role,
  connected: z.boolean(),
});

export type Participant = z.infer<typeof Participant>;
