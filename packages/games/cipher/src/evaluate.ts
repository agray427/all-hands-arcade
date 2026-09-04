import { WORD_LENGTH } from './constants.js';

export type LetterState = 'correct' | 'present' | 'absent';

/**
 * Classic two-pass Wordle marking, which is the only way to get duplicate
 * letters right: greens are claimed first and consume their letter from the
 * secret's remaining pool, then yellows are handed out left-to-right only
 * while that pool still has the letter.
 *
 * Guessing "lolly" against "allot" must give [present, present, correct,
 * absent, absent] — the second 'l' is yellow, the third is green, and the
 * fourth 'l' gets nothing because the secret only has two.
 */
export function evaluateGuess(secret: string, guess: string): LetterState[] {
  if (secret.length !== WORD_LENGTH || guess.length !== WORD_LENGTH) {
    throw new Error(`evaluateGuess expects ${WORD_LENGTH}-letter words`);
  }

  const result: LetterState[] = new Array<LetterState>(WORD_LENGTH).fill('absent');
  const remaining = new Map<string, number>();

  // Pass 1: exact positions.
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    const s = secret.charAt(i);
    if (s === guess.charAt(i)) {
      result[i] = 'correct';
    } else {
      remaining.set(s, (remaining.get(s) ?? 0) + 1);
    }
  }

  // Pass 2: misplaced letters, limited by what pass 1 left over.
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (result[i] === 'correct') continue;
    const g = guess.charAt(i);
    const left = remaining.get(g) ?? 0;
    if (left > 0) {
      result[i] = 'present';
      remaining.set(g, left - 1);
    }
  }

  return result;
}

export function isWinningResult(result: readonly LetterState[]): boolean {
  return result.length === WORD_LENGTH && result.every((state) => state === 'correct');
}

const RANK: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };

/**
 * Fold a guess into the on-screen keyboard colouring. A key never downgrades:
 * once a letter is known green it stays green even if a later guess puts it in
 * the wrong slot.
 */
export function mergeKeyboardStates(
  previous: ReadonlyMap<string, LetterState>,
  guess: string,
  result: readonly LetterState[],
): Map<string, LetterState> {
  const next = new Map(previous);
  for (let i = 0; i < guess.length; i += 1) {
    const letter = guess.charAt(i);
    const state = result[i];
    if (state === undefined) continue;
    const current = next.get(letter);
    if (current === undefined || RANK[state] > RANK[current]) {
      next.set(letter, state);
    }
  }
  return next;
}
