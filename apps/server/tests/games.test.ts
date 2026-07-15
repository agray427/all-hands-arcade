import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  envelope,
  type EngineErrorPayload,
  type Participant,
  type ServerBroadcastEnvelope,
  type TargetAudience,
} from "@arcade/core";
import { decks, trivia } from "@arcade/trivia";
import { GameCoordinator } from "../src/games.js";
import type { ConnectionContext } from "../src/router.js";

interface Emitted {
  roomCode: string;
  target: TargetAudience;
  message: ServerBroadcastEnvelope;
}

const ROOM = "GAME";

function hostCtx(): ConnectionContext {
  return { participantId: "h1", roomCode: ROOM, role: "host" };
}

function playerCtx(id: string): ConnectionContext {
  return { participantId: id, roomCode: ROOM, role: "player" };
}

function players(count: number): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    role: "player" as const,
    connected: true,
  }));
}

function errorPayload(replies: ServerBroadcastEnvelope[]): EngineErrorPayload {
  expect(replies).toHaveLength(1);
  expect(replies[0]!.type).toBe("engine:error");
  return replies[0]!.payload as EngineErrorPayload;
}

function answerMsg(choice: number) {
  return envelope("answer:submit", { choice }, { gameId: "trivia" });
}

function correctFor(view: unknown): number {
  const prompt = (view as { question: { prompt: string } }).question.prompt;
  for (const deck of decks) {
    const q = deck.questions.find((question) => question.prompt === prompt);
    if (q) return q.correctIndex;
  }
  throw new Error(`question not found in any deck: ${prompt}`);
}

