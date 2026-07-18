import { describe, expect, it } from "vitest";
import type { GameContext, Participant } from "@arcade/core";
import { resolveConfig } from "@arcade/core";
import { trivia } from "../src/index.js";
import { answer, Clock, correctChoice, fire, presence, start } from "./helpers.js";

describe("presence", () => {
  it("marks and clears offline contestants", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock);
    const away = presence(state, ctx, "p1", false).state;
    expect(away.offline).toEqual({ p1: true });

    const back = presence(away, ctx, "p1", true).state;
    expect(back.offline).toEqual({});
  });

  it("ignores non-contestants", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock);
    const next = presence(state, ctx, "ghost", false).state;
    expect(next).toBe(state);
  });

  it("snapshots players already disconnected at setup", () => {
    const clock = new Clock();
    const players: Participant[] = [
      { id: "p1", name: "Ada", role: "player", connected: true },
      { id: "p2", name: "Grace", role: "player", connected: false },
    ];
    const ctx: GameContext = { players, now: clock.now, random: () => 0.999999 };
    const resolved = resolveConfig(trivia, "classic", {});
    if (!resolved.ok) throw new Error(resolved.error);
    const { state } = trivia.setup(resolved.variantId, resolved.config, ctx);
    expect(state.offline).toEqual({ p2: true });
  });

  it("labels an offline non-answerer absent and a connected one timeout", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock, ["Ada", "Grace", "Hedy"]);
    let next = answer(state, ctx, "p1", correctChoice(state)).state;
    next = presence(next, ctx, "p2", false).state;
    next = fire(next, ctx, "round:1").state;

    expect(next.outcomes).toEqual({ p1: "correct", p2: "absent", p3: "timeout" });
  });

  it("still eliminates absent contestants in survival", () => {
    const clock = new Clock();
    const { state, ctx } = start("survival", {}, clock);
    let next = answer(state, ctx, "p1", correctChoice(state)).state;
    next = presence(next, ctx, "p2", false).state;
    next = fire(next, ctx, "round:1").state;

    expect(next.outcomes.p2).toBe("absent");
    expect(next.eliminatedAt.p2).toBe(1);
    const detail = trivia.results(next).find((r) => r.participantId === "p2")!.detail;
    expect(detail).toBe("Eliminated round 1");
  });

  it("keeps a recorded answer even if the player disconnects before the reveal", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock);
    let next = answer(state, ctx, "p1", correctChoice(state)).state;
    next = presence(next, ctx, "p1", false).state;
    next = fire(next, ctx, "round:1").state;

    expect(next.outcomes.p1).toBe("correct");
    expect(next.scores.p1).toBeGreaterThan(0);
  });

  it("scores normally after reconnecting before the deadline", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock);
    let next = presence(state, ctx, "p1", false).state;
    next = presence(next, ctx, "p1", true).state;
    next = answer(next, ctx, "p1", correctChoice(next)).state;
    next = fire(next, ctx, "round:1").state;

    expect(next.outcomes.p1).toBe("correct");
  });

  it("does not advance early because of an offline non-answerer", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock);
    let next = presence(state, ctx, "p2", false).state;
    next = answer(next, ctx, "p1", correctChoice(next)).state;
    expect(next.phase).toBe("question");
  });

  it("presence changes schedule nothing", () => {
    const clock = new Clock();
    const { state, ctx } = start("classic", {}, clock);
    expect(presence(state, ctx, "p1", false).effects).toEqual([]);
  });
});
