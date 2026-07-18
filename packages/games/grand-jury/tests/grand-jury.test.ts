import { describe, expect, it } from "vitest";
import type { GameContext } from "@arcade/core";
import { grandJury, type JuryState } from "../src/index.js";

function ctxFor(count: number, random: () => number = () => 0.01): GameContext {
  return {
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      role: "player" as const,
      connected: true,
    })),
    now: () => 1000,
    random,
  };
}

function clue(state: JuryState, ctx: GameContext, from: string, word: string) {
  return grandJury.reduce(
    state,
    { kind: "message", type: "jury:clue", payload: { word }, from, role: "player", messageId: "m" },
    ctx,
  );
}

function vote(state: JuryState, ctx: GameContext, from: string, target: string) {
  return grandJury.reduce(
    state,
    { kind: "message", type: "jury:vote", payload: { target }, from, role: "player", messageId: "m" },
    ctx,
  );
}

function fire(state: JuryState, ctx: GameContext, id: string) {
  return grandJury.reduce(state, { kind: "timer", id }, ctx);
}

function saboteurOf(state: JuryState): string {
  return state.contestants.find((id) => state.roles[id] === "saboteur")!;
}

describe("grand jury", () => {
  it("assigns exactly the configured number of saboteurs", () => {
    const ctx = ctxFor(6);
    const { state } = grandJury.setup("classic", { saboteurs: 2 }, ctx);
    const saboteurs = Object.values(state.roles).filter((r) => r === "saboteur");
    expect(saboteurs).toHaveLength(2);
    expect(Object.keys(state.roles)).toHaveLength(6);
  });

  it("clamps saboteurs so at least two jurors exist", () => {
    const ctx = ctxFor(3);
    const { state } = grandJury.setup("classic", { saboteurs: 5 }, ctx);
    expect(Object.values(state.roles).filter((r) => r === "saboteur")).toHaveLength(1);
  });

  it("gives jurors the word and saboteurs only the category", () => {
    const ctx = ctxFor(4);
    const { state } = grandJury.setup("classic", {}, ctx);
    const saboteur = saboteurOf(state);
    const juror = state.contestants.find((id) => state.roles[id] === "juror")!;
    const jurorYou = (grandJury.playerView!(state, juror) as { you: { target: string; category: string } }).you;
    const saboteurYou = (grandJury.playerView!(state, saboteur) as { you: { target: null; category: string } }).you;
    expect(jurorYou.target).toBe(state.words[0]!.word);
    expect(saboteurYou.target).toBeNull();
    expect(saboteurYou.category).toBe(state.words[0]!.category);
  });

  it("never leaks roles or the target word through shared views before the end", () => {
    const ctx = ctxFor(4);
    const { state } = grandJury.setup("classic", {}, ctx);
    const shared = JSON.stringify(grandJury.view(state, "player"));
    const host = JSON.stringify(grandJury.view(state, "host"));
    expect(shared).not.toContain("saboteur");
    expect(host).not.toContain("saboteur");
    expect(shared).not.toContain(state.words[0]!.word);
  });

  it("moves to voting once every living player has submitted a clue", () => {
    const ctx = ctxFor(3);
    let state = grandJury.setup("classic", {}, ctx).state;
    state = clue(state, ctx, "p1", "rows").state;
    state = clue(state, ctx, "p2", "columns").state;
    const result = clue(state, ctx, "p3", "cells");
    expect(result.state.phase).toBe("vote");
    expect(result.effects).toContainEqual({ kind: "cancel", id: "clue:1" });
    expect(result.state.deadline).toBe(1000 + 30000);
  });

  it("takes only the first word of a clue and hides clues until voting", () => {
    const ctx = ctxFor(3);
    let state = grandJury.setup("classic", {}, ctx).state;
    state = clue(state, ctx, "p1", "  Big   Spreadsheet ").state;
    expect(state.clues.p1).toBe("big");
    expect(grandJury.view(state, "host")).toMatchObject({ cloud: [], entries: [] });
  });

  it("eliminates the most-voted player and reveals their role", () => {
    const ctx = ctxFor(4);
    let state = grandJury.setup("classic", {}, ctx).state;
    for (const id of ["p1", "p2", "p3", "p4"]) state = clue(state, ctx, id, `c${id}`).state;
    const saboteur = saboteurOf(state);
    const voters = state.contestants.filter((id) => id !== saboteur);
    state = vote(state, ctx, voters[0]!, saboteur).state;
    state = vote(state, ctx, voters[1]!, saboteur).state;
    state = vote(state, ctx, voters[2]!, saboteur).state;
    const result = vote(state, ctx, saboteur, voters[0]!);
    expect(result.state.phase).toBe("reveal");
    expect(result.state.eliminatedAt[saboteur]).toBe(1);
    expect(result.state.lastEliminated).toEqual([
      { participantId: saboteur, role: "saboteur" },
    ]);
  });

  it("jurors win when every saboteur is out", () => {
    const ctx = ctxFor(4);
    let state = grandJury.setup("classic", {}, ctx).state;
    for (const id of ["p1", "p2", "p3", "p4"]) state = clue(state, ctx, id, "x").state;
    const saboteur = saboteurOf(state);
    for (const id of state.contestants.filter((v) => v !== saboteur)) {
      state = vote(state, ctx, id, saboteur).state;
    }
    state = fire(state, ctx, "vote:1").state;
    const result = fire(state, ctx, "reveal:1");
    expect(result.state.phase).toBe("ended");
    expect(result.state.winner).toBe("jurors");
    expect(result.effects).toEqual([{ kind: "end" }]);
    const board = grandJury.results(result.state);
    expect(board.filter((e) => e.rank === 1).every((e) => e.detail.startsWith("Juror"))).toBe(true);
  });

  it("saboteurs win by surviving the configured number of rounds", () => {
    const ctx = ctxFor(4);
    let state = grandJury.setup("classic", { roundsToWin: 1 }, ctx).state;
    const saboteur = saboteurOf(state);
    const juror = state.contestants.find((id) => state.roles[id] === "juror")!;
    for (const id of state.contestants) state = clue(state, ctx, id, "x").state;
    for (const id of state.contestants) {
      state = vote(state, ctx, id, id === juror ? saboteur : juror).state;
    }
    expect(state.phase).toBe("reveal");
    expect(state.eliminatedAt[juror]).toBe(1);
    const result = fire(state, ctx, "reveal:1");
    expect(result.state.winner).toBe("saboteurs");
  });

  it("ignores self-votes and votes for the eliminated", () => {
    const ctx = ctxFor(3);
    let state = grandJury.setup("classic", {}, ctx).state;
    for (const id of ["p1", "p2", "p3"]) state = clue(state, ctx, id, "x").state;
    const next = vote(state, ctx, "p1", "p1");
    expect(next.state.votes).toEqual({});
  });
});
