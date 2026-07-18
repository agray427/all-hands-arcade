import { describe, expect, it } from "vitest";
import { trivia } from "../src/index.js";
import { answer, Clock, correctChoice, fire, start, wrongChoice } from "./helpers.js";

interface You {
  choice: number | null;
  outcome: "correct" | "wrong" | "timeout" | null;
  score: number;
  eliminatedRound: number | null;
}

function personal(state: Parameters<typeof trivia.view>[0], id: string): You {
  return (trivia.playerView!(state, id) as { you: You }).you;
}

describe("playerView", () => {
  it("matches the public player view plus a you block", () => {
    const { state } = start("classic", {}, new Clock());
    const publicView = trivia.view(state, "player") as Record<string, unknown>;
    const mine = trivia.playerView!(state, "p1") as Record<string, unknown>;
    expect({ ...mine, you: undefined }).toEqual({ ...publicView, you: undefined });
    expect(mine.you).toBeDefined();
  });

  it("shows a contestant their own choice during the question phase and nobody else's", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock);
    const picked = wrongChoice(state);
    const next = answer(state, ctx, "p1", picked).state;

    expect(personal(next, "p1").choice).toBe(picked);
    expect(personal(next, "p2").choice).toBeNull();
    const serialized = JSON.stringify(trivia.playerView!(next, "p2"));
    expect(serialized).not.toContain(`"choice":${picked}`);
  });

  it("never leaks choices through the public views", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock);
    const next = answer(state, ctx, "p1", correctChoice(state)).state;
    for (const audience of ["host", "player"] as const) {
      expect(JSON.stringify(trivia.view(next, audience))).not.toContain('"choice":');
    }
  });

  it("carries outcome, score, and elimination after the reveal", () => {
    const clock = new Clock();
    const { state, ctx } = start("survival", {}, clock);
    let next = answer(state, ctx, "p1", correctChoice(state)).state;
    next = answer(next, ctx, "p2", wrongChoice(next)).state;

    expect(personal(next, "p1")).toEqual({
      choice: correctChoice(state),
      outcome: "correct",
      score: 1,
      eliminatedRound: null,
    });
    expect(personal(next, "p2")).toEqual({
      choice: wrongChoice(state),
      outcome: "wrong",
      score: 0,
      eliminatedRound: 1,
    });
  });

  it("marks a timed-out contestant in their you block", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock);
    const next = fire(state, ctx, "round:1").state;
    expect(personal(next, "p1")).toEqual({
      choice: null,
      outcome: "timeout",
      score: 0,
      eliminatedRound: null,
    });
  });

  it("gives non-contestants you: null", () => {
    const { state } = start("classic", {}, new Clock());
    const spectator = trivia.playerView!(state, "ghost") as { you: You | null };
    expect(spectator.you).toBeNull();
  });
});
