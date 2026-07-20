import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engineError, envelope, roomState, roomWelcome } from "@arcade/core";
import type { RoomView, ServerBroadcastEnvelope } from "@arcade/core";

type OutgoingHandler = (message: ServerBroadcastEnvelope) => void;

const stub = {
  handlers: new Map<string, OutgoingHandler>(),
  emitted: [] as Array<{ event: string; message: unknown }>,
  on(event: string, handler: OutgoingHandler) {
    this.handlers.set(event, handler);
  },
  emit(event: string, message: unknown) {
    this.emitted.push({ event, message });
  },
  receive(message: ServerBroadcastEnvelope) {
    this.handlers.get("message:outgoing")!(message);
  },
  reset() {
    this.handlers.clear();
    this.emitted = [];
  },
};

vi.mock("../src/lib/socket.js", () => ({
  getSocket: () => stub,
}));

const { ArcadeSocket } = await import("../src/lib/arcade-socket.js");

const room: RoomView = { id: "ABCD", participants: {}, createdAt: 1 };

describe("ArcadeSocket", () => {
  beforeEach(() => {
    stub.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("send emits on message:incoming", () => {
    const socket = new ArcadeSocket();
    const msg = envelope("room:leave", {});
    socket.send(msg);
    expect(stub.emitted).toEqual([{ event: "message:incoming", message: msg }]);
  });

  it("request resolves when a reply arrives with matching replyTo", async () => {
    const socket = new ArcadeSocket();
    const msg = envelope("room:create", { hostName: "Ada" });
    const pending = socket.request(msg);

    const reply = roomWelcome({ room, youId: "p_1" }, "self", msg.messageId);
    stub.receive(reply);

    await expect(pending).resolves.toBe(reply);
  });

  it("request rejects when the reply is an engine:error", async () => {
    const socket = new ArcadeSocket();
    const msg = envelope("room:join", { roomId: "ZZZZ", name: "Grace" });
    const pending = socket.request(msg);

    const reply = engineError(
      { code: "ROOM_NOT_FOUND", message: "no room: ZZZZ" },
      "self",
      msg.messageId,
    );
    stub.receive(reply);

    await expect(pending).rejects.toBe(reply);
  });

  it("request rejects after the timeout", async () => {
    const socket = new ArcadeSocket();
    const msg = envelope("room:create", { hostName: "Ada" });
    const pending = socket.request(msg, 5000);
    const assertion = expect(pending).rejects.toThrow("request timed out: room:create");

    vi.advanceTimersByTime(5001);
    await assertion;
  });

  it("ignores replies that arrive after the timeout", async () => {
    const socket = new ArcadeSocket();
    const msg = envelope("room:create", { hostName: "Ada" });
    const pending = socket.request(msg, 1000);
    const assertion = expect(pending).rejects.toThrow("request timed out");

    vi.advanceTimersByTime(1001);
    await assertion;

    expect(() =>
      stub.receive(roomWelcome({ room, youId: "p_1" }, "self", msg.messageId)),
    ).not.toThrow();
  });

  it("on dispatches typed payloads and unsubscribe stops delivery", () => {
    const socket = new ArcadeSocket();
    const seen: RoomView[] = [];
    const off = socket.on("room:state", (payload) => seen.push(payload.room));

    stub.receive(roomState({ room }, "all"));
    expect(seen).toEqual([room]);

    off();
    stub.receive(roomState({ room }, "all"));
    expect(seen).toHaveLength(1);
  });

  it("does not dispatch to listeners of other types", () => {
    const socket = new ArcadeSocket();
    const errors: string[] = [];
    socket.on("engine:error", (payload) => errors.push(payload.message));

    stub.receive(roomState({ room }, "all"));
    expect(errors).toHaveLength(0);
  });
});
