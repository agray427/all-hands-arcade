import type { Player, PlayerId, ScoreEntry } from './types.js';

/** Everything a game module is allowed to know about the world outside itself. */
export interface GameContext {
  /** Milliseconds since epoch, sampled once per server tick. */
  readonly now: number;
  /** Everyone currently in the room, connected or not. */
  readonly players: readonly Player[];
}

export interface GameMeta {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly minPlayers: number;
}

/**
 * The contract every game in the arcade implements.
 *
 * State is treated as immutable-ish: the runtime keeps whatever object the last
 * call returned and re-broadcasts views when `version` changes, so every method
 * that mutates must bump it.
 */
export interface GameModule<
  TConfig = unknown,
  TState extends { version: number } = { version: number },
  THostView = unknown,
  TPlayerView = unknown,
> extends GameMeta {
  readonly defaultConfig: TConfig;
  /** Coerce untrusted host input into a valid config, clamping out-of-range values. */
  parseConfig(raw: unknown): TConfig;
  create(config: TConfig, ctx: GameContext): TState;
  /** Handle an untrusted action from a player. Invalid actions are ignored. */
  submit(state: TState, playerId: PlayerId, action: unknown, ctx: GameContext): TState;
  /** Advance timers and phases. Called on every runtime tick. */
  tick(state: TState, ctx: GameContext): TState;
  hostView(state: TState, ctx: GameContext): THostView;
  playerView(state: TState, playerId: PlayerId, ctx: GameContext): TPlayerView;
  isOver(state: TState): boolean;
  leaderboard(state: TState, ctx: GameContext): ScoreEntry[];
}

/** Convenience alias for a module whose type parameters we no longer care about. */
export type AnyGameModule = GameModule<never, { version: number }, unknown, unknown>;

/** Rank a score map, competition-style: 1, 2, 2, 4. */
export function rankScores(
  players: readonly Player[],
  scoreOf: (playerId: PlayerId) => number,
): ScoreEntry[] {
  const rows = players
    .map((p) => ({ playerId: p.id, name: p.name, score: scoreOf(p.id), rank: 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  let rank = 0;
  let previous = Number.NaN;
  rows.forEach((row, index) => {
    if (row.score !== previous) {
      rank = index + 1;
      previous = row.score;
    }
    row.rank = rank;
  });
  return rows;
}
