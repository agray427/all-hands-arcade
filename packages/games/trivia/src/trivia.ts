import type {
  ConfigField,
  GameConfig,
  GameContext,
  GameDefinition,
  GameEffect,
  GameEvent,
  GameResults,
  ReduceResult,
} from "@arcade/core";
import { parseCustomDeck } from "./custom.js";
import { deckById, decks, type TriviaQuestion } from "./decks.js";
import {
  aliveContestants,
  questionTimeFor,
  type TriviaRules,
  type TriviaState,
  type TriviaVariantId,
} from "./state.js";

const deckField: ConfigField = {
  type: "string",
  label: "Deck",
  default: decks[0]!.id,
  options: [
    ...decks.map((d) => ({
      value: d.id,
      label: d.name,
      description: `${d.questions.length} questions`,
    })),
    { value: "custom", label: "Custom deck", description: "bring your own questions" },
  ],
};

const customDeckField: ConfigField = {
  type: "string",
  label: "Custom questions — one per line: Prompt? | choice | *correct | choice",
  multiline: true,
  when: { field: "deck", equals: "custom" },
};

function validateDeck(config: GameConfig): string | null {
  if (config.deck !== "custom") return null;
  const source = config.customDeck;
  if (typeof source !== "string" || !source.trim()) {
    return "customDeck is required when deck is custom";
  }
  const parsed = parseCustomDeck(source);
  return parsed.ok ? null : parsed.error;
}

function resolveQuestions(config: GameConfig): TriviaQuestion[] {
  if (config.deck === "custom") {
    const parsed = parseCustomDeck(config.customDeck as string);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.questions;
  }
  return deckById(config.deck as string)!.questions;
}

