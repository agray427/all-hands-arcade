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
  pairOf,
  partnerIn,
  poolOf,
  type SosChoice,
  type SosPair,
  type SosState,
} from "./state.js";

function buildRules(config: GameConfig) {
  return {
    decisionTimeMs: (config.decisionTimeMs as number | undefined) ?? 15000,
    startingPot: (config.startingPot as number | undefined) ?? 100,
  };
}

function decideTimer(round: number): string {
  return `decide:${round}`;
}

function makePairs(state: SosState, ctx: GameContext): ReduceResult<SosState> {
  const pool = poolOf(state);
  const { pairs, bye } = pairUp(pool, ctx.random);
  const built: SosPair[] = pairs.map(([a, b]) => {
    const staked = (state.stakes[a] ?? 0) + (state.stakes[b] ?? 0);
    return { a, b, pot: staked > 0 ? staked : state.rules.startingPot, choices: {}, outcome: null };
  });
  return {
    state: { ...state, phase: "pairing", pairs: built, bye, deadline: 0 },
  };
}

function toDecide(state: SosState, now: number): ReduceResult<SosState> {
  return {
    state: { ...state, phase: "decide", deadline: now + state.rules.decisionTimeMs },
    effects: [
      { kind: "schedule", id: decideTimer(state.round), delayMs: state.rules.decisionTimeMs },
    ],
  };
}

function toReveal(state: SosState, cancelTimer: boolean): ReduceResult<SosState> {
  const stakes = { ...state.stakes };
  const banked = { ...state.banked };
  const eliminatedAt = { ...state.eliminatedAt };

  const pairs = state.pairs.map((pair) => {
    const aChoice: SosChoice = pair.choices[pair.a] ?? "split";
    const bChoice: SosChoice = pair.choices[pair.b] ?? "split";
    const choices: Record<string, SosChoice> = { [pair.a]: aChoice, [pair.b]: bChoice };
    if (aChoice === "split" && bChoice === "split") {
      const half = pair.pot / 2;
      banked[pair.a] = (banked[pair.a] ?? 0) + half;
      banked[pair.b] = (banked[pair.b] ?? 0) + half;
      stakes[pair.a] = 0;
      stakes[pair.b] = 0;
      return { ...pair, choices, outcome: "double-split" as const };
    }
    if (aChoice === "steal" && bChoice === "steal") {
      eliminatedAt[pair.a] = state.round;
      eliminatedAt[pair.b] = state.round;
      stakes[pair.a] = 0;
      stakes[pair.b] = 0;
      return { ...pair, choices, outcome: "double-steal" as const };
    }
    const stealer = aChoice === "steal" ? pair.a : pair.b;
    const splitter = partnerIn(pair, stealer);
    stakes[stealer] = pair.pot;
    stakes[splitter] = 0;
    eliminatedAt[splitter] = state.round;
    return { ...pair, choices, outcome: "split-steal" as const };
  });

  return {
    state: { ...state, phase: "reveal", pairs, stakes, banked, eliminatedAt },
    effects: cancelTimer ? [{ kind: "cancel", id: decideTimer(state.round) }] : [],
  };
}

function nextRound(state: SosState, ctx: GameContext): ReduceResult<SosState> {
  const pool = poolOf(state);
  if (pool.length < 2) {
    const banked = { ...state.banked };
    const stakes = { ...state.stakes };
    for (const id of pool) {
      banked[id] = (banked[id] ?? 0) + (stakes[id] ?? 0);
      stakes[id] = 0;
    }
    return {
      state: { ...state, phase: "ended", banked, stakes },
      effects: [{ kind: "end" }],
    };
  }
  return makePairs({ ...state, round: state.round + 1 }, ctx);
}

function handleChoice(
  state: SosState,
  event: Extract<GameEvent, { kind: "message" }>,
): ReduceResult<SosState> {
  if (state.phase !== "decide") return { state };
  const pair = pairOf(state, event.from);
  if (!pair) return { state };
  if (pair.choices[event.from]) return { state };

  const choice = (event.payload as { choice: string }).choice;
  if (choice !== "split" && choice !== "steal") return { state };

  const pairs = state.pairs.map((p) =>
    p === pair
      ? { ...p, choices: { ...p.choices, [event.from]: choice } as Record<string, SosChoice> }
      : p,
  );
  const next = { ...state, pairs };
  const allChosen = next.pairs.every(
    (p) => p.choices[p.a] !== undefined && p.choices[p.b] !== undefined,
  );
  if (allChosen) return toReveal(next, true);
  return { state: next };
}

function handleAdvance(
  state: SosState,
  event: Extract<GameEvent, { kind: "message" }>,
  ctx: GameContext,
): ReduceResult<SosState> {
  if (event.role !== "host") return { state };
  if (state.phase === "pairing") return toDecide(state, ctx.now());
  if (state.phase === "reveal") return nextRound(state, ctx);
  return { state };
}

