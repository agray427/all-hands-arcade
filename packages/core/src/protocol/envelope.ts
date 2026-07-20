import { generateId } from "@arcade/util";
import type { Id as GameId } from "../models/game.js";

export type TargetAudience = "host" | "players" | "all" | (string & {});

export type EngineErrorCode =
  | "ROOM_NOT_FOUND"
  | "REJOIN_FAILED"
  | "MALFORMED_MESSAGE"
  | "NO_SUCH_GAME"
  | "NO_SUCH_VARIANT"
  | "NO_ACTIVE_GAME"
  | "GAME_ALREADY_ACTIVE"
  | "INVALID_CONFIG"
  | "NOT_ALLOWED"
  | "INTERNAL";

export type BaseMessage<T = unknown> = {
  id: string;
  type: string;
  gameId?: GameId;
  payload: T;
  timestamp: number;
};

export type ServerBroadcastEnvelope<T = unknown> = BaseMessage<T> & {
  target: TargetAudience;
  replyTo?: string;
};

export type EnvelopeOptions = {
  gameId?: GameId;
};

export function envelope<T>(
  type: string,
  payload: T,
  options: EnvelopeOptions = {},
): BaseMessage<T> {
  return {
    id: generateId("m"),
    type,
    payload,
    timestamp: Date.now(),
    ...(options.gameId ? { gameId: options.gameId } : {}),
  };
}

export function broadcast<T>(
  type: string,
  payload: T,
  target: TargetAudience,
  replyTo?: string,
  options: EnvelopeOptions = {},
): ServerBroadcastEnvelope<T> {
  return {
    ...envelope(type, payload, options),
    target,
    ...(replyTo ? { replyTo } : {}),
  };
}
