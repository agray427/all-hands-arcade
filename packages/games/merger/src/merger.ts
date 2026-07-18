import {
  pairUp,
  type GameConfig,
  type GameContext,
  type GameDefinition,
  type GameEvent,
  type GameResults,
  type ReduceResult,
} from "@arcade/core";
import {
  activePool,
  netDelta,
  pairOf,
  partnerIn,
  type AssetEstimate,
  type MergerPair,
  type MergerRules,
  type MergerState,
} from "./state.js";

function buildRules(config: GameConfig): MergerRules {
  return {
    negotiationTimeMs: (config.negotiationTimeMs as number | undefined) ?? 120000,
    showdownTimeMs: (config.showdownTimeMs as number | undefined) ?? 10000,
    startingAsset: (config.startingAsset as number | undefined) ?? 100,
  };
}

function negotiateTimer(round: number): string {
  return `negotiate:${round}`;
}

function showdownTimer(round: number): string {
  return `showdown:${round}`;
}

export function estimateFor(asset: number, random: () => number): AssetEstimate {
  const variance = Math.max(1, Math.round(asset * (0.2 + random() * 0.4)));
  return { minEst: Math.max(0, asset - variance), maxEst: asset + variance };
}

function makePairs(state: MergerState, ctx: GameContext): ReduceResult<MergerState> {
  const pool = activePool(state);
  const { pairs, bye } = pairUp(pool, ctx.random);
  const built: MergerPair[] = pairs.map(([a, b]) => ({
    a,
    b,
    assetsAtPairing: { [a]: state.assets[a] ?? 0, [b]: state.assets[b] ?? 0 },
    estimates: {
      [a]: estimateFor(state.assets[a] ?? 0, ctx.random),
      [b]: estimateFor(state.assets[b] ?? 0, ctx.random),
    },
    offers: {},
    resolution: null,
  }));
  return {
    state: {
      ...state,
      phase: "negotiate",
      pairs: built,
      bye,
      deadline: ctx.now() + state.rules.negotiationTimeMs,
    },
    effects: [
      {
        kind: "schedule",
        id: negotiateTimer(state.round),
        delayMs: state.rules.negotiationTimeMs,
      },
    ],
  };
}

function resolveDeal(
  state: MergerState,
  pair: MergerPair,
  acceptedBy: string,
): { pair: MergerPair; assets: MergerState["assets"]; banked: MergerState["banked"]; exitedAt: MergerState["exitedAt"] } {
  const partner = partnerIn(pair, acceptedBy);
  const partnerPct = pair.offers[partner]!;
  const acceptorPct = 100 - partnerPct;
  const combined = (state.assets[pair.a] ?? 0) + (state.assets[pair.b] ?? 0);
  const partnerShare = Math.round((combined * partnerPct) / 100);
  const acceptorShare = combined - partnerShare;

  const advancer =
    partnerPct > acceptorPct ? partner : acceptorPct > partnerPct ? acceptedBy : partner;
  const exiter = advancer === partner ? acceptedBy : partner;
  const shares = { [partner]: partnerShare, [acceptedBy]: acceptorShare };

  const assets = { ...state.assets, [advancer]: shares[advancer]! };
  delete assets[exiter];
  const banked = { ...state.banked, [exiter]: shares[exiter]! };
  const exitedAt = { ...state.exitedAt, [exiter]: state.round };

  return {
    pair: { ...pair, resolution: { kind: "deal", acceptedBy, shares, advancer } },
    assets,
    banked,
    exitedAt,
  };
}

function toShowdown(state: MergerState, cancelTimer: boolean): ReduceResult<MergerState> {
  const assets = { ...state.assets };
  const banked = { ...state.banked };
  const exitedAt = { ...state.exitedAt };

  const pairs = state.pairs.map((pair) => {
    if (pair.resolution) return pair;
    for (const id of [pair.a, pair.b]) {
      banked[id] = assets[id] ?? 0;
      exitedAt[id] = state.round;
      delete assets[id];
    }
    return { ...pair, resolution: { kind: "expired" as const } };
  });

  const next: MergerState = {
    ...state,
    phase: "showdown",
    pairs,
    assets,
    banked,
    exitedAt,
    deadline: 0,
  };
  const effects: ReduceResult<MergerState>["effects"] = [
    { kind: "schedule", id: showdownTimer(state.round), delayMs: state.rules.showdownTimeMs },
  ];
  if (cancelTimer) effects.unshift({ kind: "cancel", id: negotiateTimer(state.round) });
  return { state: next, effects };
}

