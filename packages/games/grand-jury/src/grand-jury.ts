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
import {
  aliveByRole,
  aliveContestants,
  type JuryRules,
  type JuryState,
} from "./state.js";
import { juryWords } from "./words.js";

function buildRules(config: GameConfig, playerCount: number): JuryRules {
  const requested = (config.saboteurs as number | undefined) ?? 1;
  return {
    clueTimeMs: (config.clueTimeMs as number | undefined) ?? 15000,
    voteTimeMs: (config.voteTimeMs as number | undefined) ?? 30000,
    revealTimeMs: (config.revealTimeMs as number | undefined) ?? 6000,
    saboteurs: Math.min(requested, Math.max(1, playerCount - 2)),
    eliminationsPerRound: (config.eliminationsPerRound as number | undefined) ?? 1,
    roundsToWin: (config.roundsToWin as number | undefined) ?? 3,
  };
}

function clueTimer(round: number): string {
  return `clue:${round}`;
}

function voteTimer(round: number): string {
  return `vote:${round}`;
}

function revealTimer(round: number): string {
  return `reveal:${round}`;
}

function beginRound(state: JuryState, round: number, now: number): ReduceResult<JuryState> {
  return {
    state: {
      ...state,
      phase: "clue",
      round,
      deadline: now + state.rules.clueTimeMs,
      clues: {},
      votes: {},
      lastEliminated: [],
    },
    effects: [{ kind: "schedule", id: clueTimer(round), delayMs: state.rules.clueTimeMs }],
  };
}

function toVote(state: JuryState, now: number, cancelClueTimer: boolean): ReduceResult<JuryState> {
  const effects: GameEffect[] = [
    { kind: "schedule", id: voteTimer(state.round), delayMs: state.rules.voteTimeMs },
  ];
  if (cancelClueTimer) effects.unshift({ kind: "cancel", id: clueTimer(state.round) });
  return {
    state: { ...state, phase: "vote", deadline: now + state.rules.voteTimeMs },
    effects,
  };
}

function endGame(state: JuryState, winner: "jurors" | "saboteurs"): ReduceResult<JuryState> {
  return { state: { ...state, phase: "ended", winner }, effects: [{ kind: "end" }] };
}

function toReveal(state: JuryState, cancelVoteTimer: boolean): ReduceResult<JuryState> {
  const counts = new Map<string, number>();
  for (const target of Object.values(state.votes)) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (state.names[a[0]] ?? "").localeCompare(state.names[b[0]] ?? ""),
  );
  const out = ranked.slice(0, state.rules.eliminationsPerRound).map(([id]) => id);

  const eliminatedAt = { ...state.eliminatedAt };
  for (const id of out) eliminatedAt[id] = state.round;
  const lastEliminated = out.map((id) => ({ participantId: id, role: state.roles[id]! }));

  const next: JuryState = { ...state, phase: "reveal", eliminatedAt, lastEliminated };
  const effects: GameEffect[] = [
    { kind: "schedule", id: revealTimer(state.round), delayMs: state.rules.revealTimeMs },
  ];
  if (cancelVoteTimer) effects.unshift({ kind: "cancel", id: voteTimer(state.round) });
  return { state: next, effects };
}

function advance(state: JuryState, ctx: GameContext): ReduceResult<JuryState> {
  const saboteursLeft = aliveByRole(state, "saboteur").length;
  const jurorsLeft = aliveByRole(state, "juror").length;
  if (saboteursLeft === 0) return endGame(state, "jurors");
  if (jurorsLeft <= saboteursLeft) return endGame(state, "saboteurs");
  if (state.round >= state.rules.roundsToWin) return endGame(state, "saboteurs");
  if (state.round >= state.words.length) return endGame(state, "saboteurs");
  return beginRound(state, state.round + 1, ctx.now());
}

function handleClue(
  state: JuryState,
  event: Extract<GameEvent, { kind: "message" }>,
  ctx: GameContext,
): ReduceResult<JuryState> {
  if (state.phase !== "clue") return { state };
  if (!state.contestants.includes(event.from)) return { state };
  if (state.eliminatedAt[event.from] !== undefined) return { state };
  if (state.clues[event.from] !== undefined) return { state };

  const word = normalizeText((event.payload as { word: string }).word).split(" ")[0] ?? "";
  if (!word) return { state };

  const next = { ...state, clues: { ...state.clues, [event.from]: word.slice(0, 24) } };
  const everyoneIn = aliveContestants(next).every((id) => next.clues[id] !== undefined);
  if (everyoneIn) return toVote(next, ctx.now(), true);
  return { state: next };
}

function handleVote(
  state: JuryState,
  event: Extract<GameEvent, { kind: "message" }>,
): ReduceResult<JuryState> {
  if (state.phase !== "vote") return { state };
  if (!state.contestants.includes(event.from)) return { state };
  if (state.eliminatedAt[event.from] !== undefined) return { state };

  const target = (event.payload as { target: string }).target;
  if (target === event.from) return { state };
  if (!state.contestants.includes(target) || state.eliminatedAt[target] !== undefined) {
    return { state };
  }

  const next = { ...state, votes: { ...state.votes, [event.from]: target } };
  const everyoneVoted = aliveContestants(next).every((id) => next.votes[id] !== undefined);
  if (everyoneVoted) return toReveal(next, true);
  return { state: next };
}

function handlePresence(
  state: JuryState,
  event: Extract<GameEvent, { kind: "presence" }>,
): ReduceResult<JuryState> {
  if (!state.contestants.includes(event.participantId)) return { state };
  const offline = { ...state.offline };
  if (event.connected) {
    delete offline[event.participantId];
  } else {
    offline[event.participantId] = true;
  }
  return { state: { ...state, offline } };
}

