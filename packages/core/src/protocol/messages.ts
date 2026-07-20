import { z } from "zod";
import { envelope } from "./envelope.js";
import type {
  BaseMessage,
  ServerBroadcastEnvelope,
  TargetAudience,
  EngineErrorCode,
} from "./envelope.js";
import type { Participant } from "../models/participant.js";
import type { RoomView } from "./dto.js";

export const RoomCreatePayload = z.object({ hostName: z.string() });
export type RoomCreatePayload = z.infer<typeof RoomCreatePayload>;

export const RoomJoinPayload = z.object({
  roomId: z.string(),
  name: z.string(),
  asHost: z.boolean().optional(),
});
export type RoomJoinPayload = z.infer<typeof RoomJoinPayload>;

export const RoomLeavePayload = z.object({});
export type RoomLeavePayload = z.infer<typeof RoomLeavePayload>;

export type RoomWelcomePayload = { room: RoomView; youId: string };
export type RoomStatePayload = { room: RoomView };
export type RoomPlayerJoinedPayload = { player: Participant };
export type EngineErrorPayload = { code: EngineErrorCode; message: string };

const clientSchemas = {
  "room:create": RoomCreatePayload,
  "room:join": RoomJoinPayload,
  "room:leave": RoomLeavePayload,
} as const;

export type ClientMessageMap = {
  [K in keyof typeof clientSchemas]: z.infer<(typeof clientSchemas)[K]>;
};

export type ServerMessageMap = {
  "room:welcome": RoomWelcomePayload;
  "room:state": RoomStatePayload;
  "room:player_joined": RoomPlayerJoinedPayload;
  "engine:error": EngineErrorPayload;
};

export type ClientMessage = {
  [K in keyof ClientMessageMap]: BaseMessage<ClientMessageMap[K]> & { type: K };
}[keyof ClientMessageMap];

export type ServerMessage = {
  [K in keyof ServerMessageMap]: ServerBroadcastEnvelope<ServerMessageMap[K]> & { type: K };
}[keyof ServerMessageMap];

function client<K extends keyof ClientMessageMap>(
  type: K,
  payload: ClientMessageMap[K],
): BaseMessage<ClientMessageMap[K]> & { type: K } {
  return envelope(type, payload) as BaseMessage<ClientMessageMap[K]> & { type: K };
}

function server<K extends keyof ServerMessageMap>(
  type: K,
  payload: ServerMessageMap[K],
  target: TargetAudience,
  replyTo?: string,
): ServerBroadcastEnvelope<ServerMessageMap[K]> & { type: K } {
  return {
    ...envelope(type, payload),
    target,
    ...(replyTo ? { replyTo } : {}),
  } as ServerBroadcastEnvelope<ServerMessageMap[K]> & { type: K };
}

export const roomCreate = (payload: RoomCreatePayload) => client("room:create", payload);
export const roomJoin = (payload: RoomJoinPayload) => client("room:join", payload);
export const roomLeave = (payload: RoomLeavePayload = {}) => client("room:leave", payload);

export const roomWelcome = (payload: RoomWelcomePayload, target: TargetAudience, replyTo?: string) =>
  server("room:welcome", payload, target, replyTo);
export const roomState = (payload: RoomStatePayload, target: TargetAudience, replyTo?: string) =>
  server("room:state", payload, target, replyTo);
export const roomPlayerJoined = (
  payload: RoomPlayerJoinedPayload,
  target: TargetAudience,
  replyTo?: string,
) => server("room:player_joined", payload, target, replyTo);
export const engineError = (payload: EngineErrorPayload, target: TargetAudience, replyTo?: string) =>
  server("engine:error", payload, target, replyTo);

export function validateClient(
  raw: unknown,
): { ok: true; msg: ClientMessage } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "envelope is not an object" };
  const env = raw as Record<string, unknown>;
  if (typeof env.type !== "string") return { ok: false, error: "missing type" };
  if (typeof env.messageId !== "string") return { ok: false, error: "missing messageId" };
  if (typeof env.timestamp !== "number") return { ok: false, error: "missing timestamp" };
  if (typeof env.payload !== "object" || env.payload === null) return { ok: false, error: "missing payload" };
  const schema = clientSchemas[env.type as keyof typeof clientSchemas];
  if (!schema) return { ok: false, error: `unknown client message type: ${env.type}` };
  const result = schema.safeParse(env.payload);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue?.message ?? "invalid payload";
    const path = issue?.path.join(".") ?? "";
    return { ok: false, error: path ? `${env.type}.${path}: ${message}` : `${env.type}: ${message}` };
  }
  return { ok: true, msg: raw as ClientMessage };
}
