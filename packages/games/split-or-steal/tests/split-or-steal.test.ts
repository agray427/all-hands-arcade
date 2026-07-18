import { describe, expect, it } from "vitest";
import type { GameContext } from "@arcade/core";
import { splitOrSteal, type SosState } from "../src/index.js";

function ctxFor(count: number): GameContext {
  return {
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      role: "player" as const,
      connected: true,
    })),
    now: () => 1000,
    random: () => 0.01,
  };
}

function choose(state: SosState, ctx: GameContext, from: string, choice: string) {
  return splitOrSteal.reduce(
    state,
    { kind: "message", type: "sos:choice", payload: { choice }, from, role: "player", messageId: "m" },
    ctx,
  );
}

function advance(state: SosState, ctx: GameContext, role: "host" | "player" = "host") {
  return splitOrSteal.reduce(
    state,
    { kind: "message", type: "round:advance", payload: {}, from: "h1", role, messageId: "m" },
    ctx,
  );
}

function fire(state: SosState, ctx: GameContext, id: string) {
  return splitOrSteal.reduce(state, { kind: "timer", id }, ctx);
}

describe("split or steal", () => {
  it("pairs everyone with a starting pot and waits for the host kick-off", () => {
    const ctx = ctxFor(4);
    const { state, effects } = splitOrSteal.setup("swarm", {}, ctx);
    expect(state.phase).toBe("pairing");
    expect(state.pairs).toHaveLength(2);
    expect(state.pairs.every((p) => p.pot === 100)).toBe(true);
    expect(state.bye).toBeNull();
    expect(effects ?? []).toEqual([]);
  });

  it("gives an odd pool a bye who keeps their stake", () => {
    const ctx = ctxFor(5);
    const { state } = splitOrSteal.setup("swarm", {}, ctx);
    expect(state.pairs).toHaveLength(2);
    expect(state.bye).not.toBeNull();
  });

  it("only the host can start the decision window", () => {
    const ctx = ctxFor(2);
    let state = splitOrSteal.setup("swarm", {}, ctx).state;
    expect(advance(state, ctx, "player").state.phase).toBe("pairing");
    const result = advance(state, ctx);
    expect(result.state.phase).toBe("decide");
    expect(result.state.deadline).toBe(1000 + 15000);
    expect(result.effects).toEqual([{ kind: "schedule", id: "decide:1", delayMs: 15000 }]);
  });

  it("double split banks half each and both stay in the pool with zero stakes", () => {
    const ctx = ctxFor(2);
    let state = splitOrSteal.setup("swarm", {}, ctx).state;
    state = advance(state, ctx).state;
    state = choose(state, ctx, "p1", "split").state;
    const result = choose(state, ctx, "p2", "split");
    expect(result.state.phase).toBe("reveal");
    expect(result.state.pairs[0]!.outcome).toBe("double-split");
    expect(result.state.banked).toEqual({ p1: 50, p2: 50 });
    expect(result.state.eliminatedAt).toEqual({});
  });

  it("split and steal gives the stealer the whole pot as stake and eliminates the splitter", () => {
    const ctx = ctxFor(2);
    let state = splitOrSteal.setup("swarm", {}, ctx).state;
    state = advance(state, ctx).state;
    state = choose(state, ctx, "p1", "steal").state;
    const revealed = choose(state, ctx, "p2", "split").state;
    expect(revealed.pairs[0]!.outcome).toBe("split-steal");
    expect(revealed.stakes.p1).toBe(100);
    expect(revealed.eliminatedAt.p2).toBe(1);
    expect(revealed.banked.p2).toBe(0);
  });

  it("double steal burns the pot and eliminates both", () => {
    const ctx = ctxFor(2);
    let state = splitOrSteal.setup("swarm", {}, ctx).state;
    state = advance(state, ctx).state;
    state = choose(state, ctx, "p1", "steal").state;
    const revealed = choose(state, ctx, "p2", "steal").state;
    expect(revealed.pairs[0]!.outcome).toBe("double-steal");
    expect(revealed.eliminatedAt).toEqual({ p1: 1, p2: 1 });
    expect(revealed.banked).toEqual({ p1: 0, p2: 0 });
  });

  it("treats no decision as split when the timer fires", () => {
    const ctx = ctxFor(2);
    let state = splitOrSteal.setup("swarm", {}, ctx).state;
    state = advance(state, ctx).state;
    const revealed = fire(state, ctx, "decide:1").state;
    expect(revealed.pairs[0]!.outcome).toBe("double-split");
  });

  it("snowballs stakes into the next round's pot", () => {
    const ctx = ctxFor(4);
    let state = splitOrSteal.setup("swarm", {}, ctx).state;
    state = advance(state, ctx).state;
    const [pairA, pairB] = state.pairs;
    state = choose(state, ctx, pairA!.a, "steal").state;
    state = choose(state, ctx, pairA!.b, "split").state;
    state = choose(state, ctx, pairB!.a, "steal").state;
    state = choose(state, ctx, pairB!.b, "split").state;
    expect(state.phase).toBe("reveal");
    const next = advance(state, ctx).state;
    expect(next.phase).toBe("pairing");
    expect(next.round).toBe(2);
    expect(next.pairs).toHaveLength(1);
    expect(next.pairs[0]!.pot).toBe(200);
  });

  it("ends when fewer than two remain and banks the survivor's stake", () => {
    const ctx = ctxFor(2);
    let state = splitOrSteal.setup("swarm", {}, ctx).state;
    state = advance(state, ctx).state;
    state = choose(state, ctx, "p1", "steal").state;
    state = choose(state, ctx, "p2", "split").state;
    const result = advance(state, ctx);
    expect(result.state.phase).toBe("ended");
    expect(result.effects).toEqual([{ kind: "end" }]);
    expect(result.state.banked.p1).toBe(100);
    const board = splitOrSteal.results(result.state);
    expect(board[0]).toMatchObject({ participantId: "p1", rank: 1, score: 100 });
  });

  it("hides the partner's choice until the reveal but shows that they chose", () => {
    const ctx = ctxFor(2);
    let state = splitOrSteal.setup("swarm", {}, ctx).state;
    state = advance(state, ctx).state;
    state = choose(state, ctx, "p1", "steal").state;
    const p2View = splitOrSteal.playerView!(state, "p2") as {
      you: { pair: { partnerChose: boolean; partnerChoice: null } };
    };
    expect(p2View.you.pair.partnerChose).toBe(true);
    expect(p2View.you.pair.partnerChoice).toBeNull();
    expect(JSON.stringify(splitOrSteal.view(state, "player"))).not.toContain(':"steal"');
  });
});
