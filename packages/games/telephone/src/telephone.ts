import {
  chunkChains,
  shuffled,
  type GameConfig,
  type GameContext,
  type GameDefinition,
  type GameEvent,
  type GameResults,
  type ReduceResult,
} from "@arcade/core";
import { telephonePrompts } from "./prompts.js";
import {
  activeOf,
  chainOf,
  expectsDrawing,
  type Strokes,
  type TeleEntry,
  type TeleRules,
  type TeleState,
} from "./state.js";

const MAX_POINTS = 5000;

function buildRules(config: GameConfig): TeleRules {
  return {
    chainSize: (config.chainSize as number | undefined) ?? 4,
    stepTimeMs: (config.stepTimeMs as number | undefined) ?? 30000,
  };
}

function stepTimer(step: number): string {
  return `step:${step}`;
}

export function sanitizeStrokes(raw: unknown): Strokes | null {
  if (!Array.isArray(raw)) return null;
  const strokes: Strokes = [];
  let points = 0;
  for (const stroke of raw) {
    if (!Array.isArray(stroke)) return null;
    const clean: [number, number][] = [];
    for (const point of stroke) {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        typeof point[0] !== "number" ||
        typeof point[1] !== "number" ||
        !Number.isFinite(point[0]) ||
        !Number.isFinite(point[1])
      ) {
        return null;
      }
      points += 1;
      if (points > MAX_POINTS) return null;
      clean.push([point[0], point[1]]);
    }
    if (clean.length > 0) strokes.push(clean);
  }
  return strokes;
}

function activesPending(state: TeleState): string[] {
  const pending: string[] = [];
  for (const chain of state.chains) {
    const active = activeOf(chain, state.step);
    if (active && !state.submitted[active]) pending.push(active);
  }
  return pending;
}

function beginStep(state: TeleState, step: number, now: number): ReduceResult<TeleState> {
  const next: TeleState = {
    ...state,
    phase: "step",
    step,
    deadline: now + state.rules.stepTimeMs,
    submitted: {},
  };
  if (activesPending(next).length === 0) return advance(next, now);
  return {
    state: next,
    effects: [{ kind: "schedule", id: stepTimer(step), delayMs: state.rules.stepTimeMs }],
  };
}

function fillMissing(state: TeleState): TeleState {
  const chains = state.chains.map((chain) => {
    const active = activeOf(chain, state.step);
    if (!active || chain.timeline.length > state.step + 1) return chain;
    const filler: TeleEntry = expectsDrawing(state.step)
      ? { kind: "drawing", strokes: [], by: null }
      : { kind: "text", text: "(nothing came through)", by: null };
    return { ...chain, timeline: [...chain.timeline, filler] };
  });
  return { ...state, chains };
}

function advance(state: TeleState, now: number): ReduceResult<TeleState> {
  const filled = fillMissing(state);
  const nextStep = filled.step + 1;
  if (nextStep >= filled.totalSteps) {
    return { state: { ...filled, phase: "gallery", deadline: 0 } };
  }
  return beginStep(filled, nextStep, now);
}

function handleSubmit(
  state: TeleState,
  event: Extract<GameEvent, { kind: "message" }>,
  ctx: GameContext,
): ReduceResult<TeleState> {
  if (state.phase !== "step") return { state };
  const chainIndex = chainOf(state, event.from);
  if (chainIndex === -1) return { state };
  const chain = state.chains[chainIndex]!;
  if (activeOf(chain, state.step) !== event.from) return { state };
  if (state.submitted[event.from]) return { state };

  const payload = event.payload as { text?: string; strokes?: unknown };
  let entry: TeleEntry;
  if (expectsDrawing(state.step)) {
    const strokes = sanitizeStrokes(payload.strokes);
    if (!strokes || strokes.length === 0) return { state };
    entry = { kind: "drawing", strokes, by: event.from };
  } else {
    const text = (payload.text ?? "").trim().slice(0, 200);
    if (!text) return { state };
    entry = { kind: "text", text, by: event.from };
  }

  const chains = state.chains.map((c, i) =>
    i === chainIndex ? { ...c, timeline: [...c.timeline, entry] } : c,
  );
  const next: TeleState = {
    ...state,
    chains,
    submitted: { ...state.submitted, [event.from]: true },
  };
  if (activesPending(next).length === 0) {
    const result = advance(next, ctx.now());
    return {
      ...result,
      effects: [{ kind: "cancel", id: stepTimer(state.step) }, ...(result.effects ?? [])],
    };
  }
  return { state: next };
}

function handleClose(
  state: TeleState,
  event: Extract<GameEvent, { kind: "message" }>,
): ReduceResult<TeleState> {
  if (event.role !== "host") return { state };
  if (state.phase !== "gallery") return { state };
  return { state: { ...state, phase: "ended" }, effects: [{ kind: "end" }] };
}

function handlePresence(
  state: TeleState,
  event: Extract<GameEvent, { kind: "presence" }>,
): ReduceResult<TeleState> {
  if (!state.contestants.includes(event.participantId)) return { state };
  const offline = { ...state.offline };
  if (event.connected) {
    delete offline[event.participantId];
  } else {
    offline[event.participantId] = true;
  }
  return { state: { ...state, offline } };
}

