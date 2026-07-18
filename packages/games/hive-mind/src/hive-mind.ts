import {
  normalizeText,
  shuffled,
  type GameConfig,
  type GameContext,
  type GameDefinition,
  type GameEffect,
  type GameEvent,
  type GameResults,
  type ReduceResult,
} from "@arcade/core";
import { hivePrompts } from "./prompts.js";
import { aliveContestants, type HiveRules, type HiveState, type HiveTallyEntry } from "./state.js";

function buildRules(config: GameConfig, promptCount: number): HiveRules {
  const roundsOverride = config.rounds as number | undefined;
  return {
    answerTimeMs: (config.answerTimeMs as number | undefined) ?? 10000,
    revealTimeMs: (config.revealTimeMs as number | undefined) ?? 6000,
    surviveTop: (config.surviveTop as number | undefined) ?? 2,
    endBelow: (config.endBelow as number | undefined) ?? 3,
    rounds: Math.min(roundsOverride ?? promptCount, promptCount),
  };
}

function roundTimer(round: number): string {
  return `round:${round}`;
}

function revealTimer(round: number): string {
  return `reveal:${round}`;
}

function beginRound(state: HiveState, round: number, now: number): ReduceResult<HiveState> {
  return {
    state: {
      ...state,
      phase: "prompt",
      round,
      deadline: now + state.rules.answerTimeMs,
      answers: {},
      normalized: {},
      tally: [],
    },
    effects: [{ kind: "schedule", id: roundTimer(round), delayMs: state.rules.answerTimeMs }],
  };
}

