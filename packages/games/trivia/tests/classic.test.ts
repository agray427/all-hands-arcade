import { describe, expect, it } from "vitest";
import { decks, trivia } from "../src/index.js";
import { answer, Clock, correctChoice, fire, start, wrongChoice } from "./helpers.js";

const deckSize = decks[0]!.questions.length;

describe("classic setup", () => {
  it("defaults rounds to the deck size", () => {
    const clock = new Clock();
    const { state } = start("classic", {}, clock);
    expect(state.rules.rounds).toBe(deckSize);
    expect(state.order).toHaveLength(deckSize);
  });

  it("clamps a rounds override to the deck size", () => {
    const clock = new Clock();
    expect(start("classic", { rounds: 5 }, clock).state.rules.rounds).toBe(5);
    expect(start("classic", { rounds: 500 }, clock).state.rules.rounds).toBe(deckSize);
  });

  it("starts round 1 with a question timer and deadline", () => {
    const clock = new Clock();
    const { state, effects } = start("classic", {}, clock);
    expect(state.phase).toBe("question");
    expect(state.round).toBe(1);
    expect(state.deadline).toBe(clock.now() + 20000);
    expect(effects).toEqual([{ kind: "schedule", id: "round:1", delayMs: 20000 }]);
  });
});

describe("classic scoring", () => {
  it("gives faster correct answers a bigger speed bonus", () => {
    const clock = new Clock();
    let { state, ctx } = start("classic", {}, clock);
    const right = correctChoice(state);

    clock.advance(1000);
    ({ state } = answer(state, ctx, "p1", right));
    clock.advance(8000);
    const result = answer(state, ctx, "p2", right);
    state = result.state;

    expect(state.phase).toBe("reveal");
    expect(state.scores.p1).toBe(100 + Math.round((400 * 19000) / 20000));
    expect(state.scores.p2).toBe(100 + Math.round((400 * 11000) / 20000));
    expect(state.scores.p1!).toBeGreaterThan(state.scores.p2!);
  });

  it("gives wrong answers nothing but never eliminates", () => {
    const clock = new Clock();
    let { state, ctx } = start("classic", {}, clock);
    ({ state } = answer(state, ctx, "p1", wrongChoice(state)));
    ({ state } = answer(state, ctx, "p2", correctChoice(state)));

    expect(state.outcomes.p1).toBe("wrong");
    expect(state.scores.p1).toBe(0);
    expect(state.eliminatedAt).toEqual({});
  });
});

describe("classic round flow", () => {
  it("advances to reveal early once everyone has answered", () => {
    const clock = new Clock();
    let { state, ctx } = start("classic", {}, clock);
    ({ state } = answer(state, ctx, "p1", 0));
    const { state: after, effects } = answer(state, ctx, "p2", 0);

    expect(after.phase).toBe("reveal");
    expect(effects).toEqual([
      { kind: "cancel", id: "round:1" },
      { kind: "schedule", id: "reveal:1", delayMs: 4000 },
    ]);
  });

  it("marks non-answerers as timeout when the round timer fires", () => {
    const clock = new Clock();
    let { state, ctx } = start("classic", {}, clock);
    ({ state } = answer(state, ctx, "p1", correctChoice(state)));

    clock.advance(20000);
    const { state: revealed } = fire(state, ctx, "round:1");
    expect(revealed.phase).toBe("reveal");
    expect(revealed.outcomes.p1).toBe("correct");
    expect(revealed.outcomes.p2).toBe("timeout");
  });

  it("ignores duplicate, out-of-range, and unknown-sender answers", () => {
    const clock = new Clock();
    let { state, ctx } = start("classic", {}, clock, ["Ada", "Grace", "Hedy"]);
    const first = answer(state, ctx, "p1", 0);
    const dup = answer(first.state, ctx, "p1", 1);
    expect(dup.state.answers.p1).toEqual(first.state.answers.p1);

    expect(answer(state, ctx, "p1", 7).state.answers).toEqual({});
    expect(answer(state, ctx, "p1", -1).state.answers).toEqual({});
    expect(answer(state, ctx, "ghost", 0).state.answers).toEqual({});
  });

  it("runs rounds until the configured count then ends with results by score", () => {
    const clock = new Clock();
    let { state, ctx } = start("classic", { rounds: 2 }, clock);

    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p2", wrongChoice(state)));
    ({ state } = fire(state, ctx, "reveal:1"));
    expect(state.phase).toBe("question");
    expect(state.round).toBe(2);
    expect(state.answers).toEqual({});

    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p2", correctChoice(state)));
    const { state: ended, effects } = fire(state, ctx, "reveal:2");

    expect(ended.phase).toBe("ended");
    expect(effects).toEqual([{ kind: "end" }]);

    const leaderboard = trivia.results(ended);
    expect(leaderboard[0]!.participantId).toBe("p1");
    expect(leaderboard[0]!.rank).toBe(1);
    expect(leaderboard[1]!.participantId).toBe("p2");
    expect(leaderboard[0]!.score).toBeGreaterThan(leaderboard[1]!.score);
  });
});

describe("classic views", () => {
  it("shows prompt and choices to both audiences without the answer during the question", () => {
    const clock = new Clock();
    const { state } = start("classic", {}, clock);

    for (const audience of ["host", "player"] as const) {
      const view = trivia.view(state, audience) as Record<string, unknown>;
      const question = view.question as { prompt: string; choices: string[] };
      expect(question.prompt.length).toBeGreaterThan(0);
      expect(question.choices).toHaveLength(4);
      expect(view).not.toHaveProperty("correctIndex");
      expect(view).not.toHaveProperty("outcomes");
    }
  });

  it("includes the correct index and outcomes at reveal", () => {
    const clock = new Clock();
    let { state, ctx } = start("classic", {}, clock);
    const right = correctChoice(state);
    ({ state } = answer(state, ctx, "p1", right));
    ({ state } = answer(state, ctx, "p2", right));

    const view = trivia.view(state, "player") as Record<string, unknown>;
    expect(view.correctIndex).toBe(right);
    expect(view.outcomes).toEqual({ p1: "correct", p2: "correct" });
  });
});
