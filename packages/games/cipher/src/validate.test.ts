import { describe, expect, it } from 'vitest';

import { NOT_ALLOWED_MESSAGE } from './constants.js';
import { normalizeEntry, validateEntry } from './validate.js';

describe('validateEntry', () => {
  it('accepts a real five-letter word', () => {
    expect(validateEntry('crane')).toEqual({ ok: true, word: 'crane' });
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(validateEntry('  CRANE ')).toEqual({ ok: true, word: 'crane' });
    expect(normalizeEntry('  CrAnE  ')).toBe('crane');
  });

  it.each([
    ['a word that is not in the list', 'zzzzz'],
    ['too short', 'cran'],
    ['too long', 'cranes'],
    ['empty', ''],
    ['digits', '12345'],
    ['punctuation', 'cra-e'],
    ['accented letters', 'crané'],
    ['internal whitespace', 'cr an'],
  ])('rejects %s with the one approved message', (_label, input) => {
    const result = validateEntry(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    // Asserted as a literal, not against the constant, so a typo in the
    // constant fails here instead of silently shipping.
    expect(result.message).toBe('This is not an allowed word');
  });

  it('exports that same message as the shared constant', () => {
    expect(NOT_ALLOWED_MESSAGE).toBe('This is not an allowed word');
  });

  it('distinguishes rejection reasons internally while showing one message', () => {
    const short = validateEntry('cran');
    const unknown = validateEntry('zzzzz');
    if (short.ok || unknown.ok) throw new Error('unreachable');
    expect(short.reason).toBe('wrong_length');
    expect(unknown.reason).toBe('not_allowed');
    expect(short.message).toBe(unknown.message);
  });
});
