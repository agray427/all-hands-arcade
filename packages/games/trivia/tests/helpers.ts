import type { GameConfig, GameContext, GameEffect, Participant } from "@arcade/core";
import { resolveConfig } from "@arcade/core";
import { trivia } from "../src/index.js";
import type { TriviaState } from "../src/index.js";

export class Clock {
  t = 1_000_000;
  now = () => this.t;
  advance(ms: number) {
    this.t += ms;
  }
}

export function makeCtx(clock: Clock, names: string[]): GameContext {
  const players: Participant[] = names.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    role: "player",
    connected: true,
  }));
  return { players, now: clock.now, random: () => 0.999999 };
}

export function start(
  variantId: string,
  overrides: GameConfig,
  clock: Clock,
  names = ["Ada", "Grace"],
): { state: TriviaState; effects: GameEffect[]; ctx: GameContext } {
  const resolved = resolveConfig(trivia, variantId, overrides);
  if (!resolved.ok) throw new Error(resolved.error);
  const ctx = makeCtx(clock, names);
  const { state, effects } = trivia.setup(resolved.variantId, resolved.config, ctx);
  return { state, effects: effects ?? [], ctx };
}

export function answer(
  state: TriviaState,
  ctx: GameContext,
  from: string,
  choice: number,
): { state: TriviaState; effects: GameEffect[] } {
  const result = trivia.reduce(
    state,
    { kind: "message", type: "answer:submit", payload: { choice }, from, role: "player", messageId: `m-${from}-${choice}` },
    ctx,
  );
  return { state: result.state, effects: result.effects ?? [] };
}

export function presence(
  state: TriviaState,
  ctx: GameContext,
  participantId: string,
  connected: boolean,
): { state: TriviaState; effects: GameEffect[] } {
  const result = trivia.reduce(state, { kind: "presence", participantId, connected }, ctx);
  return { state: result.state, effects: result.effects ?? [] };
}

export function fire(
  state: TriviaState,
  ctx: GameContext,
  timerId: string,
): { state: TriviaState; effects: GameEffect[] } {
  const result = trivia.reduce(state, { kind: "timer", id: timerId }, ctx);
  return { state: result.state, effects: result.effects ?? [] };
}

export function correctChoice(state: TriviaState): number {
  return state.questions[state.order[state.round - 1]!]!.correctIndex;
}

export function wrongChoice(state: TriviaState): number {
  const question = state.questions[state.order[state.round - 1]!]!;
  return (question.correctIndex + 1) % question.choices.length;
}