function toReveal(state: HiveState, cancelRoundTimer: boolean): ReduceResult<HiveState> {
  const counts = new Map<string, number>();
  for (const id of aliveContestants(state)) {
    const answer = state.normalized[id];
    if (answer) counts.set(answer, (counts.get(answer) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const surviving = new Set(ranked.slice(0, state.rules.surviveTop).map(([answer]) => answer));

  const tally: HiveTallyEntry[] = ranked.map(([answer, count]) => ({
    answer,
    count,
    surviving: surviving.has(answer),
  }));

  const eliminatedAt = { ...state.eliminatedAt };
  for (const id of aliveContestants(state)) {
    const answer = state.normalized[id];
    if (!answer || !surviving.has(answer)) eliminatedAt[id] = state.round;
  }

  const effects: GameEffect[] = [
    { kind: "schedule", id: revealTimer(state.round), delayMs: state.rules.revealTimeMs },
  ];
  if (cancelRoundTimer) effects.unshift({ kind: "cancel", id: roundTimer(state.round) });

  return { state: { ...state, phase: "reveal", tally, eliminatedAt }, effects };
}

function advance(state: HiveState, ctx: GameContext): ReduceResult<HiveState> {
  const alive = aliveContestants(state).length;
  if (alive < state.rules.endBelow || state.round >= state.rules.rounds) {
    return { state: { ...state, phase: "ended" }, effects: [{ kind: "end" }] };
  }
  return beginRound(state, state.round + 1, ctx.now());
}

function handleAnswer(
  state: HiveState,
  event: Extract<GameEvent, { kind: "message" }>,
): ReduceResult<HiveState> {
  if (state.phase !== "prompt") return { state };
  if (!state.contestants.includes(event.from)) return { state };
  if (state.eliminatedAt[event.from] !== undefined) return { state };
  if (state.answers[event.from] !== undefined) return { state };

  const raw = (event.payload as { text: string }).text;
  const normalized = normalizeText(raw).slice(0, 60);
  if (!normalized) return { state };

  const next = {
    ...state,
    answers: { ...state.answers, [event.from]: raw.trim().slice(0, 60) },
    normalized: { ...state.normalized, [event.from]: normalized },
  };
  const allAnswered = aliveContestants(next).every((id) => next.answers[id] !== undefined);
  if (allAnswered) return toReveal(next, true);
  return { state: next };
}

function handlePresence(
  state: HiveState,
  event: Extract<GameEvent, { kind: "presence" }>,
): ReduceResult<HiveState> {
  if (!state.contestants.includes(event.participantId)) return { state };
  const offline = { ...state.offline };
  if (event.connected) {
    delete offline[event.participantId];
  } else {
    offline[event.participantId] = true;
  }
  return { state: { ...state, offline } };
}

function reduce(state: HiveState, event: GameEvent, ctx: GameContext): ReduceResult<HiveState> {
  if (state.phase === "ended") return { state };
  switch (event.kind) {
    case "presence":
      return handlePresence(state, event);
    case "message":
      if (event.type === "hive:answer") return handleAnswer(state, event);
      return { state };
    case "timer":
      if (event.id === roundTimer(state.round) && state.phase === "prompt") {
        return toReveal(state, false);
      }
      if (event.id === revealTimer(state.round) && state.phase === "reveal") {
        return advance(state, ctx);
      }
      return { state };
  }
}

function results(state: HiveState): GameResults {
  const entries = state.contestants.map((id) => {
    const out = state.eliminatedAt[id];
    return {
      participantId: id,
      name: state.names[id] ?? "?",
      survivedRounds: out === undefined ? state.round : out - 1,
      out,
    };
  });
  entries.sort((a, b) => b.survivedRounds - a.survivedRounds || a.name.localeCompare(b.name));
  return entries.map((entry, index) => ({
    participantId: entry.participantId,
    name: entry.name,
    rank: index + 1,
    score: entry.survivedRounds,
    detail: entry.out === undefined ? "Hive mind" : `Eliminated round ${entry.out}`,
  }));
}

function view(state: HiveState, audience: "host" | "player") {
  return {
    gameId: "hive-mind",
    phase: state.phase,
    round: state.round,
    totalRounds: state.rules.rounds,
    prompt: state.prompts[state.round - 1] ?? "",
    deadline: state.deadline,
    timeMs: state.rules.answerTimeMs,
    answeredCount: Object.keys(state.answers).length,
    aliveCount: aliveContestants(state).length,
    contestants: state.contestants,
    names: state.names,
    eliminatedAt: state.eliminatedAt,
    tally: state.phase === "prompt" ? [] : state.tally,
    audience,
  };
}

function playerView(state: HiveState, participantId: string) {
  const base = view(state, "player");
  if (!state.contestants.includes(participantId)) return { ...base, you: null };
  return {
    ...base,
    you: {
      answer: state.answers[participantId] ?? null,
      eliminatedRound: state.eliminatedAt[participantId] ?? null,
    },
  };
}

export const hiveMind: GameDefinition<HiveState> = {
  id: "hive-mind",
  name: "Hive Mind Survival",
  description: "Think like the swarm: answers outside the most popular picks get you eliminated.",
  minPlayers: 2,
  stability: "alpha",
  defaultVariant: "classic",
  variants: {
    classic: {
      name: "Classic",
      description: "Everyone answers the same prompt; only the top answers survive each round.",
      configFields: {
        rounds: { type: "number", label: "Max rounds (default: prompt count)", min: 1 },
        answerTimeMs: { type: "number", label: "Answer time (ms)", default: 10000, min: 2000 },
        revealTimeMs: { type: "number", label: "Reveal time (ms)", default: 6000, min: 1000 },
        surviveTop: { type: "number", label: "Surviving answers per round", default: 2, min: 1 },
        endBelow: { type: "number", label: "End when fewer players remain than", default: 3, min: 2 },
      },
    },
  },
  messages: {
    "hive:answer": { text: "string" },
  },
  setup(_variantId, config, ctx) {
    const prompts = shuffled(hivePrompts, ctx.random);
    const rules = buildRules(config, prompts.length);
    const contestants = ctx.players.map((p) => p.id);
    const base: HiveState = {
      rules,
      phase: "prompt",
      round: 0,
      prompts: prompts.slice(0, rules.rounds),
      deadline: 0,
      answers: {},
      normalized: {},
      tally: [],
      eliminatedAt: {},
      offline: Object.fromEntries(
        ctx.players.filter((p) => !p.connected).map((p) => [p.id, true as const]),
      ),
      contestants,
      names: Object.fromEntries(ctx.players.map((p) => [p.id, p.name])),
    };
    return beginRound(base, 1, ctx.now());
  },
  reduce,
  view,
  playerView,
  results,
};