describe("GameCoordinator", () => {
  let emitted: Emitted[];
  let games: GameCoordinator;

  const stateViews = (target: TargetAudience) =>
    emitted
      .filter((e) => e.message.type === "game:state" && e.target === target)
      .map((e) => (e.message.payload as { view: unknown }).view as Record<string, unknown>);

  beforeEach(() => {
    vi.useFakeTimers();
    emitted = [];
    games = new GameCoordinator([trivia], (roomCode, target, message) => {
      emitted.push({ roomCode, target, message });
    });
  });

  afterEach(() => {
    games.dispose(ROOM);
    vi.useRealTimers();
  });

  describe("start", () => {
    it("emits game:started to the room and initial state views to hosts and players", () => {
      const replies = games.start(hostCtx(), { gameId: "trivia" }, players(2), "m1");
      expect(replies).toEqual([]);
      expect(games.hasSession(ROOM)).toBe(true);

      expect(emitted.map((e) => [e.message.type, e.target])).toEqual([
        ["game:started", "all"],
        ["game:state", "host"],
        ["game:state", "players"],
      ]);
      expect(emitted[0]!.message.replyTo).toBe("m1");
      const view = stateViews("host")[0]!;
      expect(view.phase).toBe("question");
      expect(view.round).toBe(1);
    });

    it("rejects non-hosts", () => {
      const payload = errorPayload(
        games.start(playerCtx("p1"), { gameId: "trivia" }, players(2), "m1"),
      );
      expect(payload.code).toBe("NOT_ALLOWED");
    });

    it("rejects a second game while one is active", () => {
      games.start(hostCtx(), { gameId: "trivia" }, players(2));
      const payload = errorPayload(games.start(hostCtx(), { gameId: "trivia" }, players(2)));
      expect(payload.code).toBe("GAME_ALREADY_ACTIVE");
    });

    it("rejects unknown games, variants, and invalid config", () => {
      expect(errorPayload(games.start(hostCtx(), { gameId: "chess" }, players(2))).code).toBe(
        "NO_SUCH_GAME",
      );
      expect(
        errorPayload(
          games.start(hostCtx(), { gameId: "trivia", variantId: "blitz" }, players(2)),
        ).code,
      ).toBe("NO_SUCH_VARIANT");
      const invalid = errorPayload(
        games.start(
          hostCtx(),
          { gameId: "trivia", variantId: "survival", config: { minTimeMs: 500 } },
          players(2),
        ),
      );
      expect(invalid.code).toBe("INVALID_CONFIG");
      expect(invalid.message).toContain("minTimeMs");
    });

    it("rejects rooms below minPlayers", () => {
      const payload = errorPayload(games.start(hostCtx(), { gameId: "trivia" }, []));
      expect(payload.code).toBe("NOT_ALLOWED");
      expect(payload.message).toContain("at least 1");
    });
  });

  describe("message", () => {
    it("returns NO_ACTIVE_GAME when no session is running", () => {
      expect(errorPayload(games.message(playerCtx("p1"), answerMsg(0))).code).toBe(
        "NO_ACTIVE_GAME",
      );
    });

    it("returns NO_SUCH_GAME for unregistered game ids", () => {
      const msg = envelope("answer:submit", { choice: 0 }, { gameId: "chess" });
      expect(errorPayload(games.message(playerCtx("p1"), msg)).code).toBe("NO_SUCH_GAME");
    });

    it("rejects unknown message types and malformed payloads", () => {
      games.start(hostCtx(), { gameId: "trivia" }, players(2));
      const unknown = envelope("bribe:judge", {}, { gameId: "trivia" });
      expect(errorPayload(games.message(playerCtx("p1"), unknown)).code).toBe(
        "MALFORMED_MESSAGE",
      );
      const malformed = envelope("answer:submit", { choice: "two" }, { gameId: "trivia" });
      const payload = errorPayload(games.message(playerCtx("p1"), malformed));
      expect(payload.code).toBe("MALFORMED_MESSAGE");
      expect(payload.message).toBe("choice must be number");
    });

    it("reduces answers and broadcasts updated views", () => {
      games.start(hostCtx(), { gameId: "trivia" }, players(2));
      const view = stateViews("players")[0]!;
      const right = correctFor(view);

      games.message(playerCtx("p1"), answerMsg(right));
      games.message(playerCtx("p2"), answerMsg(right));

      const reveal = stateViews("host").at(-1)!;
      expect(reveal.phase).toBe("reveal");
      expect(reveal.outcomes).toEqual({ p1: "correct", p2: "correct" });
    });
  });

  describe("timers", () => {
    it("fires the round timer to reveal and the reveal timer to advance", () => {
      games.start(
        hostCtx(),
        { gameId: "trivia", config: { questionTimeMs: 5000, revealTimeMs: 1000 } },
        players(2),
      );

      vi.advanceTimersByTime(5000);
      expect(stateViews("host").at(-1)!.phase).toBe("reveal");

      vi.advanceTimersByTime(1000);
      const next = stateViews("host").at(-1)!;
      expect(next.phase).toBe("question");
      expect(next.round).toBe(2);
    });

    it("cancels the round timer when everyone answers early", () => {
      games.start(
        hostCtx(),
        { gameId: "trivia", config: { questionTimeMs: 5000, revealTimeMs: 60000 } },
        players(1),
      );
      const right = correctFor(stateViews("players")[0]!);
      games.message(playerCtx("p1"), answerMsg(right));
      expect(stateViews("host").at(-1)!.phase).toBe("reveal");

      const count = stateViews("host").length;
      vi.advanceTimersByTime(5000);
      expect(stateViews("host")).toHaveLength(count);
    });

    it("ends the game after the final reveal and tears the session down", () => {
      games.start(
        hostCtx(),
        { gameId: "trivia", config: { rounds: 1, questionTimeMs: 5000, revealTimeMs: 1000 } },
        players(1),
      );
      vi.advanceTimersByTime(5000);
      vi.advanceTimersByTime(1000);

      const ended = emitted.find((e) => e.message.type === "game:ended")!;
      expect(ended.target).toBe("all");
      const results = (ended.message.payload as { results: unknown[] }).results;
      expect(results).toHaveLength(1);
      expect(games.hasSession(ROOM)).toBe(false);

      const count = emitted.length;
      vi.advanceTimersByTime(60000);
      expect(emitted).toHaveLength(count);
    });
  });

  describe("end", () => {
    it("lets a host end early with results and rejects everyone else", () => {
      games.start(hostCtx(), { gameId: "trivia" }, players(2));
      expect(errorPayload(games.end(playerCtx("p1"))).code).toBe("NOT_ALLOWED");

      expect(games.end(hostCtx())).toEqual([]);
      expect(emitted.at(-1)!.message.type).toBe("game:ended");
      expect(games.hasSession(ROOM)).toBe(false);
      expect(errorPayload(games.end(hostCtx())).code).toBe("NO_ACTIVE_GAME");
    });
  });

  describe("resume", () => {
    it("returns nothing when no session is running", () => {
      expect(games.resume(hostCtx())).toEqual([]);
      expect(games.resume({ participantId: null, roomCode: null, role: null })).toEqual([]);
    });

    it("replays game:started and the current view for the caller's role", () => {
      games.start(hostCtx(), { gameId: "trivia", variantId: "survival" }, players(2));

      const forPlayer = games.resume(playerCtx("p1"));
      expect(forPlayer.map((m) => [m.type, m.target])).toEqual([
        ["game:started", "self"],
        ["game:state", "self"],
      ]);
      const startedPayload = forPlayer[0]!.payload as { gameId: string; variantId: string };
      expect(startedPayload.gameId).toBe("trivia");
      expect(startedPayload.variantId).toBe("survival");
      const playerView = (forPlayer[1]!.payload as { view: Record<string, unknown> }).view;
      expect(playerView.correctIndex).toBeUndefined();

      const forHost = games.resume(hostCtx());
      const hostView = (forHost[1]!.payload as { view: Record<string, unknown> }).view;
      expect(hostView).toEqual(stateViews("host").at(-1));
    });
  });

  describe("dispose", () => {
    it("clears pending timers so nothing fires later", () => {
      games.start(
        hostCtx(),
        { gameId: "trivia", config: { questionTimeMs: 5000 } },
        players(2),
      );
      games.dispose(ROOM);
      const count = emitted.length;
      vi.advanceTimersByTime(60000);
      expect(emitted).toHaveLength(count);
    });
  });
});
