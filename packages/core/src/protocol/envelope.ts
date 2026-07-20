import { generateId } from "@arcade/util";

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
  messageId: string;
  type: string;
  gameId?: string;
  payload: T;
  timestamp: number;
};

export type ServerBroadcastEnvelope<T = unknown> = BaseMessage<T> & {
  target: TargetAudience;
  replyTo?: string;
};

export type EnvelopeOptions = {
  gameId?: string;
};

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
