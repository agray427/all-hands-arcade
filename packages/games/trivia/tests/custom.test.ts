import { describe, expect, it } from "vitest";
import { resolveConfig } from "@arcade/core";
import { parseCustomDeck } from "../src/custom.js";
import { trivia } from "../src/index.js";
import { answer, Clock, correctChoice, start } from "./helpers.js";

const source = [
  "What is 2 + 2? | 3 | *4 | 22",
  "",
  "Best pet? | *Dog | Cat | Fish | Rock | Snail | Ant",
].join("\n");

describe("parseCustomDeck", () => {
  it("parses prompts, choices, and the starred correct answer", () => {
    const parsed = parseCustomDeck(source);
    expect(parsed).toEqual({
      ok: true,
      questions: [
        { prompt: "What is 2 + 2?", choices: ["3", "4", "22"], correctIndex: 1 },
        {
          prompt: "Best pet?",
          choices: ["Dog", "Cat", "Fish", "Rock", "Snail", "Ant"],
          correctIndex: 0,
        },
      ],
    });
  });

  it("rejects bad input with the line number", () => {
    expect(parseCustomDeck("Only a prompt?")).toEqual({
      ok: false,
      error: "line 1: needs 2 to 6 choices",
    });
    expect(parseCustomDeck("Q? | a | b")).toEqual({
      ok: false,
      error: "line 1: mark exactly one correct choice with a leading *",
    });
    expect(parseCustomDeck("Q? | *a | *b")).toEqual({
      ok: false,
      error: "line 1: mark exactly one correct choice with a leading *",
    });
    expect(parseCustomDeck("ok? | *a | b\nQ? | *a |")).toEqual({
      ok: false,
      error: "line 2: empty choice",
    });
    expect(parseCustomDeck("Q? | a | b | c | d | e | f | *g")).toEqual({
      ok: false,
      error: "line 1: needs 2 to 6 choices",
    });
    expect(parseCustomDeck(" \n ")).toEqual({
      ok: false,
      error: "custom deck has no questions",
    });
  });
});

describe("custom decks in config", () => {
  it("requires customDeck when the custom deck is picked", () => {
    expect(resolveConfig(trivia, "classic", { deck: "custom" })).toMatchObject({
      ok: false,
      code: "INVALID_CONFIG",
      error: "customDeck is required when deck is custom",
    });
  });

  it("surfaces parse errors as INVALID_CONFIG on every variant", () => {
    for (const variantId of ["classic", "survival", "host-paced"]) {
      expect(
        resolveConfig(trivia, variantId, { deck: "custom", customDeck: "bad line" }),
      ).toMatchObject({ ok: false, code: "INVALID_CONFIG", error: /line 1/ });
    }
  });

  it("ignores customDeck when a bundled deck is picked", () => {
    const resolved = resolveConfig(trivia, "classic", {
      deck: "general",
      customDeck: "ignored",
    });
    expect(resolved).toMatchObject({ ok: true });
    if (resolved.ok) expect(resolved.config.customDeck).toBeUndefined();
  });
});

describe("custom decks in play", () => {
  it("defaults rounds to the custom deck size and plays its questions", () => {
    const clock = new Clock();
    let { state, ctx } = start("classic", { deck: "custom", customDeck: source }, clock);
    expect(state.rules.rounds).toBe(2);
    expect(state.questions).toHaveLength(2);

    const right = correctChoice(state);
    ({ state } = answer(state, ctx, "p1", right));
    ({ state } = answer(state, ctx, "p2", (right + 1) % state.questions[0]!.choices.length));
    expect(state.phase).toBe("reveal");
    expect(state.outcomes.p1).toBe("correct");
    expect(state.outcomes.p2).toBe("wrong");
  });

  it("clamps a rounds override to the custom deck size", () => {
    const clock = new Clock();
    const { state } = start(
      "classic",
      { deck: "custom", customDeck: source, rounds: 50 },
      clock,
    );
    expect(state.rules.rounds).toBe(2);
  });
});
