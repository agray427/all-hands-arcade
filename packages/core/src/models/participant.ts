import type { ParticipantId } from "./primitives.js";
import type { Role } from "../protocol/envelope.js";

export interface Participant {
  id: ParticipantId;
  name: string;
  role: Role;
  connected: boolean;
}