function handlePresence(
  state: SosState,
  event: Extract<GameEvent, { kind: "presence" }>,
): ReduceResult<SosState> {
  if (!state.contestants.includes(event.participantId)) return { state };
  const offline = { ...state.offline };
  if (event.connected) {
    delete offline[event.participantId];
  } else {
    offline[event.participantId] = true;
  }
  return { state: { ...state, offline } };
}

function reduce(state: SosState, event: GameEvent, ctx: GameContext): ReduceResult<SosState> {
  if (state.phase === "ended") return { state };
  switch (event.kind) {
    case "presence":
      return handlePresence(state, event);
    case "message":
      if (event.type === "sos:choice") return handleChoice(state, event);
      if (event.type === "round:advance") return handleAdvance(state, event, ctx);
      return { state };
    case "timer":
      if (event.id === decideTimer(state.round) && state.phase === "decide") {
        return toReveal(state, false);
      }
      return { state };
  }
}

function results(state: SosState): GameResults {
  const entries = state.contestants.map((id) => ({
    participantId: id,
    name: state.names[id] ?? "?",
    banked: state.banked[id] ?? 0,
    out: state.eliminatedAt[id],
  }));
  entries.sort((a, b) => b.banked - a.banked || a.name.localeCompare(b.name));
  return entries.map((entry, index) => ({
    participantId: entry.participantId,
    name: entry.name,
    rank: index + 1,
    score: entry.banked,
    detail:
      entry.out === undefined
        ? `Banked $${entry.banked}`
        : `Out round ${entry.out} — banked $${entry.banked}`,
  }));
}

function view(state: SosState, audience: "host" | "player") {
  const revealed = state.phase === "reveal" || state.phase === "ended";
  return {
    gameId: "split-or-steal",
    phase: state.phase,
    round: state.round,
    deadline: state.deadline,
    timeMs: state.rules.decisionTimeMs,
    poolCount: poolOf(state).length,
    pairs: state.pairs.map((pair) => ({
      aName: state.names[pair.a] ?? "?",
      bName: state.names[pair.b] ?? "?",
      pot: pair.pot,
      aChosen: pair.choices[pair.a] !== undefined,
      bChosen: pair.choices[pair.b] !== undefined,
      outcome: revealed ? pair.outcome : null,
      choices: revealed ? pair.choices : null,
    })),
    byeName: state.bye ? (state.names[state.bye] ?? "?") : null,
    names: state.names,
    eliminatedAt: state.eliminatedAt,
    audience,
  };
}

function playerView(state: SosState, participantId: string) {
  const base = view(state, "player");
  if (!state.contestants.includes(participantId)) return { ...base, you: null };
  const pair = pairOf(state, participantId);
  const revealed = state.phase === "reveal" || state.phase === "ended";
  return {
    ...base,
    you: {
      stake: state.stakes[participantId] ?? 0,
      banked: state.banked[participantId] ?? 0,
      eliminatedRound: state.eliminatedAt[participantId] ?? null,
      bye: state.bye === participantId,
      pair: pair
        ? {
            partnerName: state.names[partnerIn(pair, participantId)] ?? "?",
            pot: pair.pot,
            yourChoice: pair.choices[participantId] ?? null,
            partnerChose: pair.choices[partnerIn(pair, participantId)] !== undefined,
            outcome: revealed ? pair.outcome : null,
            partnerChoice: revealed
              ? (pair.choices[partnerIn(pair, participantId)] ?? null)
              : null,
          }
        : null,
    },
  };
}

export const splitOrSteal: GameDefinition<SosState> = {
  id: "split-or-steal",
  name: "Split or Steal: The Swarm",
  description:
    "Find your partner, look them in the eye, and decide: share the pot or take it all.",
  minPlayers: 2,
  stability: "alpha",
  defaultVariant: "swarm",
  variants: {
    swarm: {
      name: "Swarm",
      description:
        "Random 1v1 pairings with snowballing stakes. The host kicks off each face-off.",
      hostDriven: true,
      configFields: {
        startingPot: { type: "number", label: "Starting pot per pair ($)", default: 100, min: 2 },
        decisionTimeMs: {
          type: "number",
          label: "Decision window (ms)",
          default: 15000,
          min: 3000,
        },
      },
    },
  },
  messages: {
    "sos:choice": { choice: "string" },
    "round:advance": {},
  },
  setup(_variantId, config, ctx) {
    const rules = buildRules(config);
    const contestants = ctx.players.map((p) => p.id);
    const base: SosState = {
      rules,
      phase: "pairing",
      round: 1,
      pairs: [],
      bye: null,
      stakes: Object.fromEntries(contestants.map((id) => [id, 0])),
      banked: Object.fromEntries(contestants.map((id) => [id, 0])),
      eliminatedAt: {},
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
