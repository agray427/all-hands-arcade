import { describe, expect, it } from "vitest";
import { toCatalog, type GameContext, type Role } from "@arcade/core";
import { decks, trivia } from "../src/index.js";
import type { TriviaState } from "../src/index.js";
import { answer, Clock, correctChoice, start, wrongChoice } from "./helpers.js";

const deckSize = decks[0]!.questions.length;

function advance(
  state: TriviaState,
  ctx: GameContext,
  role: Role = "host",
): { state: TriviaState; effects: ReturnType<typeof trivia.reduce>["effects"] } {
  const result = trivia.reduce(
    state,
    { kind: "message", type: "round:advance", payload: {}, from: "h1", role, messageId: "m-adv" },
    ctx,
  );
  return { state: result.state, effects: result.effects ?? [] };
}

describe("host-paced setup", () => {
  it("is declared host-driven in the catalog while timed variants are not", () => {
    const entry = toCatalog([trivia])[0]!;
    const byId = Object.fromEntries(entry.variants.map((v) => [v.id, v.hostDriven]));
    expect(byId).toEqual({ classic: false, survival: false, "host-paced": true });
  });

  it("defaults rounds to the deck size and clamps overrides", () => {
    const clock = new Clock();
    expect(start("host-paced", {}, clock).state.rules.rounds).toBe(deckSize);
    expect(start("host-paced", { rounds: 500 }, clock).state.rules.rounds).toBe(deckSize);
  });

  it("starts with no deadline and schedules no timers", () => {
    const clock = new Clock();
    const { state, effects } = start("host-paced", {}, clock);
    expect(state.phase).toBe("question");
    expect(state.deadline).toBe(0);
    expect(effects).toEqual([]);
  });
});

describe("host-paced flow", () => {
  it("does not auto-reveal when everyone has answered", () => {
    const clock = new Clock();
    let { state, ctx } = start("host-paced", {}, clock);
    ({ state } = answer(state, ctx, "p1", 0));
    const result = answer(state, ctx, "p2", 0);
    expect(result.state.phase).toBe("question");
    expect(result.effects).toEqual([]);
  });

  it("only the host can reveal and advance", () => {
    const clock = new Clock();
    let { state, ctx } = start("host-paced", {}, clock);

    expect(advance(state, ctx, "player").state.phase).toBe("question");

    const revealed = advance(state, ctx);
    expect(revealed.state.phase).toBe("reveal");
    expect(revealed.effects).toEqual([]);

    const next = advance(revealed.state, ctx);
    expect(next.state.phase).toBe("question");
    expect(next.state.round).toBe(2);
    expect(next.effects).toEqual([]);
  });

  it("scores a flat 100 per correct answer regardless of speed", () => {
    const clock = new Clock();
    let { state, ctx } = start("host-paced", {}, clock);
    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    clock.advance(60_000);
    ({ state } = answer(state, ctx, "p2", correctChoice(state)));
    ({ state } = advance(state, ctx));

    expect(state.scores.p1).toBe(100);
    expect(state.scores.p2).toBe(100);
  });

  it("marks non-answerers at reveal without eliminating anyone", () => {
    const clock = new Clock();
    let { state, ctx } = start("host-paced", {}, clock);
    ({ state } = answer(state, ctx, "p1", wrongChoice(state)));
    ({ state } = advance(state, ctx));

    expect(state.outcomes.p1).toBe("wrong");
    expect(state.outcomes.p2).toBe("timeout");
    expect(state.eliminatedAt).toEqual({});
  });

  it("advancing past the last round ends the game", () => {
    const clock = new Clock();
    let { state, ctx } = start("host-paced", { rounds: 1 }, clock);
    ({ state } = answer(state, ctx, "p1", correctChoice(state)));
    ({ state } = answer(state, ctx, "p2", wrongChoice(state)));
    ({ state } = advance(state, ctx));

    const final = advance(state, ctx);
    expect(final.state.phase).toBe("ended");
    expect(final.effects).toEqual([{ kind: "end" }]);
    const results = trivia.results(final.state);
    expect(results[0]!).toMatchObject({ participantId: "p1", rank: 1, score: 100 });
  });

  it("round:advance is ignored by timed variants", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock);
    const result = advance(state, ctx);
    expect(result.state).toBe(state);
  });
});
