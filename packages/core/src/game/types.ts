import type { Participant } from "../models/participant.js";
import type { ParticipantId } from "../models/primitives.js";
import type { Role } from "../protocol/envelope.js";
import type { PayloadFields } from "../protocol/fields.js";

export type GameConfig = Record<string, unknown>;
export type GameView = unknown;
export type GameAudience = "host" | "player";

export interface ConfigFieldOption {
  value: string;
  label: string;
  description?: string;
}

export interface ConfigField {
  type: "number" | "string" | "boolean";
  label: string;
  default?: string | number | boolean;
  min?: number;
  options?: ConfigFieldOption[];
  multiline?: boolean;
  when?: { field: string; equals: string | number | boolean };
}

export type GameEvent =
  | {
      kind: "message";
      type: string;
      payload: unknown;
      from: ParticipantId;
      role: Role;
      messageId: string;
    }
  | { kind: "timer"; id: string }
  | { kind: "presence"; participantId: ParticipantId; connected: boolean };

export type GameEffect =
  | { kind: "schedule"; id: string; delayMs: number }
  | { kind: "cancel"; id: string }
  | { kind: "end" };

export interface ReduceResult<S> {
  state: S;
  effects?: GameEffect[];
}

export interface GameContext {
  players: Participant[];
  now(): number;
  random(): number;
}

export interface VariantDefinition {
  name: string;
  description: string;
  configFields: Record<string, ConfigField>;
  hostDriven?: boolean;
  validateConfig?(config: GameConfig): string | null;
}

export interface GameDefinition<S = unknown> {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  variants: Record<string, VariantDefinition>;
  defaultVariant: string;
  messages: Record<string, PayloadFields>;
  setup(variantId: string, config: GameConfig, ctx: GameContext): ReduceResult<S>;
  reduce(state: S, event: GameEvent, ctx: GameContext): ReduceResult<S>;
  view(state: S, audience: GameAudience): GameView;
  playerView?(state: S, participantId: ParticipantId): GameView;
  results(state: S): GameResults;
}

export type AnyGameDefinition = GameDefinition<any>;

export interface LeaderboardEntry {
  participantId: ParticipantId;
  name: string;
  rank: number;
  score: number;
  detail?: string;
}

export type GameResults = LeaderboardEntry[];

export interface GameCatalogVariant {
  id: string;
  name: string;
  description: string;
  configFields: Record<string, ConfigField>;
  hostDriven: boolean;
}

export interface GameCatalogEntry {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  defaultVariant: string;
  variants: GameCatalogVariant[];
}

export type GameCatalog = GameCatalogEntry[];
