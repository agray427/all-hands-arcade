import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as connectClient, type Socket } from "socket.io-client";
import {
  envelope,
  gameList,
  gameStart,
  roomCreate,
  roomJoin,
  roomLeave,
  roomRejoin,
  type EngineErrorPayload,
  type GameCatalog,
  type GameResults,
  type RoomPlayerJoinedPayload,
  type RoomStatePayload,
  type RoomWelcomePayload,
  type ServerBroadcastEnvelope,
} from "@arcade/core";
import { decks } from "@arcade/trivia";
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
    expect(payload.room.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(payload.room.participants[payload.youId]!.role).toBe("host");

    const state = await host.waitFor((m) => m.type === "room:state");
    expect((state.payload as RoomStatePayload).room.code).toBe(payload.room.code);
  });

  it("player join notifies the host and only the host", async () => {
    const host = await connect();
    const { room } = await createRoom(host);

    const player = await connect();
    const welcome = await joinRoom(player, room.code, "Grace");
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
    const welcome = await joinRoom(player, room.code, "Grace");

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
    const welcome = await joinRoom(player, room.code, "Grace");

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

  it("joining as host requires the host key issued to the creator", async () => {
    const host = await connect();
    const welcome = await createRoom(host);
    expect(welcome.hostKey).toMatch(/^h_/);

    const intruder = await connect();
    const forged = roomJoin({
      roomCode: welcome.room.code,
      name: "Mallory",
      asHost: true,
      hostKey: "h_forged",
    });
    intruder.socket.emit("message:incoming", forged);
    const error = await intruder.waitFor((m) => m.type === "engine:error");
    expect(error.replyTo).toBe(forged.messageId);
    expect((error.payload as EngineErrorPayload).code).toBe("NOT_ALLOWED");

    const cohost = await connect();
    const msg = roomJoin({
      roomCode: welcome.room.code,
      name: "Hedy",
      asHost: true,
      hostKey: welcome.hostKey,
    });
    cohost.socket.emit("message:incoming", msg);
    const reply = await cohost.waitFor((m) => m.replyTo === msg.messageId);
    expect(reply.type).toBe("room:welcome");
    const payload = reply.payload as RoomWelcomePayload;
    expect(payload.room.participants[payload.youId]!.role).toBe("host");
    expect(payload.hostKey).toBe(welcome.hostKey);
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

  describe("reconnection", () => {
    async function rejoin(
      inbox: Inbox,
      welcome: RoomWelcomePayload,
    ): Promise<RoomWelcomePayload> {
      const msg = roomRejoin({
        roomCode: welcome.room.code,
        participantId: welcome.youId,
        resumeToken: welcome.resumeToken,
      });
      inbox.socket.emit("message:incoming", msg);
      const reply = await inbox.waitFor((m) => m.replyTo === msg.messageId);
      expect(reply.type).toBe("room:welcome");
      return reply.payload as RoomWelcomePayload;
    }

    it("a disconnected player reclaims the same identity on a new socket", async () => {
      const host = await connect();
      const { room } = await createRoom(host);
      const player = await connect();
      const welcome = await joinRoom(player, room.code, "Grace");

      player.socket.disconnect();
      await host.waitFor(
        (m) =>
          m.type === "room:state" &&
          (m.payload as RoomStatePayload).room.participants[welcome.youId]?.connected ===
            false,
      );

      const revived = await connect();
      const replay = await rejoin(revived, welcome);
      expect(replay.youId).toBe(welcome.youId);
      expect(replay.resumeToken).toBe(welcome.resumeToken);

      const state = await host.waitFor(
        (m) =>
          m.type === "room:state" &&
          (m.payload as RoomStatePayload).room.participants[welcome.youId]?.connected ===
            true,
      );
      const roster = (state.payload as RoomStatePayload).room.participants;
      expect(Object.keys(roster)).toHaveLength(2);
      expect(roster[welcome.youId]!.name).toBe("Grace");
    });

    it("rejects a rejoin with a forged token", async () => {
      const host = await connect();
      const { room } = await createRoom(host);
      const player = await connect();
      const welcome = await joinRoom(player, room.code, "Grace");

      const intruder = await connect();
      const msg = roomRejoin({
        roomCode: room.code,
        participantId: welcome.youId,
        resumeToken: "t_forged",
      });
      intruder.socket.emit("message:incoming", msg);
      const error = await intruder.waitFor((m) => m.type === "engine:error");
      expect(error.replyTo).toBe(msg.messageId);
      expect((error.payload as EngineErrorPayload).code).toBe("REJOIN_FAILED");
    });

    it("a takeover detaches the old socket so its disconnect cannot mark the player offline", async () => {
      const host = await connect();
      const { room } = await createRoom(host);
      const stale = await connect();
      const welcome = await joinRoom(stale, room.code, "Grace");

      const fresh = await connect();
      await rejoin(fresh, welcome);
      await settle();

      stale.socket.disconnect();
      await settle();

      const roster = server.store.get(room.code)!.participants;
      expect(roster[welcome.youId]!.connected).toBe(true);
      const offline = host
        .ofType("room:state")
        .filter(
          (m) =>
            (m.payload as RoomStatePayload).room.participants[welcome.youId]?.connected ===
            false,
        );
      expect(offline).toHaveLength(0);
    });
  });

  describe("room lifecycle", () => {
    const TTL = 200;

    beforeEach(async () => {
      await server.close();
      server = await createArcadeServer({ port: 0, clientOrigin: "*", roomTtlMs: TTL });
    });

    async function rejoin(inbox: Inbox, welcome: RoomWelcomePayload) {
      const msg = roomRejoin({
        roomCode: welcome.room.code,
        participantId: welcome.youId,
        resumeToken: welcome.resumeToken,
      });
      inbox.socket.emit("message:incoming", msg);
      return inbox.waitFor((m) => m.replyTo === msg.messageId);
    }

    it("expires a hostless room after the ttl, notifies players, and invalidates tokens", async () => {
      const host = await connect();
      const hostWelcome = await createRoom(host);
      const player = await connect();
      const playerWelcome = await joinRoom(player, hostWelcome.room.code, "Grace");

      host.socket.disconnect();

      const closed = await player.waitFor((m) => m.type === "room:closed");
      expect((closed.payload as { reason: string }).reason).toContain("host");
      expect(server.store.get(hostWelcome.room.code)).toBeNull();

      const reply = await rejoin(player, playerWelcome);
      expect(reply.type).toBe("engine:error");
      expect((reply.payload as EngineErrorPayload).code).toBe("REJOIN_FAILED");
    });

    it("host rejoining within the ttl keeps the room alive", async () => {
      const host = await connect();
      const hostWelcome = await createRoom(host);
      host.socket.disconnect();

      const revived = await connect();
      const reply = await rejoin(revived, hostWelcome);
      expect(reply.type).toBe("room:welcome");

      await new Promise((resolve) => setTimeout(resolve, TTL * 2));
      expect(server.store.get(hostWelcome.room.code)).not.toBeNull();
      expect(revived.ofType("room:closed")).toHaveLength(0);
    });

    it("expires a room mid-game when the game is host-driven and the host is gone", async () => {
      const host = await connect();
      const hostWelcome = await createRoom(host);
      const p1 = await connect();
      await joinRoom(p1, hostWelcome.room.code, "Grace");

      host.socket.emit(
        "message:incoming",
        gameStart({ gameId: "trivia", variantId: "host-paced", config: { rounds: 2 } }),
      );
      await p1.waitFor((m) => m.type === "game:state");

      host.socket.disconnect();

      await p1.waitFor((m) => m.type === "room:closed");
      expect(server.store.get(hostWelcome.room.code)).toBeNull();
      expect(server.games.hasSession(hostWelcome.room.code)).toBe(false);
    });

    it("never expires a room while a game is running", async () => {
      const host = await connect();
      const hostWelcome = await createRoom(host);
      const p1 = await connect();
      await joinRoom(p1, hostWelcome.room.code, "Grace");
      const p2 = await connect();
      await joinRoom(p2, hostWelcome.room.code, "Hedy");

      host.socket.emit(
        "message:incoming",
        gameStart({
          gameId: "trivia",
          config: { rounds: 2, questionTimeMs: 30000, revealTimeMs: 500 },
        }),
      );
      await p1.waitFor((m) => m.type === "game:state");

      host.socket.disconnect();
      await new Promise((resolve) => setTimeout(resolve, TTL * 2));

      expect(server.store.get(hostWelcome.room.code)).not.toBeNull();
      expect(server.games.hasSession(hostWelcome.room.code)).toBe(true);
      expect(p1.ofType("room:closed")).toHaveLength(0);
    });
  });

  describe("games", () => {
    interface GameRoom {
      host: Inbox;
      p1: Inbox;
      p2: Inbox;
      ids: { p1: string; p2: string };
    }

    type View = {
      phase: string;
      round: number;
      correctIndex?: number;
      outcomes?: Record<string, string>;
      question: { prompt: string; choices: string[] };
      answered?: string[];
      you?: {
        choice: number | null;
        outcome: string | null;
        score: number;
        eliminatedRound: number | null;
      } | null;
    };

    const viewOf = (m: ServerBroadcastEnvelope): View =>
      (m.payload as { view: View }).view;

    const stateWith =
      (predicate: (view: View) => boolean): Predicate =>
      (m) =>
        m.type === "game:state" && predicate(viewOf(m));

    function correctFor(view: View): number {
      for (const deck of decks) {
        const q = deck.questions.find((question) => question.prompt === view.question.prompt);
        if (q) return q.correctIndex;
      }
      throw new Error(`question not in any deck: ${view.question.prompt}`);
    }

    function submitAnswer(inbox: Inbox, choice: number): void {
      inbox.socket.emit(
        "message:incoming",
        envelope("answer:submit", { choice }, { gameId: "trivia" }),
      );
    }

    async function setupGameRoom(): Promise<GameRoom> {
      const host = await connect();
      const { room } = await createRoom(host);
      const p1 = await connect();
      const w1 = await joinRoom(p1, room.code, "Grace");
      const p2 = await connect();
      const w2 = await joinRoom(p2, room.code, "Hedy");
      return { host, p1, p2, ids: { p1: w1.youId, p2: w2.youId } };
    }

    it("returns the game catalog on request", async () => {
      const host = await connect();
      await createRoom(host);
      const msg = gameList();
      host.socket.emit("message:incoming", msg);

      const reply = await host.waitFor((m) => m.replyTo === msg.messageId);
      expect(reply.type).toBe("game:catalog");
      const games = (reply.payload as { games: GameCatalog }).games;
      expect(games).toHaveLength(6);
      expect(games[0]!.id).toBe("trivia");
      expect(games[0]!.defaultVariant).toBe("classic");
      expect(games[0]!.stability).toBeUndefined();
      expect(games[0]!.variants.map((v) => v.id).sort()).toEqual([
        "classic",
        "host-paced",
        "survival",
      ]);
      const alphas = games.filter((g) => g.stability === "alpha").map((g) => g.id);
      expect(alphas.sort()).toEqual([
        "grand-jury",
        "hive-mind",
        "merger",
        "split-or-steal",
        "telephone",
      ]);
    });

    it("plays a classic game end to end over sockets", async () => {
      const { host, p1, p2, ids } = await setupGameRoom();
      const startMsg = gameStart({
        gameId: "trivia",
        config: { rounds: 2, questionTimeMs: 30000, revealTimeMs: 500 },
      });
      host.socket.emit("message:incoming", startMsg);

      const started = await host.waitFor((m) => m.type === "game:started");
      expect(started.replyTo).toBe(startMsg.messageId);

      const q1 = viewOf(await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 1)));
      expect(q1.question.choices).toHaveLength(4);
      expect(q1.correctIndex).toBeUndefined();

      const right = correctFor(q1);
      submitAnswer(p1, right);
      submitAnswer(p2, (right + 1) % 4);

      const reveal = viewOf(
        await host.waitFor(stateWith((v) => v.phase === "reveal" && v.round === 1)),
      );
      expect(reveal.correctIndex).toBe(right);
      expect(reveal.outcomes![ids.p1]).toBe("correct");
      expect(reveal.outcomes![ids.p2]).toBe("wrong");

      const q2 = viewOf(await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 2)));
      const right2 = correctFor(q2);
      submitAnswer(p1, right2);
      submitAnswer(p2, right2);

      const ended = await host.waitFor((m) => m.type === "game:ended");
      const results = (ended.payload as { results: GameResults }).results;
      expect(results.map((r) => r.participantId)).toEqual([ids.p1, ids.p2]);
      expect(results[0]!.rank).toBe(1);
      expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    });

    it("eliminates wrong answers in survival and reports how far players got", async () => {
      const { host, p1, p2, ids } = await setupGameRoom();
      host.socket.emit(
        "message:incoming",
        gameStart({
          gameId: "trivia",
          variantId: "survival",
          config: { startTimeMs: 30000, revealTimeMs: 500 },
        }),
      );

      const q1 = viewOf(await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 1)));
      const right = correctFor(q1);
      submitAnswer(p1, right);
      submitAnswer(p2, (right + 1) % 4);

      const ended = await host.waitFor((m) => m.type === "game:ended");
      const results = (ended.payload as { results: GameResults }).results;
      expect(results[0]!).toMatchObject({ participantId: ids.p1, rank: 1, detail: "Survived" });
      expect(results[1]!).toMatchObject({
        participantId: ids.p2,
        rank: 2,
        detail: "Eliminated round 1",
      });
    });

    it("eliminates silent players when the survival timer expires", async () => {
      const { host } = await setupGameRoom();
      host.socket.emit(
        "message:incoming",
        gameStart({
          gameId: "trivia",
          variantId: "survival",
          config: { startTimeMs: 1100, stepMs: 0, minTimeMs: 1000, revealTimeMs: 500 },
        }),
      );

      const ended = await host.waitFor((m) => m.type === "game:ended", 5000);
      const results = (ended.payload as { results: GameResults }).results;
      expect(results).toHaveLength(2);
      for (const entry of results) expect(entry.detail).toBe("Eliminated round 1");
    });

    it("rejects invalid survival config over the wire", async () => {
      const { host } = await setupGameRoom();
      const msg = gameStart({
        gameId: "trivia",
        variantId: "survival",
        config: { minTimeMs: 500 },
      });
      host.socket.emit("message:incoming", msg);

      const error = await host.waitFor((m) => m.type === "engine:error");
      expect(error.replyTo).toBe(msg.messageId);
      const payload = error.payload as EngineErrorPayload;
      expect(payload.code).toBe("INVALID_CONFIG");
      expect(payload.message).toContain("minTimeMs");
    });

    it("a rejoining player resumes the running game with identity and score intact", async () => {
      const host = await connect();
      const { room } = await createRoom(host);
      const p1 = await connect();
      const w1 = await joinRoom(p1, room.code, "Grace");
      const p2 = await connect();
      await joinRoom(p2, room.code, "Hedy");

      host.socket.emit(
        "message:incoming",
        gameStart({
          gameId: "trivia",
          config: { rounds: 2, questionTimeMs: 30000, revealTimeMs: 500 },
        }),
      );

      const q1 = viewOf(await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 1)));
      const right1 = correctFor(q1);
      submitAnswer(p1, right1);
      submitAnswer(p2, (right1 + 1) % 4);

      await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 2));
      p1.socket.disconnect();

      const revived = await connect();
      const msg = roomRejoin({
        roomCode: room.code,
        participantId: w1.youId,
        resumeToken: w1.resumeToken,
      });
      revived.socket.emit("message:incoming", msg);

      const welcome = await revived.waitFor((m) => m.replyTo === msg.messageId);
      expect(welcome.type).toBe("room:welcome");
      const started = await revived.waitFor((m) => m.type === "game:started");
      expect((started.payload as { gameId: string }).gameId).toBe("trivia");
      const snapshot = viewOf(
        await revived.waitFor(stateWith((v) => v.phase === "question" && v.round === 2)),
      );
      expect(snapshot.correctIndex).toBeUndefined();

      const right2 = correctFor(snapshot);
      revived.socket.emit(
        "message:incoming",
        envelope("answer:submit", { choice: right2 }, { gameId: "trivia" }),
      );
      submitAnswer(p2, (right2 + 1) % 4);

      const ended = await revived.waitFor((m) => m.type === "game:ended");
      const results = (ended.payload as { results: GameResults }).results;
      expect(results[0]!.participantId).toBe(w1.youId);
      expect(results[0]!.rank).toBe(1);
      expect(results[0]!.score).toBeGreaterThan(0);
    });

    it("echoes each player's own answer only to them", async () => {
      const { host, p1, p2, ids } = await setupGameRoom();
      host.socket.emit(
        "message:incoming",
        gameStart({
          gameId: "trivia",
          config: { rounds: 2, questionTimeMs: 30000, revealTimeMs: 500 },
        }),
      );

      const q1 = viewOf(await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 1)));
      expect(q1.you).toEqual({ choice: null, outcome: null, score: 0, eliminatedRound: null });

      const right = correctFor(q1);
      submitAnswer(p1, right);

      const mine = viewOf(
        await p1.waitFor(stateWith((v) => v.phase === "question" && v.you?.choice !== null)),
      );
      expect(mine.you!.choice).toBe(right);

      const theirs = viewOf(
        await p2.waitFor(stateWith((v) => v.phase === "question" && !!v.answered?.includes(ids.p1))),
      );
      expect(theirs.you!.choice).toBeNull();
      expect(JSON.stringify(theirs)).not.toContain(`"choice":${right}`);

      const hostQuestion = viewOf(
        await host.waitFor(stateWith((v) => v.phase === "question" && !!v.answered?.includes(ids.p1))),
      );
      expect(JSON.stringify(hostQuestion)).not.toContain('"choice":');
    });

    it("restores a player's locked answer when they rejoin mid-question", async () => {
      const host = await connect();
      const { room } = await createRoom(host);
      const p1 = await connect();
      const w1 = await joinRoom(p1, room.code, "Grace");
      const p2 = await connect();
      await joinRoom(p2, room.code, "Hedy");

      host.socket.emit(
        "message:incoming",
        gameStart({
          gameId: "trivia",
          config: { rounds: 1, questionTimeMs: 30000, revealTimeMs: 500 },
        }),
      );

      const q1 = viewOf(await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 1)));
      const right = correctFor(q1);
      submitAnswer(p1, right);
      await p1.waitFor(stateWith((v) => v.you?.choice === right));
      p1.socket.disconnect();

      const revived = await connect();
      revived.socket.emit(
        "message:incoming",
        roomRejoin({
          roomCode: room.code,
          participantId: w1.youId,
          resumeToken: w1.resumeToken,
        }),
      );

      const snapshot = viewOf(
        await revived.waitFor(stateWith((v) => v.phase === "question" && v.round === 1)),
      );
      expect(snapshot.you!.choice).toBe(right);
      expect(snapshot.correctIndex).toBeUndefined();
    });

    it("sends a late joiner spectator views with you: null", async () => {
      const { host, p1 } = await setupGameRoom();
      host.socket.emit(
        "message:incoming",
        gameStart({
          gameId: "trivia",
          config: { rounds: 1, questionTimeMs: 30000, revealTimeMs: 500 },
        }),
      );

      const q1 = viewOf(await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 1)));

      const late = await connect();
      const room = (host.messages[0]!.payload as RoomWelcomePayload).room;
      await joinRoom(late, room.code, "Late");

      submitAnswer(p1, correctFor(q1));
      const spectator = viewOf(await late.waitFor((m) => m.type === "game:state"));
      expect(spectator.you).toBeNull();
    });

    it("labels a disconnected player absent while a connected idler times out", async () => {
      const host = await connect();
      const { room } = await createRoom(host);
      const p1 = await connect();
      const w1 = await joinRoom(p1, room.code, "Grace");
      const p2 = await connect();
      const w2 = await joinRoom(p2, room.code, "Hedy");
      const p3 = await connect();
      const w3 = await joinRoom(p3, room.code, "Mary");

      host.socket.emit(
        "message:incoming",
        gameStart({
          gameId: "trivia",
          variantId: "survival",
          config: { startTimeMs: 1500, stepMs: 0, minTimeMs: 1000, revealTimeMs: 60000 },
        }),
      );

      const q1 = viewOf(await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 1)));
      submitAnswer(p1, correctFor(q1));
      p2.socket.disconnect();
      await host.waitFor(
        (m) =>
          m.type === "room:state" &&
          (m.payload as RoomStatePayload).room.participants[w2.youId]?.connected === false,
      );

      const reveal = viewOf(
        await host.waitFor(stateWith((v) => v.phase === "reveal" && v.round === 1), 5000),
      );
      expect(reveal.outcomes![w1.youId]).toBe("correct");
      expect(reveal.outcomes![w2.youId]).toBe("absent");
      expect(reveal.outcomes![w3.youId]).toBe("timeout");

      const revived = await connect();
      const msg = roomRejoin({
        roomCode: room.code,
        participantId: w2.youId,
        resumeToken: w2.resumeToken,
      });
      revived.socket.emit("message:incoming", msg);
      const snapshot = viewOf(
        await revived.waitFor(stateWith((v) => v.phase === "reveal" && v.round === 1)),
      );
      expect(snapshot.you!.outcome).toBe("absent");
      expect(snapshot.you!.eliminatedRound).toBe(1);
    });

    it("does not mark a player absent when a newer socket takes over", async () => {
      const host = await connect();
      const { room } = await createRoom(host);
      const p1 = await connect();
      const w1 = await joinRoom(p1, room.code, "Grace");

      host.socket.emit(
        "message:incoming",
        gameStart({
          gameId: "trivia",
          config: { rounds: 1, questionTimeMs: 1500, revealTimeMs: 60000 },
        }),
      );
      await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 1));

      const takeover = await connect();
      takeover.socket.emit(
        "message:incoming",
        roomRejoin({
          roomCode: room.code,
          participantId: w1.youId,
          resumeToken: w1.resumeToken,
        }),
      );
      await takeover.waitFor(stateWith((v) => v.phase === "question"));
      p1.socket.disconnect();
      await settle();

      const reveal = viewOf(
        await takeover.waitFor(stateWith((v) => v.phase === "reveal"), 5000),
      );
      expect(reveal.outcomes![w1.youId]).toBe("timeout");
    });

    it("plays a custom deck over the wire and rejects a malformed one", async () => {
      const { host, p1, p2, ids } = await setupGameRoom();

      const bad = gameStart({
        gameId: "trivia",
        config: { deck: "custom", customDeck: "no choices here" },
      });
      host.socket.emit("message:incoming", bad);
      const error = await host.waitFor((m) => m.replyTo === bad.messageId);
      expect((error.payload as EngineErrorPayload).code).toBe("INVALID_CONFIG");
      expect((error.payload as EngineErrorPayload).message).toContain("line 1");

      host.socket.emit(
        "message:incoming",
        gameStart({
          gameId: "trivia",
          config: {
            deck: "custom",
            customDeck: "Which door? | left | *right",
            questionTimeMs: 30000,
            revealTimeMs: 500,
          },
        }),
      );

      const q1 = viewOf(await p1.waitFor(stateWith((v) => v.phase === "question")));
      expect(q1.question).toEqual({ prompt: "Which door?", choices: ["left", "right"] });
      submitAnswer(p1, 1);
      submitAnswer(p2, 0);

      const ended = await host.waitFor((m) => m.type === "game:ended");
      const results = (ended.payload as { results: GameResults }).results;
      expect(results[0]!.participantId).toBe(ids.p1);
      expect(results[0]!.score).toBeGreaterThan(0);
      expect(results[1]!).toMatchObject({ participantId: ids.p2, score: 0 });
    });

    it("plays a host-paced game driven entirely by host advances", async () => {
      const { host, p1, p2, ids } = await setupGameRoom();
      host.socket.emit(
        "message:incoming",
        gameStart({ gameId: "trivia", variantId: "host-paced", config: { rounds: 1 } }),
      );

      const q1 = viewOf(await p1.waitFor(stateWith((v) => v.phase === "question" && v.round === 1)));
      const right = correctFor(q1);
      submitAnswer(p1, right);
      submitAnswer(p2, right);

      await host.waitFor(
        stateWith((v) => v.phase === "question" && v.round === 1),
      );
      await settle();
      expect(host.messages.filter((m) => m.type === "game:state").every((m) => viewOf(m).phase === "question")).toBe(true);

      p2.socket.emit(
        "message:incoming",
        envelope("round:advance", {}, { gameId: "trivia" }),
      );
      await settle();
      expect(host.messages.some((m) => m.type === "game:state" && viewOf(m).phase === "reveal")).toBe(false);

      host.socket.emit("message:incoming", envelope("round:advance", {}, { gameId: "trivia" }));
      const reveal = viewOf(await host.waitFor(stateWith((v) => v.phase === "reveal")));
      expect(reveal.correctIndex).toBe(right);

      host.socket.emit("message:incoming", envelope("round:advance", {}, { gameId: "trivia" }));
      const ended = await host.waitFor((m) => m.type === "game:ended");
      const results = (ended.payload as { results: GameResults }).results;
      expect(results.map((r) => r.score)).toEqual([100, 100]);
      expect(results.map((r) => r.participantId).sort()).toEqual([ids.p1, ids.p2].sort());
    });

    it("rejects game:start from players", async () => {
      const { p1 } = await setupGameRoom();
      p1.socket.emit("message:incoming", gameStart({ gameId: "trivia" }));
      const error = await p1.waitFor((m) => m.type === "engine:error");
      expect((error.payload as EngineErrorPayload).code).toBe("NOT_ALLOWED");
    });
  });
});
