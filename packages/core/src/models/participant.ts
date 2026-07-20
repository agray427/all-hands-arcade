export type Id = string;

export type Role = "host" | "player" | "admin";

export type Participant = {
  id: Id;
  name: string;
  role: Role;
  connected: boolean;
};
