import { describe, expect, it } from "vitest";
import { questionTimeFor, trivia } from "../src/index.js";
import { answer, Clock, correctChoice, fire, start, wrongChoice } from "./helpers.js";

describe("survival timing", () => {
  it("shrinks question time each round and floors at minTimeMs", () => {
    const clock = new Clock();
    const { state } = start(
      "survival",
      { startTimeMs: 10000, stepMs: 1000, minTimeMs: 2000 },
      clock,
    );
    expect(questionTimeFor(state.rules, 1)).toBe(10000);
    expect(questionTimeFor(state.rules, 5)).toBe(6000);
    expect(questionTimeFor(state.rules, 9)).toBe(2000);
    expect(questionTimeFor(state.rules, 15)).toBe(2000);
  });

  it("uses the shrinking time for the next round's deadline", () => {
    const clock = new Clock();
    let { state, ctx } = start(
      "survival",
      { startTimeMs: 10000, stepMs: 1000, minTimeMs: 2000 },
      clock,
      ["Ada", "Grace", "Hedy"],
    );
    for (const id of ["p1", "p2", "p3"]) {
      ({ state } = answer(state, ctx, id, correctChoice(state)));
    }
    clock.advance(4000);
    ({ state } = fire(state, ctx, "reveal:1"));
    expect(state.round).toBe(2);
    expect(state.deadline).toBe(clock.now() + 9000);
  });
});

describe("survival elimination", () => {
  it("eliminates wrong answers at reveal", () => {
    const clock = new Clock();
    let { state, ctx } = start("survival", {}, clock, ["Ada", "Grace", "Hedy"]);
    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p2", wrongChoice(state)));
    ({ state } = answer(state, ctx, "p3", correctChoice(state)));

    expect(state.phase).toBe("reveal");
    expect(state.eliminatedAt).toEqual({ p2: 1 });
    expect(state.scores).toEqual({ p1: 1, p2: 0, p3: 1 });
  });

  it("eliminates silent players when the round timer fires", () => {
    const clock = new Clock();
    let { state, ctx } = start("survival", {}, clock, ["Ada", "Grace", "Hedy"]);
    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p2", correctChoice(state)));

    clock.advance(10000);
    ({ state } = fire(state, ctx, "round:1"));
    expect(state.outcomes.p3).toBe("timeout");
    expect(state.eliminatedAt).toEqual({ p3: 1 });
  });

  it("ignores answers from eliminated players in later rounds", () => {
    const clock = new Clock();
    let { state, ctx } = start("survival", {}, clock, ["Ada", "Grace", "Hedy"]);
    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p2", wrongChoice(state)));
    ({ state } = answer(state, ctx, "p3", correctChoice(state)));
    ({ state } = fire(state, ctx, "reveal:1"));

    expect(state.round).toBe(2);
    const before = state;
    ({ state } = answer(state, ctx, "p2", correctChoice(state)));
    expect(state.answers).toEqual(before.answers);
  });

  it("advances early once all alive contestants answered, ignoring the eliminated", () => {
    const clock = new Clock();
    let { state, ctx } = start("survival", {}, clock, ["Ada", "Grace", "Hedy"]);
    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p2", wrongChoice(state)));
    ({ state } = answer(state, ctx, "p3", correctChoice(state)));
    ({ state } = fire(state, ctx, "reveal:1"));

    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    const { state: after } = answer(state, ctx, "p3", correctChoice(state));
    expect(after.phase).toBe("reveal");
  });
});

describe("survival end conditions", () => {
  it("ends when one or fewer contestants remain", () => {
    const clock = new Clock();
    let { state, ctx } = start("survival", {}, clock);
    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p2", wrongChoice(state)));

    const { state: ended, effects } = fire(state, ctx, "reveal:1");
    expect(ended.phase).toBe("ended");
    expect(effects).toEqual([{ kind: "end" }]);
  });

  it("ends when maxRounds is exhausted even with survivors", () => {
    const clock = new Clock();
    let { state, ctx } = start("survival", { maxRounds: 1 }, clock);
    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p2", correctChoice(state)));

    const { state: ended } = fire(state, ctx, "reveal:1");
    expect(ended.phase).toBe("ended");
  });

  it("ranks survivors above the eliminated and shows how far each got", () => {
    const clock = new Clock();
    let { state, ctx } = start("survival", {}, clock, ["Ada", "Grace", "Hedy"]);
    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p2", wrongChoice(state)));
    ({ state } = answer(state, ctx, "p3", correctChoice(state)));
    ({ state } = fire(state, ctx, "reveal:1"));

    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p3", wrongChoice(state)));
    const { state: ended } = fire(state, ctx, "reveal:2");

    expect(ended.phase).toBe("ended");
    const leaderboard = trivia.results(ended);
    expect(leaderboard.map((e) => e.participantId)).toEqual(["p1", "p3", "p2"]);
    expect(leaderboard[0]!.detail).toBe("Survived");
    expect(leaderboard[1]!.detail).toBe("Eliminated round 2");
    expect(leaderboard[2]!.detail).toBe("Eliminated round 1");
    expect(leaderboard.map((e) => e.rank)).toEqual([1, 2, 3]);
  });
});
