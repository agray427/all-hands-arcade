import { z } from "zod";

const Id = z.string();

export const Role = z.enum(["host", "player", "admin"]);

export const Participant = z.object({
  id: Id,
  name: z.string(),
  role: Role,
  connected: z.boolean(),
});

export { Id as ParticipantId };

export type ParticipantId = z.infer<typeof Id>;
export type Role = z.infer<typeof Role>;
export type Participant = z.infer<typeof Participant>;
