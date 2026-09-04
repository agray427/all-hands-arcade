import { NOT_ALLOWED_MESSAGE, WORD_LENGTH } from './constants.js';
import { isAllowedWord } from './words/index.js';

export type EntryRejection = 'wrong_length' | 'non_alpha' | 'not_allowed';

export type EntryResult =
  | { ok: true; word: string }
  | { ok: false; reason: EntryRejection; message: string };

export function normalizeEntry(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * The single gate for both roles. The facilitator's secret word and every
 * player's guess run through this exact function, so the two can never drift
 * apart on what counts as a word.
 *
 * Every rejection carries the same user-facing message. `reason` exists only
 * for tests and telemetry — the spec asks for one error string and nothing
 * else should ever be shown.
 */
export function validateEntry(raw: string): EntryResult {
  const word = normalizeEntry(raw);

  if (word.length !== WORD_LENGTH) {
    return { ok: false, reason: 'wrong_length', message: NOT_ALLOWED_MESSAGE };
  }
  if (!/^[a-z]+$/.test(word)) {
    return { ok: false, reason: 'non_alpha', message: NOT_ALLOWED_MESSAGE };
  }
  if (!isAllowedWord(word)) {
    return { ok: false, reason: 'not_allowed', message: NOT_ALLOWED_MESSAGE };
  }

  return { ok: true, word };
}