function reduce(state: TeleState, event: GameEvent, ctx: GameContext): ReduceResult<TeleState> {
  if (state.phase === "ended") return { state };
  switch (event.kind) {
    case "presence":
      return handlePresence(state, event);
    case "message":
      if (event.type === "tele:submit") return handleSubmit(state, event, ctx);
      if (event.type === "round:advance") return handleClose(state, event);
      return { state };
    case "timer":
      if (event.id === stepTimer(state.step) && state.phase === "step") {
        return advance(state, ctx.now());
      }
      return { state };
  }
}

function results(state: TeleState): GameResults {
  return state.contestants
    .map((id) => ({
      participantId: id,
      name: state.names[id] ?? "?",
      chain: chainOf(state, id),
    }))
    .sort((a, b) => a.chain - b.chain || a.name.localeCompare(b.name))
    .map((entry) => ({
      participantId: entry.participantId,
      name: entry.name,
      rank: 1,
      score: 0,
      detail: `Chain ${entry.chain + 1}`,
    }));
}

function chainProgress(state: TeleState) {
  return state.chains.map((chain, index) => ({
    index,
    members: chain.members.map((id) => ({
      participantId: id,
      name: state.names[id] ?? "?",
      done: chain.timeline.length > chain.members.indexOf(id) + 1,
    })),
    active: state.phase === "step" ? activeOf(chain, state.step) : null,
    submitted: state.phase === "step" ? !!state.submitted[activeOf(chain, state.step) ?? ""] : false,
    length: chain.timeline.length,
  }));
}

function timelinesFor(state: TeleState) {
  return state.chains.map((chain, index) => ({
    index,
    members: chain.members.map((id) => state.names[id] ?? "?"),
    timeline: chain.timeline.map((entry) => ({
      ...entry,
      byName: "by" in entry && entry.by ? (state.names[entry.by] ?? "?") : null,
    })),
  }));
}

function view(state: TeleState, audience: "host" | "player") {
  const gallery = state.phase !== "step";
  return {
    gameId: "telephone",
    phase: state.phase,
    step: state.step,
    totalSteps: state.totalSteps,
    deadline: state.deadline,
    timeMs: state.rules.stepTimeMs,
    chains: chainProgress(state),
    timelines: gallery && audience === "host" ? timelinesFor(state) : [],
    names: state.names,
    audience,
  };
}

function playerView(state: TeleState, participantId: string) {
  const base = view(state, "player");
  const chainIndex = chainOf(state, participantId);
  if (chainIndex === -1) return { ...base, you: null };
  const chain = state.chains[chainIndex]!;
  const yourTurn =
    state.phase === "step" &&
    activeOf(chain, state.step) === participantId &&
    !state.submitted[participantId];
  const previous = yourTurn ? (chain.timeline[state.step] ?? null) : null;
  return {
    ...base,
    timelines:
      state.phase === "gallery" || state.phase === "ended"
        ? [
            {
              index: chainIndex,
              members: chain.members.map((id) => state.names[id] ?? "?"),
              timeline: chain.timeline.map((entry) => ({
                ...entry,
                byName: "by" in entry && entry.by ? (state.names[entry.by] ?? "?") : null,
              })),
            },
          ]
        : [],
    you: {
      chain: chainIndex,
      yourTurn,
      task: yourTurn ? (expectsDrawing(state.step) ? "draw" : "guess") : null,
      previous,
      submitted: !!state.submitted[participantId],
      position: chain.members.indexOf(participantId),
    },
  };
}

export const telephone: GameDefinition<TeleState> = {
  id: "telephone",
  name: "Massive Telephone",
  description:
    "Prompts degrade into chaos as chains of players alternate drawing and guessing.",
  minPlayers: 2,
  stability: "alpha",
  defaultVariant: "classic",
  variants: {
    classic: {
      name: "Classic",
      description:
        "Players are split into chains; drawings and guesses pass down the line, then the host unveils each chain's timeline.",
      hostDriven: true,
      configFields: {
        chainSize: { type: "number", label: "Players per chain", default: 4, min: 2 },
        stepTimeMs: { type: "number", label: "Time per step (ms)", default: 30000, min: 5000 },
      },
    },
  },
  messages: {
    "tele:submit": { text: "string?", strokes: "object?" },
    "round:advance": {},
  },
  setup(_variantId, config, ctx) {
    const rules = buildRules(config);
    const contestants = ctx.players.map((p) => p.id);
    const groups = chunkChains(contestants, rules.chainSize, ctx.random);
    const prompts = shuffled(telephonePrompts, ctx.random);
    const chains = groups.map((members, i) => ({
      members,
      timeline: [
        { kind: "prompt" as const, text: prompts[i % prompts.length]! },
      ] as TeleEntry[],
    }));
    const base: TeleState = {
      rules,
      phase: "step",
      step: 0,
      totalSteps: Math.max(...chains.map((c) => c.members.length)),
      chains,
      deadline: 0,
      submitted: {},
      offline: Object.fromEntries(
        ctx.players.filter((p) => !p.connected).map((p) => [p.id, true as const]),
      ),
      contestants,
      names: Object.fromEntries(ctx.players.map((p) => [p.id, p.name])),
    };
    return beginStep(base, 0, ctx.now());
  },
  reduce,
  view,
  playerView,
  results,
};
