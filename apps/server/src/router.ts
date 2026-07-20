import { assertNever } from "@arcade/util";
import {
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
  roomId: string | null;
  role: Role | null;
}

export interface Outbound {
  target: TargetAudience;
  message: ServerBroadcastEnvelope;
}

export interface Identity {
  participantId: string;
  roomId: string;
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
    return fail("NO_SUCH_GAME", `no game registered: ${raw.gameId}`, raw.id);
  }

  const parsed = validateClient(raw);
  if (!parsed.ok) return fail("MALFORMED_MESSAGE", parsed.error, raw.id);
  const msg = parsed.msg;

  switch (msg.type) {
    case "room:create": {
      const { view, host } = store.create(msg.payload.hostName);
      return {
        identity: { participantId: host.id, roomId: view.id, role: "host" },
        outbound: [
          {
            target: "self",
            message: roomWelcome({ room: view, youId: host.id }, "self", msg.id),
          },
          { target: "all", message: roomState({ room: view }, "all") },
        ],
      };
    }
    case "room:join": {
      const result = store.join(
        msg.payload.roomId,
        msg.payload.name,
        msg.payload.asHost ?? false,
      );
      if (!result) {
        return fail("ROOM_NOT_FOUND", `no room: ${msg.payload.roomId}`, msg.id);
      }
      const { view, participant } = result;
      return {
        identity: {
          participantId: participant.id,
          roomId: view.id,
          role: participant.role,
        },
        outbound: [
          {
            target: "self",
            message: roomWelcome(
              { room: view, youId: participant.id },
              "self",
              msg.id,
            ),
          },
          { target: "all", message: roomState({ room: view }, "all") },
          { target: "host", message: roomPlayerJoined({ player: participant }, "host") },
        ],
      };
    }
    case "room:leave": {
      if (!ctx.roomId || !ctx.participantId) return { outbound: [] };
      const view = store.remove(ctx.roomId, ctx.participantId);
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
