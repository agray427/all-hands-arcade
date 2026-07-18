import { describe, expect, it } from "vitest";
import type { GameContext } from "@arcade/core";
import { hiveMind, type HiveState } from "../src/index.js";

function ctxFor(count: number): GameContext {
  return {
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      role: "player" as const,
      connected: true,
    })),
    now: () => 1000,
    random: () => 0.42,
  };
}

function answer(state: HiveState, ctx: GameContext, from: string, text: string) {
  return hiveMind.reduce(
    state,
    { kind: "message", type: "hive:answer", payload: { text }, from, role: "player", messageId: "m" },
    ctx,
  );
}

function fire(state: HiveState, ctx: GameContext, id: string) {
  return hiveMind.reduce(state, { kind: "timer", id }, ctx);
}

describe("hive mind", () => {
  it("starts round 1 with a prompt, a deadline, and a scheduled timer", () => {
    const ctx = ctxFor(4);
    const { state, effects } = hiveMind.setup("classic", {}, ctx);
    expect(state.phase).toBe("prompt");
    expect(state.round).toBe(1);
    expect(state.prompts[0]).toBeTruthy();
    expect(state.deadline).toBe(1000 + 10000);
    expect(effects).toEqual([{ kind: "schedule", id: "round:1", delayMs: 10000 }]);
  });

  it("normalizes answers and eliminates the minority at the deadline", () => {
    const ctx = ctxFor(4);
    let state = hiveMind.setup("classic", {}, ctx).state;
    state = answer(state, ctx, "p1", "  BLUE ").state;
    state = answer(state, ctx, "p2", "blue").state;
    state = answer(state, ctx, "p3", "Red").state;
    const result = fire(state, ctx, "round:1");
    expect(result.state.phase).toBe("reveal");
    expect(result.state.tally).toEqual([
      { answer: "blue", count: 2, surviving: true },
      { answer: "red", count: 1, surviving: true },
    ]);
    expect(result.state.eliminatedAt).toEqual({ p4: 1 });
  });

  it("eliminates answers outside the top N when there are more than N distinct answers", () => {
    const ctx = ctxFor(5);
    let state = hiveMind.setup("classic", { surviveTop: 1 }, ctx).state;
    state = answer(state, ctx, "p1", "cat").state;
    state = answer(state, ctx, "p2", "cat").state;
    state = answer(state, ctx, "p3", "dog").state;
    state = answer(state, ctx, "p4", "fox").state;
    const revealed = answer(state, ctx, "p5", "cat").state;
    expect(revealed.phase).toBe("reveal");
    expect(revealed.eliminatedAt).toEqual({ p3: 1, p4: 1 });
  });

  it("advances to reveal early when every living player has answered", () => {
    const ctx = ctxFor(2);
    let state = hiveMind.setup("classic", {}, ctx).state;
    state = answer(state, ctx, "p1", "tea").state;
    const result = answer(state, ctx, "p2", "tea");
    expect(result.state.phase).toBe("reveal");
    expect(result.effects).toContainEqual({ kind: "cancel", id: "round:1" });
  });

  it("locks the first answer and ignores empty or duplicate submissions", () => {
    const ctx = ctxFor(3);
    let state = hiveMind.setup("classic", {}, ctx).state;
    state = answer(state, ctx, "p1", "   ").state;
    expect(state.answers.p1).toBeUndefined();
    state = answer(state, ctx, "p1", "one").state;
    state = answer(state, ctx, "p1", "two").state;
    expect(state.answers.p1).toBe("one");
  });

  it("ends when the survivors drop below the threshold", () => {
    const ctx = ctxFor(4);
    let state = hiveMind.setup("classic", { endBelow: 3 }, ctx).state;
    state = answer(state, ctx, "p1", "sun").state;
    state = answer(state, ctx, "p2", "sun").state;
    state = fire(state, ctx, "round:1").state;
    expect(state.eliminatedAt).toEqual({ p3: 1, p4: 1 });
    const result = fire(state, ctx, "reveal:1");
    expect(result.state.phase).toBe("ended");
    expect(result.effects).toEqual([{ kind: "end" }]);
  });

  it("keeps looping while enough players survive", () => {
    const ctx = ctxFor(4);
    let state = hiveMind.setup("classic", { endBelow: 2 }, ctx).state;
    for (const id of ["p1", "p2", "p3", "p4"]) state = answer(state, ctx, id, "same").state;
    const next = fire(state, ctx, "reveal:1");
    expect(next.state.phase).toBe("prompt");
    expect(next.state.round).toBe(2);
    expect(next.state.answers).toEqual({});
  });

  it("ranks results by rounds survived", () => {
    const ctx = ctxFor(3);
    let state = hiveMind.setup("classic", { endBelow: 2 }, ctx).state;
    state = answer(state, ctx, "p1", "a").state;
    state = answer(state, ctx, "p2", "a").state;
    state = fire(state, ctx, "round:1").state;
    state = fire(state, ctx, "reveal:1").state;
    state = answer(state, ctx, "p1", "b").state;
    const done = answer(state, ctx, "p2", "b").state;
    const board = hiveMind.results({ ...done, phase: "ended" });
    expect(board[0]!.detail).toBe("Hive mind");
    expect(board.find((e) => e.participantId === "p3")!.detail).toBe("Eliminated round 1");
    expect(board.find((e) => e.participantId === "p3")!.score).toBe(0);
  });

  it("hides everyone's answers from the shared views but echoes your own", () => {
    const ctx = ctxFor(3);
    let state = hiveMind.setup("classic", {}, ctx).state;
    state = answer(state, ctx, "p1", "unicorn").state;
    const shared = JSON.stringify(hiveMind.view(state, "player"));
    expect(shared).not.toContain("unicorn");
    const mine = hiveMind.playerView!(state, "p1") as { you: { answer: string } };
    expect(mine.you.answer).toBe("unicorn");
    const theirs = hiveMind.playerView!(state, "p2") as { you: { answer: null } };
    expect(theirs.you.answer).toBeNull();
  });
});