function nextRound(state: MergerState, ctx: GameContext): ReduceResult<MergerState> {
  const pool = activePool(state);
  if (pool.length < 2) {
    const banked = { ...state.banked };
    const exitedAt = { ...state.exitedAt };
    for (const id of pool) {
      banked[id] = state.assets[id] ?? 0;
      exitedAt[id] = state.round;
    }
    return {
      state: { ...state, phase: "ended", banked, exitedAt },
      effects: [{ kind: "end" }],
    };
  }
  return makePairs({ ...state, round: state.round + 1 }, ctx);
}

function withPair(state: MergerState, updated: MergerPair): MergerPair[] {
  return state.pairs.map((p) => (p.a === updated.a && p.b === updated.b ? updated : p));
}

function handleOffer(
  state: MergerState,
  event: Extract<GameEvent, { kind: "message" }>,
): ReduceResult<MergerState> {
  if (state.phase !== "negotiate") return { state };
  const pair = pairOf(state, event.from);
  if (!pair || pair.resolution) return { state };

  const pct = (event.payload as { pct: number }).pct;
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return { state };

  const updated = { ...pair, offers: { ...pair.offers, [event.from]: pct } };
  return { state: { ...state, pairs: withPair(state, updated) } };
}

function handleAccept(
  state: MergerState,
  event: Extract<GameEvent, { kind: "message" }>,
): ReduceResult<MergerState> {
  if (state.phase !== "negotiate") return { state };
  const pair = pairOf(state, event.from);
  if (!pair || pair.resolution) return { state };
  const partner = partnerIn(pair, event.from);
  if (pair.offers[partner] === undefined) return { state };

  const resolved = resolveDeal(state, pair, event.from);
  const next: MergerState = {
    ...state,
    pairs: withPair(state, resolved.pair),
    assets: resolved.assets,
    banked: resolved.banked,
    exitedAt: resolved.exitedAt,
  };
  if (next.pairs.every((p) => p.resolution)) return toShowdown(next, true);
  return { state: next };
}

function handlePresence(
  state: MergerState,
  event: Extract<GameEvent, { kind: "presence" }>,
): ReduceResult<MergerState> {
  if (!state.contestants.includes(event.participantId)) return { state };
  const offline = { ...state.offline };
  if (event.connected) {
    delete offline[event.participantId];
  } else {
    offline[event.participantId] = true;
  }
  return { state: { ...state, offline } };
}

function reduce(state: MergerState, event: GameEvent, ctx: GameContext): ReduceResult<MergerState> {
  if (state.phase === "ended") return { state };
  switch (event.kind) {
    case "presence":
      return handlePresence(state, event);
    case "message":
      if (event.type === "merger:offer") return handleOffer(state, event);
      if (event.type === "merger:accept") return handleAccept(state, event);
      return { state };
    case "timer":
      if (event.id === negotiateTimer(state.round) && state.phase === "negotiate") {
        return toShowdown(state, false);
      }
      if (event.id === showdownTimer(state.round) && state.phase === "showdown") {
        return nextRound(state, ctx);
      }
      return { state };
  }
}

function results(state: MergerState): GameResults {
  const entries = state.contestants.map((id) => ({
    participantId: id,
    name: state.names[id] ?? "?",
    banked: state.banked[id] ?? 0,
    delta: netDelta(state, id),
  }));
  entries.sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name));
  return entries.map((entry, index) => ({
    participantId: entry.participantId,
    name: entry.name,
    rank: index + 1,
    score: entry.delta,
    detail: `Banked $${entry.banked} (Δ ${entry.delta >= 0 ? "+" : "−"}$${Math.abs(entry.delta)})`,
  }));
}

