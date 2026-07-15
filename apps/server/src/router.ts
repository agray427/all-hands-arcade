import {
  assertNever,
  engineError,
  isEnvelopeShape,
  roomPlayerJoined,
  roomState,
  roomWelcome,
  validateClient,
  type EngineErrorCode,
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

export interface HandleResult {
  outbound: Outbound[];
  identity?: Identity;
  leave?: boolean;
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
    return fail("NO_SUCH_GAME", `no game registered: ${raw.gameId}`, raw.messageId);
  }

  const parsed = validateClient(raw);
  if (!parsed.ok) return fail("MALFORMED_MESSAGE", parsed.error, raw.messageId);
  const msg = parsed.msg;

  switch (msg.type) {
    case "room:create": {
      const { view, host } = store.create(msg.payload.hostName);
      return {
        identity: { participantId: host.id, roomCode: view.code, role: "host" },
        outbound: [
          {
            target: "self",
            message: roomWelcome({ room: view, youId: host.id }, "self", msg.messageId),
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
      const { view, participant } = result;
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
              { room: view, youId: participant.id },
              "self",
              msg.messageId,
            ),
          },
          { target: "all", message: roomState({ room: view }, "all") },
          { target: "host", message: roomPlayerJoined({ player: participant }, "host") },
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
    default:
      return assertNever(msg);
  }
}
