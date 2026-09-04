import { MAX_GUESSES, ROUND_DURATION_MS } from './constants.js';

/**
 * `continuous` (the default) interpolates the speed axis between the published
 * anchors, so solving at 32s and at 44s are worth different amounts and a
 * one-round match still separates the field. `tiered` snaps to the anchors
 * exactly as written, if you want the simpler story on stage.
 *
 * The guess axis is an integer 1..5 and sits on its anchors in both modes.
 */
export type ScoreMode = 'continuous' | 'tiered';

export interface SpeedAnchor {
  readonly atSeconds: number;
  readonly points: number;
}

/**
 * Published speed scale: within 15s -> 500, 45s -> 400, 90s -> 300,
 * 135s -> 200, 180s -> 100. Tied to ROUND_DURATION_MS; see the note there.
 */
export const SPEED_ANCHORS: readonly SpeedAnchor[] = [
  { atSeconds: 15, points: 500 },
  { atSeconds: 45, points: 400 },
  { atSeconds: 90, points: 300 },
  { atSeconds: 135, points: 200 },
  { atSeconds: 180, points: 100 },
] as const;

/** Index 0 = solved in one guess. */
export const GUESS_ANCHORS: readonly number[] = [500, 400, 300, 200, 100] as const;

export const MAX_SPEED_POINTS = 500;
export const MAX_GUESS_POINTS = 500;
export const MAX_ROUND_POINTS = MAX_SPEED_POINTS + MAX_GUESS_POINTS;

/**
 * The floor for a correct answer: last guess, right on the buzzer, is
 * 100 speed + 100 guesses. This is derived from the anchors rather than
 * clamped anywhere in code — scoring.test.ts asserts it stays true.
 */
export const MIN_CORRECT_ROUND_POINTS = 200;

const FIRST_ANCHOR: SpeedAnchor = SPEED_ANCHORS[0] ?? { atSeconds: 15, points: 500 };
const LAST_ANCHOR: SpeedAnchor =
  SPEED_ANCHORS[SPEED_ANCHORS.length - 1] ?? { atSeconds: 180, points: 100 };

export function speedPoints(elapsedMs: number, mode: ScoreMode = 'continuous'): number {
  const seconds = Math.min(
    ROUND_DURATION_MS / 1000,
    Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1000,
  );

  if (mode === 'tiered') {
    for (const anchor of SPEED_ANCHORS) {
      if (seconds <= anchor.atSeconds) return anchor.points;
    }
    return LAST_ANCHOR.points;
  }

  // Full marks for anything inside the first anchor, so a fast solve is not
  // punished for a few hundred milliseconds of network jitter.
  if (seconds <= FIRST_ANCHOR.atSeconds) return FIRST_ANCHOR.points;
  if (seconds >= LAST_ANCHOR.atSeconds) return LAST_ANCHOR.points;

  let previous = FIRST_ANCHOR;
  for (const anchor of SPEED_ANCHORS) {
    if (seconds <= anchor.atSeconds) {
      const span = anchor.atSeconds - previous.atSeconds;
      if (span <= 0) return anchor.points;
      const progress = (seconds - previous.atSeconds) / span;
      return Math.round(previous.points + (anchor.points - previous.points) * progress);
    }
    previous = anchor;
  }

  return LAST_ANCHOR.points;
}

export function guessPoints(guessCount: number): number {
  const clamped = Math.min(MAX_GUESSES, Math.max(1, Math.round(guessCount)));
  return GUESS_ANCHORS[clamped - 1] ?? GUESS_ANCHORS[GUESS_ANCHORS.length - 1] ?? 100;
}

export interface RoundScoreInput {
  solved: boolean;
  /** Always measured server-side as (guess received) - (round started). */
  elapsedMs: number;
  guessCount: number;
  mode?: ScoreMode;
}

export interface RoundScoreBreakdown {
  speed: number;
  guesses: number;
  total: number;
}

export function scoreRound(input: RoundScoreInput): RoundScoreBreakdown {
  if (!input.solved) return { speed: 0, guesses: 0, total: 0 };

  const speed = speedPoints(input.elapsedMs, input.mode ?? 'continuous');
  const guesses = guessPoints(input.guessCount);
  return { speed, guesses, total: speed + guesses };
}
