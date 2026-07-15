import {
  assertNever,
  engineError,
  isEnvelopeShape,
  roomPlayerJoined,
  roomState,
  roomWelcome,
  validateClient,
  type BaseMessage,
  type EngineErrorCode,
  type GameEndPayload,
  type GameListPayload,
  type GameStartPayload,
  type Role,
  type ServerBroadcastEnvelope,
  type TargetAudience,
} from "@arcade/core";
import type { RoomStore } from "./rooms.js";

export interface ConnectionContext {
  participantId: string | null;
  roomCode: string | null;
  role: Role | null;
}

export interface Outbound {
  target: TargetAudience;
  message: ServerBroadcastEnvelope;
}

export interface Identity {
  participantId: string;
  roomCode: string;
  role: Role;
}

export type GameAction =
  | { kind: "game-message"; msg: BaseMessage }
  | { kind: "list"; msg: BaseMessage<GameListPayload> }
  | { kind: "start"; msg: BaseMessage<GameStartPayload> }
  | { kind: "end"; msg: BaseMessage<GameEndPayload> };

export interface HandleResult {
  outbound: Outbound[];
  identity?: Identity;
  leave?: boolean;
  resumed?: boolean;
  gameAction?: GameAction;
}

function fail(
  code: EngineErrorCode,
  message: string,
  replyTo?: string,
): HandleResult {
  return {
    outbound: [
      { target: "self", message: engineError({ code, message }, "self", replyTo) },
    ],
  };
}

export function handle(
  store: RoomStore,
  ctx: ConnectionContext,
  raw: unknown,
): HandleResult {
  if (!isEnvelopeShape(raw)) return fail("MALFORMED_MESSAGE", "invalid envelope");
  if (raw.gameId) {
    return { outbound: [], gameAction: { kind: "game-message", msg: raw } };
  }

  const parsed = validateClient(raw);
  if (!parsed.ok) return fail("MALFORMED_MESSAGE", parsed.error, raw.messageId);
  const msg = parsed.msg;

  switch (msg.type) {
    case "room:create": {
      const { view, host, resumeToken } = store.create(msg.payload.hostName);
      return {
        identity: { participantId: host.id, roomCode: view.code, role: "host" },
        outbound: [
          {
            target: "self",
            message: roomWelcome(
              { room: view, youId: host.id, resumeToken },
              "self",
              msg.messageId,
            ),
          },
          { target: "all", message: roomState({ room: view }, "all") },
        ],
      };
    }
    case "room:join": {
      const result = store.join(
        msg.payload.roomCode,
        msg.payload.name,
        msg.payload.asHost ?? false,
      );
      if (!result) {
        return fail("ROOM_NOT_FOUND", `no room: ${msg.payload.roomCode}`, msg.messageId);
      }
      const { view, participant, resumeToken } = result;
      return {
        identity: {
          participantId: participant.id,
          roomCode: view.code,
          role: participant.role,
        },
        outbound: [
          {
            target: "self",
            message: roomWelcome(
              { room: view, youId: participant.id, resumeToken },
              "self",
              msg.messageId,
            ),
          },
          { target: "all", message: roomState({ room: view }, "all") },
          { target: "host", message: roomPlayerJoined({ player: participant }, "host") },
        ],
      };
    }
    case "room:rejoin": {
      const result = store.rejoin(
        msg.payload.roomCode,
        msg.payload.participantId,
        msg.payload.resumeToken,
      );
      if (!result) {
        return fail("REJOIN_FAILED", "unknown room, participant, or token", msg.messageId);
      }
      const { view, participant, resumeToken } = result;
      return {
        resumed: true,
        identity: {
          participantId: participant.id,
          roomCode: view.code,
          role: participant.role,
        },
        outbound: [
          {
            target: "self",
            message: roomWelcome(
              { room: view, youId: participant.id, resumeToken },
              "self",
              msg.messageId,
            ),
          },
          { target: "all", message: roomState({ room: view }, "all") },
        ],
      };
    }
    case "room:leave": {
      if (!ctx.roomCode || !ctx.participantId) return { outbound: [] };
      const view = store.remove(ctx.roomCode, ctx.participantId);
      return {
        leave: true,
        outbound: view
          ? [{ target: "all", message: roomState({ room: view }, "all") }]
          : [],
      };
    }
    case "game:list":
      return { outbound: [], gameAction: { kind: "list", msg } };
    case "game:start":
      return { outbound: [], gameAction: { kind: "start", msg } };
    case "game:end":
      return { outbound: [], gameAction: { kind: "end", msg } };
    default:
      return assertNever(msg);
  }
}