function shuffle(count: number, random: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

function buildRules(variant: TriviaVariantId, config: GameConfig, deckSize: number): TriviaRules {
  const roundsOverride = (config.rounds ?? config.maxRounds) as number | undefined;
  return {
    variant,
    deckId: config.deck as string,
    rounds: Math.min(roundsOverride ?? deckSize, deckSize),
    questionTimeMs: (config.questionTimeMs as number | undefined) ?? 20000,
    revealTimeMs: (config.revealTimeMs as number | undefined) ?? 4000,
    startTimeMs: (config.startTimeMs as number | undefined) ?? 10000,
    stepMs: (config.stepMs as number | undefined) ?? 1000,
    minTimeMs: (config.minTimeMs as number | undefined) ?? 2000,
  };
}

function roundTimer(round: number): string {
  return `round:${round}`;
}

function revealTimer(round: number): string {
  return `reveal:${round}`;
}

function beginRound(state: TriviaState, round: number, now: number): ReduceResult<TriviaState> {
  const timeMs = questionTimeFor(state.rules, round);
  const paced = state.rules.variant === "host-paced";
  return {
    state: {
      ...state,
      phase: "question",
      round,
      deadline: paced ? 0 : now + timeMs,
      answers: {},
      outcomes: {},
    },
    effects: paced ? [] : [{ kind: "schedule", id: roundTimer(round), delayMs: timeMs }],
  };
}

function toReveal(state: TriviaState, cancelRoundTimer: boolean): ReduceResult<TriviaState> {
  const { rules } = state;
  const question = currentQuestion(state);
  const totalMs = questionTimeFor(rules, state.round);
  const scores = { ...state.scores };
  const eliminatedAt = { ...state.eliminatedAt };
  const outcomes: TriviaState["outcomes"] = {};

  for (const id of aliveContestants(state)) {
    const answer = state.answers[id];
    if (!answer) {
      outcomes[id] = "timeout";
      if (rules.variant === "survival") eliminatedAt[id] = state.round;
      continue;
    }
    if (answer.choice === question.correctIndex) {
      outcomes[id] = "correct";
      if (rules.variant === "classic") {
        const remaining = Math.max(0, state.deadline - answer.at);
        scores[id] = (scores[id] ?? 0) + 100 + Math.round((400 * remaining) / totalMs);
      } else if (rules.variant === "host-paced") {
        scores[id] = (scores[id] ?? 0) + 100;
      } else {
        scores[id] = (scores[id] ?? 0) + 1;
      }
    } else {
      outcomes[id] = "wrong";
      if (rules.variant === "survival") eliminatedAt[id] = state.round;
    }
  }

  const effects: GameEffect[] = [];
  if (cancelRoundTimer) effects.push({ kind: "cancel", id: roundTimer(state.round) });
  if (rules.variant !== "host-paced") {
    effects.push({
      kind: "schedule",
      id: revealTimer(state.round),
      delayMs: rules.revealTimeMs,
    });
  }

  return {
    state: { ...state, phase: "reveal", scores, eliminatedAt, outcomes },
    effects,
  };
}

function advance(state: TriviaState, ctx: GameContext): ReduceResult<TriviaState> {
  const finishedAllRounds = state.round >= state.rules.rounds;
  const survivalOver =
    state.rules.variant === "survival" && aliveContestants(state).length <= 1;

  if (finishedAllRounds || survivalOver) {
    return {
      state: { ...state, phase: "ended" },
      effects: [{ kind: "end" }],
    };
  }
  return beginRound(state, state.round + 1, ctx.now());
}

export function currentQuestion(state: TriviaState) {
  return state.questions[state.order[state.round - 1]!]!;
}

function handleAnswer(
  state: TriviaState,
  event: Extract<GameEvent, { kind: "message" }>,
  ctx: GameContext,
): ReduceResult<TriviaState> {
  if (state.phase !== "question") return { state };
  if (!state.contestants.includes(event.from)) return { state };
  if (state.eliminatedAt[event.from] !== undefined) return { state };
  if (state.answers[event.from]) return { state };

  const { choice } = event.payload as { choice: number };
  const question = currentQuestion(state);
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.choices.length) {
    return { state };
  }

  const answers = {
    ...state.answers,
    [event.from]: { choice, at: ctx.now() },
  };
  const next = { ...state, answers };

  const allAnswered = aliveContestants(next).every((id) => answers[id] !== undefined);
  if (allAnswered && state.rules.variant !== "host-paced") return toReveal(next, true);
  return { state: next };
}

function handleAdvance(
  state: TriviaState,
  event: Extract<GameEvent, { kind: "message" }>,
  ctx: GameContext,
): ReduceResult<TriviaState> {
  if (state.rules.variant !== "host-paced") return { state };
  if (event.role !== "host") return { state };
  if (state.phase === "question") return toReveal(state, false);
  return advance(state, ctx);
}

function reduce(
  state: TriviaState,
  event: GameEvent,
  ctx: GameContext,
): ReduceResult<TriviaState> {
  if (state.phase === "ended") return { state };

  switch (event.kind) {
    case "message":
      if (event.type === "answer:submit") return handleAnswer(state, event, ctx);
      if (event.type === "round:advance") return handleAdvance(state, event, ctx);
      return { state };
    case "timer":
      if (event.id === roundTimer(state.round) && state.phase === "question") {
        return toReveal(state, false);
      }
      if (event.id === revealTimer(state.round) && state.phase === "reveal") {
        return advance(state, ctx);
      }
      return { state };
  }
}