function showdownPayload(state: MergerState, pair: MergerPair) {
  if (!pair.resolution) return null;
  const exact: Record<string, { name: string; asset: number; share: number; delta: number }> = {};
  for (const id of [pair.a, pair.b]) {
    const share =
      pair.resolution.kind === "deal"
        ? (pair.resolution.shares[id] ?? 0)
        : (pair.assetsAtPairing[id] ?? 0);
    const holding = state.assets[id] ?? state.banked[id] ?? 0;
    exact[id] = {
      name: state.names[id] ?? "?",
      asset: pair.assetsAtPairing[id] ?? 0,
      share,
      delta: holding - (state.startingAssets[id] ?? 0),
    };
  }
  return {
    kind: pair.resolution.kind,
    exact,
    advancer: pair.resolution.kind === "deal" ? pair.resolution.advancer : null,
  };
}

function view(state: MergerState, audience: "host" | "player") {
  const showdown = state.phase === "showdown" || state.phase === "ended";
  return {
    gameId: "merger",
    phase: state.phase,
    round: state.round,
    deadline: state.deadline,
    timeMs: state.rules.negotiationTimeMs,
    poolCount: activePool(state).length,
    pairs: state.pairs.map((pair) => ({
      aName: state.names[pair.a] ?? "?",
      bName: state.names[pair.b] ?? "?",
      aOffered: pair.offers[pair.a] !== undefined,
      bOffered: pair.offers[pair.b] !== undefined,
      resolved: pair.resolution?.kind ?? null,
      showdown: showdown ? showdownPayload(state, pair) : null,
    })),
    byeName: state.bye ? (state.names[state.bye] ?? "?") : null,
    names: state.names,
    exitedAt: state.exitedAt,
    audience,
  };
}

function playerView(state: MergerState, participantId: string) {
  const base = view(state, "player");
  if (!state.contestants.includes(participantId)) return { ...base, you: null };
  const pair = pairOf(state, participantId);
  const partner = pair ? partnerIn(pair, participantId) : null;
  const showdown =
    pair && (state.phase === "showdown" || state.phase === "ended") && pair.resolution
      ? showdownPayload(state, pair)
      : null;
  return {
    ...base,
    you: {
      asset: state.assets[participantId] ?? null,
      banked: state.banked[participantId] ?? null,
      startingAsset: state.startingAssets[participantId] ?? 0,
      exitedRound: state.exitedAt[participantId] ?? null,
      bye: state.bye === participantId,
      pair:
        pair && partner
          ? {
              partnerName: state.names[partner] ?? "?",
              partnerEstimate: pair.estimates[partner] ?? null,
              yourOffer: pair.offers[participantId] ?? null,
              partnerOffer: pair.offers[partner] ?? null,
              resolved: pair.resolution?.kind ?? null,
              acceptedByYou:
                pair.resolution?.kind === "deal" && pair.resolution.acceptedBy === participantId,
              showdown,
            }
          : null,
    },
  };
}

export const merger: GameDefinition<MergerState> = {
  id: "merger",
  name: "The Merger",
  description:
    "Negotiate a split of your combined assets without ever seeing the other side's books.",
  minPlayers: 2,
  stability: "alpha",
  defaultVariant: "tournament",
  variants: {
    tournament: {
      name: "Tournament",
      description:
        "Pairs must agree on a percentage split. The majority shareholder advances; the minority exits and banks their share. Scored on net delta.",
      configFields: {
        startingAsset: { type: "number", label: "Starting asset ($)", default: 100, min: 10 },
        negotiationTimeMs: {
          type: "number",
          label: "Negotiation window (ms)",
          default: 120000,
          min: 10000,
        },
        showdownTimeMs: {
          type: "number",
          label: "Showdown reveal time (ms)",
          default: 10000,
          min: 2000,
        },
      },
    },
  },
  messages: {
    "merger:offer": { pct: "number" },
    "merger:accept": {},
  },
  setup(_variantId, config, ctx) {
    const rules = buildRules(config);
    const contestants = ctx.players.map((p) => p.id);
    const assets = Object.fromEntries(contestants.map((id) => [id, rules.startingAsset]));
    const base: MergerState = {
      rules,
      phase: "negotiate",
      round: 1,
      assets,
      startingAssets: { ...assets },
      banked: {},
      exitedAt: {},
      pairs: [],
      bye: null,
      deadline: 0,
      offline: Object.fromEntries(
        ctx.players.filter((p) => !p.connected).map((p) => [p.id, true as const]),
      ),
      contestants,
      names: Object.fromEntries(ctx.players.map((p) => [p.id, p.name])),
    };
    return makePairs(base, ctx);
  },
  reduce,
  view,
  playerView,
  results,
};
