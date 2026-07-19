import { z } from "zod";

export const ParticipantId = z.string();

export const Role = z.enum(["host", "player", "admin"]);

export const Participant = z.object({
  id: ParticipantId,
  name: z.string(),
  role: Role,
  connected: z.boolean(),
});

export type ParticipantId = z.infer<typeof ParticipantId>;
export type Role = z.infer<typeof Role>;
export type Participant = z.infer<typeof Participant>;
