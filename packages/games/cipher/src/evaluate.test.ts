import { describe, expect, it } from 'vitest';

import { evaluateGuess, isWinningResult, mergeKeyboardStates } from './evaluate.js';

describe('evaluateGuess', () => {
  it('marks an exact match all correct', () => {
    expect(evaluateGuess('crane', 'crane')).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
    ]);
  });

  it('marks a total miss all absent', () => {
    expect(evaluateGuess('crane', 'spilt')).toEqual([
      'absent',
      'absent',
      'absent',
      'absent',
      'absent',
    ]);
  });

  // The duplicate-letter cases are where naive implementations go wrong.
  it('does not over-award a repeated guess letter', () => {
    // "allot" has two Ls; "lolly" has three. The fourth letter gets nothing.
    expect(evaluateGuess('allot', 'lolly')).toEqual([
      'present',
      'present',
      'correct',
      'absent',
      'absent',
    ]);
  });

  it('handles a repeated letter split across positions', () => {
    expect(evaluateGuess('speed', 'erase')).toEqual([
      'present',
      'absent',
      'absent',
      'present',
      'present',
    ]);
  });

  it('does not award yellows already claimed by a green', () => {
    // 'beast' has one S and 'sassy' has three. The green in position 4 claims
    // it, so neither leading S gets anything; the A is the only yellow.
    expect(evaluateGuess('beast', 'sassy')).toEqual([
      'absent',
      'present',
      'absent',
      'correct',
      'absent',
    ]);
  });

  it('handles duplicates on both sides', () => {
    expect(evaluateGuess('abbey', 'kebab')).toEqual([
      'absent',
      'present',
      'correct',
      'present',
      'present',
    ]);
  });

  it('rejects words of the wrong length rather than mis-scoring them', () => {
    expect(() => evaluateGuess('crane', 'crab')).toThrow();
  });
});

describe('isWinningResult', () => {
  it('needs every tile correct', () => {
    expect(isWinningResult(evaluateGuess('crane', 'crane'))).toBe(true);
    expect(isWinningResult(evaluateGuess('crane', 'crana'))).toBe(false);
  });
});

describe('mergeKeyboardStates', () => {
  it('never downgrades a key that is already correct', () => {
    const first = mergeKeyboardStates(new Map(), 'crane', evaluateGuess('crane', 'crane'));
    expect(first.get('c')).toBe('correct');

    // A later guess putting 'c' in the wrong slot must not turn the key yellow.
    const second = mergeKeyboardStates(first, 'chest', evaluateGuess('crane', 'chest'));
    expect(second.get('c')).toBe('correct');
  });

  it('upgrades absent to present to correct', () => {
    let states = mergeKeyboardStates(new Map(), 'spilt', evaluateGuess('crane', 'spilt'));
    expect(states.get('s')).toBe('absent');

    states = mergeKeyboardStates(states, 'about', evaluateGuess('crane', 'about'));
    expect(states.get('a')).toBe('present');

    states = mergeKeyboardStates(states, 'crane', evaluateGuess('crane', 'crane'));
    expect(states.get('a')).toBe('correct');
  });
});
