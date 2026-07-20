import { z } from "zod";
import { envelope, broadcast } from "./envelope.js";
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

const Envelope = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.number(),
  gameId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export function isEnvelopeShape(raw: unknown): raw is BaseMessage {
  return Envelope.safeParse(raw).success;
}

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
  return broadcast(type, payload, target, replyTo) as ServerBroadcastEnvelope<
    ServerMessageMap[K]
  > & { type: K };
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
  const env = Envelope.safeParse(raw);
  if (!env.success) {
    const issue = env.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    return {
      ok: false,
      error: issue ? `${path || "envelope"}: ${issue.message}` : "invalid envelope",
    };
  }
  const schema = clientSchemas[env.data.type as keyof typeof clientSchemas];
  if (!schema) return { ok: false, error: `unknown client message type: ${env.data.type}` };
  const result = schema.safeParse(env.data.payload);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue?.message ?? "invalid payload";
    const path = issue?.path.join(".") ?? "";
    return { ok: false, error: path ? `${env.data.type}.${path}: ${message}` : `${env.data.type}: ${message}` };
  }
  return { ok: true, msg: raw as ClientMessage };
}
