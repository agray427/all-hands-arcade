import { generateId } from "../models/ids.js";

export type Role = "host" | "player" | "admin";

export type TargetAudience = "host" | "players" | "all" | (string & {});

export type EngineErrorCode =
  | "ROOM_NOT_FOUND"
  | "MALFORMED_MESSAGE"
  | "NO_SUCH_GAME"
  | "INTERNAL";

export interface BaseMessage<T = unknown> {
  messageId: string;
  type: string;
  gameId?: string;
  payload: T;
  timestamp: number;
}

export interface ServerBroadcastEnvelope<T = unknown> extends BaseMessage<T> {
  target: TargetAudience;
  replyTo?: string;
}

export interface EnvelopeOptions {
  gameId?: string;
}

export function envelope<T>(
  type: string,
  payload: T,
  options: EnvelopeOptions = {},
): BaseMessage<T> {
  return {
    messageId: generateId("m"),
    type,
    payload,
    timestamp: Date.now(),
    ...(options.gameId ? { gameId: options.gameId } : {}),
  };
}

export function isEnvelopeShape(raw: unknown): raw is BaseMessage {
  if (typeof raw !== "object" || raw === null) return false;
  const e = raw as Record<string, unknown>;
  return (
    typeof e.messageId === "string" &&
    typeof e.type === "string" &&
    typeof e.timestamp === "number" &&
    "payload" in e &&
    (e.gameId === undefined || typeof e.gameId === "string")
  );
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled message variant: ${JSON.stringify(value)}`);
}
