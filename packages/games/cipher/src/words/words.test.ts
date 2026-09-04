import { describe, expect, it } from 'vitest';

import { WORD_LENGTH } from '../constants.js';
import { BLOCKED_WORDS } from './blocklist.js';
import { ALLOWED_BLOB, ALLOWED_COUNT } from './allowed.generated.js';
import { ANSWER_BLOB, ANSWER_COUNT } from './answers.generated.js';
import { allowedWords, answerPool, isAllowedWord, randomAnswer, suggestWords } from './index.js';

describe('generated word lists', () => {
  it('stores exactly COUNT fixed-width words', () => {
    expect(ALLOWED_BLOB.length).toBe(ALLOWED_COUNT * WORD_LENGTH);
    expect(ANSWER_BLOB.length).toBe(ANSWER_COUNT * WORD_LENGTH);
  });

  it('is big enough for the guess freedom players expect', () => {
    expect(ALLOWED_COUNT).toBeGreaterThan(5_000);
    expect(ANSWER_COUNT).toBeGreaterThan(500);
  });

  it('contains only lowercase five-letter words', () => {
    for (const word of allowedWords()) {
      expect(word).toMatch(/^[a-z]{5}$/);
    }
  });

  it('has no duplicates', () => {
    const words = allowedWords();
    expect(new Set(words).size).toBe(words.length);
  });

  it('keeps the answer pool a strict subset of the allow list', () => {
    // This is what lets us have a curated random-word button without ever
    // breaking the "one allow list governs both roles" rule.
    for (const word of answerPool()) {
      expect(isAllowedWord(word)).toBe(true);
    }
  });

  it('excludes every blocked word from both lists', () => {
    for (const word of BLOCKED_WORDS) {
      expect(isAllowedWord(word)).toBe(false);
      expect(answerPool()).not.toContain(word);
    }
  });

  it('includes the everyday words a player will reach for first', () => {
    for (const word of ['crane', 'slate', 'adieu', 'audio', 'stare', 'pizza', 'jazzy', 'abbey']) {
      expect(isAllowedWord(word)).toBe(true);
    }
  });

  it('rejects non-words', () => {
    expect(isAllowedWord('zzzzz')).toBe(false);
    expect(isAllowedWord('crane ')).toBe(false);
    expect(isAllowedWord('CRANE')).toBe(false);
  });
});

describe('randomAnswer', () => {
  it('is deterministic for a given RNG and always allowed', () => {
    expect(randomAnswer(() => 0)).toBe(answerPool()[0]);
    expect(randomAnswer(() => 0.999999)).toBe(answerPool()[ANSWER_COUNT - 1]);
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      expect(isAllowedWord(randomAnswer(() => r))).toBe(true);
    }
  });

  it('stays in range for degenerate RNG values', () => {
    expect(isAllowedWord(randomAnswer(() => 1))).toBe(true);
    expect(isAllowedWord(randomAnswer(() => -1))).toBe(true);
  });
});

describe('suggestWords', () => {
  it('returns allowed words matching the prefix, common ones first', () => {
    const suggestions = suggestWords('sta', 5);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(5);
    for (const word of suggestions) {
      expect(word.startsWith('sta')).toBe(true);
      expect(isAllowedWord(word)).toBe(true);
    }
    expect(new Set(suggestions).size).toBe(suggestions.length);
  });

  it('returns nothing for an empty prefix', () => {
    expect(suggestWords('')).toEqual([]);
  });
});
