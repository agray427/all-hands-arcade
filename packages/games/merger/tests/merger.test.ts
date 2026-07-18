import { describe, expect, it } from "vitest";
import type { GameContext } from "@arcade/core";
import { estimateFor, merger, type MergerState } from "../src/index.js";

function ctxFor(count: number, random: () => number = () => 0.5): GameContext {
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

function offer(state: MergerState, ctx: GameContext, from: string, pct: number) {
  return merger.reduce(
    state,
    { kind: "message", type: "merger:offer", payload: { pct }, from, role: "player", messageId: "m" },
    ctx,
  );
}

function accept(state: MergerState, ctx: GameContext, from: string) {
  return merger.reduce(
    state,
    { kind: "message", type: "merger:accept", payload: {}, from, role: "player", messageId: "m" },
    ctx,
  );
}

function fire(state: MergerState, ctx: GameContext, id: string) {
  return merger.reduce(state, { kind: "timer", id }, ctx);
}

type You = {
  you: {
    asset: number | null;
    banked: number | null;
    pair: {
      partnerEstimate: { minEst: number; maxEst: number };
      partnerOffer: number | null;
      showdown: { exact: Record<string, { asset: number; share: number; delta: number }> } | null;
    } | null;
  };
};

describe("the merger", () => {
  it("starts everyone with the same asset and pairs them with fog-of-war estimates", () => {
    const ctx = ctxFor(4);
    const { state, effects } = merger.setup("tournament", {}, ctx);
    expect(state.phase).toBe("negotiate");
    expect(Object.values(state.assets)).toEqual([100, 100, 100, 100]);
    expect(state.pairs).toHaveLength(2);
    for (const pair of state.pairs) {
      for (const id of [pair.a, pair.b]) {
        const est = pair.estimates[id]!;
        expect(est.minEst).toBeLessThanOrEqual(100);
        expect(est.maxEst).toBeGreaterThanOrEqual(100);
        expect(est.minEst).toBeLessThan(est.maxEst);
      }
    }
    expect(effects).toEqual([{ kind: "schedule", id: "negotiate:1", delayMs: 120000 }]);
  });

  it("keeps estimate ranges straddling the true asset", () => {
    for (const asset of [1, 50, 999]) {
      const est = estimateFor(asset, () => 0.3);
      expect(est.minEst).toBeLessThanOrEqual(asset);
      expect(est.maxEst).toBeGreaterThanOrEqual(asset);
      expect(est.minEst).toBeGreaterThanOrEqual(0);
    }
  });

  it("NEVER exposes the partner's exact asset in any negotiate-phase view", () => {
    const ctx = ctxFor(2, () => 0.37);
    let state = merger.setup("tournament", { startingAsset: 73 }, ctx).state;
    state = offer(state, ctx, "p1", 60).state;
    for (const rendered of [
      JSON.stringify(merger.view(state, "player")),
      JSON.stringify(merger.view(state, "host")),
    ]) {
      expect(rendered).not.toContain("73");
    }
    const p1View = merger.playerView!(state, "p1") as You;
    expect(p1View.you.asset).toBe(73);
    const serialized = JSON.stringify(p1View);
    expect(serialized).not.toContain('"asset":null');
    const estimate = p1View.you.pair!.partnerEstimate;
    expect(estimate.minEst).toBeLessThanOrEqual(73);
    expect(estimate.maxEst).toBeGreaterThanOrEqual(73);
    expect(JSON.stringify(p1View.you.pair)).not.toContain(":73");
  });

  it("relays offers to the partner without revealing anything else", () => {
    const ctx = ctxFor(2);
    let state = merger.setup("tournament", {}, ctx).state;
    state = offer(state, ctx, "p1", 55).state;
    const p2View = merger.playerView!(state, "p2") as You;
    expect(p2View.you.pair!.partnerOffer).toBe(55);
  });

  it("rejects non-integer or out-of-range offers and lets players re-offer", () => {
    const ctx = ctxFor(2);
    let state = merger.setup("tournament", {}, ctx).state;
    expect(offer(state, ctx, "p1", 101).state.pairs[0]!.offers.p1).toBeUndefined();
    expect(offer(state, ctx, "p1", -1).state.pairs[0]!.offers.p1).toBeUndefined();
    expect(offer(state, ctx, "p1", 49.5).state.pairs[0]!.offers.p1).toBeUndefined();
    state = offer(state, ctx, "p1", 40).state;
    state = offer(state, ctx, "p1", 62).state;
    expect(state.pairs[0]!.offers.p1).toBe(62);
  });

  it("cannot accept before the partner has made an offer", () => {
    const ctx = ctxFor(2);
    const state = merger.setup("tournament", {}, ctx).state;
    expect(accept(state, ctx, "p2").state.pairs[0]!.resolution).toBeNull();
  });

  it("accepting closes the deal: majority advances with their share, minority exits banking theirs", () => {
    const ctx = ctxFor(2);
    let state = merger.setup("tournament", { startingAsset: 100 }, ctx).state;
    state = offer(state, ctx, "p1", 60).state;
    const result = accept(state, ctx, "p2");
    const pair = result.state.pairs[0]!;
    expect(pair.resolution).toMatchObject({ kind: "deal", acceptedBy: "p2", advancer: "p1" });
    expect(result.state.assets.p1).toBe(120);
    expect(result.state.assets.p2).toBeUndefined();
    expect(result.state.banked.p2).toBe(80);
    expect(result.state.exitedAt.p2).toBe(1);
    expect(result.state.phase).toBe("showdown");
  });

  it("a 50/50 deal sends the acceptor out and advances the offerer", () => {
    const ctx = ctxFor(2);
    let state = merger.setup("tournament", {}, ctx).state;
    state = offer(state, ctx, "p1", 50).state;
    const result = accept(state, ctx, "p2");
    expect(result.state.pairs[0]!.resolution).toMatchObject({ advancer: "p1" });
    expect(result.state.banked.p2).toBe(100);
  });

  it("reveals exact assets, shares, and deltas only at the showdown", () => {
    const ctx = ctxFor(2);
    let state = merger.setup("tournament", { startingAsset: 100 }, ctx).state;
    state = offer(state, ctx, "p1", 70).state;
    state = accept(state, ctx, "p2").state;
    expect(state.phase).toBe("showdown");
    const p2View = merger.playerView!(state, "p2") as You;
    const showdown = p2View.you.pair!.showdown!;
    expect(showdown.exact.p1).toMatchObject({ asset: 100, share: 140, delta: 40 });
    expect(showdown.exact.p2).toMatchObject({ asset: 100, share: 60, delta: -40 });
  });

  it("an expired negotiation exits both players banking their current assets", () => {
    const ctx = ctxFor(2);
    let state = merger.setup("tournament", {}, ctx).state;
    const result = fire(state, ctx, "negotiate:1");
    expect(result.state.phase).toBe("showdown");
    expect(result.state.pairs[0]!.resolution).toEqual({ kind: "expired" });
    expect(result.state.banked).toEqual({ p1: 100, p2: 100 });
    const done = fire(result.state, ctx, "showdown:1");
    expect(done.state.phase).toBe("ended");
    expect(done.effects).toEqual([{ kind: "end" }]);
  });

  it("runs a second round among advancers and ranks by net delta", () => {
    const ctx = ctxFor(4);
    let state = merger.setup("tournament", { startingAsset: 100 }, ctx).state;
    const [pairA, pairB] = state.pairs;
    state = offer(state, ctx, pairA!.a, 70).state;
    state = accept(state, ctx, pairA!.b).state;
    state = offer(state, ctx, pairB!.a, 55).state;
    state = accept(state, ctx, pairB!.b).state;
    expect(state.phase).toBe("showdown");
    state = fire(state, ctx, "showdown:1").state;
    expect(state.phase).toBe("negotiate");
    expect(state.round).toBe(2);
    expect(state.pairs).toHaveLength(1);
    const [finalPair] = state.pairs;
    expect(finalPair!.assetsAtPairing[pairA!.a]).toBe(140);
    expect(finalPair!.assetsAtPairing[pairB!.a]).toBe(110);
    state = fire(state, ctx, "negotiate:2").state;
    state = fire(state, ctx, "showdown:2").state;
    expect(state.phase).toBe("ended");
    const board = merger.results(state);
    expect(board[0]!.score).toBe(40);
    expect(board[0]!.detail).toContain("+$40");
    expect(board[board.length - 1]!.score).toBe(-40);
  });
});
