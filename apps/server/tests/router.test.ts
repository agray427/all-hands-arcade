import { describe, expect, it } from "vitest";
import {
  envelope,
  gameEnd,
  gameList,
  gameStart,
  roomCreate,
  roomJoin,
  roomLeave,
  roomRejoin,
} from "@arcade/core";
import type {
  EngineErrorPayload,
  RoomWelcomePayload,
  ServerBroadcastEnvelope,
} from "@arcade/core";
import { RoomStore } from "../src/rooms.js";
import { handle, type ConnectionContext } from "../src/router.js";

function emptyCtx(): ConnectionContext {
  return { participantId: null, roomCode: null, role: null };
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
    expect(result.identity!.roomCode).toHaveLength(4);

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
    const msg = roomJoin({ roomCode: view.code, name: "Grace" });
    const result = handle(store, emptyCtx(), msg);

    expect(result.identity!.role).toBe("player");
    expect(result.identity!.roomCode).toBe(view.code);

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
      roomJoin({ roomCode: view.code, name: "Grace", asHost: true }),
    );
    expect(result.identity!.role).toBe("host");
  });

  it("fails with ROOM_NOT_FOUND for an unknown code", () => {
    const store = new RoomStore();
    const msg = roomJoin({ roomCode: "ZZZZ", name: "Grace" });
    const result = handle(store, emptyCtx(), msg);

    expect(result.identity).toBeUndefined();
    expect(result.outbound).toHaveLength(1);
    const out = result.outbound[0]!;
    expect(out.target).toBe("self");
    expect(errorPayload(out.message).code).toBe("ROOM_NOT_FOUND");
    expect(out.message.replyTo).toBe(msg.messageId);
  });
});

describe("handle room:rejoin", () => {
  it("reclaims the identity, replays the welcome, and flags the resume", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const joinResult = handle(store, emptyCtx(), roomJoin({ roomCode: view.code, name: "Grace" }));
    const welcome = joinResult.outbound[0]!.message.payload as RoomWelcomePayload;
    store.setConnected(view.code, welcome.youId, false);

    const msg = roomRejoin({
      roomCode: view.code,
      participantId: welcome.youId,
      resumeToken: welcome.resumeToken,
    });
    const result = handle(store, emptyCtx(), msg);

    expect(result.resumed).toBe(true);
    expect(result.identity).toEqual({
      participantId: welcome.youId,
      roomCode: view.code,
      role: "player",
    });
    expect(result.outbound.map((o) => [o.target, o.message.type])).toEqual([
      ["self", "room:welcome"],
      ["all", "room:state"],
    ]);
    const replayed = result.outbound[0]!.message.payload as RoomWelcomePayload;
    expect(replayed.youId).toBe(welcome.youId);
    expect(replayed.resumeToken).toBe(welcome.resumeToken);
    expect(replayed.room.participants[welcome.youId]!.connected).toBe(true);
    expect(result.outbound[0]!.message.replyTo).toBe(msg.messageId);
  });

  it("fails with REJOIN_FAILED on a bad token", () => {
    const store = new RoomStore();
    const { view, host } = store.create("Ada");
    const msg = roomRejoin({
      roomCode: view.code,
      participantId: host.id,
      resumeToken: "t_forged",
    });
    const result = handle(store, emptyCtx(), msg);

    expect(result.identity).toBeUndefined();
    expect(result.resumed).toBeUndefined();
    expect(errorPayload(result.outbound[0]!.message).code).toBe("REJOIN_FAILED");
    expect(result.outbound[0]!.message.replyTo).toBe(msg.messageId);
  });
});

describe("handle room:leave", () => {
  it("removes the participant and broadcasts the new roster", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const { participant } = store.join(view.code, "Grace", false)!;
    const ctx: ConnectionContext = {
      participantId: participant.id,
      roomCode: view.code,
      role: "player",
    };

    const result = handle(store, ctx, roomLeave());

    expect(result.leave).toBe(true);
    expect(result.outbound).toHaveLength(1);
    expect(result.outbound[0]!.target).toBe("all");
    expect(result.outbound[0]!.message.type).toBe("room:state");
    expect(store.get(view.code)!.participants[participant.id]).toBeUndefined();
  });

  it("is a no-op when the connection has no room", () => {
    const store = new RoomStore();
    const result = handle(store, emptyCtx(), roomLeave());
    expect(result.outbound).toHaveLength(0);
    expect(result.leave).toBeUndefined();
  });
});

describe("handle game routing", () => {
  it("routes gameId envelopes to a game-message action without touching rooms", () => {
    const store = new RoomStore();
    const msg = envelope("answer:submit", { choice: 1 }, { gameId: "trivia" });
    const result = handle(store, emptyCtx(), msg);
    expect(result.outbound).toEqual([]);
    expect(result.gameAction).toEqual({ kind: "game-message", msg });
  });

  it("routes engine game messages to typed actions", () => {
    const store = new RoomStore();
    const list = gameList();
    expect(handle(store, emptyCtx(), list).gameAction).toEqual({ kind: "list", msg: list });

    const start = gameStart({ gameId: "trivia", variantId: "survival" });
    expect(handle(store, emptyCtx(), start).gameAction).toEqual({ kind: "start", msg: start });

    const end = gameEnd();
    expect(handle(store, emptyCtx(), end).gameAction).toEqual({ kind: "end", msg: end });
  });

  it("still validates game:start payloads", () => {
    const store = new RoomStore();
    const msg = { ...gameStart({ gameId: "trivia" }), payload: { gameId: 7 } };
    const result = handle(store, emptyCtx(), msg);
    expect(result.gameAction).toBeUndefined();
    expect(errorPayload(result.outbound[0]!.message).code).toBe("MALFORMED_MESSAGE");
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

  it("rejects unknown message types", () => {
    const store = new RoomStore();
    const msg = envelope("room:explode", {});
    const result = handle(store, emptyCtx(), msg);
    expect(errorPayload(result.outbound[0]!.message).code).toBe("MALFORMED_MESSAGE");
  });
});