function reduce(state: JuryState, event: GameEvent, ctx: GameContext): ReduceResult<JuryState> {
  if (state.phase === "ended") return { state };
  switch (event.kind) {
    case "presence":
      return handlePresence(state, event);
    case "message":
      if (event.type === "jury:clue") return handleClue(state, event, ctx);
      if (event.type === "jury:vote") return handleVote(state, event);
      return { state };
    case "timer":
      if (event.id === clueTimer(state.round) && state.phase === "clue") {
        return toVote(state, ctx.now(), false);
      }
      if (event.id === voteTimer(state.round) && state.phase === "vote") {
        return toReveal(state, false);
      }
      if (event.id === revealTimer(state.round) && state.phase === "reveal") {
        return advance(state, ctx);
      }
      return { state };
  }
}

function results(state: JuryState): GameResults {
  const winner = state.winner ?? "saboteurs";
  const entries = state.contestants.map((id) => {
    const role = state.roles[id]!;
    const won = (winner === "jurors") === (role === "juror");
    return { participantId: id, name: state.names[id] ?? "?", role, won };
  });
  entries.sort((a, b) => Number(b.won) - Number(a.won) || a.name.localeCompare(b.name));
  const winners = entries.filter((e) => e.won).length;
  return entries.map((entry) => ({
    participantId: entry.participantId,
    name: entry.name,
    rank: entry.won ? 1 : winners + 1,
    score: entry.won ? 1 : 0,
    detail: `${entry.role === "saboteur" ? "Saboteur" : "Juror"}${entry.won ? " — won" : ""}`,
  }));
}

function cloudOf(state: JuryState): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const clue of Object.values(state.clues)) {
    counts.set(clue, (counts.get(clue) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

function view(state: JuryState, audience: "host" | "player") {
  const showClues = state.phase !== "clue";
  return {
    gameId: "grand-jury",
    phase: state.phase,
    round: state.round,
    roundsToWin: state.rules.roundsToWin,
    deadline: state.deadline,
    timeMs: state.phase === "vote" ? state.rules.voteTimeMs : state.rules.clueTimeMs,
    cluesIn: Object.keys(state.clues).length,
    votesIn: Object.keys(state.votes).length,
    aliveCount: aliveContestants(state).length,
    contestants: state.contestants,
    names: state.names,
    eliminatedAt: state.eliminatedAt,
    cloud: showClues ? cloudOf(state) : [],
    entries: showClues
      ? aliveContestants(state).map((id) => ({
          participantId: id,
          name: state.names[id] ?? "?",
          clue: state.clues[id] ?? null,
        }))
      : [],
    lastEliminated:
      state.phase === "reveal" || state.phase === "ended"
        ? state.lastEliminated.map((e) => ({
            ...e,
            name: state.names[e.participantId] ?? "?",
          }))
        : [],
    winner: state.winner,
    roles: state.phase === "ended" ? state.roles : null,
    audience,
  };
}

function playerView(state: JuryState, participantId: string) {
  const base = view(state, "player");
  if (!state.contestants.includes(participantId)) return { ...base, you: null };
  const role = state.roles[participantId]!;
  const word = state.words[state.round - 1];
  return {
    ...base,
    you: {
      role,
      target: role === "juror" ? (word?.word ?? "") : null,
      category: word?.category ?? "",
      clue: state.clues[participantId] ?? null,
      vote: state.votes[participantId] ?? null,
      eliminatedRound: state.eliminatedAt[participantId] ?? null,
    },
  };
}

export const grandJury: GameDefinition<JuryState> = {
  id: "grand-jury",
  name: "The Grand Jury",
  description:
    "Hidden saboteurs bluff their way through word clues while the jury votes them out.",
  minPlayers: 3,
  stability: "alpha",
  defaultVariant: "classic",
  variants: {
    classic: {
      name: "Classic",
      description:
        "Jurors know the secret word, saboteurs only its category. Clue, vote, eliminate.",
      configFields: {
        saboteurs: { type: "number", label: "Saboteurs", default: 1, min: 1 },
        eliminationsPerRound: {
          type: "number",
          label: "Eliminations per round",
          default: 1,
          min: 1,
        },
        roundsToWin: {
          type: "number",
          label: "Rounds saboteurs must survive",
          default: 3,
          min: 1,
        },
        clueTimeMs: { type: "number", label: "Clue time (ms)", default: 15000, min: 3000 },
        voteTimeMs: { type: "number", label: "Vote time (ms)", default: 30000, min: 3000 },
        revealTimeMs: { type: "number", label: "Reveal time (ms)", default: 6000, min: 1000 },
      },
    },
  },
  messages: {
    "jury:clue": { word: "string" },
    "jury:vote": { target: "string" },
  },
  setup(_variantId, config, ctx) {
    const rules = buildRules(config, ctx.players.length);
    const contestants = ctx.players.map((p) => p.id);
    const order = shuffled(contestants, ctx.random);
    const roles = Object.fromEntries(
      order.map((id, i) => [id, i < rules.saboteurs ? ("saboteur" as const) : ("juror" as const)]),
    );
    const base: JuryState = {
      rules,
      phase: "clue",
      round: 0,
      words: shuffled(juryWords, ctx.random),
      deadline: 0,
      roles,
      clues: {},
      votes: {},
      lastEliminated: [],
      eliminatedAt: {},
      offline: Object.fromEntries(
        ctx.players.filter((p) => !p.connected).map((p) => [p.id, true as const]),
      ),
      contestants,
      names: Object.fromEntries(ctx.players.map((p) => [p.id, p.name])),
      winner: null,
    };
    return beginRound(base, 1, ctx.now());
  },
  reduce,
  view,
  playerView,
  results,
};
