import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  engineError,
  gameEnded,
  gameStarted,
  gameState,
  roomClosed,
  roomWelcome,
  type GameResults,
  type RoomView,
  type ServerBroadcastEnvelope,
} from "@arcade/core";

const storage = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

type OutgoingHandler = (message: ServerBroadcastEnvelope) => void;

const stub = {
  handlers: new Map<string, OutgoingHandler>(),
  emitted: [] as Array<{ event: string; message: { type: string; payload: unknown; gameId?: string; messageId: string } }>,
  on(event: string, handler: OutgoingHandler) {
    this.handlers.set(event, handler);
  },
  emit(event: string, message: { type: string; payload: unknown; gameId?: string; messageId: string }) {
    this.emitted.push({ event, message });
  },
  receive(message: ServerBroadcastEnvelope) {
    this.handlers.get("message:outgoing")!(message);
  },
  reset() {
    this.handlers.clear();
    this.emitted = [];
  },
  lastSent() {
    return this.emitted.at(-1)!.message;
  },
};

vi.mock("../src/lib/socket.js", () => ({
  getSocket: () => stub,
}));

const { ArcadeClient } = await import("../src/lib/arcade.svelte.js");

const room: RoomView = { code: "ABCD", participants: {}, createdAt: 1 };

function questionView(round: number, phase = "question") {
  return {
    variant: "classic",
    phase,
    round,
    totalRounds: 3,
    deadline: 2000,
    timeMs: 1000,
    question: { prompt: "Q?", choices: ["a", "b", "c", "d"] },
    answered: [],
    contestants: ["p1"],
    names: { p1: "Grace" },
    scores: { p1: 0 },
    eliminatedAt: {},
  };
}

describe("ArcadeClient games", () => {
  beforeEach(() => {
    stub.reset();
    storage.clear();
  });

  it("loads the catalog via request/reply", async () => {
    const client = new ArcadeClient();
    const pending = client.loadCatalog();
    const sent = stub.lastSent();
    expect(sent.type).toBe("game:list");

    stub.receive({
      type: "game:catalog",
      messageId: "m_s",
      timestamp: 1,
      target: "self",
      replyTo: sent.messageId,
      payload: { games: [{ id: "trivia" }] },
    } as ServerBroadcastEnvelope);
    await pending;

    expect(client.catalog).toEqual([{ id: "trivia" }]);
  });

  it("tracks game state, resets choices per round, and stores results", () => {
    const client = new ArcadeClient();

    stub.receive(gameStarted({ gameId: "trivia", variantId: "classic", config: {} }, "all"));
    stub.receive(gameState({ gameId: "trivia", view: questionView(1) }, "players"));
    expect(client.game?.view.round).toBe(1);

    client.submitAnswer(2);
    expect(client.myChoice).toBe(2);
    const sent = stub.lastSent();
    expect(sent.type).toBe("answer:submit");
    expect(sent.gameId).toBe("trivia");
    expect(sent.payload).toEqual({ choice: 2 });

    client.submitAnswer(3);
    expect(client.myChoice).toBe(2);

    stub.receive(gameState({ gameId: "trivia", view: questionView(1, "reveal") }, "players"));
    expect(client.myChoice).toBe(2);

    stub.receive(gameState({ gameId: "trivia", view: questionView(2) }, "players"));
    expect(client.myChoice).toBeNull();

    const results: GameResults = [
      { participantId: "p1", name: "Grace", rank: 1, score: 5 },
    ];
    stub.receive(gameEnded({ gameId: "trivia", results }, "all"));
    expect(client.game).toBeNull();
    expect(client.results).toEqual(results);
  });

  it("surfaces engine errors from startGame", async () => {
    const client = new ArcadeClient();
    const pending = client.startGame("trivia", "survival", { minTimeMs: 500 });
    const sent = stub.lastSent();
    expect(sent.type).toBe("game:start");

    stub.receive(
      engineError(
        { code: "INVALID_CONFIG", message: "minTimeMs must be at least 1000" },
        "self",
        sent.messageId,
      ),
    );
    await pending;

    expect(client.lastError).toBe("minTimeMs must be at least 1000");
  });

  it("clears game state on leave", () => {
    const client = new ArcadeClient();
    stub.receive(roomWelcome({ room, youId: "p1", resumeToken: "t_1" }, "self"));
    stub.receive(gameState({ gameId: "trivia", view: questionView(1) }, "players"));
    client.leave();
    expect(client.game).toBeNull();
    expect(client.results).toBeNull();
    expect(client.myChoice).toBeNull();
  });
});

