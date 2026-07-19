import { z } from "zod";

export const ParticipantId = z.string();
export type ParticipantId = z.infer<typeof ParticipantId>;

export const RoomCode = z.string();
export type RoomCode = z.infer<typeof RoomCode>;
