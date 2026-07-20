import { describe, expect, it } from "vitest";
import { envelope, roomCreate, roomJoin, roomLeave } from "@arcade/core";
import type { EngineErrorPayload, ServerBroadcastEnvelope } from "@arcade/core";
import { RoomStore } from "../src/rooms.js";
import { handle, type ConnectionContext } from "../src/router.js";

function emptyCtx(): ConnectionContext {
  return { participantId: null, roomId: null, role: null };
}

function errorPayload(message: ServerBroadcastEnvelope): EngineErrorPayload {
  expect(message.type).toBe("engine:error");
  return message.payload as EngineErrorPayload;
}

describe("handle room:create", () => {
  it("returns host identity, a correlated welcome, and a room broadcast", () => {
    const store = new RoomStore();
    const msg = roomCreate({ hostName: "Ada" });
    const result = handle(store, emptyCtx(), msg);

    expect(result.identity).toBeDefined();
    expect(result.identity!.role).toBe("host");
    expect(result.identity!.roomId).toHaveLength(4);

    expect(result.outbound).toHaveLength(2);
    const [welcome, state] = result.outbound;
    expect(welcome!.target).toBe("self");
    expect(welcome!.message.type).toBe("room:welcome");
    expect(welcome!.message.replyTo).toBe(msg.messageId);
    expect(state!.target).toBe("all");
    expect(state!.message.type).toBe("room:state");
  });
});

describe("handle room:join", () => {
  it("returns player identity, welcome, state, and a host-only notification", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const msg = roomJoin({ roomId: view.id, name: "Grace" });
    const result = handle(store, emptyCtx(), msg);

    expect(result.identity!.role).toBe("player");
    expect(result.identity!.roomId).toBe(view.id);

    expect(result.outbound.map((o) => [o.target, o.message.type])).toEqual([
      ["self", "room:welcome"],
      ["all", "room:state"],
      ["host", "room:player_joined"],
    ]);
    expect(result.outbound[0]!.message.replyTo).toBe(msg.messageId);
  });

  it("honors asHost", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const result = handle(
      store,
      emptyCtx(),
      roomJoin({ roomId: view.id, name: "Grace", asHost: true }),
    );
    expect(result.identity!.role).toBe("host");
  });

  it("fails with ROOM_NOT_FOUND for an unknown code", () => {
    const store = new RoomStore();
    const msg = roomJoin({ roomId: "ZZZZ", name: "Grace" });
    const result = handle(store, emptyCtx(), msg);

    expect(result.identity).toBeUndefined();
    expect(result.outbound).toHaveLength(1);
    const out = result.outbound[0]!;
    expect(out.target).toBe("self");
    expect(errorPayload(out.message).code).toBe("ROOM_NOT_FOUND");
    expect(out.message.replyTo).toBe(msg.messageId);
  });
});

describe("handle room:leave", () => {
  it("removes the participant and broadcasts the new roster", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const { participant } = store.join(view.id, "Grace", false)!;
    const ctx: ConnectionContext = {
      participantId: participant.id,
      roomId: view.id,
      role: "player",
    };

    const result = handle(store, ctx, roomLeave());

    expect(result.leave).toBe(true);
    expect(result.outbound).toHaveLength(1);
    expect(result.outbound[0]!.target).toBe("all");
    expect(result.outbound[0]!.message.type).toBe("room:state");
    expect(store.get(view.id)!.participants[participant.id]).toBeUndefined();
  });

  it("is a no-op when the connection has no room", () => {
    const store = new RoomStore();
    const result = handle(store, emptyCtx(), roomLeave());
    expect(result.outbound).toHaveLength(0);
    expect(result.leave).toBeUndefined();
  });
});

describe("handle errors", () => {
  it("rejects a malformed envelope", () => {
    const store = new RoomStore();
    const result = handle(store, emptyCtx(), { nope: true });
    expect(errorPayload(result.outbound[0]!.message).code).toBe("MALFORMED_MESSAGE");
  });

  it("rejects an invalid payload with the validator error", () => {
    const store = new RoomStore();
    const msg = { ...roomCreate({ hostName: "Ada" }), payload: {} };
    const result = handle(store, emptyCtx(), msg);
    const payload = errorPayload(result.outbound[0]!.message);
    expect(payload.code).toBe("MALFORMED_MESSAGE");
    expect(payload.message).toContain("hostName");
    expect(result.outbound[0]!.message.replyTo).toBe(msg.messageId);
  });

  it("rejects unknown game messages with NO_SUCH_GAME", () => {
    const store = new RoomStore();
    const msg = envelope("guess:submit", { value: 1 }, { gameId: "trivia" });
    const result = handle(store, emptyCtx(), msg);
    const payload = errorPayload(result.outbound[0]!.message);
    expect(payload.code).toBe("NO_SUCH_GAME");
    expect(payload.message).toContain("trivia");
    expect(result.outbound[0]!.message.replyTo).toBe(msg.messageId);
  });

  it("rejects unknown message types", () => {
    const store = new RoomStore();
    const msg = envelope("room:explode", {});
    const result = handle(store, emptyCtx(), msg);
    expect(errorPayload(result.outbound[0]!.message).code).toBe("MALFORMED_MESSAGE");
  });
});
