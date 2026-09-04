import type { GameContext, GameModule, Player, PlayerId, ScoreEntry } from '@arcade/core';
import { rankScores } from '@arcade/core';
import {
  beats,
  describe,
  gesturesFor,
  isGesture,
  ruleBook,
  CLASSIC_GESTURES,
  GESTURE_EMOJI,
  GESTURE_LABEL,
  LIZARD_SPOCK_GESTURES,
} from './rules.js';
import type { Gesture, Variant } from './rules.js';
import type {
  HostView,
  PlayerRoundResult,
  PlayerView,
  RoundSummary,
  RpslsConfig,
  RpslsState,
} from './types.js';

/** How long the "here's how it works" card sits on screen before round 1. */
const INTRO_MS = 5_000;
/** Rows of the leaderboard sent to the host dashboard and to each player. */
const HOST_LEADERBOARD_SIZE = 12;
const PLAYER_LEADERBOARD_SIZE = 5;
const HOST_ROUND_ROWS = 10;

export const DEFAULT_CONFIG: RpslsConfig = {
  rounds: 5,
  variant: 'lizard-spock',
  choiceSeconds: 15,
  revealSeconds: 6,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function nameOf(players: readonly Player[], playerId: PlayerId): string {
  return players.find((player) => player.id === playerId)?.name ?? 'Unknown';
}

/**
 * Score a round.
 *
 * Head-to-head Rock-Paper-Scissors deadlocks the moment a room is bigger than
 * two people, so instead every submitting player is compared against every
 * other submitting player and earns one point per opponent they defeat. Players
 * who let the clock run out score nothing and are not counted as opponents, so
 * going idle never feeds the room free points.
 */
function scoreRound(
  round: number,
  picks: Record<PlayerId, Gesture>,
  players: readonly Player[],
  gestures: readonly Gesture[],
): RoundSummary {
  const counts = new Map<Gesture, number>();
  for (const gesture of gestures) counts.set(gesture, 0);
  for (const gesture of Object.values(picks)) {
    counts.set(gesture, (counts.get(gesture) ?? 0) + 1);
  }

  const results: PlayerRoundResult[] = Object.entries(picks).map(([playerId, gesture]) => {
    let beat = 0;
    let lost = 0;
    for (const other of gestures) {
      const count = counts.get(other) ?? 0;
      if (count === 0) continue;
      if (beats(gesture, other)) beat += count;
      else if (beats(other, gesture)) lost += count;
    }
    return {
      playerId,
      name: nameOf(players, playerId),
      gesture,
      beat,
      lost,
      // Everyone who threw the same gesture, minus this player.
      tied: (counts.get(gesture) ?? 1) - 1,
    };
  });

  results.sort((a, b) => b.beat - a.beat || a.name.localeCompare(b.name));

  return {
    round,
    tally: gestures.map((gesture) => ({ gesture, count: counts.get(gesture) ?? 0 })),
    results,
    submitted: results.length,
    missed: Math.max(0, players.length - results.length),
  };
}

function startRound(state: RpslsState, round: number, now: number): RpslsState {
  return {
    ...state,
    version: state.version + 1,
    phase: 'choosing',
    round,
    phaseEndsAt: now + state.config.choiceSeconds * 1_000,
    picks: {},
  };
}

function resolveRound(state: RpslsState, ctx: GameContext): RpslsState {
  const gestures = gesturesFor(state.config.variant);
  const summary = scoreRound(state.round, state.picks, ctx.players, gestures);

  const totals = { ...state.totals };
  for (const result of summary.results) {
    totals[result.playerId] = (totals[result.playerId] ?? 0) + result.beat;
  }

  return {
    ...state,
    version: state.version + 1,
    phase: 'reveal',
    phaseEndsAt: ctx.now + state.config.revealSeconds * 1_000,
    totals,
    lastRound: summary,
  };
}

function trimLeaderboard(entries: ScoreEntry[], size: number): ScoreEntry[] {
  return entries.slice(0, size);
}

export const rpsls: GameModule<RpslsConfig, RpslsState, HostView, PlayerView> = {
  id: 'rpsls',
  name: 'Rock Paper Scissors Lizard Spock',
  tagline: 'Sheldon-approved. One point for every person you beat.',
  minPlayers: 2,
  defaultConfig: DEFAULT_CONFIG,

  parseConfig(raw) {
    const input = (raw ?? {}) as Partial<Record<keyof RpslsConfig, unknown>>;
    const variant: Variant = input.variant === 'classic' ? 'classic' : 'lizard-spock';
    return {
      rounds: clamp(Number(input.rounds), 1, 25, DEFAULT_CONFIG.rounds),
      variant,
      choiceSeconds: clamp(Number(input.choiceSeconds), 5, 60, DEFAULT_CONFIG.choiceSeconds),
      revealSeconds: clamp(Number(input.revealSeconds), 3, 20, DEFAULT_CONFIG.revealSeconds),
    };
  },

  create(config, ctx) {
    return {
      version: 1,
      config,
      phase: 'intro',
      round: 0,
      phaseEndsAt: ctx.now + INTRO_MS,
      picks: {},
      totals: {},
      lastRound: null,
    };
  },

  submit(state, playerId, action, ctx) {
    if (state.phase !== 'choosing') return state;
    if (!ctx.players.some((player) => player.id === playerId)) return state;

    const payload = action as { type?: unknown; gesture?: unknown } | null;
    if (!payload || payload.type !== 'pick') return state;
    if (!isGesture(payload.gesture, state.config.variant)) return state;
    if (state.picks[playerId] === payload.gesture) return state;

    return {
      ...state,
      version: state.version + 1,
      picks: { ...state.picks, [playerId]: payload.gesture },
    };
  },

  tick(state, ctx) {
    switch (state.phase) {
      case 'intro':
        return ctx.now >= state.phaseEndsAt ? startRound(state, 1, ctx.now) : state;

      case 'choosing': {
        // Don't make a small room stare at a timer nobody is waiting on.
        const waitingOn = ctx.players.filter(
          (player) => player.connected && state.picks[player.id] === undefined,
        ).length;
        const everyoneIn = ctx.players.length > 0 && waitingOn === 0;
        if (ctx.now >= state.phaseEndsAt || everyoneIn) return resolveRound(state, ctx);
        return state;
      }

      case 'reveal': {
        if (ctx.now < state.phaseEndsAt) return state;
        if (state.round >= state.config.rounds) {
          return { ...state, version: state.version + 1, phase: 'final', phaseEndsAt: 0 };
        }
        return startRound(state, state.round + 1, ctx.now);
      }

      default:
        return state;
    }
  },

  hostView(state, ctx) {
    const lastRound: RoundSummary | null = state.lastRound
      ? { ...state.lastRound, results: state.lastRound.results.slice(0, HOST_ROUND_ROWS) }
      : null;

    return {
      gameId: 'rpsls',
      phase: state.phase,
      round: state.round,
      rounds: state.config.rounds,
      variant: state.config.variant,
      gestures: [...gesturesFor(state.config.variant)],
      rules: ruleBook(state.config.variant),
      phaseEndsAt: state.phaseEndsAt,
      choiceSeconds: state.config.choiceSeconds,
      playerCount: ctx.players.length,
      submitted: Object.keys(state.picks).length,
      lastRound,
      leaderboard: trimLeaderboard(this.leaderboard(state, ctx), HOST_LEADERBOARD_SIZE),
    };
  },

  playerView(state, playerId, ctx) {
    const standings = this.leaderboard(state, ctx);
    const mine = standings.find((entry) => entry.playerId === playerId);

    return {
      gameId: 'rpsls',
      phase: state.phase,
      round: state.round,
      rounds: state.config.rounds,
      variant: state.config.variant,
      gestures: [...gesturesFor(state.config.variant)],
      rules: ruleBook(state.config.variant),
      phaseEndsAt: state.phaseEndsAt,
      pick: state.picks[playerId] ?? null,
      result:
        state.lastRound?.results.find((entry) => entry.playerId === playerId) ?? null,
      total: mine?.score ?? 0,
      rank: mine?.rank ?? 0,
      playerCount: ctx.players.length,
      leaderboard: trimLeaderboard(standings, PLAYER_LEADERBOARD_SIZE),
    };
  },

  isOver(state) {
    return state.phase === 'final';
  },

  leaderboard(state, ctx) {
    return rankScores(ctx.players, (playerId) => state.totals[playerId] ?? 0);
  },
};

export default rpsls;
export { beats, describe, gesturesFor, isGesture, ruleBook };
export { CLASSIC_GESTURES, GESTURE_EMOJI, GESTURE_LABEL, LIZARD_SPOCK_GESTURES };
export type { Gesture, Variant } from './rules.js';
export type {
  HostView,
  PlayerRoundResult,
  PlayerView,
  RoundSummary,
  RpslsAction,
  RpslsConfig,
  RpslsPhase,
  RpslsState,
} from './types.js';
