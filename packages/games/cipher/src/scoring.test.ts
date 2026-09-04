import { describe, expect, it } from 'vitest';

import { MAX_GUESSES, ROUND_DURATION_MS } from './constants.js';
import {
  GUESS_ANCHORS,
  MAX_ROUND_POINTS,
  MIN_CORRECT_ROUND_POINTS,
  SPEED_ANCHORS,
  guessPoints,
  scoreRound,
  speedPoints,
} from './scoring.js';

describe('speed anchors', () => {
  // The numbers the game is advertised with. If these move, the rules sheet is wrong.
  const cases: [seconds: number, points: number][] = [
    [15, 500],
    [45, 400],
    [90, 300],
    [135, 200],
    [180, 100],
  ];

  it.each(cases)('%ds is worth %d in continuous mode', (seconds, points) => {
    expect(speedPoints(seconds * 1000, 'continuous')).toBe(points);
  });

  it.each(cases)('%ds is worth %d in tiered mode', (seconds, points) => {
    expect(speedPoints(seconds * 1000, 'tiered')).toBe(points);
  });

  it('gives full marks for an instant solve', () => {
    expect(speedPoints(0)).toBe(500);
    expect(speedPoints(14_999)).toBe(500);
  });

  it('never drops below the final anchor, even past the buzzer', () => {
    expect(speedPoints(ROUND_DURATION_MS + 60_000)).toBe(100);
  });

  it('matches the declared anchor table', () => {
    expect(SPEED_ANCHORS.map((a) => [a.atSeconds, a.points])).toEqual([
      [15, 500],
      [45, 400],
      [90, 300],
      [135, 200],
      [180, 100],
    ]);
  });
});

describe('continuous interpolation', () => {
  it('separates solves that a tiered scale would tie', () => {
    // The whole point of continuous mode: 32s and 44s both sit in the "45s"
    // bucket but should not be worth the same.
    expect(speedPoints(32_000, 'continuous')).not.toBe(speedPoints(44_000, 'continuous'));
    expect(speedPoints(32_000, 'tiered')).toBe(speedPoints(44_000, 'tiered'));
  });

  it('interpolates linearly between anchors', () => {
    // Midpoint of 15s..45s is 30s, halfway between 500 and 400.
    expect(speedPoints(30_000)).toBe(450);
    // Midpoint of 90s..135s is 112.5s, halfway between 300 and 200.
    expect(speedPoints(112_500)).toBe(250);
  });

  it('decreases monotonically across the whole round', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let ms = 0; ms <= ROUND_DURATION_MS; ms += 100) {
      const points = speedPoints(ms);
      expect(points).toBeLessThanOrEqual(previous);
      previous = points;
    }
  });

  it('stays inside the 100..500 band', () => {
    for (let ms = 0; ms <= ROUND_DURATION_MS; ms += 250) {
      expect(speedPoints(ms)).toBeGreaterThanOrEqual(100);
      expect(speedPoints(ms)).toBeLessThanOrEqual(500);
    }
  });
});

describe('guess anchors', () => {
  it.each([
    [1, 500],
    [2, 400],
    [3, 300],
    [4, 200],
    [5, 100],
  ])('solving in %d guesses is worth %d', (guesses, points) => {
    expect(guessPoints(guesses)).toBe(points);
  });

  it('clamps out-of-range guess counts instead of returning undefined', () => {
    expect(guessPoints(0)).toBe(500);
    expect(guessPoints(99)).toBe(100);
  });

  it('matches the declared anchor table', () => {
    expect([...GUESS_ANCHORS]).toEqual([500, 400, 300, 200, 100]);
  });
});

describe('round totals', () => {
  it('awards a perfect 1000 for a first-guess instant solve', () => {
    expect(scoreRound({ solved: true, elapsedMs: 0, guessCount: 1 })).toEqual({
      speed: 500,
      guesses: 500,
      total: MAX_ROUND_POINTS,
    });
  });

  it('awards exactly 200 for the last guess on the buzzer', () => {
    // The spec's "last guess within the 3 minutes still gets 200". This falls
    // out of the anchors (100 speed + 100 guesses) rather than being clamped,
    // so this test is what keeps the two consistent.
    expect(
      scoreRound({ solved: true, elapsedMs: ROUND_DURATION_MS, guessCount: MAX_GUESSES }).total,
    ).toBe(MIN_CORRECT_ROUND_POINTS);
  });

  it('scores an unsolved round at zero', () => {
    expect(scoreRound({ solved: false, elapsedMs: 20_000, guessCount: 5 })).toEqual({
      speed: 0,
      guesses: 0,
      total: 0,
    });
  });

  it('keeps every correct answer between 200 and 1000', () => {
    for (let ms = 0; ms <= ROUND_DURATION_MS; ms += 500) {
      for (let guesses = 1; guesses <= MAX_GUESSES; guesses += 1) {
        const { total } = scoreRound({ solved: true, elapsedMs: ms, guessCount: guesses });
        expect(total).toBeGreaterThanOrEqual(MIN_CORRECT_ROUND_POINTS);
        expect(total).toBeLessThanOrEqual(MAX_ROUND_POINTS);
      }
    }
  });

  it('scores a worked example the way the rules sheet would', () => {
    // Solved at 30s on the second guess: 450 speed + 400 guesses.
    expect(scoreRound({ solved: true, elapsedMs: 30_000, guessCount: 2 })).toEqual({
      speed: 450,
      guesses: 400,
      total: 850,
    });
  });
});
