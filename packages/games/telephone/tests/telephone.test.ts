import { describe, expect, it } from "vitest";
import type { GameContext } from "@arcade/core";
import { sanitizeStrokes, telephone, type TeleState } from "../src/index.js";

function ctxFor(count: number): GameContext {
  return {
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      role: "player" as const,
      connected: true,
    })),
    now: () => 1000,
    random: () => 0.99,
  };
}

const SCRIBBLE = [
  [
    [0, 0],
    [10, 10],
    [20, 5],
  ],
];

function submit(state: TeleState, ctx: GameContext, from: string, payload: object) {
  return telephone.reduce(
    state,
    { kind: "message", type: "tele:submit", payload, from, role: "player", messageId: "m" },
    ctx,
  );
}

function fire(state: TeleState, ctx: GameContext, id: string) {
  return telephone.reduce(state, { kind: "timer", id }, ctx);
}

function activeAt(state: TeleState, chain: number): string {
  return state.chains[chain]!.members[state.step]!;
}

describe("massive telephone", () => {
  it("splits players into chains seeded with a prompt", () => {
    const ctx = ctxFor(8);
    const { state, effects } = telephone.setup("classic", { chainSize: 4 }, ctx);
    expect(state.chains).toHaveLength(2);
    expect(state.chains.flatMap((c) => c.members).sort()).toEqual(
      ctx.players.map((p) => p.id).sort(),
    );
    expect(state.chains.every((c) => c.timeline[0]!.kind === "prompt")).toBe(true);
    expect(state.totalSteps).toBe(4);
    expect(effects).toEqual([{ kind: "schedule", id: "step:0", delayMs: 30000 }]);
  });

  it("merges a lone trailing player into the previous chain", () => {
    const ctx = ctxFor(5);
    const { state } = telephone.setup("classic", { chainSize: 2 }, ctx);
    expect(state.chains).toHaveLength(2);
    expect(state.chains.map((c) => c.members.length).sort()).toEqual([2, 3]);
  });

  it("expects a drawing first and rejects text in its place", () => {
    const ctx = ctxFor(2);
    const { state } = telephone.setup("classic", { chainSize: 2 }, ctx);
    const active = activeAt(state, 0);
    const rejected = submit(state, ctx, active, { text: "not a drawing" });
    expect(rejected.state.chains[0]!.timeline).toHaveLength(1);
    const accepted = submit(state, ctx, active, { strokes: SCRIBBLE });
    expect(accepted.state.chains[0]!.timeline[1]).toMatchObject({ kind: "drawing", by: active });
  });

  it("only the active member of a chain may submit", () => {
    const ctx = ctxFor(4);
    const { state } = telephone.setup("classic", { chainSize: 4 }, ctx);
    const bystander = state.chains[0]!.members[1]!;
    const result = submit(state, ctx, bystander, { strokes: SCRIBBLE });
    expect(result.state.chains[0]!.timeline).toHaveLength(1);
  });

  it("advances to the guess step once every chain's drawer has submitted", () => {
    const ctx = ctxFor(4);
    let state = telephone.setup("classic", { chainSize: 2 }, ctx).state;
    state = submit(state, ctx, activeAt(state, 0), { strokes: SCRIBBLE }).state;
    const result = submit(state, ctx, activeAt(state, 1), { strokes: SCRIBBLE });
    expect(result.state.step).toBe(1);
    expect(result.effects).toContainEqual({ kind: "cancel", id: "step:0" });
    expect(result.effects).toContainEqual({ kind: "schedule", id: "step:1", delayMs: 30000 });
    const guesser = activeAt(result.state, 0);
    const guessed = submit(result.state, ctx, guesser, { text: "a cat?" });
    expect(guessed.state.chains[0]!.timeline[2]).toMatchObject({ kind: "text", text: "a cat?" });
  });

  it("fills missing submissions when the step timer fires", () => {
    const ctx = ctxFor(2);
    let state = telephone.setup("classic", { chainSize: 2 }, ctx).state;
    state = fire(state, ctx, "step:0").state;
    expect(state.step).toBe(1);
    expect(state.chains[0]!.timeline[1]).toMatchObject({ kind: "drawing", strokes: [], by: null });
  });

  it("reaches the gallery after the last step and the host closes it", () => {
    const ctx = ctxFor(2);
    let state = telephone.setup("classic", { chainSize: 2 }, ctx).state;
    state = submit(state, ctx, activeAt(state, 0), { strokes: SCRIBBLE }).state;
    state = submit(state, ctx, activeAt(state, 0), { text: "guess" }).state;
    expect(state.phase).toBe("gallery");
    const stray = telephone.reduce(
      state,
      { kind: "message", type: "round:advance", payload: {}, from: "p1", role: "player", messageId: "m" },
      ctx,
    );
    expect(stray.state.phase).toBe("gallery");
    const closed = telephone.reduce(
      state,
      { kind: "message", type: "round:advance", payload: {}, from: "h1", role: "host", messageId: "m" },
      ctx,
    );
    expect(closed.state.phase).toBe("ended");
    expect(closed.effects).toEqual([{ kind: "end" }]);
  });

  it("hides other chains' content from players until the gallery, then shows only their own", () => {
    const ctx = ctxFor(4);
    let state = telephone.setup("classic", { chainSize: 2 }, ctx).state;
    state = submit(state, ctx, activeAt(state, 0), { strokes: SCRIBBLE }).state;
    const midGame = telephone.playerView!(state, state.chains[1]!.members[0]!) as {
      timelines: unknown[];
    };
    expect(midGame.timelines).toEqual([]);
    state = submit(state, ctx, activeAt(state, 1), { strokes: SCRIBBLE }).state;
    state = submit(state, ctx, activeAt(state, 0), { text: "g1" }).state;
    state = submit(state, ctx, activeAt(state, 1), { text: "g2" }).state;
    expect(state.phase).toBe("gallery");
    const gallery = telephone.playerView!(state, state.chains[0]!.members[0]!) as {
      timelines: { index: number }[];
    };
    expect(gallery.timelines).toHaveLength(1);
    expect(gallery.timelines[0]!.index).toBe(0);
    const host = telephone.view(state, "host") as { timelines: unknown[] };
    expect(host.timelines).toHaveLength(2);
  });

  it("tells the active player their task and the previous entry", () => {
    const ctx = ctxFor(2);
    let state = telephone.setup("classic", { chainSize: 2 }, ctx).state;
    const drawer = activeAt(state, 0);
    const yourTurn = telephone.playerView!(state, drawer) as {
      you: { yourTurn: boolean; task: string; previous: { kind: string } };
    };
    expect(yourTurn.you.yourTurn).toBe(true);
    expect(yourTurn.you.task).toBe("draw");
    expect(yourTurn.you.previous.kind).toBe("prompt");
    state = submit(state, ctx, drawer, { strokes: SCRIBBLE }).state;
    const guesser = activeAt(state, 0);
    const guessTurn = telephone.playerView!(state, guesser) as {
      you: { task: string; previous: { kind: string } };
    };
    expect(guessTurn.you.task).toBe("guess");
    expect(guessTurn.you.previous.kind).toBe("drawing");
  });

  it("sanitizes strokes and rejects malformed or oversized payloads", () => {
    expect(sanitizeStrokes([[[1, 2], [3, 4]]])).toEqual([[[1, 2], [3, 4]]]);
    expect(sanitizeStrokes("nope")).toBeNull();
    expect(sanitizeStrokes([[[1, "a"]]])).toBeNull();
    expect(sanitizeStrokes([[[1]]])).toBeNull();
    const huge = [Array.from({ length: 5001 }, (_, i) => [i, i])];
    expect(sanitizeStrokes(huge)).toBeNull();
  });
});