describe("ArcadeClient reconnection", () => {
  beforeEach(() => {
    stub.reset();
    storage.clear();
  });

  it("persists the session on welcome and clears it on leave", () => {
    const client = new ArcadeClient();
    stub.receive(roomWelcome({ room, youId: "p1", resumeToken: "t_1" }, "self"));

    expect(JSON.parse(storage.get("arcade:session")!)).toEqual({
      roomCode: "ABCD",
      participantId: "p1",
      resumeToken: "t_1",
    });

    client.leave();
    expect(storage.has("arcade:session")).toBe(false);
  });

  it("resume rejoins from the stored session and applies the welcome", async () => {
    storage.set(
      "arcade:session",
      JSON.stringify({ roomCode: "ABCD", participantId: "p1", resumeToken: "t_1" }),
    );
    const client = new ArcadeClient();
    const pending = client.resume();

    const sent = stub.lastSent();
    expect(sent.type).toBe("room:rejoin");
    expect(sent.payload).toEqual({
      roomCode: "ABCD",
      participantId: "p1",
      resumeToken: "t_1",
    });

    const withYou: RoomView = {
      ...room,
      participants: {
        p1: { id: "p1", name: "Grace", role: "player", connected: true },
      },
    };
    stub.receive({
      ...roomWelcome({ room: withYou, youId: "p1", resumeToken: "t_1" }, "self"),
      replyTo: sent.messageId,
    });

    expect(await pending).toBe(true);
    expect(client.room?.code).toBe("ABCD");
    expect(client.you?.name).toBe("Grace");
  });

  it("resume without a stored session does nothing", async () => {
    const client = new ArcadeClient();
    expect(await client.resume()).toBe(false);
    expect(stub.emitted).toHaveLength(0);
  });

  it("a rejected resume clears the stale session", async () => {
    storage.set(
      "arcade:session",
      JSON.stringify({ roomCode: "ABCD", participantId: "p1", resumeToken: "t_stale" }),
    );
    const client = new ArcadeClient();
    const pending = client.resume();

    const sent = stub.lastSent();
    stub.receive(
      engineError(
        { code: "REJOIN_FAILED", message: "unknown room, participant, or token" },
        "self",
        sent.messageId,
      ),
    );

    expect(await pending).toBe(false);
    expect(storage.has("arcade:session")).toBe(false);
  });

  it("room:closed clears state and session and surfaces the reason", () => {
    const client = new ArcadeClient();
    stub.receive(roomWelcome({ room, youId: "p1", resumeToken: "t_1" }, "self"));
    stub.receive(gameStarted({ gameId: "trivia", variantId: "classic", config: {} }, "all"));
    stub.receive(gameState({ gameId: "trivia", view: questionView(1) }, "all"));

    stub.receive(roomClosed({ reason: "room closed after host inactivity" }, "all"));

    expect(client.room).toBeNull();
    expect(client.you).toBeNull();
    expect(client.game).toBeNull();
    expect(client.notice).toBe("room closed after host inactivity");
    expect(storage.has("arcade:session")).toBe(false);
  });

  it("the next welcome clears the notice", () => {
    const client = new ArcadeClient();
    stub.receive(roomClosed({ reason: "room closed after host inactivity" }, "all"));
    expect(client.notice).not.toBeNull();

    stub.receive(roomWelcome({ room, youId: "p1", resumeToken: "t_1" }, "self"));
    expect(client.notice).toBeNull();
    expect(client.room?.code).toBe("ABCD");
  });

  it("tracks connection status and auto-rejoins when the socket comes back", async () => {
    const client = new ArcadeClient();
    stub.receive(roomWelcome({ room, youId: "p1", resumeToken: "t_1" }, "self"));

    (stub.handlers.get("disconnect") as unknown as () => void)();
    expect(client.connected).toBe(false);

    (stub.handlers.get("connect") as unknown as () => void)();
    expect(client.connected).toBe(true);

    await Promise.resolve();
    const sent = stub.lastSent();
    expect(sent.type).toBe("room:rejoin");
    expect(sent.payload).toEqual({
      roomCode: "ABCD",
      participantId: "p1",
      resumeToken: "t_1",
    });
  });
});
