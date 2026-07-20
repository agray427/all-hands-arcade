import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as connectClient, type Socket } from "socket.io-client";
import {
  roomCreate,
  roomJoin,
  roomLeave,
  type EngineErrorPayload,
  type RoomPlayerJoinedPayload,
  type RoomStatePayload,
  type RoomWelcomePayload,
  type ServerBroadcastEnvelope,
} from "@arcade/core";
import { createArcadeServer, type ArcadeServer } from "../src/server.js";

type Predicate = (message: ServerBroadcastEnvelope) => boolean;

class Inbox {
  readonly messages: ServerBroadcastEnvelope[] = [];
  private waiters: Array<{
    predicate: Predicate;
    resolve: (message: ServerBroadcastEnvelope) => void;
  }> = [];

  constructor(readonly socket: Socket) {
    socket.on("message:outgoing", (message: ServerBroadcastEnvelope) => {
      this.messages.push(message);
      const index = this.waiters.findIndex((w) => w.predicate(message));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        waiter!.resolve(message);
      }
    });
  }

  waitFor(predicate: Predicate, timeoutMs = 2000): Promise<ServerBroadcastEnvelope> {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("timed out waiting for message"));
      }, timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
    });
  }

  ofType(type: string): ServerBroadcastEnvelope[] {
    return this.messages.filter((m) => m.type === type);
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("arcade server integration", () => {
  let server: ArcadeServer;
  let sockets: Socket[];

  beforeEach(async () => {
    server = await createArcadeServer({ port: 0, clientOrigin: "*" });
    sockets = [];
  });

  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    await server.close();
  });

  async function connect(): Promise<Inbox> {
    const socket = connectClient(`http://localhost:${server.port}`, {
      transports: ["websocket"],
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
    return new Inbox(socket);
  }

  async function createRoom(host: Inbox, hostName = "Ada"): Promise<RoomWelcomePayload> {
    const msg = roomCreate({ hostName });
    host.socket.emit("message:incoming", msg);
    const welcome = await host.waitFor((m) => m.replyTo === msg.messageId);
    expect(welcome.type).toBe("room:welcome");
    return welcome.payload as RoomWelcomePayload;
  }

  async function joinRoom(
    inbox: Inbox,
    roomCode: string,
    name: string,
  ): Promise<RoomWelcomePayload> {
    const msg = roomJoin({ roomCode, name });
    inbox.socket.emit("message:incoming", msg);
    const welcome = await inbox.waitFor((m) => m.replyTo === msg.messageId);
    expect(welcome.type).toBe("room:welcome");
    return welcome.payload as RoomWelcomePayload;
  }

  it("host creates a room and receives a correlated welcome", async () => {
    const host = await connect();
    const msg = roomCreate({ hostName: "Ada" });
    host.socket.emit("message:incoming", msg);

    const welcome = await host.waitFor((m) => m.type === "room:welcome");
    expect(welcome.replyTo).toBe(msg.messageId);

    const payload = welcome.payload as RoomWelcomePayload;
    expect(payload.room.id).toMatch(/^[A-Z2-9]{4}$/);
    expect(payload.room.participants[payload.youId]!.role).toBe("host");

    const state = await host.waitFor((m) => m.type === "room:state");
    expect((state.payload as RoomStatePayload).room.id).toBe(payload.room.id);
  });

  it("player join notifies the host and only the host", async () => {
    const host = await connect();
    const { room } = await createRoom(host);

    const player = await connect();
    const welcome = await joinRoom(player, room.id, "Grace");
    expect(welcome.room.participants[welcome.youId]!.role).toBe("player");

    const joined = await host.waitFor((m) => m.type === "room:player_joined");
    expect((joined.payload as RoomPlayerJoinedPayload).player.name).toBe("Grace");

    const hostState = await host.waitFor(
      (m) =>
        m.type === "room:state" &&
        Object.keys((m.payload as RoomStatePayload).room.participants).length === 2,
    );
    expect(hostState).toBeDefined();

    await player.waitFor(
      (m) =>
        m.type === "room:state" &&
        Object.keys((m.payload as RoomStatePayload).room.participants).length === 2,
    );

    await settle();
    expect(player.ofType("room:player_joined")).toHaveLength(0);
  });

  it("player leave shrinks the roster for the host", async () => {
    const host = await connect();
    const { room } = await createRoom(host);
    const player = await connect();
    const welcome = await joinRoom(player, room.id, "Grace");

    player.socket.emit("message:incoming", roomLeave());

    const state = await host.waitFor(
      (m) =>
        m.type === "room:state" &&
        (m.payload as RoomStatePayload).room.participants[welcome.youId] === undefined,
    );
    const roster = (state.payload as RoomStatePayload).room.participants;
    expect(Object.keys(roster)).toHaveLength(1);
  });

  it("player disconnect broadcasts connected: false", async () => {
    const host = await connect();
    const { room } = await createRoom(host);
    const player = await connect();
    const welcome = await joinRoom(player, room.id, "Grace");

    player.socket.disconnect();

    const state = await host.waitFor(
      (m) =>
        m.type === "room:state" &&
        (m.payload as RoomStatePayload).room.participants[welcome.youId]?.connected ===
          false,
    );
    const participant = (state.payload as RoomStatePayload).room.participants[
      welcome.youId
    ];
    expect(participant!.name).toBe("Grace");
  });

  it("joining an unknown room returns ROOM_NOT_FOUND", async () => {
    const player = await connect();
    const msg = roomJoin({ roomCode: "ZZZZ", name: "Grace" });
    player.socket.emit("message:incoming", msg);

    const error = await player.waitFor((m) => m.type === "engine:error");
    expect(error.replyTo).toBe(msg.messageId);
    const payload = error.payload as EngineErrorPayload;
    expect(payload.code).toBe("ROOM_NOT_FOUND");
  });
});