function results(state: TriviaState): GameResults {
  const survival = state.rules.variant === "survival";
  const entries = state.contestants.map((id) => ({
    participantId: id,
    name: state.names[id] ?? "?",
    score: state.scores[id] ?? 0,
    eliminatedRound: state.eliminatedAt[id],
  }));

  entries.sort((a, b) => {
    if (survival) {
      const aOut = a.eliminatedRound ?? Infinity;
      const bOut = b.eliminatedRound ?? Infinity;
      if (aOut !== bOut) return bOut - aOut;
    }
    if (a.score !== b.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return entries.map((entry, index) => ({
    participantId: entry.participantId,
    name: entry.name,
    rank: index + 1,
    score: entry.score,
    ...(survival
      ? {
          detail:
            entry.eliminatedRound === undefined
              ? "Survived"
              : `Eliminated round ${entry.eliminatedRound}`,
        }
      : {}),
  }));
}

export const trivia: GameDefinition<TriviaState> = {
  id: "trivia",
  name: "Trivia",
  description: "Answer multiple-choice questions from a deck of your choosing.",
  minPlayers: 1,
  defaultVariant: "classic",
  variants: {
    classic: {
      name: "Classic",
      description: "Fast and accurate: everyone answers, quicker correct answers score more.",
      validateConfig: validateDeck,
      configFields: {
        deck: deckField,
        customDeck: customDeckField,
        rounds: { type: "number", label: "Rounds (default: deck size)", min: 1 },
        questionTimeMs: {
          type: "number",
          label: "Question time (ms)",
          default: 20000,
          min: 1000,
        },
        revealTimeMs: { type: "number", label: "Reveal time (ms)", default: 4000, min: 500 },
      },
    },
    "host-paced": {
      name: "Host-paced",
      description:
        "No clocks. The host reveals answers and advances rounds whenever they're ready — perfect for commentary between questions.",
      hostDriven: true,
      validateConfig: validateDeck,
      configFields: {
        deck: deckField,
        customDeck: customDeckField,
        rounds: { type: "number", label: "Rounds (default: deck size)", min: 1 },
      },
    },
    survival: {
      name: "Survival",
      description:
        "Questions keep coming with less and less time. Answer wrong or too late and you're out.",
      validateConfig: validateDeck,
      configFields: {
        deck: deckField,
        customDeck: customDeckField,
        maxRounds: { type: "number", label: "Max rounds (default: deck size)", min: 1 },
        startTimeMs: {
          type: "number",
          label: "Starting question time (ms)",
          default: 10000,
          min: 1000,
        },
        stepMs: {
          type: "number",
          label: "Time reduction per round (ms)",
          default: 1000,
          min: 0,
        },
        minTimeMs: {
          type: "number",
          label: "Minimum question time (ms)",
          default: 2000,
          min: 1000,
        },
        revealTimeMs: { type: "number", label: "Reveal time (ms)", default: 4000, min: 500 },
      },
    },
  },
  messages: {
    "answer:submit": { choice: "number" },
    "round:advance": {},
  },
  setup(variantId, config, ctx) {
    const questions = resolveQuestions(config);
    const rules = buildRules(variantId as TriviaVariantId, config, questions.length);
    const contestants = ctx.players.map((p) => p.id);
    const names = Object.fromEntries(ctx.players.map((p) => [p.id, p.name]));
    const base: TriviaState = {
      rules,
      phase: "question",
      round: 0,
      questions,
      order: shuffle(questions.length, ctx.random).slice(0, rules.rounds),
      deadline: 0,
      answers: {},
      outcomes: {},
      scores: Object.fromEntries(contestants.map((id) => [id, 0])),
      eliminatedAt: {},
      contestants,
      names,
    };
    return beginRound(base, 1, ctx.now());
  },
  reduce,
  view(state, audience) {
    const question = currentQuestion(state);
    const common = {
      variant: state.rules.variant,
      phase: state.phase,
      round: state.round,
      totalRounds: state.rules.rounds,
      deadline: state.deadline,
      timeMs: questionTimeFor(state.rules, state.round),
      question: { prompt: question.prompt, choices: question.choices },
      answered: Object.keys(state.answers),
      contestants: state.contestants,
      names: state.names,
      scores: state.scores,
      eliminatedAt: state.eliminatedAt,
      audience,
    };
    if (state.phase === "question") return common;
    return {
      ...common,
      correctIndex: question.correctIndex,
      outcomes: state.outcomes,
      ...(state.phase === "ended" ? { leaderboard: results(state) } : {}),
    };
  },
  results,
};
